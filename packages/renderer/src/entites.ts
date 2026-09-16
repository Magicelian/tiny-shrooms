// Bâtiments, habitants et souche-dépôt en formes provisoires, synchronisés sur les instantanés.
import * as THREE from 'three';
import type { Batiment, Case, Habitant, IdBatiment, IdHabitant, Ile, Instantane } from '@tiny-shrooms/engine';
import { PAS_DE_SIMULATION_MS } from '@tiny-shrooms/engine';
import { CHAPEAUX, COULEURS, COULEURS_BATIMENT, HAUTEURS_BATIMENT, materiau } from './palette';
import { versMonde } from './repere';
import { SoucheRendu } from './souche';

const CUBE = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const PIED = new THREE.CylinderGeometry(0.08, 0.1, 0.22, 6).translate(0, 0.11, 0);
const PIQUET = new THREE.BoxGeometry(0.08, 0.7, 0.08).translate(0, 0.35, 0);
const CHAPEAU = new THREE.SphereGeometry(0.17, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.2, 0);

/** « z » en pixels au-dessus d'un habitant endormi, partagé par tous. */
const MATERIAU_Z = new THREE.SpriteMaterial({ map: textureZ(), transparent: true, depthWrite: false });
/** Durée de la montée d'un « z », en millisecondes. */
const CYCLE_Z_MS = 1800;

/** Les habitants sont volontairement grands par rapport aux cases, pour rester lisibles. */
const ECHELLE_HABITANT = 1.7;

interface HabitantAffiche {
  objet: THREE.Group;
  depuis: THREE.Vector3;
  vers: THREE.Vector3;
  debut: number;
  donnees: Habitant;
  z: THREE.Sprite;
}

export class Entites {
  readonly groupe = new THREE.Group();
  private readonly batiments = new Map<IdBatiment, THREE.Mesh>();
  private readonly habitants = new Map<IdHabitant, HabitantAffiche>();
  private readonly souche = new SoucheRendu();
  private readonly piquets: THREE.Mesh[] = [];
  private ile: Ile | null = null;

  constructor() {
    this.groupe.add(this.souche.groupe);
  }

  changerIle(ile: Ile): void {
    // Une case défrichée ou la souche arrachée ne déplacent rien : on ne repart de zéro que pour une autre île.
    const autre = !this.ile || this.ile.largeur !== ile.largeur || this.ile.profondeur !== ile.profondeur;
    this.ile = ile;
    this.souche.changerIle(ile);
    if (!autre) return;
    for (const m of this.batiments.values()) this.groupe.remove(m);
    for (const h of this.habitants.values()) this.groupe.remove(h.objet, h.z);
    this.batiments.clear();
    this.habitants.clear();
  }

  appliquer(instantane: Instantane, maintenant: number): void {
    const ile = this.ile;
    if (!ile) return;
    this.synchroniserBatiments(instantane.batiments, ile);
    this.souche.appliquer(instantane.retraitSouche);
    this.synchroniserDefrichages(instantane, ile);
    this.synchroniserHabitants(instantane.habitants, ile, maintenant);
  }

  /** Emprise affichée d'un bâtiment : sa case et sa hauteur du moment. */
  emprise(id: IdBatiment): { case: Case; taille: number; hauteur: number } | null {
    const maillage = this.batiments.get(id);
    const donnees = maillage?.userData.batiment as Batiment | undefined;
    if (!maillage || !donnees) return null;
    return { case: donnees.case, taille: 1, hauteur: maillage.scale.y };
  }

  /** Piquets de chantier sur les cases en cours de défrichage, qui s'enfoncent à mesure. */
  private synchroniserDefrichages(instantane: Instantane, ile: Ile): void {
    const { defrichages } = instantane;
    while (this.piquets.length < defrichages.length) {
      const piquet = new THREE.Mesh(PIQUET, materiau(COULEURS.chantier));
      piquet.castShadow = true;
      this.piquets.push(piquet);
      this.groupe.add(piquet);
    }
    this.piquets.forEach((piquet, i) => {
      const d = defrichages[i];
      piquet.visible = !!d;
      if (!d) return;
      versMonde({ x: d.case.x + 0.8, y: d.case.y + 0.8 }, ile, piquet.position);
      piquet.scale.y = 1 - 0.7 * d.avancement;
    });
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
      // Le « z » monte en s'effaçant, puis repart ; chaque dormeur a son propre décalage.
      h.z.visible = activite === 'dort';
      if (h.z.visible) {
        const t = (maintenant / CYCLE_Z_MS + h.donnees.id * 0.37) % 1;
        h.z.position.set(h.objet.position.x + t * 0.15, 0.6 + t * 0.4, h.objet.position.z);
        h.z.material.opacity = 1 - t;
      }
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
      maillage.userData.batiment = b;
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
        const z = new THREE.Sprite(MATERIAU_Z.clone());
        z.scale.setScalar(0.22);
        z.visible = false;
        affiche = { objet: creerHabitant(h), depuis: vers.clone(), vers, debut: maintenant, donnees: h, z };
        this.habitants.set(h.id, affiche);
        this.groupe.add(affiche.objet, z);
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
      this.groupe.remove(affiche.objet, affiche.z);
      affiche.z.material.dispose();
      this.habitants.delete(id);
    }
  }

}

/** Un « z » de 5 × 5 pixels, blanc cerclé de sombre. */
function textureZ(): THREE.CanvasTexture {
  const motif = ['#####', '...#.', '..#..', '.#...', '#####'];
  const toile = document.createElement('canvas');
  toile.width = toile.height = 7;
  const ctx = toile.getContext('2d')!;
  motif.forEach((ligne, y) =>
    [...ligne].forEach((p, x) => {
      if (p !== '#') return;
      ctx.fillStyle = '#2b2233';
      ctx.fillRect(x, y, 3, 3);
    }),
  );
  ctx.fillStyle = '#f4f0ff';
  motif.forEach((ligne, y) => [...ligne].forEach((p, x) => p === '#' && ctx.fillRect(x + 1, y + 1, 1, 1)));
  const texture = new THREE.CanvasTexture(toile);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  return texture;
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
