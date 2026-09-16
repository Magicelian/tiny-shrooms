// Génération de l'île de forêt et lecture du terrain.
import type { Ile, Position, Terrain } from './contrat';
import { creerHasard } from './hasard';

const TAILLE_SOUCHE = 2;

/** Île ronde bordée de forêt, avec une mare et la souche-dépôt au centre ; même graine, même île. */
export function genererIle(taille: number, graine: number): Ile {
  const hasard = creerHasard(graine);
  const milieu = taille / 2;
  const rayon = taille * 0.47;
  const angleMare = hasard() * Math.PI * 2;
  const mare = { x: milieu + Math.cos(angleMare) * taille * 0.22, y: milieu + Math.sin(angleMare) * taille * 0.22 };
  const souche = { x: Math.floor(milieu) - TAILLE_SOUCHE / 2, y: Math.floor(milieu) - TAILLE_SOUCHE / 2 };

  const terrain: Terrain[] = [];
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const d = Math.hypot(x + 0.5 - milieu, y + 0.5 - milieu);
      const r = hasard();
      // Les abords de la souche restent dégagés.
      const presDeLaSouche = x >= souche.x - 1 && x <= souche.x + TAILLE_SOUCHE && y >= souche.y - 1 && y <= souche.y + TAILLE_SOUCHE;
      let t: Terrain = 'herbe';
      if (d > rayon + r * 0.4) t = 'vide';
      else if (presDeLaSouche) t = 'herbe';
      else if (d > rayon - 1.4 + r * 0.8) t = r < 0.8 ? 'foret' : 'buisson';
      else if (Math.hypot(x + 0.5 - mare.x, y + 0.5 - mare.y) < 1.3) t = 'eau';
      else if (r < 0.05) t = 'rocher';
      else if (r < 0.12) t = 'buisson';
      terrain.push(t);
    }
  }
  return { biome: 'foret', largeur: taille, profondeur: taille, terrain, souche, tailleSouche: TAILLE_SOUCHE };
}

/** Terrain de la case, `vide` hors de la grille. */
export function terrainEn(ile: Ile, x: number, y: number): Terrain {
  if (x < 0 || y < 0 || x >= ile.largeur || y >= ile.profondeur) return 'vide';
  return ile.terrain[y * ile.largeur + x] ?? 'vide';
}

export function dansLaSouche(ile: Ile, x: number, y: number): boolean {
  const { souche: a, tailleSouche: t } = ile;
  return x >= a.x && x < a.x + t && y >= a.y && y < a.y + t;
}

export function centreSouche(ile: Ile): Position {
  return { x: ile.souche.x + ile.tailleSouche / 2, y: ile.souche.y + ile.tailleSouche / 2 };
}
