// Forme des données d'équilibrage consommées par le moteur ; les valeurs vivent dans packages/content.
import type {
  AmeliorationVillage,
  Meteo,
  Quantites,
  Ressource,
  Saison,
  Terrain,
  TypeBatiment,
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
  logement?: number;
  voisinage?: RegleVoisinage[];
}

export interface ContenuHabitants {
  auDepart: number;
  /** Places offertes par la souche-dépôt. */
  logementDeBase: number;
  vitesseCasesParSeconde: number;
  /** Quantité portée par voyage. */
  capaciteTransport: number;
  /** Réserve maximale d'un bâtiment avant que la récolte s'arrête, par ressource. */
  reserveMax: number;
  baiesParMinute: number;
  ouvriersParChantier: number;
  delaiArriveeSecondes: number;
  /** Bien-être moyen minimal pour qu'un nouvel habitant arrive. */
  seuilArrivee: number;
  /** Au-delà, un habitant compte comme heureux et produit des spores. */
  seuilBonheur: number;
  sporesParHabitantHeureux: number;
  /** Durée entre deux remises en question de la tâche en cours. */
  reevaluationSecondes: number;
  /** Heures du jour (entre 0 et 1) où tout le monde dort. */
  nuit: { debut: number; fin: number };
  /** Cadence de travail d'un village affamé, entre 0 et 1. */
  travailAffame: number;
  /** Nombre de baies fraîches qu'une baie séchée remplace au repas. */
  valeurBaieSechee: number;
  bienEtre: { base: number; loge: number; nourri: number; affame: number; feuDeCamp: number; minutesPourSeStabiliser: number };
}

export interface ContenuSaisons {
  /** Multiplicateur de production par saison (1 pour une ressource absente). */
  production: Record<Saison, Quantites>;
  /** En hiver, cadence de travail d'un poste trop loin d'un feu de camp. */
  travailAuFroid: number;
  /** Portée de la chaleur d'un feu de camp, en cases. */
  rayonChaleur: number;
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
}

export interface Contenu {
  ile: { taille: number };
  stocksDeDepart: Record<Ressource, number>;
  plafondsDeBase: Record<Ressource, number>;
  batiments: Record<TypeBatiment, DefinitionBatiment>;
  batimentsDeDepart: TypeBatiment[];
  habitants: ContenuHabitants;
  /** Améliorations du village, achetées à l'atelier. */
  ameliorations: Record<AmeliorationVillage, DefinitionAmelioration>;
  /** Part du coût rendue à la démolition, entre 0 et 1. */
  remboursementDemolition: number;
  /** `heureDeDepart` : heure du jour (entre 0 et 1) au premier pas d'une partie. */
  temps: { minutesParSaison: number; minutesParJour: number; heureDeDepart: number };
  saisons: ContenuSaisons;
  meteo: ContenuMeteo;
}
