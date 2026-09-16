// Rendu de l'îlot : scène Three.js pixelisée, nourrie par les messages du moteur.
import * as THREE from 'three';
import type { Ile, Instantane } from '@tiny-shrooms/engine';
import { CameraIso } from './camera';
import { Entites } from './entites';
import { construireIle } from './ile';
import { Pixelisation } from './pixelisation';

export const IMAGES_PAR_SECONDE = 30;
/** Facteur de réduction de la résolution de rendu par rapport à la fenêtre. */
export const REDUCTION = 2;

export class Rendu {
  readonly canevas: HTMLCanvasElement;
  /** Nombre d'images dessinées depuis la création, pour mesurer la cadence. */
  images = 0;

  private readonly moteur: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly vue = new CameraIso();
  private readonly pixelisation: Pixelisation;
  private readonly entites = new Entites();
  private decor: THREE.Group | null = null;
  private actif = false;
  private derniereImage = 0;

  constructor(conteneur: HTMLElement) {
    this.moteur = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    this.moteur.setPixelRatio(1);
    this.moteur.setClearColor(0x000000, 0);
    this.moteur.shadowMap.enabled = true;
    this.moteur.shadowMap.type = THREE.BasicShadowMap;
    this.canevas = this.moteur.domElement;
    conteneur.prepend(this.canevas);

    this.pixelisation = new Pixelisation(this.moteur);
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a4a6a, 1.2));
    const soleil = new THREE.DirectionalLight(0xfff0d0, 2.2);
    soleil.position.set(6, 12, 4);
    soleil.castShadow = true;
    soleil.shadow.mapSize.set(512, 512);
    soleil.shadow.bias = -0.002;
    Object.assign(soleil.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
    this.scene.add(soleil, this.entites.groupe);
    this.redimensionner();
  }

  appliquerIle(ile: Ile): void {
    if (this.decor) this.scene.remove(this.decor);
    this.decor = construireIle(ile);
    this.scene.add(this.decor);
    this.entites.changerIle(ile);
    this.vue.cadrer(Math.max(ile.largeur, ile.profondeur));
  }

  appliquerInstantane(instantane: Instantane): void {
    this.entites.appliquer(instantane, performance.now());
  }

  tourner(sens: 1 | -1): void {
    this.vue.tourner(sens);
  }

  basculerZoom(): void {
    this.vue.basculerZoom();
  }

  redimensionner(): void {
    const largeur = Math.max(1, Math.ceil(window.innerWidth / REDUCTION));
    const hauteur = Math.max(1, Math.ceil(window.innerHeight / REDUCTION));
    this.moteur.setSize(largeur, hauteur, false);
    this.pixelisation.redimensionner(largeur, hauteur);
    this.vue.redimensionner(largeur / hauteur);
  }

  /** Relance le rendu (fenêtre visible). */
  demarrer(): void {
    if (this.actif) return;
    this.actif = true;
    this.derniereImage = 0;
    requestAnimationFrame(this.boucle);
  }

  /** Coupe le rendu (fenêtre cachée) : plus aucune image. */
  arreter(): void {
    this.actif = false;
  }

  private readonly boucle = (instant: number): void => {
    if (!this.actif) return;
    requestAnimationFrame(this.boucle);
    const ecart = instant - this.derniereImage;
    if (ecart < 1000 / IMAGES_PAR_SECONDE - 2) return;
    const dt = this.derniereImage === 0 ? 0 : ecart / 1000;
    this.derniereImage = instant;
    this.vue.animer(dt);
    this.entites.animer(performance.now());
    this.pixelisation.rendre(this.scene, this.vue.camera);
    this.images++;
  };
}
