// Accueil au relais : un habitant fait signe tant qu'un visiteur attend, les visiteurs patientent à côté.
import * as THREE from 'three';
import type { Batiment, IdBatiment, IdVisiteur, Ile, TypeVisiteur, Visiteur } from '@tiny-shrooms/engine';
import { CHAPEAUX, COULEURS, HAUTEURS_BATIMENT, materiau } from './palette';
import { versMonde } from './repere';

const PIED = new THREE.CylinderGeometry(0.08, 0.1, 0.22, 6).translate(0, 0.11, 0);
const CHAPEAU = new THREE.SphereGeometry(0.17, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.2, 0);
const BRAS = new THREE.BoxGeometry(0.04, 0.16, 0.04).translate(0, 0.08, 0);
const BOULE = new THREE.SphereGeometry(0.5, 8, 6);
const ANNEAU = new THREE.TorusGeometry(0.1, 0.06, 5, 8);
const CORPS = new THREE.BoxGeometry(0.36, 0.06, 0.12).translate(0, 0.03, 0);

const ECHELLE = 1.7;
/** Places autour de la case du relais, en unités de case depuis son centre. */
const PLACES = [
  { x: 0, y: 0.85 },
  { x: 0.85, y: 0 },
  { x: -0.85, y: 0 },
  { x: 0, y: -0.85 },
];

interface Relais {
  groupe: THREE.Group;
  signe: THREE.Group;
  bras: THREE.Mesh;
}

export class Accueil {
  readonly groupe = new THREE.Group();
  private readonly relais = new Map<IdBatiment, Relais>();
  private readonly visiteurs = new Map<IdVisiteur, THREE.Group>();

  vider(): void {
    this.groupe.clear();
    this.relais.clear();
    this.visiteurs.clear();
  }

  appliquer(batiments: Batiment[], visiteurs: Visiteur[], ile: Ile): void {
    const construits = batiments.filter((b) => b.type === 'relais' && b.chantier === null);
    for (const [id, r] of this.relais) {
      if (construits.some((b) => b.id === id)) continue;
      this.groupe.remove(r.groupe);
      this.relais.delete(id);
    }
    // Les visiteurs se répartissent entre les relais, dans leur ordre d'arrivée.
    const parRelais = Math.ceil(visiteurs.length / Math.max(1, construits.length));
    construits.forEach((b, rang) => {
      const r = this.relais.get(b.id) ?? this.creerRelais(b.id);
      versMonde({ x: b.case.x + 0.5, y: b.case.y + 0.5 }, ile, r.groupe.position);
      const accueillis = visiteurs.slice(rang * parRelais, (rang + 1) * parRelais);
      r.signe.visible = accueillis.length > 0;
      accueillis.forEach((v, place) => {
        const figure = this.visiteurs.get(v.id) ?? this.creerVisiteur(v);
        const p = PLACES[place % PLACES.length]!;
        versMonde({ x: b.case.x + 0.5 + p.x, y: b.case.y + 0.5 + p.y }, ile, figure.position);
        figure.lookAt(r.groupe.position.x, 0, r.groupe.position.z);
      });
    });
    const presents = new Set(construits.length > 0 ? visiteurs.map((v) => v.id) : []);
    for (const [id, figure] of this.visiteurs) {
      if (presents.has(id)) continue;
      this.groupe.remove(figure);
      this.visiteurs.delete(id);
    }
  }

  animer(maintenant: number): void {
    const phase = maintenant / 150;
    for (const r of this.relais.values()) {
      if (!r.signe.visible) continue;
      r.bras.rotation.z = -2.2 + Math.sin(phase * 1.6) * 0.5;
      r.signe.position.y = HAUTEURS_BATIMENT.relais + Math.abs(Math.sin(phase)) * 0.08;
    }
    for (const [id, figure] of this.visiteurs) {
      if (figure.userData.type === 'luciole') figure.position.y = 0.45 + Math.sin(phase * 0.7 + id) * 0.12;
      else figure.scale.y = ECHELLE * (1 + Math.sin(phase * 0.5 + id) * 0.04);
    }
  }

  private creerRelais(id: IdBatiment): Relais {
    const groupe = new THREE.Group();
    const signe = new THREE.Group();
    const pied = new THREE.Mesh(PIED, materiau(COULEURS.pied));
    const chapeau = new THREE.Mesh(CHAPEAU, materiau(CHAPEAUX[1]));
    const bras = new THREE.Mesh(BRAS, materiau(COULEURS.pied));
    bras.position.set(0.07, 0.14, 0);
    signe.add(pied, chapeau, bras);
    signe.scale.setScalar(ECHELLE);
    signe.position.y = HAUTEURS_BATIMENT.relais;
    for (const m of [pied, chapeau, bras]) m.castShadow = true;
    groupe.add(signe);
    this.groupe.add(groupe);
    const r = { groupe, signe, bras };
    this.relais.set(id, r);
    return r;
  }

  private creerVisiteur(v: Visiteur): THREE.Group {
    const figure = new THREE.Group();
    for (const m of formes(v.type)) {
      m.castShadow = true;
      figure.add(m);
    }
    figure.scale.setScalar(ECHELLE);
    figure.userData.type = v.type;
    this.groupe.add(figure);
    this.visiteurs.set(v.id, figure);
    return figure;
  }
}

function formes(type: TypeVisiteur): THREE.Mesh[] {
  switch (type) {
    case 'herisson': {
      const dos = new THREE.Mesh(BOULE, materiau(COULEURS.herisson));
      dos.scale.set(0.3, 0.2, 0.22);
      dos.position.y = 0.08;
      const museau = new THREE.Mesh(BOULE, materiau(COULEURS.museau));
      museau.scale.setScalar(0.08);
      museau.position.set(0, 0.07, 0.15);
      return [dos, museau];
    }
    case 'escargot': {
      const corps = new THREE.Mesh(CORPS, materiau(COULEURS.escargot));
      corps.rotation.y = Math.PI / 2;
      const coquille = new THREE.Mesh(ANNEAU, materiau(COULEURS.coquille));
      coquille.position.set(0, 0.16, -0.04);
      coquille.rotation.y = Math.PI / 2;
      return [corps, coquille];
    }
    case 'luciole': {
      const luciole = new THREE.Mesh(BOULE, materiau(COULEURS.luciole));
      luciole.scale.setScalar(0.08);
      return [luciole];
    }
  }
}
