// Joueur scripté des critères : nourriture, bois, mousse, logements, services manquants, montée en gamme, stockage.
import {
  aPortee,
  capaciteLogement,
  coutBatiment,
  Moteur,
  PAS_PAR_MINUTE,
  RESSOURCES,
  refusMontee,
  terrainEn,
  type Besoin,
  type Case,
  type Commande,
  type Etat,
  type TypeBatiment,
} from '@tiny-shrooms/engine';
import { contenu } from './index';

export const PAS_PAR_SECONDE = PAS_PAR_MINUTE / 60;
export const BOURG = contenu.paliers.findIndex((p) => p.nom === 'bourg');

function nombre(etat: Etat, type: TypeBatiment): number {
  return etat.batiments.filter((b) => b.type === type).length;
}

function pres(etat: Etat, c: Case, terrain: string): boolean {
  return [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => terrainEn(etat.ile, c.x + dx, c.y + dy) === terrain));
}

/** Toutes les 5 s de jeu : récolte ce qui est prêt et tente une seule action, par ordre de priorité. */
export class Joueur {
  constructor(private readonly moteur: Moteur) {}

  private get etat(): Etat {
    return this.moteur.etatCourant as Etat;
  }

  commander(commande: Commande): boolean {
    const [message] = this.moteur.recevoir({ type: 'commande', commande }, 0);
    return message?.type === 'instantane' && !message.evenements.some((e) => e.type === 'commandeRefusee');
  }

  private abordable(type: TypeBatiment): boolean {
    const cout = coutBatiment(contenu, this.etat.prestige.bonus, type);
    return RESSOURCES.every((r) => this.etat.stocks[r] >= (cout[r] ?? 0));
  }

  /** Pose un bâtiment sur la première case qui convient ; les cases sont triées de la souche vers le bord. */
  poser(type: TypeBatiment, preferer?: (c: Case) => number): boolean {
    if (!this.etat.batimentsDebloques.includes(type) || !this.abordable(type)) return false;
    const cases = this.moteur.casesLibres();
    if (cases.length === 0) return false;
    // Les logements restent près du centre ; le reste s'installe plus loin pour leur laisser la place.
    const classees = preferer ? [...cases].sort((a, b) => preferer(b) - preferer(a)) : cases;
    return this.commander({ type: 'poserBatiment', batiment: type, case: classees[0]!, orientation: 0 });
  }

  /** Île pleine : fait abattre l'arbre le plus proche du centre, un seul à la fois. */
  faireDeLaPlace(): boolean {
    const { ile, defrichages } = this.etat;
    if (defrichages.length > 0 || this.moteur.casesLibres().length > 0) return false;
    let meilleure: Case | null = null;
    for (let y = 0; y < ile.profondeur; y++) {
      for (let x = 0; x < ile.largeur; x++) {
        if (terrainEn(ile, x, y) !== 'foret') continue;
        const d = Math.hypot(x - ile.largeur / 2, y - ile.profondeur / 2);
        if (!meilleure || d < Math.hypot(meilleure.x - ile.largeur / 2, meilleure.y - ile.profondeur / 2)) meilleure = { x, y };
      }
    }
    return meilleure !== null && this.commander({ type: 'defricher', case: meilleure });
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

  /** Renvoie vrai si une action a été lancée. */
  jouer(): boolean {
    const { etat } = this;
    etat.ile.elements.forEach((_, element) => {
      if (etat.pousses[element]! >= 1) this.commander({ type: 'recolter', element });
    });
    const population = etat.habitants.length;
    const capacite = capaciteLogement(contenu, etat.batiments, etat.ile.soucheEnPlace, etat.prestige);
    // Montées en gamme et améliorations ne sont pas des chantiers : elles passent avant la limite.
    if (this.monter() || this.ameliorerAtelier()) return true;
    if (this.chantiers() >= 2) return false;

    if (nombre(etat, 'hutte') === 0) return this.poser('hutte');
    const actions: (() => boolean)[] = [
      () => nombre(etat, 'cueillette') < 1 + Math.floor(population / 5) && this.production('cueillette', 'buisson'),
      () => nombre(etat, 'tasDeBois') < 1 + Math.floor(population / 10) && this.production('tasDeBois', 'foret'),
      () => population >= 4 && nombre(etat, 'tapisDeMousse') < 1 + Math.floor(population / 12) && this.production('tapisDeMousse', 'eau'),
      // Un bâtiment qui vient d'être débloqué est essayé tout de suite.
      () => etat.palier >= 1 && nombre(etat, 'sechoir') < 1 && this.production('sechoir', 'herbe'),
      () => etat.palier >= 1 && nombre(etat, 'atelier') < 1 && this.production('atelier', 'herbe'),
      () => capacite - population < 2 && this.chantiers('hutte') === 0 && this.poser('hutte'),
      () => this.service('chaleur'),
      () => this.service('eau'),
      () => this.service('commerce'),
      () => this.stockage(),
      // Île pleine et logements pleins : on abat un arbre, en gardant un bout de forêt pour le sanctuaire.
      () => capacite - population < 2 && this.forets() > 3 && this.faireDeLaPlace(),
    ];
    return actions.some((action) => action());
  }

  private forets(): number {
    const { ile } = this.etat;
    let n = 0;
    for (let y = 0; y < ile.profondeur; y++) for (let x = 0; x < ile.largeur; x++) if (terrainEn(ile, x, y) === 'foret') n++;
    return n;
  }

  private ameliorerAtelier(): boolean {
    return (['outils', 'vitesse'] as const).some((a) => this.commander({ type: 'ameliorer', cible: { village: a } }));
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
