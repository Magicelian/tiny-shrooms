// Passage des coordonnées du contrat (cases) au monde Three.js : l'île est centrée sur l'origine,
// y du contrat devient z, la surface de l'herbe est à y = 0.
import * as THREE from 'three';
import type { Ile, Position } from '@tiny-shrooms/engine';

export function versMonde(position: Position, ile: Ile, cible = new THREE.Vector3()): THREE.Vector3 {
  return cible.set(position.x - ile.largeur / 2, 0, position.y - ile.profondeur / 2);
}

/** Centre de la case (x, y). */
export function centreCase(x: number, y: number, ile: Ile, cible?: THREE.Vector3): THREE.Vector3 {
  return versMonde({ x: x + 0.5, y: y + 0.5 }, ile, cible);
}

/** Bruit déterministe dans [0, 1) pour varier le décor sans l'animer. */
export function bruit(x: number, y: number, graine = 0): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + graine * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
