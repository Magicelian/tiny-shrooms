// Toutes les chaînes du jeu, en français et en anglais (mêmes clés).
import { en } from './en';
import { fr } from './fr';

export type Cle = keyof typeof fr;
export type Langue = 'fr' | 'en';
export const LANGUES: readonly Langue[] = ['fr', 'en'];

const dictionnaires: Record<Langue, Record<Cle, string>> = { fr, en };
let langue: Langue = langueSysteme();
const abonnes = new Set<(l: Langue) => void>();

/** Langue du système si le jeu la parle, l'anglais sinon. */
export function langueSysteme(): Langue {
  const code = (globalThis.navigator?.language ?? 'fr').slice(0, 2).toLowerCase();
  return code === 'fr' ? 'fr' : 'en';
}

export function langueActuelle(): Langue {
  return langue;
}

export function choisirLangue(l: Langue): void {
  if (l === langue) return;
  langue = l;
  for (const f of abonnes) f(l);
}

/** Appelé à chaque changement de langue ; renvoie de quoi se désabonner. */
export function surLangue(f: (l: Langue) => void): () => void {
  abonnes.add(f);
  return () => abonnes.delete(f);
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
