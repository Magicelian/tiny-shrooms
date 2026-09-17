// Placement sur la grille et bonus de voisinage. Emprise d'une case par bâtiment en V1.
// Les fonctions pures ne lisent que des types du contrat : le frontend s'en sert pour l'aperçu fantôme.
import type { Batiment, Case, IdBatiment, Ile, RaisonRefus, TypeBatiment } from './contrat';
import type { Contenu } from './contenu';
import type { Etat } from './etat';
import { dansLaSouche, elementEn, terrainEn } from './ile';

type Emprise = Pick<Batiment, 'id' | 'type' | 'case' | 'chantier'>;

/** Raison pour laquelle on ne peut pas bâtir sur `c`, ou `null` si la case est libre. */
export function emplacementRefuse(ile: Ile, batiments: readonly Emprise[], c: Case, ignorer?: IdBatiment): RaisonRefus | null {
  const terrain = terrainEn(ile, c.x, c.y);
  if (terrain === 'vide') return 'horsIle';
  if (terrain !== 'herbe' || dansLaSouche(ile, c.x, c.y) || elementEn(ile, c.x, c.y) >= 0) return 'emplacementOccupe';
  if (batiments.some((b) => b.id !== ignorer && b.case.x === c.x && b.case.y === c.y)) return 'emplacementOccupe';
  return null;
}

/** Vrai si ce type ne se bâtit qu'une fois et qu'il est déjà posé (chantier compris). */
export function dejaConstruit(contenu: Contenu, batiments: readonly Pick<Batiment, 'type'>[], type: TypeBatiment): boolean {
  return contenu.batiments[type].unique === true && batiments.some((b) => b.type === type);
}

/** Multiplicateur de voisinage qu'aurait un bâtiment de ce type posé sur `c` (1 = aucun bonus). */
export function bonusVoisinage(ile: Ile, batiments: readonly Emprise[], contenu: Contenu, type: TypeBatiment, c: Case): number {
  let bonus = 1;
  for (const regle of contenu.batiments[type].voisinage ?? []) {
    if (voisinTrouve(ile, batiments, c, regle.voisin)) bonus += regle.bonus;
  }
  return bonus;
}

export function verifierEmplacement(etat: Etat, c: Case, ignorer?: IdBatiment): RaisonRefus | null {
  return emplacementRefuse(etat.ile, etat.batiments, c, ignorer);
}

/** Cases où l'on peut bâtir, de la plus proche à la plus lointaine de la souche-dépôt. */
export function casesLibres(etat: Etat): Case[] {
  const { ile } = etat;
  const cases: Case[] = [];
  for (let y = 0; y < ile.profondeur; y++) {
    for (let x = 0; x < ile.largeur; x++) {
      if (verifierEmplacement(etat, { x, y }) === null) cases.push({ x, y });
    }
  }
  const cx = ile.souche.x + ile.tailleSouche / 2 - 0.5;
  const cy = ile.souche.y + ile.tailleSouche / 2 - 0.5;
  return cases.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
}

/** Recalcule le multiplicateur de voisinage de chaque bâtiment (à appeler après tout changement de la grille). */
export function majBonusVoisinage(etat: Etat, contenu: Contenu): void {
  for (const b of etat.batiments) b.bonusVoisinage = bonusVoisinage(etat.ile, etat.batiments, contenu, b.type, b.case);
}

function voisinTrouve(ile: Ile, batiments: readonly Emprise[], c: Case, voisin: string): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = c.x + dx;
      const y = c.y + dy;
      if (terrainEn(ile, x, y) === voisin) return true;
      if (batiments.some((b) => b.chantier === null && b.type === voisin && b.case.x === x && b.case.y === y)) return true;
    }
  }
  return false;
}
