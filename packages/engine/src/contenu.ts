// Forme des données d'équilibrage consommées par le moteur ; les valeurs vivent dans packages/content.
import type {
  AmeliorationVillage,
  BonusPrestige,
  Defrichable,
  Besoin,
  Meteo,
  Quantites,
  Ressource,
  Saison,
  Terrain,
  TypeBatiment,
  TypeElement,
} from './contrat';

export interface RegleVoisinage {
  /** Terrain ou bâtiment à chercher dans les 8 cases voisines. */
  voisin: Terrain | TypeBatiment;
  bonus: number;
}

export interface DefinitionBatiment {
  cout: Quantites;
  /** Durée du chantier pour un seul bâtisseur. */
  constructionSecondes: number;
  /** Quantités produites par minute, par habitant au travail. */
  production?: Quantites;
  /** Quantités prises dans les stocks par minute pour produire ; la production suit la part disponible. */
  consommation?: Quantites;
  /** Nombre d'habitants pouvant y récolter en même temps (1 par défaut). */
  postes?: number;
  /** Hausse des plafonds de stock ; fait aussi du bâtiment un point de dépôt. */
  stockage?: Quantites;
  /** Fait du bâtiment un logement : places et besoins suivent son rang (`Contenu.logement`). */
  logement?: boolean;
  /** Rayon d'effet en cases (carré centré sur le bâtiment) : chaleur d'un feu, eau d'un puits, commerce d'un marché. */
  portee?: number;
  /** Un seul exemplaire par île : le catalogue ne le propose plus tant qu'il est là. */
  unique?: boolean;
  voisinage?: RegleVoisinage[];
}

/** Récolte à la main d'un type d'élément naturel. */
export interface DefinitionRecolte {
  ressource: Ressource;
  quantite: number;
  /** Durée de repousse en saison neutre ; le facteur de saison de la ressource la ralentit (l'hiver, les baies ne repoussent pas). */
  repousseSecondes: number;
}

export interface ContenuHabitants {
  auDepart: number;
  /** Places offertes par la souche-dépôt. */
  logementDeBase: number;
  /** Délai de la toute première arrivée d'une île (sinon `delaiArriveeSecondes`). */
  premiereArriveeSecondes?: number;
  vitesseCasesParSeconde: number;
  /** Quantité portée par voyage. */
  capaciteTransport: number;
  /** Réserve maximale d'un bâtiment avant que la récolte s'arrête, par ressource. */
  reserveMax: number;
  baiesParMinute: number;
  ouvriersParChantier: number;
  delaiArriveeSecondes: number;
  /**
   * Rythme des arrivées selon les places libres : le délai de base vaut pour `placesDeReference` places libres,
   * il s'allonge en dessous et raccourcit au-dessus (délai × (référence + 1) / (libres + 1)), sans passer sous
   * `delaiMinimal` × le délai de base. Absent : délai fixe.
   */
  arriveeSelonPlaces?: { placesDeReference: number; delaiMinimal: number };
  /**
   * Bien-être moyen sous `seuil` : au bout de `delaiSecondes`, le moins heureux quitte le village, puis un
   * autre à chaque nouveau délai tant que la moyenne reste basse. Jamais en dessous de `minimum` habitants.
   * Absent : personne ne part.
   */
  depart?: { seuil: number; delaiSecondes: number; minimum: number };
  /** Bien-être moyen minimal pour qu'un nouvel habitant arrive. */
  seuilArrivee: number;
  /** Bien-être à partir duquel un habitant produit des spores ; la production croît jusqu'à 1. */
  seuilBonheur: number;
  /** Durée entre deux remises en question de la tâche en cours. */
  reevaluationSecondes: number;
  /** Heures du jour (entre 0 et 1) où tout le monde dort. */
  nuit: { debut: number; fin: number };
  /** Cadence de travail d'un village affamé, entre 0 et 1. */
  travailAffame: number;
  /** Nombre de baies fraîches qu'une baie séchée remplace au repas. */
  valeurBaieSechee: number;
  /**
   * Bien-être visé : `base`, plus `loge` et `besoins` × part des besoins satisfaits pour un habitant logé,
   * plus `affame` quand le village manque de nourriture ; un village affamé ne vise alors jamais plus que
   * `plafondAffame`, si confortables que soient ses logements.
   */
  bienEtre: { base: number; loge: number; besoins: number; affame: number; plafondAffame: number; minutesPourSeStabiliser: number };
}

