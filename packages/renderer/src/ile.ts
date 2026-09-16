// Île en coupe : herbe, terre et roche empilées par colonne, décor posé sur les cases.
import * as THREE from 'three';
import type { Ile } from '@tiny-shrooms/engine';
import { COULEURS, COULEURS_SURFACE, materiau } from './palette';
import { bruit, centreCase } from './repere';

const GEOMETRIES = {
  cube: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(0.5, 1, 6).translate(0, 0.5, 0),
  boule: new THREE.IcosahedronGeometry(0.5, 0),
  caillou: new THREE.DodecahedronGeometry(0.5, 0),
};
type Forme = keyof typeof GEOMETRIES;

interface Piece {
  forme: Forme;
  couleur: number;
  matrice: THREE.Matrix4;
  ombre: 'porte' | 'recoit';
}

const HAUT_TERRE = -0.25;
const HAUT_ROCHE = -1;

export function construireIle(ile: Ile): THREE.Group {
  const pieces: Piece[] = [];
  const centre = new THREE.Vector3();
  const echelle = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const axeY = new THREE.Vector3(0, 1, 0);

  const poser = (forme: Forme, couleur: number, ombre: Piece['ombre'], position: THREE.Vector3, taille: THREE.Vector3, angle = 0) => {
    rotation.setFromAxisAngle(axeY, angle);
    pieces.push({ forme, couleur, ombre, matrice: new THREE.Matrix4().compose(position, rotation, taille) });
  };

  const bords = distancesAuBord(ile);
  for (let y = 0; y < ile.profondeur; y++) {
    for (let x = 0; x < ile.largeur; x++) {
      const terrain = ile.terrain[y * ile.largeur + x] ?? 'vide';
      if (terrain === 'vide') continue;
      centreCase(x, y, ile, centre);
      const b = bruit(x, y);

      // Colonne : surface, terre, puis roche plus profonde vers le centre.
      const hautSurface = terrain === 'eau' ? -0.12 : 0;
      poser('cube', COULEURS_SURFACE[terrain], 'recoit', centre.clone().setY(HAUT_TERRE), echelle.set(1, hautSurface - HAUT_TERRE, 1));
      poser('cube', COULEURS.terre, 'recoit', centre.clone().setY(HAUT_ROCHE), echelle.set(1, HAUT_TERRE - HAUT_ROCHE, 1));
      const profondeurRoche = Math.min(4, 0.5 + (bords[y * ile.largeur + x] ?? 0) * 0.8 + b * 0.5);
      poser('cube', COULEURS.roche, 'recoit', centre.clone().setY(HAUT_ROCHE - profondeurRoche), echelle.set(1, profondeurRoche, 1));

      // Décor, légèrement décalé pour casser la grille.
      const decalage = centre.clone().add(new THREE.Vector3((bruit(x, y, 1) - 0.5) * 0.3, 0, (bruit(x, y, 2) - 0.5) * 0.3));
      if (terrain === 'foret') {
        const t = 0.8 + b * 0.4;
        poser('cube', COULEURS.tronc, 'porte', decalage, echelle.set(0.16, 0.4 * t, 0.16));
        poser('cone', COULEURS.feuillage, 'porte', decalage.clone().setY(0.3 * t), echelle.set(0.8 * t, 1 * t, 0.8 * t), b * Math.PI);
      } else if (terrain === 'buisson') {
        poser('boule', COULEURS.buisson, 'porte', decalage.setY(0.2), echelle.setScalar(0.6 + b * 0.2), b * Math.PI);
      } else if (terrain === 'rocher') {
        poser('caillou', COULEURS.caillou, 'porte', decalage.setY(0.12), echelle.set(0.6, 0.45, 0.6), b * Math.PI);
      }
    }
  }
  return regrouper(pieces);
}

/** Regroupe les pièces par forme et couleur en maillages instanciés. */
function regrouper(pieces: Piece[]): THREE.Group {
  const lots = new Map<string, Piece[]>();
  for (const piece of pieces) {
    const cle = `${piece.forme}:${piece.couleur}:${piece.ombre}`;
    const lot = lots.get(cle);
    if (lot) lot.push(piece);
    else lots.set(cle, [piece]);
  }
  const groupe = new THREE.Group();
  for (const lot of lots.values()) {
    const { forme, couleur, ombre } = lot[0]!;
    const maillage = new THREE.InstancedMesh(GEOMETRIES[forme], materiau(couleur), lot.length);
    lot.forEach((piece, i) => maillage.setMatrixAt(i, piece.matrice));
    maillage.castShadow = true;
    maillage.receiveShadow = ombre === 'recoit';
    groupe.add(maillage);
  }
  return groupe;
}

/** Distance de chaque case au vide le plus proche (hors île compris), en pas de grille. */
function distancesAuBord(ile: Ile): number[] {
  const { largeur, profondeur } = ile;
  const distances = ile.terrain.map(() => Infinity);
  const file: number[] = [];
  ile.terrain.forEach((terrain, i) => {
    const x = i % largeur;
    const y = Math.floor(i / largeur);
    const auBord = x === 0 || y === 0 || x === largeur - 1 || y === profondeur - 1;
    if (terrain === 'vide' || auBord) {
      distances[i] = terrain === 'vide' ? -1 : 0;
      file.push(i);
    }
  });
  for (let tete = 0; tete < file.length; tete++) {
    const i = file[tete]!;
    const x = i % largeur;
    const y = Math.floor(i / largeur);
    const suivante = Math.max(0, distances[i]!) + 1;
    for (const [vx, vy] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (vx < 0 || vy < 0 || vx >= largeur || vy >= profondeur) continue;
      const v = vy * largeur + vx;
      if (distances[v]! > suivante) {
        distances[v] = suivante;
        file.push(v);
      }
    }
  }
  return distances;
}
