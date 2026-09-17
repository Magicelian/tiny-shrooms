// Bâtiments, habitants et souche-dépôt en voxels, synchronisés sur les instantanés.
import * as THREE from 'three';
import type { Batiment, Case, Habitant, IdBatiment, IdHabitant, Ile, Instantane } from '@tiny-shrooms/engine';
import { PAS_DE_SIMULATION_MS } from '@tiny-shrooms/engine';
import { modeleBatiment, modeleFlamme, modelesHabitant, type ModelesHabitant } from './modeles';
import { COULEURS, materiau } from './palette';
import { versMonde } from './repere';
import { SoucheRendu } from './souche';
import { instancier, montrerCouches, sansNuance, type Modele } from './voxels';

const PIQUET = sansNuance(new THREE.BoxGeometry(0.08, 0.7, 0.08).translate(0, 0.35, 0));

/** « z » en pixels au-dessus d'un habitant endormi, partagé par tous. */
const MATERIAU_Z = new THREE.SpriteMaterial({ map: textureZ(), transparent: true, depthWrite: false });
/** Durée de la montée d'un « z », en millisecondes. */
const CYCLE_Z_MS = 1800;

/** Les habitants sont volontairement grands par rapport aux cases, pour rester lisibles. */
const ECHELLE_HABITANT = 1.4;

interface BatimentAffiche {
  maillage: THREE.Mesh;
  modele: Modele;
  /** Rang (logements) et chantier affichés, pour ne refaire que ce qui change. */
  cle: string;
  flamme: THREE.Mesh | null;
}

interface HabitantAffiche {
  objet: THREE.Group;
  /** Corps et chapeau, qu'on penche ou écrase ; pieds à part pour la marche. */
  buste: THREE.Group;
  pieds: [THREE.Mesh, THREE.Mesh];
  ballot: THREE.Mesh;
  depuis: THREE.Vector3;
  vers: THREE.Vector3;
  debut: number;
  donnees: Habitant;
  z: THREE.Sprite;
}

