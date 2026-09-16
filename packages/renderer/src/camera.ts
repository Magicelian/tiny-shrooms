// Caméra orthographique isométrique : rotation par quarts de tour, zoom par paliers, vue qu'on fait glisser.
import * as THREE from 'three';

const ELEVATION = Math.atan(1 / Math.SQRT2);
const ZOOMS = [1, 1.5, 2, 3] as const;
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
  /** Point visé au sol, borné à l'étendue de l'île. */
  private readonly centre = new THREE.Vector2();
  private demiLargeurIle = 4;
  private demiProfondeurIle = 4;

  /** Ajuste le cadrage à la taille de l'île, en cases. */
  cadrer(largeur: number, profondeur: number): void {
    this.demiHauteur = Math.max(largeur, profondeur) * 0.62;
    this.demiLargeurIle = largeur / 2;
    this.demiProfondeurIle = profondeur / 2;
    this.borner();
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

  /** Un palier de plus (1) ou de moins (-1), sans reboucler. */
  zoomer(sens: 1 | -1): void {
    this.niveauZoom = Math.min(ZOOMS.length - 1, Math.max(0, this.niveauZoom + sens));
  }

  /**
   * Fait suivre l'île à la souris : `dx`, `dy` en pixels CSS, `hauteurEcran` celle de la fenêtre.
   * Le sol étant vu en biais, un déplacement vertical à l'écran couvre plus de terrain.
   */
  glisser(dx: number, dy: number, hauteurEcran: number): void {
    const parPixel = (2 * this.demiHauteur) / this.camera.zoom / hauteurEcran;
    const droite = dx * parPixel;
    const avant = (dy * parPixel) / Math.sin(ELEVATION);
    const [c, s] = [Math.cos(this.angle), Math.sin(this.angle)];
    // Droite de l'écran au sol : (cos, -sin) ; avant (vers le haut de l'écran) : (-sin, -cos).
    this.centre.x += -droite * c - avant * s;
    this.centre.y += droite * s - avant * c;
    this.borner();
  }

  /** Avance les transitions ; renvoie vrai tant que la caméra bouge. */
  animer(dtSecondes: number): boolean {
    const suivi = Math.min(1, dtSecondes * 12);
    const angleCible = Math.PI / 4 + (this.quart * Math.PI) / 2;
    const zoomCible = ZOOMS[this.niveauZoom]!;
    this.angle = rapprocher(this.angle, angleCible, suivi);
    const zoom = rapprocher(this.camera.zoom, zoomCible, suivi);
    const bouge = this.angle !== angleCible || zoom !== zoomCible;

    const avancementZoom = Math.min(1, zoom - ZOOMS[0]);
    const visee = VISEE_ENSEMBLE + (VISEE_ZOOM - VISEE_ENSEMBLE) * avancementZoom;
    const horizontal = Math.cos(ELEVATION) * DISTANCE;
    const { x, y: z } = this.centre;
    this.camera.position.set(
      x + Math.sin(this.angle) * horizontal,
      visee + Math.sin(ELEVATION) * DISTANCE,
      z + Math.cos(this.angle) * horizontal,
    );
    this.camera.lookAt(x, visee, z);
    if (zoom !== this.camera.zoom) {
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
    }
    return bouge;
  }

  private borner(): void {
    this.centre.x = Math.min(this.demiLargeurIle, Math.max(-this.demiLargeurIle, this.centre.x));
    this.centre.y = Math.min(this.demiProfondeurIle, Math.max(-this.demiProfondeurIle, this.centre.y));
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