export interface ContenuSaisons {
  /** Multiplicateur de production par saison (1 pour une ressource absente). */
  production: Record<Saison, Quantites>;
  /** En hiver, cadence de travail d'un poste hors de portée d'un feu de camp. */
  travailAuFroid: number;
}

export interface ContenuMeteo {
  /** Durée pendant laquelle une météo tirée au sort se maintient. */
  minutesParPeriode: number;
  /** Poids relatifs des météos possibles, par saison. */
  probabilites: Record<Saison, Partial<Record<Meteo, number>>>;
  /** Multiplicateur de production par météo (1 pour une ressource absente). */
  production: Record<Meteo, Quantites>;
}

export interface DefinitionAmelioration {
  /** Coût du premier niveau, multiplié par `hausseCout` à chaque niveau suivant. */
  cout: Quantites;
  hausseCout: number;
  /** Gain par niveau : +`effet` de vitesse de marche ou de production. */
  effet: number;
  niveauMax: number;
  /** Durée des travaux à l'atelier, pour un bâtisseur (absent : effet immédiat). */
  travauxSecondes?: number;
}

/** Rang d'un logement ; le premier est celui d'un logement neuf. */
export interface DefinitionRang {
  places: number;
  besoins: Besoin[];
  /** Prix de la montée depuis le rang précédent (absent au premier rang). */
  cout?: Quantites;
  /** Palier de population à atteindre pour monter à ce rang. */
  palier: number;
  /** Durée des travaux de montée à ce rang, pour un bâtisseur (absent : immédiat). */
  agrandissementSecondes?: number;
  /** Spores par minute d'un habitant pleinement heureux. */
  sporesParMinute: number;
  /** Prélevé dans les stocks par minute ; le besoin du même nom n'est satisfait que si tout est servi. */
  consommation?: Quantites;
}

export interface ContenuLogement {
  rangs: DefinitionRang[];
  /** Bâtiment dont la portée satisfait chaque besoin de proximité. */
  sources: Partial<Record<Besoin, TypeBatiment>>;
}

export interface DefinitionPalier {
  /** Clé de traduction `palier.<nom>`. */
  nom: string;
  population: number;
  debloque: TypeBatiment[];
}

/** Renaissance au sanctuaire. */
export interface ContenuPrestige {
  /** Graines gagnées : `floor((populationMax / diviseur) ^ puissance)`. */
  gain: { diviseur: number; puissance: number };
  /** Prix en graines du premier niveau, multiplié par `hausseCout` à chaque niveau suivant. */
  bonus: Record<BonusPrestige, { cout: number; hausseCout: number; niveauMax: number }>;
  /** Effet d'un niveau de chaque bonus. */
  effets: {
    /** `production` : +part de production. */
    production: number;
    /** `depart` : ressources en stock et habitants au début d'une partie, logés dans la souche. */
    stocksDeDepart: Quantites;
    habitantsDeDepart: number;
    /** `construction` : −part du coût, +part de vitesse des chantiers. */
    reductionCout: number;
    vitesseChantier: number;
    /** `logement` : +bien-être visé, +places par logement, −part du délai entre deux arrivées. */
    bienEtre: number;
    places: number;
    accueil: number;
  };
}

export interface Contenu {
  ile: { taille: number };
  stocksDeDepart: Record<Ressource, number>;
  plafondsDeBase: Record<Ressource, number>;
  batiments: Record<TypeBatiment, DefinitionBatiment>;
  logement: ContenuLogement;
  /** Retrait de la souche-dépôt : prix, puis durée pour un seul travailleur. */
  souche: { coutRetrait: Quantites; retraitSecondes: number };
  /** Arrachage : prix, durée pour un seul travailleur et ce que ça rapporte. */
  defrichage: Record<Defrichable, { cout: Quantites; secondes: number; gain?: Quantites }>;
  /** Paliers de population dans l'ordre ; le premier, à 0 habitant, donne les bâtiments de départ. */
  paliers: DefinitionPalier[];
  recolte: Record<TypeElement, DefinitionRecolte>;
  habitants: ContenuHabitants;
  /** Améliorations du village, achetées à l'atelier. */
  ameliorations: Record<AmeliorationVillage, DefinitionAmelioration>;
  prestige: ContenuPrestige;
  /** Part du coût rendue à la démolition, entre 0 et 1. */
  remboursementDemolition: number;
  /** `heureDeDepart` : heure du jour (entre 0 et 1) au premier pas d'une partie. */
  temps: { minutesParSaison: number; minutesParJour: number; heureDeDepart: number };
  saisons: ContenuSaisons;
  meteo: ContenuMeteo;
}
