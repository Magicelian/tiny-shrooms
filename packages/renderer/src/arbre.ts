// Arbre-mère : forme selon le stade, mycélium sur les flancs de l'île, envol des spores à la floraison.
import * as THREE from 'three';
import type { ArbreMere, Ile, StadeArbre } from '@tiny-shrooms/engine';
import { STADES_ARBRE } from '@tiny-shrooms/engine';
import { COULEURS, materiau } from './palette';
import { bruit, centreCase, versMonde } from './repere';

/** Durée de l'envol des spores ; l'interface affiche l'écran de fin ensuite. */
export const DUREE_ENVOL_MS = 6000;

const TRONC = new THREE.CylinderGeometry(0.16, 0.24, 1, 6).translate(0, 0.5, 0);
const BOULE = new THREE.IcosahedronGeometry(0.5, 1);
const FLEUR = new THREE.IcosahedronGeometry(0.5, 0);
const FIL = new THREE.PlaneGeometry(1, 1);

const TAILLES: Record<StadeArbre, number> = { pousse: 0.8, arbuste: 1.1, arbre: 1.6, floraison: 1.7 };
/** Croissance visible pendant un stade, en part de l'écart avec le stade suivant. */
const CROISSANCE_DANS_STADE = 0.5;

/** Couronnes : position, rayon et premier stade où elles paraissent. */
const COURONNES: { x: number; y: number; z: number; r: number; stade: StadeArbre }[] = [
  { x: 0, y: 1, z: 0, r: 1, stade: 'pousse' },
  { x: 0.35, y: 0.8, z: 0.1, r: 0.6, stade: 'arbuste' },
  { x: -0.3, y: 0.85, z: -0.2, r: 0.6, stade: 'arbuste' },
  { x: 0.1, y: 1.35, z: -0.3, r: 0.7, stade: 'arbre' },
  { x: -0.25, y: 1.2, z: 0.35, r: 0.65, stade: 'arbre' },
];

const SPORES = 160;

export class ArbreRendu {
  readonly groupe = new THREE.Group();
  /** Envol des spores, dessiné par-dessus l'îlot. */
  readonly superposition = new THREE.Scene();
  private readonly couronnes: THREE.Mesh[] = [];
  private readonly fleurs = new THREE.Group();
  private readonly plante = new THREE.Group();
  private mycelium: THREE.InstancedMesh | null = null;
  /** Nombre de fils du mycélium, du plus proche au plus lointain de l'arbre. */
  private fils = 0;
  private readonly envol: THREE.Points;
  private readonly depart = new Float32Array(SPORES * 3);
  private debutEnvol: number | null = null;

  constructor() {
    const tronc = new THREE.Mesh(TRONC, materiau(COULEURS.tronc));
    this.plante.add(tronc);
    for (const c of COURONNES) {
      const m = new THREE.Mesh(BOULE, materiau(COULEURS.couronne));
      m.position.set(c.x, c.y, c.z);
      m.scale.setScalar(c.r);
      this.couronnes.push(m);
      this.plante.add(m);
    }
    for (let i = 0; i < 14; i++) {
      const f = new THREE.Mesh(FLEUR, materiau(COULEURS.floraison));
      const angle = i * 2.4;
      const hauteur = 0.75 + bruit(i, 1) * 0.8;
      const rayon = 0.45 + bruit(i, 2) * 0.1;
      f.position.set(Math.cos(angle) * rayon, hauteur, Math.sin(angle) * rayon);
      f.scale.setScalar(0.16);
      this.fleurs.add(f);
    }
    this.plante.add(this.fleurs);
    this.plante.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
    });
    this.groupe.add(this.plante);

    const geometrie = new THREE.BufferGeometry();
    geometrie.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPORES * 3), 3));
    const couleurs = new Float32Array(SPORES * 3);
    const teintes = [new THREE.Color(COULEURS.floraison), new THREE.Color(0xfff6e0), new THREE.Color(COULEURS.luciole)];
    for (let i = 0; i < SPORES; i++) teintes[i % 3]!.toArray(couleurs, i * 3);
    geometrie.setAttribute('color', new THREE.BufferAttribute(couleurs, 3));
    this.envol = new THREE.Points(geometrie, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true }));
    this.envol.frustumCulled = false;
    this.envol.visible = false;
    this.superposition.add(this.envol);
  }

  changerIle(ile: Ile): void {
    const milieu = ile.tailleArbreMere / 2;
    versMonde({ x: ile.arbreMere.x + milieu, y: ile.arbreMere.y + milieu }, ile, this.groupe.position);
    if (this.mycelium) this.groupe.parent?.remove(this.mycelium);
    this.mycelium = construireMycelium(ile, this.groupe.position);
    this.fils = this.mycelium.count;
    this.mycelium.count = 0;
    this.groupe.parent?.add(this.mycelium);
  }

  /** À appeler une fois le groupe placé dans la scène. */
  attacher(parent: THREE.Object3D): void {
    parent.add(this.groupe);
    if (this.mycelium) parent.add(this.mycelium);
  }

  appliquer(arbre: ArbreMere): void {
    const rang = STADES_ARBRE.indexOf(arbre.stade);
    const suivant = STADES_ARBRE[rang + 1];
    const base = TAILLES[arbre.stade];
    const taille = suivant ? base + (TAILLES[suivant] - base) * arbre.avancement * CROISSANCE_DANS_STADE : base;
    this.plante.scale.setScalar(taille);
    COURONNES.forEach((c, i) => (this.couronnes[i]!.visible = STADES_ARBRE.indexOf(c.stade) <= rang));
    // Après la floraison, l'arbre garde ses fleurs.
    this.fleurs.visible = arbre.stade === 'floraison';
    // Chaque fil occupe deux instances (un horizontal, un vertical).
    if (this.mycelium) this.mycelium.count = 2 * Math.round((this.fils / 2) * arbre.mycelium);
  }

  /** Lance l'envol des spores depuis la couronne. */
  lancerEnvol(maintenant: number): void {
    this.debutEnvol = maintenant;
    this.envol.visible = true;
    for (let i = 0; i < SPORES; i++) {
      const angle = bruit(i, 3) * Math.PI * 2;
      const rayon = bruit(i, 4) * 0.8;
      this.depart[i * 3] = this.groupe.position.x + Math.cos(angle) * rayon;
      this.depart[i * 3 + 1] = 1 + bruit(i, 5) * 1.5;
      this.depart[i * 3 + 2] = this.groupe.position.z + Math.sin(angle) * rayon;
    }
  }

  animer(maintenant: number): void {
    if (this.debutEnvol === null) return;
    const t = (maintenant - this.debutEnvol) / DUREE_ENVOL_MS;
    if (t >= 1) {
      this.debutEnvol = null;
      this.envol.visible = false;
      return;
    }
    const positions = this.envol.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < SPORES; i++) {
      // Chaque spore part à son tour, monte en spirale et s'écarte.
      const local = Math.max(0, t * 1.6 - bruit(i, 6) * 0.6);
      const angle = bruit(i, 7) * Math.PI * 2 + local * 5;
      const ecart = local * (1.5 + bruit(i, 8) * 2);
      positions.setXYZ(
        i,
        this.depart[i * 3]! + Math.cos(angle) * ecart,
        local > 0 ? this.depart[i * 3 + 1]! + local * local * 14 : -100,
        this.depart[i * 3 + 2]! + Math.sin(angle) * ecart,
      );
    }
    positions.needsUpdate = true;
  }
}

