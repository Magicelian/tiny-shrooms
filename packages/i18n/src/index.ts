// Toutes les chaînes du jeu. Français seulement pour l'instant ; l'anglais reprendra les mêmes clés.
import { fr } from './fr';

export type Cle = keyof typeof fr;
export type Langue = 'fr';

const dictionnaires: Record<Langue, Record<Cle, string>> = { fr };
let langue: Langue = 'fr';

export function choisirLangue(l: Langue): void {
  langue = l;
}

/** Traduit une clé ; `{nom}` dans le texte est remplacé par `variables.nom`. */
export function t(cle: Cle, variables?: Record<string, string | number>): string {
  const texte = dictionnaires[langue][cle];
  if (!variables) return texte;
  return texte.replace(/\{(\w+)\}/g, (_, nom: string) => String(variables[nom] ?? `{${nom}}`));
}

/** Nombre formaté selon la langue. */
export function nombre(valeur: number, decimales = 0): string {
  return valeur.toLocaleString(langue, { maximumFractionDigits: decimales });
}
