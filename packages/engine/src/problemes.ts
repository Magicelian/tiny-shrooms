import type { Instantane } from './contrat';

/** Ce qui mérite qu'on revienne voir le village : signalé par une pastille sur l'icône de la barre des menus. */
export type Probleme = 'faim' | 'froid';

/**
 * Problèmes en cours, dans un ordre stable. `froid` : l'hiver est là, on sait bâtir un feu de camp
 * mais aucun n'est achevé ; les habitants travaillent alors au ralenti partout.
 */
export function problemes(instantane: Instantane): Probleme[] {
  const liste: Probleme[] = [];
  if (instantane.faim) liste.push('faim');
  const auChaud = instantane.batiments.some((b) => b.type === 'feuDeCamp' && b.chantier === null);
  if (
    instantane.temps.saison === 'hiver' &&
    instantane.habitants.length > 0 &&
    instantane.batimentsDebloques.includes('feuDeCamp') &&
    !auChaud
  ) {
    liste.push('froid');
  }
  return liste;
}
