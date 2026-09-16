// Placement sur la grille et bonus de voisinage. Emprise d'une case par bâtiment en V1.
import type { Case, IdBatiment, RaisonRefus } from './contrat';
import type { Contenu } from './contenu';
import type { Etat } from './etat';
import { dansLArbre, terrainEn } from './ile';

export function verifierEmplacement(etat: Etat, c: Case, ignorer?: IdBatiment): RaisonRefus | null {
  const terrain = terrainEn(etat.ile, c.x, c.y);
  if (terrain === 'vide') return 'horsIle';
  if (terrain !== 'herbe' || dansLArbre(etat.ile, c.x, c.y)) return 'emplacementOccupe';
  if (etat.batiments.some((b) => b.id !== ignorer && b.case.x === c.x && b.case.y === c.y)) return 'emplacementOccupe';
  return null;
}

/** Cases où l'on peut bâtir, de la plus proche à la plus lointaine de l'arbre-mère. */
export function casesLibres(etat: Etat): Case[] {
  const { ile } = etat;
  const cases: Case[] = [];
  for (let y = 0; y < ile.profondeur; y++) {
    for (let x = 0; x < ile.largeur; x++) {
      if (verifierEmplacement(etat, { x, y }) === null) cases.push({ x, y });
    }
  }
  const cx = ile.arbreMere.x + ile.tailleArbreMere / 2 - 0.5;
  const cy = ile.arbreMere.y + ile.tailleArbreMere / 2 - 0.5;
  return cases.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
}

/** Recalcule le multiplicateur de voisinage de chaque bâtiment (à appeler après tout changement de la grille). */
export function majBonusVoisinage(etat: Etat, contenu: Contenu): void {
  for (const b of etat.batiments) {
    const regles = contenu.batiments[b.type].voisinage ?? [];
    let bonus = 1;
    for (const regle of regles) {
      if (voisinTrouve(etat, b.case, regle.voisin)) bonus += regle.bonus;
    }
    b.bonusVoisinage = bonus;
  }
}

function voisinTrouve(etat: Etat, c: Case, voisin: string): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = c.x + dx;
      const y = c.y + dy;
      if (terrainEn(etat.ile, x, y) === voisin) return true;
      if (etat.batiments.some((b) => b.chantier === null && b.type === voisin && b.case.x === x && b.case.y === y)) return true;
    }
  }
  return false;
}
