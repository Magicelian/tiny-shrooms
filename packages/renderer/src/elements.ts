// Éléments naturels récoltables : baies sur les buissons, bois mort, mousse ; ils disparaissent une fois récoltés.
import * as THREE from 'three';
import type { Ile, TypeElement } from '@tiny-shrooms/engine';
import { materiau } from './palette';
import { bruit, centreCase } from './repere';

const COULEURS_ELEMENT = { baie: 0xd8335a, bois: 0x8a6440, mousse: 0x3e9a5e } as const;

const BAIE = new THREE.IcosahedronGeometry(0.07, 0);
const BUCHE = new THREE.CylinderGeometry(0.07, 0.08, 0.6, 6).rotateZ(Math.PI / 2).translate(0, 0.08, 0);
const TAPIS = new THREE.CylinderGeometry(0.34, 0.38, 0.06, 8).translate(0, 0.03, 0);
const TOUFFE = new THREE.IcosahedronGeometry(0.1, 0);

interface ElementAffiche {
  type: TypeElement;
  objet: THREE.Group;
}

export class ElementsRendu {
  readonly groupe = new THREE.Group();
  private elements: ElementAffiche[] = [];

  changerIle(ile: Ile): void {
    this.groupe.clear();
    this.elements = ile.elements.map(({ type, case: c }) => {
      const objet = construire(type, bruit(c.x, c.y, 3));
      centreCase(c.x, c.y, ile, objet.position);
      objet.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = true;
      });
      this.groupe.add(objet);
      return { type, objet };
    });
  }

  /** `pousses` : repousse de chaque élément, entre 0 et 1 (1 = récoltable). */
  appliquer(pousses: readonly number[]): void {
    this.elements.forEach(({ type, objet }, i) => {
      const pousse = pousses[i] ?? 1;
      // La mousse repousse à vue ; baies et bois mort réapparaissent d'un coup.
      if (type === 'mousse') objet.scale.setScalar(pousse >= 1 ? 1 : 0.3 + 0.35 * pousse);
      else objet.visible = pousse >= 1;
    });
  }
}

function construire(type: TypeElement, b: number): THREE.Group {
  const groupe = new THREE.Group();
  const ajouter = (geometrie: THREE.BufferGeometry, couleur: number, x: number, y: number, z: number, angle = 0) => {
    const m = new THREE.Mesh(geometrie, materiau(couleur));
    m.position.set(x, y, z);
    m.rotation.y = angle;
    groupe.add(m);
  };
  if (type === 'buisson') {
    // Posées sur le buisson sauvage dessiné avec le terrain.
    for (let i = 0; i < 4; i++) {
      const angle = i * 1.6 + b * 6;
      ajouter(BAIE, COULEURS_ELEMENT.baie, Math.cos(angle) * 0.24, 0.3 + (i % 2) * 0.1, Math.sin(angle) * 0.24);
    }
  } else if (type === 'boisMort') {
    ajouter(BUCHE, COULEURS_ELEMENT.bois, 0, 0, -0.08, b * Math.PI);
    ajouter(BUCHE, COULEURS_ELEMENT.bois, 0, 0.12, 0.04, b * Math.PI + 0.9);
  } else {
    ajouter(TAPIS, COULEURS_ELEMENT.mousse, 0, 0, 0);
    ajouter(TOUFFE, COULEURS_ELEMENT.mousse, 0.12, 0.08, 0.05);
    ajouter(TOUFFE, COULEURS_ELEMENT.mousse, -0.1, 0.07, -0.1);
  }
  return groupe;
}
