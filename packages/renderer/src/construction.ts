// Aides du mode construction : grille de placement et bâtiment fantôme vert ou rouge.
// Ces objets vivent dans une scène à part, dessinée par-dessus sans contours ni ombres.
import * as THREE from 'three';
import type { Case, Ile, TypeBatiment } from '@tiny-shrooms/engine';
import { HAUTEURS_BATIMENT } from './palette';
import { centreCase, versMonde } from './repere';

const VERT = 0xb6ff5c;
const ROUGE = 0xff4a4a;
/** Cases à portée d'un feu, d'un puits ou d'un marché. */
const BLEU = 0x7fd4ff;
const SOL = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const BOITE = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
/** Surlignage d'un bâtiment ou d'un élément du décor : clair, pour trancher sur toutes les saisons. */
const CLAIR = 0xfff6c8;

export class AidesConstruction {
  readonly scene = new THREE.Scene();
  private grille: THREE.LineSegments | null = null;
  private readonly materiauFantome = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false });
  private readonly fantome = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 0.9).translate(0, 0.5, 0), this.materiauFantome);
  private readonly materiauSol = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false });
  private readonly sol = new THREE.Mesh(SOL, this.materiauSol);
  private readonly materiauPortee = new THREE.MeshBasicMaterial({ color: BLEU, transparent: true, opacity: 0.3, depthWrite: false });
  /** Cases de portée, réutilisées d'un affichage à l'autre. */
  private readonly portee: THREE.Mesh[] = [];
  private ile: Ile | null = null;
  /** Boîte dessinée par-dessus ce qu'on vise : arêtes franches et fond léger. */
  private readonly surlignage = new THREE.Group();

  constructor() {
    this.fantome.visible = this.sol.visible = false;
    this.sol.position.y = 0.02;
    this.scene.add(this.fantome, this.sol);
    const fond = new THREE.Mesh(BOITE, new THREE.MeshBasicMaterial({ color: CLAIR, transparent: true, opacity: 0.18, depthWrite: false }));
    const aretes = new THREE.LineSegments(
      new THREE.EdgesGeometry(BOITE),
      new THREE.LineBasicMaterial({ color: CLAIR, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.surlignage.add(fond, aretes);
    this.surlignage.visible = false;
    this.scene.add(this.surlignage);
  }

  /** Encadre une emprise carrée de `taille` cases depuis `case`, sur `hauteur` ; `null` l'efface. */
  surligner(zone: { case: Case; taille: number; hauteur: number } | null): void {
    this.surlignage.visible = !!zone && !!this.ile;
    if (!zone || !this.ile) return;
    const milieu = zone.taille / 2;
    versMonde({ x: zone.case.x + milieu, y: zone.case.y + milieu }, this.ile, this.surlignage.position);
    this.surlignage.scale.set(zone.taille, zone.hauteur + 0.05, zone.taille);
  }

  get actives(): boolean {
    return this.grille?.visible === true || this.sol.visible || this.surlignage.visible || this.portee.some((m) => m.visible);
  }

  /** Surligne les cases à portée ; une liste vide efface la zone. */
  montrerPortee(cases: readonly Case[]): void {
    if (!this.ile) return;
    while (this.portee.length < cases.length) {
      const m = new THREE.Mesh(SOL, this.materiauPortee);
      this.portee.push(m);
      this.scene.add(m);
    }
    this.portee.forEach((m, i) => {
      const c = cases[i];
      m.visible = !!c;
      if (c) centreCase(c.x, c.y, this.ile!, m.position).setY(0.015);
    });
  }

  changerIle(ile: Ile): void {
    this.ile = ile;
    if (this.grille) this.scene.remove(this.grille);
    this.grille = construireGrille(ile);
    this.grille.visible = false;
    this.scene.add(this.grille);
  }

  afficherGrille(visible: boolean): void {
    if (this.grille) this.grille.visible = visible;
  }

  /** Montre un fantôme sur une case ; `type` nul pour ne surligner que la case. */
  montrerFantome(c: Case, type: TypeBatiment | null, valide: boolean): void {
    if (!this.ile) return;
    const couleur = valide ? VERT : ROUGE;
    this.materiauFantome.color.set(couleur);
    this.materiauSol.color.set(couleur);
    centreCase(c.x, c.y, this.ile, this.sol.position).setY(0.02);
    this.sol.visible = true;
    this.fantome.visible = type !== null;
    if (type) {
      centreCase(c.x, c.y, this.ile, this.fantome.position);
      this.fantome.scale.y = HAUTEURS_BATIMENT[type];
    }
  }

  cacherFantome(): void {
    this.fantome.visible = this.sol.visible = false;
  }
}

/** Arêtes des cases de l'île seulement, sans déborder sur le vide. */
function construireGrille(ile: Ile): THREE.LineSegments {
  const points: number[] = [];
  const x0 = -ile.largeur / 2;
  const z0 = -ile.profondeur / 2;
  const y = 0.01;
  const surIle = (x: number, z: number) =>
    x >= 0 && z >= 0 && x < ile.largeur && z < ile.profondeur && ile.terrain[z * ile.largeur + x] !== 'vide';
  for (let z = 0; z <= ile.profondeur; z++) {
    for (let x = 0; x <= ile.largeur; x++) {
      // Arête nord de la case (x, z), partagée avec la case du dessus.
      if (surIle(x, z) || surIle(x, z - 1)) points.push(x0 + x, y, z0 + z, x0 + x + 1, y, z0 + z);
      // Arête ouest, partagée avec la case de gauche.
      if (surIle(x, z) || surIle(x - 1, z)) points.push(x0 + x, y, z0 + z, x0 + x, y, z0 + z + 1);
    }
  }
  const geometrie = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const materiau = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  return new THREE.LineSegments(geometrie, materiau);
}
