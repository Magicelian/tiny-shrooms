// Sons synthétisés avec Web Audio : aucun fichier. Effets brefs façon 8-bit pour l'interface,
// nappes discrètes pour l'ambiance (vent, pluie, oiseaux le jour, grillons la nuit).
// Coupé tant que le joueur ne l'a pas allumé ; le contexte audio n'est créé qu'à ce moment-là.
import type { Meteo, Saison } from '@tiny-shrooms/engine';

export type Effet =
  | 'ouvrir'
  | 'fermer'
  | 'choisir'
  | 'recolte'
  | 'poser'
  | 'termine'
  | 'arrivee'
  | 'refus'
  | 'palier'
  | 'renaissance'
  | 'arracher'
  | 'demolir'
  | 'faim';

export interface AmbianceSonore {
  saison: Saison;
  meteo: Meteo;
  nuit: boolean;
}

/** Volumes de base, bas exprès : le jeu reste ouvert toute la journée. */
const VOLUME_EFFETS = 0.22;
const VOLUME_AMBIANCE = 0.1;
/** Deux effets identiques plus rapprochés que ceci n'en font qu'un. */
const ECART_MIN_S = 0.06;

type Onde = OscillatorType;
/** Une note : fréquence (Hz), départ et durée (s) relatifs à l'effet, glissement final éventuel. */
interface Note {
  f: number;
  t: number;
  d: number;
  vers?: number;
  onde?: Onde;
  v?: number;
}

const NOTES: Record<Effet, Note[]> = {
  ouvrir: [{ f: 660, t: 0, d: 0.05, onde: 'square', v: 0.5 }, { f: 990, t: 0.04, d: 0.06, onde: 'square', v: 0.4 }],
  fermer: [{ f: 880, t: 0, d: 0.05, onde: 'square', v: 0.4 }, { f: 587, t: 0.04, d: 0.06, onde: 'square', v: 0.35 }],
  choisir: [{ f: 784, t: 0, d: 0.04, onde: 'square', v: 0.35 }],
  recolte: [{ f: 520, t: 0, d: 0.09, vers: 1040, onde: 'triangle' }, { f: 1560, t: 0.06, d: 0.05, onde: 'square', v: 0.25 }],
  poser: [
    { f: 180, t: 0, d: 0.06, vers: 90, onde: 'triangle' },
    { f: 200, t: 0.1, d: 0.06, vers: 100, onde: 'triangle' },
  ],
  termine: [
    { f: 523, t: 0, d: 0.08, onde: 'square', v: 0.4 },
    { f: 659, t: 0.08, d: 0.08, onde: 'square', v: 0.4 },
    { f: 784, t: 0.16, d: 0.16, onde: 'square', v: 0.4 },
  ],
  arrivee: [
    { f: 784, t: 0, d: 0.07, onde: 'triangle' },
    { f: 1175, t: 0.08, d: 0.12, onde: 'triangle' },
  ],
  refus: [{ f: 150, t: 0, d: 0.14, vers: 110, onde: 'sawtooth', v: 0.35 }],
  palier: [
    { f: 523, t: 0, d: 0.1, onde: 'square', v: 0.35 },
    { f: 659, t: 0.1, d: 0.1, onde: 'square', v: 0.35 },
    { f: 784, t: 0.2, d: 0.1, onde: 'square', v: 0.35 },
    { f: 1047, t: 0.3, d: 0.3, onde: 'square', v: 0.35 },
    { f: 523, t: 0.3, d: 0.3, onde: 'triangle', v: 0.5 },
  ],
  renaissance: [
    { f: 220, t: 0, d: 0.9, vers: 880, onde: 'triangle', v: 0.6 },
    { f: 1319, t: 0.6, d: 0.5, onde: 'sine', v: 0.4 },
    { f: 1760, t: 0.75, d: 0.5, onde: 'sine', v: 0.3 },
  ],
  arracher: [{ f: 300, t: 0, d: 0.12, vers: 140, onde: 'sawtooth', v: 0.25 }],
  // Deux notes douces qui descendent : plus rien à manger.
  faim: [
    { f: 494, t: 0, d: 0.16, onde: 'triangle', v: 0.45 },
    { f: 370, t: 0.16, d: 0.28, vers: 330, onde: 'triangle', v: 0.45 },
  ],
  demolir: [
    { f: 120, t: 0, d: 0.1, vers: 60, onde: 'square', v: 0.35 },
    { f: 90, t: 0.08, d: 0.14, vers: 45, onde: 'square', v: 0.3 },
  ],
};

