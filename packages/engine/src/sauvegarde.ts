// Format du fichier de sauvegarde : un numéro de version et l'état complet.
// Aucun horodatage : le temps passé jeu fermé ne rapporte rien.
import type { Etat } from './etat';

export const VERSION_SAUVEGARDE = 1;

interface FichierSauvegarde {
  version: number;
  etat: Etat;
}

/**
 * Migrations successives : `MIGRATIONS[v]` convertit une sauvegarde de la version `v`
 * vers la version `v + 1`. Toute évolution du format ajoute une entrée ici.
 */
const MIGRATIONS: Record<number, (etat: Record<string, unknown>) => Record<string, unknown>> = {};

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
  for (; version < VERSION_SAUVEGARDE; version++) {
    const migrer = MIGRATIONS[version];
    if (!migrer) throw new Error(`aucune migration depuis la version ${version}`);
    etat = migrer(etat as Record<string, unknown>);
  }
  verifier(etat as Record<string, unknown>);
  return etat as Etat;
}

/** Prend la première sauvegarde lisible, par ordre de préférence ; `null` s'il n'y en a aucune. */
export function chargerPremiereValide(textes: readonly string[]): { etat: Etat; rang: number } | null {
  for (const [rang, texte] of textes.entries()) {
    try {
      return { etat: charger(texte), rang };
    } catch {
      // Fichier tronqué ou abîmé : on passe à la copie suivante.
    }
  }
  return null;
}

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

/** Contrôle de forme : suffit à écarter un fichier tronqué ou modifié à la main. */
function verifier(etat: Record<string, unknown>): void {
  const nombres = ['pas', 'graine', 'prochainId', 'prochainIdHabitant', 'pasAvantArrivee'];
  const tableaux = ['batiments', 'habitants', 'batimentsDebloques', 'stocksPleins'];
  const objets = ['ile', 'stocks', 'priorites', 'arbreMere', 'reglages'];
  const manquant =
    nombres.find((cle) => !Number.isFinite(etat[cle])) ??
    tableaux.find((cle) => !Array.isArray(etat[cle])) ??
    objets.find((cle) => !estObjet(etat[cle]));
  if (manquant) throw new Error(`sauvegarde incomplète : ${manquant}`);
}
