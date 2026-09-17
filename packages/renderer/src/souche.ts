// Souche-dépôt : grosse souche au centre de l'île de départ, où les habitants déposent leurs récoltes.
import * as THREE from 'three';
import type { Ile } from '@tiny-shrooms/engine';
import { modeleSouche } from './modeles';
import { versMonde } from './repere';

export class SoucheRendu {
  readonly groupe = new THREE.Group();
  private maillage: THREE.Mesh | null = null;
  private taille = 0;

  changerIle(ile: Ile): void {
    this.groupe.visible = ile.soucheEnPlace;
    if (ile.tailleSouche !== this.taille) {
      this.taille = ile.tailleSouche;
      if (this.maillage) this.groupe.remove(this.maillage);
      const modele = modeleSouche(ile.tailleSouche);
      this.maillage = new THREE.Mesh(modele.geometrie, modele.materiaux);
      this.maillage.castShadow = this.maillage.receiveShadow = true;
      this.groupe.add(this.maillage);
    }
    const milieu = ile.tailleSouche / 2;
    versMonde({ x: ile.souche.x + milieu, y: ile.souche.y + milieu }, ile, this.groupe.position);
  }

  /** Pendant l'arrachage, la souche s'affaisse. */
  appliquer(retrait: number | null): void {
    this.groupe.scale.y = 1 - 0.7 * (retrait ?? 0);
  }
}
