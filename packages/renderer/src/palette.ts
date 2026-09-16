// Palette limitée et matériaux partagés, ombrés en paliers.
import * as THREE from 'three';
import type { Terrain, TypeBatiment } from '@tiny-shrooms/engine';

export const COULEURS = {
  herbe: 0x7cc452,
  terre: 0x8a5a3b,
  roche: 0x6b6f7a,
  eau: 0x4fa3d9,
  feuillage: 0x3f8f3a,
  /** Couronne de l'arbre-mère : distincte du feuillage pour ne pas suivre les saisons. */
  couronne: 0x3f8f3b,
  tronc: 0x6b4226,
  buisson: 0x2f7d4a,
  caillou: 0x9a9ea8,
  pied: 0xf2e6cf,
  chantier: 0xd9c9a3,
  floraison: 0xf29ac2,
  mycelium: 0xf4ecd8,
  herisson: 0x7a5236,
  museau: 0xe0c29a,
  coquille: 0xd9822b,
  escargot: 0xc9d67a,
  luciole: 0xfff27a,
} as const;

export const CHAPEAUX = [0xd8423a, 0xe8a33d, 0x9b59d0, 0x3d8fe8, 0xf2f2e8] as const;

export const COULEURS_BATIMENT: Record<TypeBatiment, number> = {
  hutte: 0xd8423a,
  cueillette: 0xc2358a,
  tasDeBois: 0x9c6b3f,
  tapisDeMousse: 0x5fae6e,
  gardeManger: 0xe0b04a,
  remise: 0x7d5a44,
  sechoir: 0xe38a3a,
  feuDeCamp: 0xf2612d,
  atelier: 0x5b7fb8,
  relais: 0x8e6cc4,
};

/** Hauteur provisoire de chaque bâtiment, en unités de case. */
export const HAUTEURS_BATIMENT: Record<TypeBatiment, number> = {
  hutte: 1.1,
  cueillette: 0.7,
  tasDeBois: 0.55,
  tapisDeMousse: 0.2,
  gardeManger: 0.95,
  remise: 1.2,
  sechoir: 0.8,
  feuDeCamp: 0.35,
  atelier: 1.35,
  relais: 1.5,
};

export const COULEURS_SURFACE: Record<Exclude<Terrain, 'vide'>, number> = {
  herbe: COULEURS.herbe,
  foret: COULEURS.herbe,
  buisson: COULEURS.herbe,
  rocher: COULEURS.herbe,
  eau: COULEURS.eau,
};

/** Trois paliers de lumière, sans dégradé. */
const paliers = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
paliers.minFilter = THREE.NearestFilter;
paliers.magFilter = THREE.NearestFilter;
paliers.needsUpdate = true;

const cache = new Map<number, THREE.MeshToonMaterial>();

/** Matériau toon partagé pour une couleur donnée. */
export function materiau(couleur: number): THREE.MeshToonMaterial {
  let m = cache.get(couleur);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: couleur, gradientMap: paliers });
    cache.set(couleur, m);
  }
  return m;
}