/** Nappe de bruit filtré dont on règle le volume en douceur. */
interface Nappe {
  gain: GainNode;
  filtre: BiquadFilterNode;
}

export class Sons {
  private contexte: AudioContext | null = null;
  private maitre: GainNode | null = null;
  private effets: GainNode | null = null;
  private ambianceSortie: GainNode | null = null;
  private bruit: AudioBuffer | null = null;
  private vent: Nappe | null = null;
  private pluie: Nappe | null = null;
  private allume = false;
  private cache = false;
  private derniers = new Map<Effet, number>();
  private ambiance: AmbianceSonore | null = null;
  private minuterie: ReturnType<typeof setTimeout> | null = null;

  get actif(): boolean {
    return this.allume;
  }

  /** Allume ou coupe tout le son (menu de l'icône). */
  activer(allume: boolean): void {
    this.allume = allume;
    if (allume) this.preparer();
    this.appliquerVolume();
  }

  /** Fenêtre cachée : l'ambiance se tait, les effets aussi. */
  suspendre(cache: boolean): void {
    this.cache = cache;
    this.appliquerVolume();
  }

  jouer(effet: Effet): void {
    const ctx = this.pret();
    if (!ctx || !this.effets) return;
    const maintenant = ctx.currentTime;
    if (maintenant - (this.derniers.get(effet) ?? -1) < ECART_MIN_S) return;
    this.derniers.set(effet, maintenant);
    for (const n of NOTES[effet]) this.note(n, maintenant, this.effets);
    if (effet === 'poser' || effet === 'demolir' || effet === 'arracher') this.souffle(maintenant, 0.12, 900, 0.5);
  }

  /** Saison, météo et nuit courantes : les nappes glissent vers leur nouveau volume. */
  ambiancer(a: AmbianceSonore): void {
    const avant = this.ambiance;
    this.ambiance = a;
    if (avant && avant.meteo === a.meteo && avant.nuit === a.nuit && avant.saison === a.saison) return;
    this.reglerNappes();
  }

  // ─── Mécanique ─────────────────────────────────────────────────────────────

  /** Contexte prêt à jouer, ou rien si le son est coupé. */
  private pret(): AudioContext | null {
    if (!this.allume || this.cache || !this.contexte) return null;
    if (this.contexte.state === 'suspended') void this.contexte.resume();
    return this.contexte;
  }

  private preparer(): void {
    if (this.contexte) return;
    const Contexte = globalThis.AudioContext;
    if (!Contexte) return;
    const ctx = new Contexte();
    this.contexte = ctx;
    this.maitre = ctx.createGain();
    this.maitre.gain.value = 0;
    this.maitre.connect(ctx.destination);
    this.effets = ctx.createGain();
    this.effets.gain.value = VOLUME_EFFETS;
    this.effets.connect(this.maitre);
    this.ambianceSortie = ctx.createGain();
    this.ambianceSortie.gain.value = VOLUME_AMBIANCE;
    this.ambianceSortie.connect(this.maitre);

    // Deux secondes de bruit rose approché, bouclées.
    const longueur = ctx.sampleRate * 2;
    this.bruit = ctx.createBuffer(1, longueur, ctx.sampleRate);
    const donnees = this.bruit.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < longueur; i++) {
      const blanc = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + blanc * 0.029;
      b1 = 0.985 * b1 + blanc * 0.032;
      b2 = 0.95 * b2 + blanc * 0.048;
      donnees[i] = (b0 + b1 + b2 + blanc * 0.02) * 0.9;
    }
    this.vent = this.nappe('bandpass', 400, 0.8);
    this.pluie = this.nappe('highpass', 2500, 0.3);
    // Le vent respire : un oscillateur lent module sa fréquence.
    const respiration = ctx.createOscillator();
    const ampleur = ctx.createGain();
    respiration.frequency.value = 0.09;
    ampleur.gain.value = 220;
    respiration.connect(ampleur).connect(this.vent.filtre.frequency);
    respiration.start();

