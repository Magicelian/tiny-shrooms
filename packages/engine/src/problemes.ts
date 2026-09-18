import type { Contenu } from './contenu';
import type { Instantane } from './contrat';

/** Ce qui mérite qu'on revienne voir le village : signalé par une pastille sur l'icône de la barre des menus. */
export type Probleme = 'faim' | 'froid' | 'malheur';

/**
 * Problèmes en cours, dans un ordre stable. `froid` : l'hiver est là, on sait bâtir un feu de camp
 * mais aucun n'est achevé ; les habitants travaillent alors au ralenti partout. `malheur` : le bien-être moyen
 * est sous le seuil de départ, des habitants s'en vont.
 */
export function problemes(instantane: Instantane, contenu: Contenu): Probleme[] {
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
  const depart = contenu.habitants.depart;
  const n = instantane.habitants.length;
  if (depart && n > depart.minimum && instantane.habitants.reduce((s, h) => s + h.bienEtre, 0) / n < depart.seuil) {
    liste.push('malheur');
  }
  return liste;
}
