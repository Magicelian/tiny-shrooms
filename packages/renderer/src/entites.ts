// Bâtiments, habitants et souche-dépôt en formes provisoires, synchronisés sur les instantanés.
import * as THREE from 'three';
import type { Batiment, Habitant, IdBatiment, IdHabitant, Ile, Instantane } from '@tiny-shrooms/engine';
import { PAS_DE_SIMULATION_MS } from '@tiny-shrooms/engine';
import { CHAPEAUX, COULEURS, COULEURS_BATIMENT, HAUTEURS_BATIMENT, materiau } from './palette';
import { versMonde } from './repere';
import { SoucheRendu } from './souche';

const CUBE = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const PIED = new THREE.CylinderGeometry(0.08, 0.1, 0.22, 6).translate(0, 0.11, 0);
const CHAPEAU = new THREE.SphereGeometry(0.17, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.2, 0);

/** Les habitants sont volontairement grands par rapport aux cases, pour rester lisibles. */
const ECHELLE_HABITANT = 1.7;

interface HabitantAffiche {
  objet: THREE.Group;
  depuis: THREE.Vector3;
  vers: THREE.Vector3;
  debut: number;
  donnees: Habitant;
}

export class Entites {
  readonly groupe = new THREE.Group();
  private readonly batiments = new Map<IdBatiment, THREE.Mesh>();
  private readonly habitants = new Map<IdHabitant, HabitantAffiche>();
  private readonly souche = new SoucheRendu();
  private ile: Ile | null = null;

  constructor() {
    this.groupe.add(this.souche.groupe);
  }

  changerIle(ile: Ile): void {
    this.ile = ile;
    for (const m of this.batiments.values()) this.groupe.remove(m);
    for (const h of this.habitants.values()) this.groupe.remove(h.objet);
    this.batiments.clear();
    this.habitants.clear();
    this.souche.changerIle(ile);
  }

  appliquer(instantane: Instantane, maintenant: number): void {
    const ile = this.ile;
    if (!ile) return;
    this.synchroniserBatiments(instantane.batiments, ile);
    this.synchroniserHabitants(instantane.habitants, ile, maintenant);
  }

  /** Maillages des bâtiments, pour savoir lequel est sous la souris. */
  maillagesBatiments(): THREE.Object3D[] {
    return [...this.batiments.values()];
  }

  /** Mouvements entre deux instantanés et petites animations. */
  animer(maintenant: number): void {
    for (const h of this.habitants.values()) {
      const t = Math.min(1, (maintenant - h.debut) / PAS_DE_SIMULATION_MS);
      h.objet.position.lerpVectors(h.depuis, h.vers, t);
      const { activite } = h.donnees;
      const phase = maintenant / 90 + h.donnees.id;
      if (activite === 'marche' || activite === 'porte') {
        h.objet.position.y = Math.abs(Math.sin(phase)) * 0.06;
      } else if (activite === 'recolte' || activite === 'construit' || activite === 'tient') {
        h.objet.rotation.z = Math.sin(phase * 0.8) * 0.2;
      }
      h.objet.scale.y = ECHELLE_HABITANT * (activite === 'dort' ? 0.7 : 1);
    }
  }

  private synchroniserBatiments(batiments: Batiment[], ile: Ile): void {
    const vus = new Set<IdBatiment>();
    for (const b of batiments) {
      vus.add(b.id);
      let maillage = this.batiments.get(b.id);
      if (!maillage) {
        maillage = new THREE.Mesh(CUBE);
        maillage.castShadow = maillage.receiveShadow = true;
        maillage.userData.id = b.id;
        this.batiments.set(b.id, maillage);
        this.groupe.add(maillage);
      }
      // Emprise provisoire d'une case ; la vraie taille viendra de packages/content.
      versMonde({ x: b.case.x + 0.5, y: b.case.y + 0.5 }, ile, maillage.position);
      maillage.rotation.y = (-b.orientation * Math.PI) / 2;
      // Rang d'un logement : chaque montée en gamme le rehausse d'un tiers.
      const hauteur = HAUTEURS_BATIMENT[b.type] * (1 + (b.niveau - 1) / 3);
      const avancement = b.chantier === null ? 1 : Math.max(0.1, b.chantier);
      maillage.scale.set(0.9, hauteur * avancement, 0.9);
      maillage.material = materiau(b.chantier === null ? COULEURS_BATIMENT[b.type] : COULEURS.chantier);
    }
    for (const [id, maillage] of this.batiments) {
      if (vus.has(id)) continue;
      this.groupe.remove(maillage);
      this.batiments.delete(id);
    }
  }

  private synchroniserHabitants(habitants: Habitant[], ile: Ile, maintenant: number): void {
    const vus = new Set<IdHabitant>();
    for (const h of habitants) {
      vus.add(h.id);
      let affiche = this.habitants.get(h.id);
      const vers = versMonde(h.position, ile);
      if (!affiche) {
        affiche = { objet: creerHabitant(h), depuis: vers.clone(), vers, debut: maintenant, donnees: h };
        this.habitants.set(h.id, affiche);
        this.groupe.add(affiche.objet);
      } else {
        affiche.depuis.copy(affiche.objet.position).setY(0);
        affiche.vers = vers;
        affiche.debut = maintenant;
        affiche.donnees = h;
      }
      affiche.objet.rotation.set(0, -h.direction, 0);
    }
    for (const [id, affiche] of this.habitants) {
      if (vus.has(id)) continue;
      this.groupe.remove(affiche.objet);
      this.habitants.delete(id);
    }
  }

}

function creerHabitant(h: Habitant): THREE.Group {
  const groupe = new THREE.Group();
  const pied = new THREE.Mesh(PIED, materiau(COULEURS.pied));
  const chapeau = new THREE.Mesh(CHAPEAU, materiau(CHAPEAUX[h.chapeau % CHAPEAUX.length]!));
  pied.castShadow = chapeau.castShadow = true;
  groupe.add(pied, chapeau);
  groupe.scale.setScalar(ECHELLE_HABITANT);
  return groupe;
}
