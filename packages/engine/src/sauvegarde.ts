// Format du fichier de sauvegarde : un numéro de version et la partie complète (champ `etat`, nom d'origine).
// Aucun horodatage : le temps passé jeu fermé ne rapporte rien.
import type { Case, Ile } from './contrat';
import type { Etat, Partie } from './etat';
import { placerElements } from './ile';
import { prestigeNeuf } from './prestige';

export const VERSION_SAUVEGARDE = 13;

/** Première version du modèle actuel ; les parties plus anciennes ne se migrent pas (réorientation). */
export const PREMIERE_VERSION_LISIBLE = 4;

/** Sauvegarde valide mais antérieure à la réorientation : on repart de zéro après l'avoir archivée. */
export class SauvegardeAncienne extends Error {
  constructor(readonly version: number) {
    super(`sauvegarde d'avant la réorientation (version ${version})`);
  }
}

/** Une île sans son lien vers la partie, qui ferait une boucle. */
type IleSauvee = Omit<Etat, 'partie'>;

interface FichierSauvegarde {
  version: number;
  etat: Omit<Partie, 'iles'> & { iles: IleSauvee[] };
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
  // Version 12 : améliorations de l'atelier construites par les habitants ; plus d'annonce de stock plein.
  11: ({ stocksPleins: _stocksPleins, ...etat }) => ({
    ...etat,
    batiments: (etat.batiments as object[]).map((b) => ({ ...b, amelioration: null })),
  }),
  // Version 13 : archipel. L'île en cours devient la première ; stock, prestige et réglages deviennent communs.
  12: ({ pas, graine, stocks, arrivages, prestige, reglages, ...ile }) => {
    const { renaissances: _r, populationMax, ...reste } = prestige as { renaissances: number; populationMax: number };
    return {
      pas,
      graine,
      stocks,
      arrivages,
      prestige: reste,
      reglages,
      vue: 0,
      iles: [{ ...ile, graine, populationMax, offrande: {} }],
    };
  },
};

export function serialiser(partie: Readonly<Partie>): string {
  const iles = partie.iles.map(({ partie: _partie, ...ile }) => ile);
  const fichier: FichierSauvegarde = { version: VERSION_SAUVEGARDE, etat: { ...partie, iles } };
  return JSON.stringify(fichier);
}

/** Relit une sauvegarde et la migre ; lève une erreur si le fichier est illisible ou incomplet. */
export function charger(texte: string): Partie {
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
  const partie = etat as unknown as Partie;
  for (const ile of partie.iles) ile.partie = partie;
  return partie;
}

/**
 * Prend la première sauvegarde lisible, par ordre de préférence ; `null` s'il n'y en a aucune.
 * `ancienne` : au moins un fichier date d'avant la réorientation.
 */
export function chargerPremiereValide(textes: readonly string[]): { partie: Partie; rang: number } | { ancienne: true } | null {
  let ancienne = false;
  for (const [rang, texte] of textes.entries()) {
    try {
      return { partie: charger(texte), rang };
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
function verifier(partie: Record<string, unknown>): void {
  manquant(partie, ['pas', 'graine', 'vue'], ['iles'], ['stocks', 'reglages', 'arrivages', 'prestige']);
  const iles = partie.iles as unknown[];
  if (iles.length === 0 || !iles[partie.vue as number]) throw new Error('sauvegarde incomplète : vue');
  for (const ile of iles) {
    if (!estObjet(ile)) throw new Error('sauvegarde incomplète : iles');
    manquant(
      ile,
      ['graine', 'prochainId', 'prochainIdHabitant', 'pasAvantArrivee', 'palier', 'populationMax'],
      ['batiments', 'habitants', 'pousses', 'batimentsDebloques', 'defrichages'],
      ['ile', 'ameliorations', 'offrande'],
    );
  }
}

function manquant(objet: Record<string, unknown>, nombres: string[], tableaux: string[], objets: string[]): void {
  const cle =
    nombres.find((c) => !Number.isFinite(objet[c])) ??
    tableaux.find((c) => !Array.isArray(objet[c])) ??
    objets.find((c) => !estObjet(objet[c]));
  if (cle) throw new Error(`sauvegarde incomplète : ${cle}`);
}
