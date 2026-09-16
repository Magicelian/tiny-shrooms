// Saisons et météo à l'écran : teinte des matériaux partagés et particules dessinées par-dessus l'îlot.
import * as THREE from 'three';
import type { Ile, Meteo, Saison, Temps } from '@tiny-shrooms/engine';
import { SAISONS } from '@tiny-shrooms/engine';
import { COULEURS, materiau } from './palette';

type Teintes = Record<'herbe' | 'feuillage' | 'buisson' | 'eau', number>;

const TEINTES: Record<Saison, Teintes> = {
  printemps: { herbe: COULEURS.herbe, feuillage: COULEURS.feuillage, buisson: COULEURS.buisson, eau: COULEURS.eau },
  ete: { herbe: 0x8fbf3c, feuillage: 0x2f7f30, buisson: 0x2a7040, eau: 0x3f98d6 },
  automne: { herbe: 0xb3a94a, feuillage: 0xd2782c, buisson: 0xb0522e, eau: 0x4b8fb8 },
  hiver: { herbe: 0xe4ecf0, feuillage: 0x4f7a6a, buisson: 0x6f8f86, eau: 0xa8d0e6 },
};

/** Part finale de la saison pendant laquelle on glisse vers les teintes de la suivante. */
const TRANSITION = 0.2;
/** Hauteur d'où tombent les particules, en cases. */
const CIEL = 6;
const GOUTTES = 120;
const FLOCONS = 140;
const FEUILLES = 36;
const COULEURS_FEUILLES = [0xd2782c, 0xe0a33a, 0xb0442a];
/** Durée du crépuscule et de l'aube, en secondes réelles. */
const CREPUSCULE_S = 3;
/** Lumières de nuit : un ciel bleu sombre, un soleil devenu lune. */
const CIEL_NUIT = new THREE.Color(0x5a6ab8);
const LUNE = new THREE.Color(0x8fa6ff);
const PART_NUIT = { ciel: 0.45, soleil: 0.2 };

interface Lumieres {
  ciel: THREE.HemisphereLight;
  soleil: THREE.DirectionalLight;
  intensites: { ciel: number; soleil: number };
  couleurs: { ciel: THREE.Color; soleil: THREE.Color };
}

interface Particules {
  objet: THREE.Points | THREE.LineSegments;
  positions: Float32Array;
  /** Nombre de sommets par particule (1 pour un point, 2 pour un trait). */
  sommets: number;
  nombre: number;
  phases: Float32Array;
}

export class Ambiance {
  /** Scène dessinée après la pixelisation, sans contours. */
  readonly scene = new THREE.Scene();

