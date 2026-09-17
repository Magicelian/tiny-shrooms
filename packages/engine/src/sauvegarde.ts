// Format du fichier de sauvegarde : un numéro de version et l'état complet.
// Aucun horodatage : le temps passé jeu fermé ne rapporte rien.
import type { Case, Ile } from './contrat';
import type { Etat } from './etat';
import { placerElements } from './ile';
import { prestigeNeuf } from './prestige';

export const VERSION_SAUVEGARDE = 11;

/** Première version du modèle actuel ; les parties plus anciennes ne se migrent pas (réorientation). */
export const PREMIERE_VERSION_LISIBLE = 4;

/** Sauvegarde valide mais antérieure à la réorientation : on repart de zéro après l'avoir archivée. */
export class SauvegardeAncienne extends Error {
  constructor(readonly version: number) {
    super(`sauvegarde d'avant la réorientation (version ${version})`);
  }
}

interface FichierSauvegarde {
  version: number;
  etat: Etat;
}

/**
 * Migrations successives : `MIGRATIONS[v]` convertit une sauvegarde de la version `v`
 * vers la version `v + 1`. Toute évolution du format ajoute une entrée ici.
 */
const MIGRATIONS: Record<number, (etat: Record<string, unknown>) => Record<string, unknown>> = {
  // Version 5 : éléments naturels récoltables, semés autour des bâtiments déjà posés.
  4: (etat) => {
    const ile = etat.ile as Omit<Ile, 'elements'>;
    const occupees = (etat.batiments as { case: Case }[]).map((b) => b.case);
    const elements = placerElements(ile, etat.graine as number, occupees);
    return { ...etat, ile: { ...ile, elements }, pousses: elements.map(() => 1) };
  },
  // Version 6 : paliers de population et besoins des logements. Les bâtiments de palier supérieur,
  // jusque-là offerts d'emblée, se débloquent de nouveau en franchissant les paliers.
  5: (etat) => {
    const hameau = ['hutte', 'cueillette', 'tasDeBois', 'tapisDeMousse', 'gardeManger', 'remise', 'feuDeCamp'];
    return {
      ...etat,
      palier: 0,
      batimentsDebloques: (etat.batimentsDebloques as string[]).filter((type) => hameau.includes(type)),
      batiments: (etat.batiments as object[]).map((b) => ({ ...b, besoins: {} })),
    };
  },
  // Version 7 : livraisons rangées peu à peu dans les stocks.
  6: (etat) => ({ ...etat, arrivages: { baies: 0, baiesSechees: 0, boisMort: 0, mousse: 0, spores: 0 } }),
  // Version 8 : souche-dépôt amovible.
  7: (etat) => ({ ...etat, ile: { ...(etat.ile as object), soucheEnPlace: true }, retraitSouche: null }),
  // Version 9 : défrichage des arbres, buissons et plantes.
  8: (etat) => ({ ...etat, defrichages: [] }),
  // Version 10 : renaissance et prestige.
  // Le sanctuaire vient avec le bourg (palier 2) : une partie qui l'a déjà atteint le reçoit tout de suite.
  9: (etat) => ({
    ...etat,
    prestige: { ...prestigeNeuf(), populationMax: (etat.habitants as unknown[]).length },
    batimentsDebloques: [...(etat.batimentsDebloques as string[]), ...((etat.palier as number) >= 2 ? ['sanctuaire'] : [])],
  }),
  // Version 11 : agrandissement des logements par les habitants.
  10: (etat) => ({ ...etat, batiments: (etat.batiments as object[]).map((b) => ({ ...b, agrandissement: null })) }),
};

export function serialiser(etat: Etat): string {
  const fichier: FichierSauvegarde = { version: VERSION_SAUVEGARDE, etat };
  return JSON.stringify(fichier);
}

/** Relit une sauvegarde et la migre ; lève une erreur si le fichier est illisible ou incomplet. */
export function charger(texte: string): Etat {
  const fichier = JSON.parse(texte) as { version?: unknown; etat?: unknown };
  let version = fichier.version;
  let etat = fichier.etat;
  if (typeof version !== 'number' || !estObjet(etat)) throw new Error('sauvegarde sans version ni état');
  if (version > VERSION_SAUVEGARDE) throw new Error(`sauvegarde trop récente (version ${version})`);
  if (version < PREMIERE_VERSION_LISIBLE) throw new SauvegardeAncienne(version);
  for (; version < VERSION_SAUVEGARDE; version++) {
    const migrer = MIGRATIONS[version];
    if (!migrer) throw new Error(`aucune migration depuis la version ${version}`);
    etat = migrer(etat as Record<string, unknown>);
  }
  verifier(etat as Record<string, unknown>);
  return etat as Etat;
}

/**
 * Prend la première sauvegarde lisible, par ordre de préférence ; `null` s'il n'y en a aucune.
 * `ancienne` : au moins un fichier date d'avant la réorientation.
 */
export function chargerPremiereValide(textes: readonly string[]): { etat: Etat; rang: number } | { ancienne: true } | null {
  let ancienne = false;
  for (const [rang, texte] of textes.entries()) {
    try {
      return { etat: charger(texte), rang };
    } catch (erreur) {
      // Fichier tronqué ou abîmé : on passe à la copie suivante.
      if (erreur instanceof SauvegardeAncienne) ancienne = true;
    }
  }
  return ancienne ? { ancienne: true } : null;
}

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

/** Contrôle de forme : suffit à écarter un fichier tronqué ou modifié à la main. */
function verifier(etat: Record<string, unknown>): void {
  const nombres = ['pas', 'graine', 'prochainId', 'prochainIdHabitant', 'pasAvantArrivee', 'palier'];
  const tableaux = ['batiments', 'habitants', 'pousses', 'batimentsDebloques', 'stocksPleins', 'defrichages'];
  const objets = ['ile', 'stocks', 'reglages', 'ameliorations', 'arrivages', 'prestige'];
  const manquant =
    nombres.find((cle) => !Number.isFinite(etat[cle])) ??
    tableaux.find((cle) => !Array.isArray(etat[cle])) ??
    objets.find((cle) => !estObjet(etat[cle]));
  if (manquant) throw new Error(`sauvegarde incomplète : ${manquant}`);
}
