// Éléments naturels récoltables : baies sur les buissons, bois mort, mousse ; ils disparaissent une fois récoltés.
import * as THREE from 'three';
import type { Ile, TypeElement } from '@tiny-shrooms/engine';
import { modelesElements } from './modeles';
import { bruit, centreCase } from './repere';

const MODELE_PAR_TYPE = { buisson: 'baies', boisMort: 'bois', mousse: 'mousse' } as const;

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
  const modele = modelesElements()[MODELE_PAR_TYPE[type]];
  const groupe = new THREE.Group();
  const maillage = new THREE.Mesh(modele.geometrie, modele.materiaux);
  // Quart de tour au hasard : les baies restent sur le buisson, les bûches changent de sens.
  maillage.rotation.y = Math.floor(b * 4) * (Math.PI / 2);
  groupe.add(maillage);
  return groupe;
}
