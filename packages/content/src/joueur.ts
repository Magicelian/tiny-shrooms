// Joueur scripté des critères : nourriture, bois, mousse, logements, services manquants, montée en gamme, stockage,
// ruches de la prairie et offrandes.
import {
  aPortee,
  BONUS_PRESTIGE,
  coutBonus,
  capaciteLogement,
  coutBatiment,
  Moteur,
  offrande,
  plafonds,
  PAS_PAR_MINUTE,
  RESSOURCES,
  refusMontee,
  terrainEn,
  terrainManquant,
  type Besoin,
  type Case,
  type Commande,
  type Etat,
  type TypeBatiment,
} from '@tiny-shrooms/engine';
import { contenu } from './index';

export const PAS_PAR_SECONDE = PAS_PAR_MINUTE / 60;
export const BOURG = contenu.paliers.findIndex((p) => p.nom === 'bourg');

/** Ce qu'on abat pour faire de la place. */
const BOISES: readonly string[] = ['foret', 'roseaux', 'fleurs'];

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

  get partie() {
    return this.moteur.partieCourante;
  }

  commander(commande: Commande): boolean {
    const message = this.moteur.recevoir({ type: 'commande', commande }, 0).find((m) => m.type === 'instantane');
    return message?.type === 'instantane' && !message.evenements.some((e) => e.type === 'commandeRefusee');
  }

  private abordable(type: TypeBatiment): boolean {
    const cout = coutBatiment(contenu, this.etat.partie.prestige.bonus, type, this.etat.batiments);
    return RESSOURCES.every((r) => this.etat.partie.stocks[r] >= (cout[r] ?? 0));
  }

  /** Pose un bâtiment sur la première case qui convient ; les cases sont triées de la souche vers le bord. */
  poser(type: TypeBatiment, preferer?: (c: Case) => number): boolean {
    if (!this.etat.batimentsDebloques.includes(type) || !this.abordable(type)) return false;
    const cases = this.moteur.casesLibres().filter((c) => !terrainManquant(this.etat.ile, contenu, type, c));
    if (cases.length === 0) return false;
    // Les logements restent près du centre ; le reste s'installe plus loin pour leur laisser la place.
    const classees = preferer ? [...cases].sort((a, b) => preferer(b) - preferer(a)) : cases;
    return this.commander({ type: 'poserBatiment', batiment: type, case: classees[0]!, orientation: 0 });
  }

  /** Île pleine : fait abattre l'arbre (ou les roseaux, les fleurs) le plus proche du centre, un seul à la fois. */
  faireDeLaPlace(): boolean {
    const { ile, defrichages } = this.etat;
    if (defrichages.length > 0 || this.moteur.casesLibres().length > 0) return false;
    let meilleure: Case | null = null;
    for (let y = 0; y < ile.profondeur; y++) {
      for (let x = 0; x < ile.largeur; x++) {
        if (!BOISES.includes(terrainEn(ile, x, y))) continue;
        const d = Math.hypot(x - ile.largeur / 2, y - ile.profondeur / 2);
        if (!meilleure || d < Math.hypot(meilleure.x - ile.largeur / 2, meilleure.y - ile.profondeur / 2)) meilleure = { x, y };
      }
    }
    return meilleure !== null && this.commander({ type: 'defricher', case: meilleure });
  }

  /** Ruches achevées ou en chantier de l'île. */
  private ruches() {
    return this.etat.batiments.filter((b) => contenu.batiments[b.type].pollinise);
  }

  /** Cueillette à portée d'une ruche de préférence, puis près d'un buisson. */
  private cueillette(): boolean {
    const cases = this.moteur.casesLibres();
    const ruches = this.ruches();
    return this.poser('cueillette', (c) =>
      (ruches.some((r) => aPortee(contenu, r, c)) ? 200 : 0) + (pres(this.etat, c, 'buisson') ? 100 : 0) + cases.indexOf(c) / cases.length,
    );
  }

  /** Ruche là où elle couvre le plus de cueillettes qu'aucune ruche ne couvre encore. */
  private ruche(): boolean {
    const etat = this.etat;
    if (!etat.batimentsDebloques.includes('ruche') || this.chantiers('ruche') > 0) return false;
    const ruches = this.ruches();
    const seules = etat.batiments.filter((b) => b.type === 'cueillette' && !ruches.some((r) => aPortee(contenu, r, b.case)));
    if (seules.length === 0) return false;
    const couvertes = (c: Case) => seules.filter((b) => aPortee(contenu, { type: 'ruche', case: c, chantier: null }, b.case)).length;
    return Math.max(0, ...this.moteur.casesLibres().map(couvertes)) > 0 && this.poser('ruche', couvertes);
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
    const capacite = capaciteLogement(contenu, etat.batiments, etat.ile.soucheEnPlace, etat.partie.prestige);
    // Montées en gamme et améliorations ne sont pas des chantiers : elles passent avant la limite.
    if (this.monter() || this.ameliorerAtelier()) return true;
    if (this.chantiers() >= 2) return false;

    if (nombre(etat, 'hutte') === 0) return this.poser('hutte');
    const actions: (() => boolean)[] = [
      // Au bourg, le sanctuaire passe avant tout : sinon, l'île pleine, chaque case libérée est reprise.
      () => this.offrir(),
      () => this.renforcerPourOffrande(population),
      () => nombre(etat, 'cueillette') < 1 + Math.floor(population / 5) && this.cueillette(),
      // Sur la prairie, une ruche dès qu'une cueillette n'en a pas ; les suivantes se groupent autour.
      () => this.ruche(),
      () => nombre(etat, 'tasDeBois') < 1 + Math.floor(population / 10) && this.production('tasDeBois', 'foret'),
      // Sur le marais, la tourbière remplace le tapis : c'est elle qui fait la mousse de l'archipel.
      () => population >= 2 && nombre(etat, 'tourbiere') < 1 + Math.floor(population / 8) && this.production('tourbiere', 'roseaux'),
      () => population >= 4 && !etat.batimentsDebloques.includes('tourbiere') && nombre(etat, 'tapisDeMousse') < 1 + Math.floor(population / 12) && this.production('tapisDeMousse', 'eau'),
      // Un bâtiment qui vient d'être débloqué est essayé tout de suite.
      () => etat.palier >= 1 && nombre(etat, 'sechoir') < 1 + Math.floor(population / 15) && this.production('sechoir', 'herbe'),
      () => etat.palier >= 1 && nombre(etat, 'atelier') < 1 && this.production('atelier', 'herbe'),
      // Stocks au plafond : on agrandit les réserves avant de loger plus de monde (l'hiver se passe sur les réserves).
      () => this.stockage(),
      () => capacite - population < 2 && this.chantiers('hutte') === 0 && this.poser('hutte'),
      () => this.service('chaleur'),
      () => this.service('eau'),
      () => this.service('commerce'),
      // Île pleine et logements pleins : on abat un arbre, en gardant un bout de forêt pour le sanctuaire.
      () => capacite - population < 2 && this.forets() > 3 && this.faireDeLaPlace(),
    ];
    return actions.some((action) => action());
  }

  /** Au bourg : pose le sanctuaire, puis y dépose dès qu'un stock demandé par l'offrande est presque plein. */
  offrir(): boolean {
    const etat = this.etat;
    if (!etat.batimentsDebloques.includes('sanctuaire')) return false;
    if (nombre(etat, 'sanctuaire') === 0) return this.poser('sanctuaire') || this.faireDeLaPlace() || this.demolirPourLeSanctuaire();
    const o = offrande(etat, contenu);
    if (!o) return false;
    const max = plafonds(etat.partie, contenu);
    const plein = RESSOURCES.some((r) => (o.objectif[r] ?? 0) > (o.depose[r] ?? 0) && etat.partie.stocks[r] >= max[r] * 0.9);
    return plein && this.commander({ type: 'offrir' });
  }

  /**
   * Offrande en cours : un producteur de plus pour ce qui y manque encore (la mousse pour ouvrir le marais, les baies
   * séchées pour la prairie).
   */
  private renforcerPourOffrande(population: number): boolean {
    const o = nombre(this.etat, 'sanctuaire') > 0 ? offrande(this.etat, contenu) : null;
    if (!o) return false;
    const manque = (r: 'mousse' | 'boisMort' | 'baiesSechees') => (o.objectif[r] ?? 0) > (o.depose[r] ?? 0);
    const limite = 2 + Math.floor(population / 8);
    if (manque('baiesSechees') && nombre(this.etat, 'sechoir') < limite) return this.production('sechoir', 'herbe');
    if (manque('mousse') && nombre(this.etat, 'tapisDeMousse') < limite) return this.production('tapisDeMousse', 'eau');
    if (manque('boisMort') && nombre(this.etat, 'tasDeBois') < limite) return this.production('tasDeBois', 'foret');
    return false;
  }

  /** Île pleine sans arbre à abattre : un tas de bois cède sa place (le bois déborde à ce stade). */
  private demolirPourLeSanctuaire(): boolean {
    const { batiments, defrichages } = this.etat;
    if (defrichages.length > 0 || this.moteur.casesLibres().length > 0 || nombre(this.etat, 'tasDeBois') < 2) return false;
    const tas = batiments.find((b) => b.type === 'tasDeBois')!;
    return this.commander({ type: 'demolir', id: tas.id });
  }

  private forets(): number {
    const { ile } = this.etat;
    let n = 0;
    for (let y = 0; y < ile.profondeur; y++) for (let x = 0; x < ile.largeur; x++) if (BOISES.includes(terrainEn(ile, x, y))) n++;
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
    const { stocks } = this.etat.partie;
    const plein = (r: 'baies' | 'boisMort' | 'mousse', type: TypeBatiment) => {
      if (nombre(this.etat, type) > this.etat.habitants.length / 10) return false;
      const max = contenu.plafondsDeBase[r] + nombre(this.etat, type) * (contenu.batiments[type].stockage?.[r] ?? 0);
      return stocks[r] >= max * 0.9;
    };
    if (plein('boisMort', 'remise') || plein('mousse', 'remise')) return this.production('remise', 'herbe');
    if (plein('baies', 'gardeManger')) return this.production('gardeManger', 'herbe');
    return false;
  }
}

/** Dépense les graines : l'accueil des logements d'abord (la population fixe le rythme), puis le bonus le moins cher. */
export function depenser(joueur: Joueur): void {
  const { prestige } = joueur.partie;
  for (;;) {
    const prix = BONUS_PRESTIGE.map((b) => [b, coutBonus(contenu, b, prestige.bonus[b])] as const)
      .filter((x): x is readonly [(typeof BONUS_PRESTIGE)[number], number] => x[1] !== null && x[1] <= prestige.graines)
      .sort((a, b) => Number(b[0] === 'logement') - Number(a[0] === 'logement') || a[1] - b[1]);
    if (prix.length === 0 || !joueur.commander({ type: 'acheterBonus', bonus: prix[0]![0] })) return;
  }
}
