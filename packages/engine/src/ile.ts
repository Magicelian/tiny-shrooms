// Génération de l'île de forêt et lecture du terrain.
import type { Case, ElementNaturel, Ile, Position, Terrain, TypeElement } from './contrat';
import { creerHasard } from './hasard';

const TAILLE_SOUCHE = 2;
/** Éléments semés sur l'herbe, en plus d'un buisson récoltable sur chaque case de buisson sauvage. */
const ELEMENTS_EPARS: Partial<Record<TypeElement, number>> = { boisMort: 3, mousse: 3 };

/** Part des ressources naturelles retirée à chaque renaissance, et au plus. */
const RARETE_PAR_RENAISSANCE = 0.15;
const RARETE_MAX = 0.6;

/** Part des buissons et des éléments épars qui manque sur l'île d'une n-ième renaissance. */
export function rarete(renaissances: number): number {
  return Math.min(RARETE_MAX, RARETE_PAR_RENAISSANCE * renaissances);
}

/**
 * Île ronde bordée de forêt, avec une mare et la souche-dépôt au centre ; même graine, même île.
 * `renaissances` : chaque île suivante porte moins de buissons, de bois mort et de mousse.
 */
export function genererIle(taille: number, graine: number, renaissances = 0): Ile {
  const abondance = 1 - rarete(renaissances);
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
      else if (d > rayon - 1.4 + r * 0.8) t = r < 1 - 0.2 * abondance ? 'foret' : 'buisson';
      else if (Math.hypot(x + 0.5 - mare.x, y + 0.5 - mare.y) < 1.3) t = 'eau';
      else if (r < 0.05) t = 'rocher';
      else if (r < 0.05 + 0.07 * abondance) t = 'buisson';
      terrain.push(t);
    }
  }
  const ile: Ile = { biome: 'foret', largeur: taille, profondeur: taille, terrain, souche, tailleSouche: TAILLE_SOUCHE, soucheEnPlace: true, elements: [] };
  ile.elements = placerElements(ile, graine, [], renaissances);
  return ile;
}

/**
 * Éléments naturels de l'île : un buisson par case de buisson sauvage, puis du bois mort et de la mousse
 * sur l'herbe, hors des abords de la souche et des cases `occupees`. Même graine, mêmes éléments.
 */
export function placerElements(ile: Omit<Ile, 'elements'>, graine: number, occupees: readonly Case[], renaissances = 0): ElementNaturel[] {
  const hasard = creerHasard(graine * 31 + 7);
  const elements: ElementNaturel[] = [];
  const candidates: Case[] = [];
  for (let y = 0; y < ile.profondeur; y++) {
    for (let x = 0; x < ile.largeur; x++) {
      const terrain = terrainEn(ile, x, y);
      if (terrain === 'buisson') elements.push({ type: 'buisson', case: { x, y } });
      const loinDeLaSouche = x < ile.souche.x - 1 || x > ile.souche.x + ile.tailleSouche || y < ile.souche.y - 1 || y > ile.souche.y + ile.tailleSouche;
      if (terrain === 'herbe' && loinDeLaSouche && !occupees.some((c) => c.x === x && c.y === y)) candidates.push({ x, y });
    }
  }
  for (const [type, base] of Object.entries(ELEMENTS_EPARS) as [TypeElement, number][]) {
    const nombre = Math.max(1, Math.round(base * (1 - rarete(renaissances))));
    for (let i = 0; i < nombre && candidates.length > 0; i++) {
      const [c] = candidates.splice(Math.floor(hasard() * candidates.length), 1);
      elements.push({ type, case: c! });
    }
  }
  return elements;
}

export function elementEn(ile: Ile, x: number, y: number): number {
  return ile.elements.findIndex((e) => e.case.x === x && e.case.y === y);
}

/** Terrain de la case, `vide` hors de la grille. */
export function terrainEn(ile: Pick<Ile, 'largeur' | 'profondeur' | 'terrain'>, x: number, y: number): Terrain {
  if (x < 0 || y < 0 || x >= ile.largeur || y >= ile.profondeur) return 'vide';
  return ile.terrain[y * ile.largeur + x] ?? 'vide';
}

export function dansLaSouche(ile: Ile, x: number, y: number): boolean {
  if (!ile.soucheEnPlace) return false;
  const { souche: a, tailleSouche: t } = ile;
  return x >= a.x && x < a.x + t && y >= a.y && y < a.y + t;
}

export function centreSouche(ile: Ile): Position {
  return { x: ile.souche.x + ile.tailleSouche / 2, y: ile.souche.y + ile.tailleSouche / 2 };
}
