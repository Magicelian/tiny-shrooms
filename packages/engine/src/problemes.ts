import type { Contenu } from './contenu';
import type { Batiment, Habitant, Instantane, Probleme, Saison, TypeBatiment } from './contrat';

/** Ce qu'il faut savoir d'une île pour y repérer les problèmes : une île du moteur comme un instantané conviennent. */
export interface VueProblemes {
  faim?: boolean;
  batiments: readonly Pick<Batiment, 'type' | 'chantier'>[];
  habitants: readonly Pick<Habitant, 'bienEtre'>[];
  batimentsDebloques: readonly TypeBatiment[];
}

/**
 * Problèmes en cours sur une île, dans un ordre stable. `froid` : l'hiver est là, on sait bâtir un feu de camp
 * mais aucun n'est achevé ; les habitants travaillent alors au ralenti partout. `malheur` : le bien-être moyen
 * est sous le seuil de départ, des habitants s'en vont.
 */
export function problemesDe(ile: VueProblemes, saison: Saison, contenu: Contenu): Probleme[] {
  const liste: Probleme[] = [];
  if (ile.faim) liste.push('faim');
  const auChaud = ile.batiments.some((b) => b.type === 'feuDeCamp' && b.chantier === null);
  if (saison === 'hiver' && ile.habitants.length > 0 && ile.batimentsDebloques.includes('feuDeCamp') && !auChaud) {
    liste.push('froid');
  }
  const depart = contenu.habitants.depart;
  const n = ile.habitants.length;
  if (depart && n > depart.minimum && ile.habitants.reduce((s, h) => s + h.bienEtre, 0) / n < depart.seuil) {
    liste.push('malheur');
  }
  return liste;
}

/** Problèmes de toutes les îles réunis, dans l'ordre stable de `Probleme`, sans doublon. */
export function problemes(instantane: Pick<Instantane, 'iles'>): Probleme[] {
  const ordre: Probleme[] = ['faim', 'froid', 'malheur'];
  return ordre.filter((p) => instantane.iles.some((ile) => ile.problemes.includes(p)));
}