  private demiLargeur = 6;
  private demiProfondeur = 6;
  private meteo: Meteo = 'soleil';
  private saison: Saison = 'printemps';
  private temps = 0;
  private nuit = false;
  /** 0 en plein jour, 1 en pleine nuit. */
  private obscurite = 0;
  private lumieres: Lumieres | null = null;
  private readonly pluie = creerParticules(GOUTTES, 2, new THREE.LineBasicMaterial({ color: 0x9fd0f2, transparent: true, opacity: 0.8 }));
  private readonly neige = creerParticules(FLOCONS, 1, new THREE.PointsMaterial({ color: 0xffffff, size: 1, sizeAttenuation: false }));
  private readonly feuilles = creerParticules(
    FEUILLES,
    1,
    new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true }),
  );
  private readonly couleurCourante = new THREE.Color();
  private readonly couleurSuivante = new THREE.Color();

  constructor() {
    const couleurs = new Float32Array(FEUILLES * 3);
    const c = new THREE.Color();
    for (let i = 0; i < FEUILLES; i++) c.setHex(COULEURS_FEUILLES[i % COULEURS_FEUILLES.length]!).toArray(couleurs, i * 3);
    this.feuilles.objet.geometry.setAttribute('color', new THREE.BufferAttribute(couleurs, 3));
    for (const p of [this.pluie, this.neige, this.feuilles]) {
      this.repartir(p);
      this.scene.add(p.objet);
    }
    this.montrer();
  }

  /** Lumières de la scène, assombries la nuit ; leurs réglages de jour servent de référence. */
  eclairer(ciel: THREE.HemisphereLight, soleil: THREE.DirectionalLight): void {
    this.lumieres = {
      ciel,
      soleil,
      intensites: { ciel: ciel.intensity, soleil: soleil.intensity },
      couleurs: { ciel: ciel.color.clone(), soleil: soleil.color.clone() },
    };
  }

  changerIle(ile: Ile): void {
    this.demiLargeur = ile.largeur / 2;
    this.demiProfondeur = ile.profondeur / 2;
    for (const p of [this.pluie, this.neige, this.feuilles]) this.repartir(p);
  }

  appliquer(temps: Temps): void {
    this.nuit = temps.nuit;
    const rang = SAISONS.indexOf(temps.saison);
    const suivante = SAISONS[(rang + 1) % SAISONS.length]!;
    const glissement = Math.max(0, (temps.avancementSaison - (1 - TRANSITION)) / TRANSITION);
    for (const cle of ['herbe', 'feuillage', 'buisson', 'eau'] as const) {
      this.couleurCourante.setHex(TEINTES[temps.saison][cle]);
      this.couleurSuivante.setHex(TEINTES[suivante][cle]);
      materiau(COULEURS[cle]).color.lerpColors(this.couleurCourante, this.couleurSuivante, glissement);
    }
    if (temps.meteo !== this.meteo || temps.saison !== this.saison) {
      this.meteo = temps.meteo;
      this.saison = temps.saison;
      this.montrer();
    }
  }

  animer(dt: number): void {
    this.temps += dt;
    this.assombrir(dt);
    if (this.pluie.objet.visible) this.deplacer(this.pluie, dt, 7, 1.2, 0);
    if (this.neige.objet.visible) this.deplacer(this.neige, dt, 0.7, this.meteo === 'vent' ? 1.5 : 0.2, 0.3);
    if (this.feuilles.objet.visible) this.deplacer(this.feuilles, dt, 0.5, this.meteo === 'vent' ? 2.5 : 0.4, 0.6);
  }

  private assombrir(dt: number): void {
    const cible = this.nuit ? 1 : 0;
    // Premier affichage (dt nul) : on part directement de la bonne lumière.
    const pas = dt === 0 ? 1 : dt / CREPUSCULE_S;
    this.obscurite += Math.sign(cible - this.obscurite) * Math.min(pas, Math.abs(cible - this.obscurite));
    const l = this.lumieres;
    if (!l) return;
    const o = this.obscurite;
    l.ciel.intensity = l.intensites.ciel * (1 - (1 - PART_NUIT.ciel) * o);
    l.soleil.intensity = l.intensites.soleil * (1 - (1 - PART_NUIT.soleil) * o);
    l.ciel.color.lerpColors(l.couleurs.ciel, CIEL_NUIT, o);
    l.soleil.color.lerpColors(l.couleurs.soleil, LUNE, o);
  }

  private montrer(): void {
    this.pluie.objet.visible = this.meteo === 'pluie';
    this.neige.objet.visible = this.meteo === 'neige';
    // Des feuilles tombent tout l'automne, et le vent en fait voler en toute saison sauf l'hiver.
    this.feuilles.objet.visible = this.saison === 'automne' || (this.meteo === 'vent' && this.saison !== 'hiver');
  }

  /** Chute verticale, dérive horizontale et balancement ; une particule tombée repart du ciel. */
  private deplacer(p: Particules, dt: number, chute: number, derive: number, balancement: number): void {
    const pos = p.positions;
    for (let i = 0; i < p.nombre; i++) {
      const o = i * p.sommets * 3;
      const phase = p.phases[i]!;
      let x = pos[o]! + (derive + Math.sin(this.temps * 2 + phase) * balancement) * dt;
      let y = pos[o + 1]! - chute * (0.8 + (phase % 0.4)) * dt;
      let z = pos[o + 2]! + Math.cos(this.temps * 1.7 + phase) * balancement * 0.5 * dt;
      if (y < 0) y += CIEL;
      if (x > this.demiLargeur) x -= 2 * this.demiLargeur;
      pos[o] = x;
      pos[o + 1] = y;
      pos[o + 2] = z;
      if (p.sommets === 2) {
        // Trait penché dans le sens de la dérive.
        pos[o + 3] = x - derive * 0.05;
        pos[o + 4] = y + 0.3;
        pos[o + 5] = z;
      }
    }
    p.objet.geometry.attributes.position!.needsUpdate = true;
  }

  private repartir(p: Particules): void {
    for (let i = 0; i < p.nombre; i++) {
      const o = i * p.sommets * 3;
      const [x, y, z] = [(Math.random() * 2 - 1) * this.demiLargeur, Math.random() * CIEL, (Math.random() * 2 - 1) * this.demiProfondeur];
      for (let s = 0; s < p.sommets; s++) p.positions.set([x, y + s * 0.3, z], o + s * 3);
    }
    p.objet.geometry.attributes.position!.needsUpdate = true;
  }
}

function creerParticules(nombre: number, sommets: number, materiel: THREE.Material): Particules {
  const positions = new Float32Array(nombre * sommets * 3);
  const geometrie = new THREE.BufferGeometry();
  geometrie.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const objet = sommets === 2 ? new THREE.LineSegments(geometrie, materiel) : new THREE.Points(geometrie, materiel);
  // Les particules bougent sans cesse : inutile de recalculer leur boîte englobante.
  objet.frustumCulled = false;
  const phases = Float32Array.from({ length: nombre }, () => Math.random() * Math.PI * 2);
  return { objet, positions, sommets, nombre, phases };
}
