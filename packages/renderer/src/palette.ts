// Palette limitée et matériaux partagés, ombrés en paliers.
import * as THREE from 'three';
import type { Biome, Terrain, TypeBatiment } from '@tiny-shrooms/engine';

export const COULEURS = {
  herbe: 0x7cc452,
  terre: 0x8a5a3b,
  roche: 0x6b6f7a,
  eau: 0x4fa3d9,
  feuillage: 0x3f8f3a,
  tronc: 0x6b4226,
  buisson: 0x2f7d4a,
  roseau: 0x86a83c,
  massette: 0x6b3f22,
  nenuphar: 0x3f8a4a,
  fleurNenuphar: 0xf2a6c8,
  tige: 0x4f9a3c,
  /** Chapeaux des champignons luisants de la grotte : ils brillent, plus fort la nuit (`Ambiance`). */
  luisant: 0x5ff0e6,
  piedLuisant: 0xc9d4f2,
  /** Vieux chênes de la futaie : tronc épais, feuillage sombre. */
  troncChene: 0x5a3a24,
  feuillageChene: 0x2e6e35,
  feuillageCheneClair: 0x4a8f3e,
  caillou: 0x9a9ea8,
  pied: 0xf2e6cf,
  chantier: 0xd9c9a3,
  /** Dessus de la souche-dépôt. */
  cerne: 0xc9a06a,
} as const;

export const CHAPEAUX = [0xd8423a, 0xe8a33d, 0x9b59d0, 0x3d8fe8, 0xf2f2e8] as const;

export const COULEURS_BATIMENT: Record<TypeBatiment, number> = {
  hutte: 0xd8423a,
  cueillette: 0xc2358a,
  tasDeBois: 0x9c6b3f,
  tapisDeMousse: 0x5fae6e,
  tourbiere: 0x6b4a33,
  ruche: 0xe2b04e,
  champignonniere: 0x7a5fb8,
  scierie: 0xb5703a,
  gardeManger: 0xe0b04a,
  remise: 0x7d5a44,
  sechoir: 0xe38a3a,
  feuDeCamp: 0xf2612d,
  atelier: 0x5b7fb8,
  puits: 0x6fa8c9,
  marche: 0xd9a441,
  sanctuaire: 0xb58fd6,
};

export const COULEURS_SURFACE: Record<Exclude<Terrain, 'vide'>, number> = {
  herbe: COULEURS.herbe,
  foret: COULEURS.herbe,
  roseaux: COULEURS.herbe,
  fleurs: COULEURS.herbe,
  luisants: COULEURS.herbe,
  chenes: COULEURS.herbe,
  buisson: COULEURS.herbe,
  rocher: COULEURS.herbe,
  eau: COULEURS.eau,
};

/** Le marais : herbe plus sombre et eau verdâtre. */
const HERBE_MARAIS = 0x6f9a4c;
/** La prairie : herbe tendre, plus claire. */
const HERBE_PRAIRIE = 0x95d35e;
/** La grotte : mousse sombre bleu-violet, eau plus profonde. */
const MOUSSE_GROTTE = 0x5d5a9e;
/** La futaie : herbe ombragée, vert profond. */
const HERBE_FUTAIE = 0x5f9e4a;
/** Même couleur sur toute l'île, sauf l'eau. */
function surfaces(sol: number, eau: number): Record<Exclude<Terrain, 'vide'>, number> {
  return { herbe: sol, foret: sol, roseaux: sol, fleurs: sol, luisants: sol, chenes: sol, buisson: sol, rocher: sol, eau };
}
export const SURFACES_PAR_BIOME: Record<Biome, Record<Exclude<Terrain, 'vide'>, number>> = {
  foret: COULEURS_SURFACE,
  marais: surfaces(HERBE_MARAIS, 0x4a9a8e),
  prairie: surfaces(HERBE_PRAIRIE, COULEURS.eau),
  grotte: surfaces(MOUSSE_GROTTE, 0x3d74a8),
  futaie: surfaces(HERBE_FUTAIE, 0x4a93b8),
};

/** Trois paliers de lumière, sans dégradé. */
const paliers = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
paliers.minFilter = THREE.NearestFilter;
paliers.magFilter = THREE.NearestFilter;
paliers.needsUpdate = true;

const cache = new Map<number, THREE.MeshToonMaterial>();

/** Part de la neige tombée, de 0 à 1, réglée par l'ambiance au fil de l'hiver. */
export const NEIGE = { value: 0 };
const BLANC_NEIGE = 'vec3(0.93, 0.96, 1.0)';

/**
 * Neige sur les faces du dessus : l'attribut `neige` d'une face (seuil tiré par voxel, 0 = jamais) la
 * blanchit dès que `NEIGE` l'atteint ; elle s'accumule ainsi voxel par voxel. Une géométrie sans cet
 * attribut le lit à 0 et ne blanchit pas.
 */
function injecterNeige(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.uniforms.uNeige = NEIGE;
  shader.vertexShader =
    'attribute float neige;\nvarying float vNeige;\n' +
    shader.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n  vNeige = neige;');
  shader.fragmentShader =
    'uniform float uNeige;\nvarying float vNeige;\n' +
    shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>\n  if (vNeige > 0.0 && uNeige >= vNeige) diffuseColor.rgb = ${BLANC_NEIGE} * vColor.rgb;`,
    );
}

/**
 * Matériau toon partagé pour une couleur donnée. L'attribut `color` des géométries nuance la couleur
 * (voxels) : toute géométrie dessinée avec ces matériaux doit en avoir un (`sansNuance` sinon).
 */
export function materiau(couleur: number): THREE.MeshToonMaterial {
  let m = cache.get(couleur);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: couleur, gradientMap: paliers, vertexColors: true });
    m.onBeforeCompile = injecterNeige;
    cache.set(couleur, m);
  }
  return m;
}
