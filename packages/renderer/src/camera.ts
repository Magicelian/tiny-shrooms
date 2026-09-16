// Caméra orthographique isométrique : rotation par quarts de tour, deux niveaux de zoom.
import * as THREE from 'three';

const ELEVATION = Math.atan(1 / Math.SQRT2);
const ZOOMS = [1, 2] as const;
const DISTANCE = 50;
/** Hauteur visée : sous la surface pour cadrer la coupe en vue d'ensemble, au ras du sol une fois zoomé. */
const VISEE_ENSEMBLE = -1.2;
const VISEE_ZOOM = -0.2;

export class CameraIso {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100);
  private quart = 0;
  private angle = Math.PI / 4;
  private niveauZoom = 0;
  private demiHauteur = 8;
  private ratio = 1;

  /** Ajuste le cadrage à la taille de l'île, en cases. */
  cadrer(tailleIle: number): void {
    this.demiHauteur = tailleIle * 0.62;
    this.majProjection();
  }

  redimensionner(ratio: number): void {
    this.ratio = ratio;
    this.majProjection();
  }

  tourner(sens: 1 | -1): void {
    this.quart += sens;
  }

  basculerZoom(): void {
    this.niveauZoom = (this.niveauZoom + 1) % ZOOMS.length;
  }

  /** Avance les transitions ; renvoie vrai tant que la caméra bouge. */
  animer(dtSecondes: number): boolean {
    const suivi = Math.min(1, dtSecondes * 12);
    const angleCible = Math.PI / 4 + (this.quart * Math.PI) / 2;
    const zoomCible = ZOOMS[this.niveauZoom]!;
    this.angle = rapprocher(this.angle, angleCible, suivi);
    const zoom = rapprocher(this.camera.zoom, zoomCible, suivi);
    const bouge = this.angle !== angleCible || zoom !== zoomCible;

    const avancementZoom = (zoom - ZOOMS[0]) / (ZOOMS[1] - ZOOMS[0]);
    const visee = VISEE_ENSEMBLE + (VISEE_ZOOM - VISEE_ENSEMBLE) * avancementZoom;
    const horizontal = Math.cos(ELEVATION) * DISTANCE;
    this.camera.position.set(
      Math.sin(this.angle) * horizontal,
      visee + Math.sin(ELEVATION) * DISTANCE,
      Math.cos(this.angle) * horizontal,
    );
    this.camera.lookAt(0, visee, 0);
    if (zoom !== this.camera.zoom) {
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
    }
    return bouge;
  }

  private majProjection(): void {
    const c = this.camera;
    c.top = this.demiHauteur;
    c.bottom = -this.demiHauteur;
    c.left = -this.demiHauteur * this.ratio;
    c.right = this.demiHauteur * this.ratio;
    c.updateProjectionMatrix();
  }
}

function rapprocher(valeur: number, cible: number, suivi: number): number {
  const suivante = valeur + (cible - valeur) * suivi;
  return Math.abs(cible - suivante) < 1e-3 ? cible : suivante;
}
