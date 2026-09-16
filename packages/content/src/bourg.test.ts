// Critère de l'étape 13 : depuis une partie neuve, un joueur scripté atteint le palier bourg.
// Toutes les 5 s de jeu, il récolte ce qui est prêt et tente une seule action, par ordre de priorité :
// nourriture, bois, mousse, logements, services manquants, montée en gamme, stockage.
import { describe, expect, it } from 'vitest';
import {
  aPortee,
  capaciteLogement,
  creerEtat,
  Moteur,
  PAS_PAR_MINUTE,
  refusMontee,
  terrainEn,
  type Besoin,
  type Case,
  type Commande,
  type Etat,
  type TypeBatiment,
} from '@tiny-shrooms/engine';
import { contenu } from './index';

const PAS_PAR_SECONDE = PAS_PAR_MINUTE / 60;
const BOURG = contenu.paliers.findIndex((p) => p.nom === 'bourg');
const HEURES_MAX = 20;

function nombre(etat: Etat, type: TypeBatiment): number {
  return etat.batiments.filter((b) => b.type === type).length;
}

function pres(etat: Etat, c: Case, terrain: string): boolean {
  return [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => terrainEn(etat.ile, c.x + dx, c.y + dy) === terrain));
}

class Joueur {
  constructor(private readonly moteur: Moteur) {}

  private get etat(): Etat {
    return this.moteur.etatCourant as Etat;
  }

  private commander(commande: Commande): boolean {
    const [message] = this.moteur.recevoir({ type: 'commande', commande }, 0);
    return message?.type === 'instantane' && !message.evenements.some((e) => e.type === 'commandeRefusee');
  }

  private abordable(type: TypeBatiment): boolean {
    const cout = contenu.batiments[type].cout;
    return Object.entries(cout).every(([r, q]) => this.etat.stocks[r as keyof typeof cout] >= q);
  }

  /** Pose un bâtiment sur la première case qui convient ; les cases sont triées de la souche vers le bord. */
  private poser(type: TypeBatiment, preferer?: (c: Case) => number): boolean {
    if (!this.etat.batimentsDebloques.includes(type) || !this.abordable(type)) return false;
    const cases = this.moteur.casesLibres();
    if (cases.length === 0) return false;
    // Les logements restent près du centre ; le reste s'installe plus loin pour leur laisser la place.
    const classees = preferer ? [...cases].sort((a, b) => preferer(b) - preferer(a)) : cases;
    return this.commander({ type: 'poserBatiment', batiment: type, case: classees[0]!, orientation: 0 });
  }

  private production(type: TypeBatiment, terrain: string): boolean {
    const cases = this.moteur.casesLibres();
    return this.poser(type, (c) => (pres(this.etat, c, terrain) ? 100 : 0) + cases.indexOf(c) / cases.length);
  }

  /** Service qui couvre le plus de logements auxquels ce besoin manque. */
  private service(besoin: Besoin): boolean {
    const type = contenu.logement.sources[besoin]!;
    const manquants = this.etat.batiments.filter((b) => b.chantier === null && b.besoins[besoin] === false);
    if (manquants.length === 0 || this.chantiers(type) > 0) return false;
    const couverts = (c: Case) => manquants.filter((m) => aPortee(contenu, { type, case: c, chantier: null }, m.case)).length;
    return this.poser(type, couverts);
  }

  private chantiers(type?: TypeBatiment): number {
    return this.etat.batiments.filter((b) => b.chantier !== null && (!type || b.type === type)).length;
  }

  jouer(): void {
    const { etat } = this;
    etat.ile.elements.forEach((_, element) => {
      if (etat.pousses[element]! >= 1) this.commander({ type: 'recolter', element });
    });
    const population = etat.habitants.length;
    const capacite = capaciteLogement(contenu, etat.batiments);
    if (this.chantiers() >= 2) return;

    if (nombre(etat, 'hutte') === 0) {
      this.poser('hutte');
      return;
    }
    const actions: (() => boolean)[] = [
      () => nombre(etat, 'cueillette') < 1 + Math.floor(population / 5) && this.production('cueillette', 'buisson'),
      () => nombre(etat, 'tasDeBois') < 1 + Math.floor(population / 10) && this.production('tasDeBois', 'foret'),
      () => population >= 4 && nombre(etat, 'tapisDeMousse') < 1 + Math.floor(population / 12) && this.production('tapisDeMousse', 'eau'),
      () => capacite - population < 2 && this.chantiers('hutte') === 0 && this.poser('hutte'),
      () => this.service('chaleur'),
      () => this.service('eau'),
      () => this.service('commerce'),
      () => this.monter(),
      () => etat.palier >= 1 && nombre(etat, 'sechoir') < 1 && this.production('sechoir', 'herbe'),
      () => this.stockage(),
    ];
    for (const action of actions) if (action()) return;
  }

  private monter(): boolean {
    for (const b of this.etat.batiments) {
      if (refusMontee(contenu, b, this.etat.palier) !== null) continue;
      if (this.commander({ type: 'ameliorer', cible: { batiment: b.id } })) return true;
    }
    return false;
  }

  private stockage(): boolean {
    const { stocks } = this.etat;
    const plein = (r: 'baies' | 'boisMort' | 'mousse', type: TypeBatiment) => {
      const max = contenu.plafondsDeBase[r] + nombre(this.etat, type) * (contenu.batiments[type].stockage?.[r] ?? 0);
      return stocks[r] >= max * 0.9;
    };
    if (plein('boisMort', 'remise') || plein('mousse', 'remise')) return this.production('remise', 'herbe');
    if (plein('baies', 'gardeManger')) return this.production('gardeManger', 'herbe');
    return false;
  }
}

describe('Joueur scripté jusqu’au bourg', () => {
  it.each([1, 2, 3])('graine %i : palier bourg atteint sans jamais perdre d’habitant', (graine) => {
    const moteur = new Moteur(contenu, 0, creerEtat(contenu, graine));
    const joueur = new Joueur(moteur);
    const paliers: string[] = [];
    let population = 0;
    let secondes = 0;
    for (; secondes < HEURES_MAX * 3600 && moteur.etatCourant.palier < BOURG; secondes += 5) {
      joueur.jouer();
      for (const e of moteur.simuler(5 * PAS_PAR_SECONDE)) {
        if (e.type === 'palierAtteint') paliers.push(`${contenu.paliers[e.palier]!.nom} à ${(secondes / 3600).toFixed(1)} h`);
      }
      expect(moteur.etatCourant.habitants.length).toBeGreaterThanOrEqual(population);
      population = moteur.etatCourant.habitants.length;
    }
    const etat = moteur.etatCourant;
    const rangs = [1, 2, 3].map((n) => etat.batiments.filter((b) => b.type === 'hutte' && b.niveau === n).length);
    console.log(`graine ${graine} : ${paliers.join(', ')} ; ${population} habitants, logements par rang ${rangs.join('/')}`);
    expect(etat.palier).toBe(BOURG);
  }, 30_000);
});
