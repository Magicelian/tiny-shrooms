// Vignettes des modèles pour l'interface : rendu en petit, vue iso, cerné de sombre comme dans le jeu.
// Chaque vignette est dessinée une fois avec le moteur principal, puis gardée en image (data URL).
import * as THREE from 'three';
import type { TypeBatiment } from '@tiny-shrooms/engine';
import { modeleBatiment, modeleSouche, modelesDecor, modelesElements } from './modeles';
import type { Modele } from './voxels';

/** Côté de la vignette en pixels de rendu ; l'interface l'affiche agrandie, sans lissage. */
const TAILLE = 24;
const ENCRE = [27, 19, 32] as const;

export type VignetteNature = 'arbre' | 'buisson' | 'souche' | 'boisMort' | 'mousse' | 'baies';

export class Vignettes {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  private readonly cible = new THREE.WebGLRenderTarget(TAILLE, TAILLE);
  private readonly cache = new Map<string, string>();
  private readonly pixels = new Uint8Array(TAILLE * TAILLE * 4);

  constructor(private readonly moteur: THREE.WebGLRenderer) {
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a4a6a, 1.4));
    const soleil = new THREE.DirectionalLight(0xfff0d0, 2.2);
    soleil.position.set(4, 10, 6);
    this.scene.add(soleil);
    // Même angle que la caméra du jeu, façade (+z) vers le spectateur.
    this.camera.position.set(6, 6 * Math.SQRT1_2 * 1.15, 6);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
  }

  batiment(type: TypeBatiment, niveau = 1): string {
    return this.dessiner(`b:${type}:${niveau}`, () => modeleBatiment(type, niveau));
  }

  nature(nom: VignetteNature): string {
    return this.dessiner(`n:${nom}`, () => {
      if (nom === 'souche') return modeleSouche(1);
      if (nom === 'arbre' || nom === 'buisson') return modelesDecor()[nom];
      return modelesElements()[nom === 'boisMort' ? 'bois' : nom];
    });
  }

  private dessiner(cle: string, modele: () => Modele): string {
    const deja = this.cache.get(cle);
    if (deja) return deja;
    const m = modele();
    const maillage = new THREE.Mesh(m.geometrie, m.materiaux);
    this.scene.add(maillage);
    this.cadrer(m.geometrie.boundingBox!);

    const { moteur } = this;
    const avant = moteur.getRenderTarget();
    const fondAvant = moteur.getClearAlpha();
    const ombres = moteur.shadowMap.enabled;
    moteur.shadowMap.enabled = false;
    moteur.setRenderTarget(this.cible);
    moteur.setClearAlpha(0);
    moteur.clear();
    moteur.render(this.scene, this.camera);
    moteur.readRenderTargetPixels(this.cible, 0, 0, TAILLE, TAILLE, this.pixels);
    moteur.setRenderTarget(avant);
    moteur.setClearAlpha(fondAvant);
    moteur.shadowMap.enabled = ombres;
    this.scene.remove(maillage);

    const url = versImage(this.pixels);
    this.cache.set(cle, url);
    return url;
  }

  /** Ortho ajustée à la boîte du modèle vue de la caméra, avec un pixel de marge pour le contour. */
  private cadrer(boite: THREE.Box3): void {
    const vue = this.camera.matrixWorldInverse;
    const p = new THREE.Vector3();
    const bornes = new THREE.Box3();
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? boite.max.x : boite.min.x, i & 2 ? boite.max.y : boite.min.y, i & 4 ? boite.max.z : boite.min.z);
      bornes.expandByPoint(p.applyMatrix4(vue));
    }
    const cx = (bornes.min.x + bornes.max.x) / 2;
    const cy = (bornes.min.y + bornes.max.y) / 2;
    const demi = (Math.max(bornes.max.x - bornes.min.x, bornes.max.y - bornes.min.y) / 2) * (TAILLE / (TAILLE - 2));
    Object.assign(this.camera, { left: cx - demi, right: cx + demi, top: cy + demi, bottom: cy - demi });
    this.camera.updateProjectionMatrix();
  }
}

/** Pixels linéaires (bas en haut) → image sRGB cernée d'un pixel sombre. */
function versImage(pixels: Uint8Array): string {
  const toile = document.createElement('canvas');
  toile.width = toile.height = TAILLE;
  const ctx = toile.getContext('2d')!;
  const image = ctx.createImageData(TAILLE, TAILLE);
  const d = image.data;
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < TAILLE && y < TAILLE && pixels[((TAILLE - 1 - y) * TAILLE + x) * 4 + 3]! > 128;
  for (let y = 0; y < TAILLE; y++) {
    for (let x = 0; x < TAILLE; x++) {
      const o = (y * TAILLE + x) * 4;
      const s = ((TAILLE - 1 - y) * TAILLE + x) * 4;
      if (opaque(x, y)) {
        for (let c = 0; c < 3; c++) d[o + c] = versSrgb(pixels[s + c]!);
        d[o + 3] = 255;
      } else if (opaque(x + 1, y) || opaque(x - 1, y) || opaque(x, y + 1) || opaque(x, y - 1)) {
        d.set([...ENCRE, 255], o);
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  return toile.toDataURL();
}

function versSrgb(v: number): number {
  const l = v / 255;
  const s = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.round(s * 255);
}
