// Génération des îles (un terrain par biome) et lecture du terrain.
import type { Biome, Case, ElementNaturel, Ile, Position, Terrain, TypeElement } from './contrat';
import { creerHasard } from './hasard';

const TAILLE_SOUCHE = 2;
/** Éléments semés sur l'herbe, en plus d'un buisson récoltable sur chaque case de buisson sauvage. */
const ELEMENTS_EPARS: Record<Biome, Partial<Record<TypeElement, number>>> = {
  foret: { boisMort: 3, mousse: 3 },
  marais: { boisMort: 1, mousse: 6 },
  prairie: { boisMort: 2, mousse: 1 },
};

/**
 * Île ronde, la souche-dépôt au centre ; même graine et même biome, même île. Forêt : bordée d'arbres, une
 * mare. Marais : bordé de roseaux (quelques arbres, peu de buissons), trois mares cernées de roseaux.
 * Prairie : bordée de fleurs et de buissons sauvages, presque sans arbres, une mare.
 */
export function genererIle(taille: number, graine: number, biome: Biome = 'foret'): Ile {
  const hasard = creerHasard(graine);
  const milieu = taille / 2;
  const rayon = taille * 0.47;
  const angleMare = hasard() * Math.PI * 2;
  const mares = biome === 'marais' ? 3 : 1;
  const centresMares = Array.from({ length: mares }, (_, i) => {
    const angle = angleMare + (i * Math.PI * 2) / mares;
    return { x: milieu + Math.cos(angle) * taille * 0.22, y: milieu + Math.sin(angle) * taille * 0.22 };
  });
  const souche = { x: Math.floor(milieu) - TAILLE_SOUCHE / 2, y: Math.floor(milieu) - TAILLE_SOUCHE / 2 };

  const terrain: Terrain[] = [];
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const d = Math.hypot(x + 0.5 - milieu, y + 0.5 - milieu);
      const r = hasard();
      // Les abords de la souche restent dégagés.
      const presDeLaSouche = x >= souche.x - 1 && x <= souche.x + TAILLE_SOUCHE && y >= souche.y - 1 && y <= souche.y + TAILLE_SOUCHE;
      const versMare = Math.min(...centresMares.map((m) => Math.hypot(x + 0.5 - m.x, y + 0.5 - m.y)));
      let t: Terrain = 'herbe';
      if (d > rayon + r * 0.4) t = 'vide';
      else if (presDeLaSouche) t = 'herbe';
      else if (biome === 'marais') t = terrainMarais(d > rayon - 1.4 + r * 0.8, versMare, r);
      else if (biome === 'prairie') t = terrainPrairie(d > rayon - 1.4 + r * 0.8, versMare, r);
      else if (d > rayon - 1.4 + r * 0.8) t = r < 0.8 ? 'foret' : 'buisson';
      else if (versMare < 1.3) t = 'eau';
      else if (r < 0.05) t = 'rocher';
      else if (r < 0.12) t = 'buisson';
      terrain.push(t);
    }
  }
  const ile: Ile = { biome, largeur: taille, profondeur: taille, terrain, souche, tailleSouche: TAILLE_SOUCHE, soucheEnPlace: true, elements: [] };
  ile.elements = placerElements(ile, graine, []);
  return ile;
}

/** Case du marais hors des abords de la souche : `lisiere` vaut vrai sur le pourtour de l'île. */
function terrainMarais(lisiere: boolean, versMare: number, r: number): Terrain {
  if (lisiere) return r < 0.72 ? 'roseaux' : r < 0.86 ? 'foret' : r < 0.92 ? 'buisson' : 'eau';
  if (versMare < 1.1) return 'eau';
  if (versMare < 1.9 && r < 0.3) return 'roseaux';
  if (r < 0.03) return 'rocher';
  if (r < 0.05) return 'buisson';
  return 'herbe';
}

/** Case de la prairie hors des abords de la souche : `lisiere` vaut vrai sur le pourtour de l'île. */
function terrainPrairie(lisiere: boolean, versMare: number, r: number): Terrain {
  if (lisiere) return r < 0.5 ? 'fleurs' : r < 0.88 ? 'buisson' : 'foret';
  if (versMare < 1.3) return 'eau';
  if (r < 0.02) return 'rocher';
  if (r < 0.14) return 'buisson';
  if (r < 0.22) return 'fleurs';
  return 'herbe';
}

/**
 * Éléments naturels de l'île : un buisson par case de buisson sauvage, puis du bois mort et de la mousse
 * sur l'herbe, hors des abords de la souche et des cases `occupees`. Même graine, mêmes éléments.
 */
export function placerElements(ile: Omit<Ile, 'elements'>, graine: number, occupees: readonly Case[]): ElementNaturel[] {
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
  for (const [type, base] of Object.entries(ELEMENTS_EPARS[ile.biome]) as [TypeElement, number][]) {
    for (let i = 0; i < base && candidates.length > 0; i++) {
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