/** Fils de mycélium posés sur les faces latérales de l'île, triés du plus proche au plus lointain de l'arbre. */
function construireMycelium(ile: Ile, arbre: THREE.Vector3): THREE.InstancedMesh {
  const faces: { distance: number; centre: THREE.Vector3; angle: number; graine: number }[] = [];
  const plein = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < ile.largeur && y < ile.profondeur && ile.terrain[y * ile.largeur + x] !== 'vide';
  const cotes = [
    { dx: 1, dy: 0, angle: Math.PI / 2 },
    { dx: -1, dy: 0, angle: -Math.PI / 2 },
    { dx: 0, dy: 1, angle: 0 },
    { dx: 0, dy: -1, angle: Math.PI },
  ];
  for (let y = 0; y < ile.profondeur; y++) {
    for (let x = 0; x < ile.largeur; x++) {
      if (!plein(x, y)) continue;
      const centre = centreCase(x, y, ile);
      cotes.forEach(({ dx, dy, angle }, k) => {
        if (plein(x + dx, y + dy)) return;
        const face = centre.clone().add(new THREE.Vector3(dx * 0.505, 0, dy * 0.505));
        faces.push({ distance: face.distanceTo(new THREE.Vector3(arbre.x, 0, arbre.z)), centre: face, angle, graine: x * 7 + y * 13 + k });
      });
    }
  }
  faces.sort((a, b) => a.distance - b.distance);

  const materiel = new THREE.MeshBasicMaterial({ color: COULEURS.mycelium });
  const maillage = new THREE.InstancedMesh(FIL, materiel, faces.length * 2);
  const matrice = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const axeY = new THREE.Vector3(0, 1, 0);
  faces.forEach((f, i) => {
    rotation.setFromAxisAngle(axeY, f.angle);
    // Un fil horizontal dans la terre, et une racine qui plonge dans la roche.
    const hauteur = -0.4 - bruit(f.graine, 1) * 0.45;
    const long = 0.7 + bruit(f.graine, 2) * 0.3;
    matrice.compose(f.centre.clone().setY(hauteur), rotation, new THREE.Vector3(long, 0.08, 1));
    maillage.setMatrixAt(i * 2, matrice);
    const decalage = new THREE.Vector3((bruit(f.graine, 3) - 0.5) * 0.6, 0, 0).applyQuaternion(rotation);
    const plonge = 0.3 + bruit(f.graine, 4) * 0.6;
    matrice.compose(f.centre.clone().add(decalage).setY(hauteur - plonge / 2), rotation, new THREE.Vector3(0.08, plonge, 1));
    maillage.setMatrixAt(i * 2 + 1, matrice);
  });
  maillage.frustumCulled = false;
  return maillage;
}
