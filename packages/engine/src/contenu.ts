// Forme des données d'équilibrage consommées par le moteur ; les valeurs vivent dans packages/content.
import type { Quantites, Ressource, Terrain, TypeBatiment } from './contrat';

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
  /** Places offertes par l'arbre-mère. */
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
  sporesParSoigneur: number;
  /** Durée entre deux remises en question de la tâche en cours. */
  reevaluationSecondes: number;
  /** Heures du jour (entre 0 et 1) où tout le monde dort. */
  nuit: { debut: number; fin: number };
  bienEtre: { base: number; loge: number; nourri: number; affame: number; feuDeCamp: number; minutesPourSeStabiliser: number };
}

export interface Contenu {
  ile: { taille: number };
  stocksDeDepart: Record<Ressource, number>;
  plafondsDeBase: Record<Ressource, number>;
  batiments: Record<TypeBatiment, DefinitionBatiment>;
  batimentsDeDepart: TypeBatiment[];
  habitants: ContenuHabitants;
  /** Spores données par les racines, par minute. */
  arbreMere: { sporesParMinute: number };
  /** Part du coût rendue à la démolition, entre 0 et 1. */
  remboursementDemolition: number;
  /** `heureDeDepart` : heure du jour (entre 0 et 1) au premier pas d'une partie. */
  temps: { minutesParSaison: number; minutesParJour: number; heureDeDepart: number };
}