export class Entites {
  readonly groupe = new THREE.Group();
  private readonly batiments = new Map<IdBatiment, BatimentAffiche>();
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
    for (const b of this.batiments.values()) this.groupe.remove(b.maillage);
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
    const affiche = this.batiments.get(id);
    const donnees = affiche?.maillage.userData.batiment as Batiment | undefined;
    if (!affiche || !donnees) return null;
    const avancement = donnees.chantier === null ? 1 : Math.max(0.15, donnees.chantier);
    return { case: donnees.case, taille: 1, hauteur: affiche.modele.hauteur * avancement };
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
    return [...this.batiments.values()].map((b) => b.maillage);
  }

  /** Mouvements entre deux instantanés et petites animations. */
  animer(maintenant: number): void {
    for (const b of this.batiments.values()) {
      if (!b.flamme) continue;
      const phase = maintenant / 110 + b.maillage.id;
      b.flamme.scale.set(1 + Math.sin(phase * 1.3) * 0.08, 0.85 + Math.abs(Math.sin(phase)) * 0.3, 1 + Math.cos(phase * 1.7) * 0.08);
    }
    for (const h of this.habitants.values()) {
      const t = Math.min(1, (maintenant - h.debut) / PAS_DE_SIMULATION_MS);
      h.objet.position.lerpVectors(h.depuis, h.vers, t);
      const { activite } = h.donnees;
      const phase = maintenant / 90 + h.donnees.id;
      const [gauche, droit] = h.pieds;
      const marche = activite === 'marche' || activite === 'porte';
      const travail = activite === 'recolte' || activite === 'construit' || activite === 'tient';
      const dort = activite === 'dort';
      // Pieds : pas alternés en marchant, au repos sinon.
      const pas = marche ? Math.sin(phase) : 0;
      gauche.position.set(pas * 0.05, Math.max(0, pas) * 0.03, -0.045);
      droit.position.set(-pas * 0.05, Math.max(0, -pas) * 0.03, 0.045);
      h.buste.position.y = marche ? Math.abs(Math.sin(phase)) * 0.025 : 0;
      h.buste.rotation.set(
        marche ? Math.sin(phase) * 0.08 : 0,
        0,
        // Penché vers l'avant (+x) pour travailler, par petits coups.
        travail ? -0.15 - Math.max(0, Math.sin(phase * 0.8)) * 0.3 : 0,
      );
      // Respiration au repos, écrasé pour dormir.
      const souffle = marche || travail ? 1 : 1 + Math.sin(maintenant / 600 + h.donnees.id) * 0.03;
      h.buste.scale.set(dort ? 1.1 : 1, (dort ? 0.7 : 1) * souffle, dort ? 1.1 : 1);
      h.ballot.visible = activite === 'porte';
      // Le « z » monte en s'effaçant, puis repart ; chaque dormeur a son propre décalage.
      h.z.visible = dort;
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
      const modele = modeleBatiment(b.type, b.niveau);
      let affiche = this.batiments.get(b.id);
      if (affiche && affiche.modele !== modele) {
        this.groupe.remove(affiche.maillage);
        affiche = undefined;
      }
      if (!affiche) {
        const maillage = new THREE.Mesh(instancier(modele), modele.materiaux);
        maillage.castShadow = maillage.receiveShadow = true;
        maillage.userData.id = b.id;
        affiche = { maillage, modele, cle: '', flamme: null };
        this.batiments.set(b.id, affiche);
        this.groupe.add(maillage);
      }
      const { maillage } = affiche;
      versMonde({ x: b.case.x + 0.5, y: b.case.y + 0.5 }, ile, maillage.position);
      maillage.rotation.y = (-b.orientation * Math.PI) / 2;
      maillage.userData.batiment = b;
      // Chantier : le bâtiment monte couche par couche.
      const avancement = b.chantier === null ? 1 : Math.min(0.99, b.chantier);
      const cle = avancement.toFixed(3);
      if (cle !== affiche.cle) {
        affiche.cle = cle;
        montrerCouches(maillage.geometry, modele, avancement);
      }
      const feu = b.type === 'feuDeCamp' && b.chantier === null;
      if (feu && !affiche.flamme) {
        const f = modeleFlamme();
        affiche.flamme = new THREE.Mesh(f.geometrie, f.materiaux);
        affiche.flamme.position.y = 2 / 12;
        maillage.add(affiche.flamme);
      } else if (!feu && affiche.flamme) {
        maillage.remove(affiche.flamme);
        affiche.flamme = null;
      }
    }
    for (const [id, affiche] of this.batiments) {
      if (vus.has(id)) continue;
      this.groupe.remove(affiche.maillage);
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
        affiche = { ...creerHabitant(h), depuis: vers.clone(), vers, debut: maintenant, donnees: h, z };
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

function maillage(m: Modele): THREE.Mesh {
  const resultat = new THREE.Mesh(m.geometrie, m.materiaux);
  resultat.castShadow = true;
  return resultat;
}

function creerHabitant(h: Habitant): Pick<HabitantAffiche, 'objet' | 'buste' | 'pieds' | 'ballot'> {
  const modeles: ModelesHabitant = modelesHabitant();
  const objet = new THREE.Group();
  const buste = new THREE.Group();
  const ballot = maillage(modeles.ballot);
  ballot.visible = false;
  buste.add(maillage(modeles.corps), maillage(modeles.chapeaux[h.chapeau % modeles.chapeaux.length]!), ballot);
  const pieds: [THREE.Mesh, THREE.Mesh] = [maillage(modeles.pied), maillage(modeles.pied)];
  objet.add(buste, ...pieds);
  objet.scale.setScalar(ECHELLE_HABITANT);
  return { objet, buste, pieds, ballot };
}