    // WebKit crée parfois le contexte suspendu : le premier appui le réveille.
    const reveiller = () => void ctx.resume();
    addEventListener('pointerdown', reveiller, { once: true });
    this.reglerNappes();
    this.planifierPetitsBruits();
  }

  private nappe(type: BiquadFilterType, frequence: number, q: number): Nappe {
    const ctx = this.contexte!;
    const source = ctx.createBufferSource();
    source.buffer = this.bruit;
    source.loop = true;
    const filtre = ctx.createBiquadFilter();
    filtre.type = type;
    filtre.frequency.value = frequence;
    filtre.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filtre).connect(gain).connect(this.ambianceSortie!);
    source.start();
    return { gain, filtre };
  }

  private appliquerVolume(): void {
    if (!this.contexte || !this.maitre) return;
    const cible = this.allume && !this.cache ? 1 : 0;
    const t = this.contexte.currentTime;
    this.maitre.gain.cancelScheduledValues(t);
    this.maitre.gain.setTargetAtTime(cible, t, 0.15);
    if (cible) void this.contexte.resume();
  }

  private reglerNappes(): void {
    const a = this.ambiance;
    if (!this.contexte || !this.vent || !this.pluie || !a) return;
    const t = this.contexte.currentTime;
    const vent = a.meteo === 'vent' ? 1 : a.meteo === 'neige' ? 0.55 : a.saison === 'hiver' ? 0.35 : 0.18;
    const pluie = a.meteo === 'pluie' ? 0.9 : 0;
    this.vent.gain.gain.setTargetAtTime(vent, t, 2);
    this.pluie.gain.gain.setTargetAtTime(pluie, t, 2);
  }

  /** Oiseaux le jour (sauf l'hiver et sous la pluie), grillons la nuit (sauf l'hiver). */
  private planifierPetitsBruits(): void {
    if (this.minuterie) clearTimeout(this.minuterie);
    const suivant = () => {
      const a = this.ambiance;
      const ctx = this.pret();
      let attente = 4000 + Math.random() * 6000;
      if (ctx && a && a.saison !== 'hiver') {
        if (a.nuit) {
          this.grillon(ctx.currentTime);
          attente = 1200 + Math.random() * 2500;
        } else if (a.meteo !== 'pluie' && a.meteo !== 'neige') {
          this.oiseau(ctx.currentTime);
        }
      }
      this.minuterie = setTimeout(suivant, attente);
    };
    this.minuterie = setTimeout(suivant, 2000);
  }

  private oiseau(debut: number): void {
    const base = 2200 + Math.random() * 1400;
    const cris = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < cris; i++) {
      const t = i * (0.11 + Math.random() * 0.05);
      this.note({ f: base, t, d: 0.07, vers: base * (1.2 + Math.random() * 0.3), onde: 'sine', v: 0.35 }, debut, this.ambianceSortie!);
    }
  }

  private grillon(debut: number): void {
    const f = 4200 + Math.random() * 400;
    for (let i = 0; i < 3; i++) this.note({ f, t: i * 0.06, d: 0.03, onde: 'sine', v: 0.18 }, debut, this.ambianceSortie!);
  }

  private note(n: Note, debut: number, sortie: AudioNode): void {
    const ctx = this.contexte!;
    const t0 = debut + n.t;
    const t1 = t0 + n.d;
    const osc = ctx.createOscillator();
    osc.type = n.onde ?? 'square';
    osc.frequency.setValueAtTime(n.f, t0);
    if (n.vers) osc.frequency.exponentialRampToValueAtTime(n.vers, t1);
    const gain = ctx.createGain();
    const v = n.v ?? 0.5;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(v, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t1);
    osc.connect(gain).connect(sortie);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }

  /** Bouffée de bruit brève (coup de marteau, terre remuée). */
  private souffle(debut: number, duree: number, frequence: number, v: number): void {
    const ctx = this.contexte!;
    const source = ctx.createBufferSource();
    source.buffer = this.bruit;
    const filtre = ctx.createBiquadFilter();
    filtre.type = 'lowpass';
    filtre.frequency.value = frequence;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(v, debut);
    gain.gain.exponentialRampToValueAtTime(0.001, debut + duree);
    source.connect(filtre).connect(gain).connect(this.effets!);
    source.start(debut, Math.random());
    source.stop(debut + duree + 0.02);
  }
}
