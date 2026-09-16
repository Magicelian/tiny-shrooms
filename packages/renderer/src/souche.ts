// Souche-dépôt : grosse souche au centre de l'île de départ, où les habitants déposent leurs récoltes.
import * as THREE from 'three';
import type { Ile } from '@tiny-shrooms/engine';
import { CHAPEAUX, COULEURS, materiau } from './palette';
import { versMonde } from './repere';

const TRONC = new THREE.CylinderGeometry(0.62, 0.78, 0.7, 9).translate(0, 0.35, 0);
const CERNE = new THREE.CylinderGeometry(0.5, 0.5, 0.04, 9).translate(0, 0.72, 0);
const RACINE = new THREE.BoxGeometry(0.5, 0.2, 0.22).translate(0.25, 0.1, 0);
const PIED = new THREE.CylinderGeometry(0.05, 0.06, 0.16, 6).translate(0, 0.08, 0);
const CHAPEAU = new THREE.SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.14, 0);

export class SoucheRendu {
  readonly groupe = new THREE.Group();

  constructor() {
    this.groupe.add(new THREE.Mesh(TRONC, materiau(COULEURS.tronc)));
    this.groupe.add(new THREE.Mesh(CERNE, materiau(COULEURS.cerne)));
    for (let i = 0; i < 4; i++) {
      const racine = new THREE.Mesh(RACINE, materiau(COULEURS.tronc));
      racine.position.set(Math.cos(i * 1.7 + 0.4) * 0.55, 0, Math.sin(i * 1.7 + 0.4) * 0.55);
      racine.rotation.y = -(i * 1.7 + 0.4);
      this.groupe.add(racine);
    }
    // Deux petits champignons sur le flanc, pour signaler le dépôt.
    for (const [x, z, taille] of [[0.45, 0.45, 1], [0.62, 0.15, 0.7]] as const) {
      const champignon = new THREE.Group();
      champignon.add(new THREE.Mesh(PIED, materiau(COULEURS.pied)), new THREE.Mesh(CHAPEAU, materiau(CHAPEAUX[0])));
      champignon.position.set(x, 0, z);
      champignon.scale.setScalar(taille);
      this.groupe.add(champignon);
    }
    this.groupe.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
    });
  }

  changerIle(ile: Ile): void {
    const milieu = ile.tailleSouche / 2;
    versMonde({ x: ile.souche.x + milieu, y: ile.souche.y + milieu }, ile, this.groupe.position);
  }
}
