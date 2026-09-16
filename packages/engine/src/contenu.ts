// Forme des données d'équilibrage consommées par le moteur ; les valeurs vivent dans packages/content.
import type { Quantites, Ressource, TypeBatiment } from './contrat';

export interface DefinitionBatiment {
  cout: Quantites;
  constructionSecondes: number;
  /** Quantités produites par minute de jeu. */
  production?: Quantites;
  /** Quantités consommées par minute pour produire ; la production suit la part disponible. */
  consommation?: Quantites;
  /** Hausse des plafonds de stock. */
  stockage?: Quantites;
  logement?: number;
}

export interface Contenu {
  stocksDeDepart: Record<Ressource, number>;
  plafondsDeBase: Record<Ressource, number>;
  batiments: Record<TypeBatiment, DefinitionBatiment>;
  batimentsDeDepart: TypeBatiment[];
  arbreMere: { sporesParMinute: number };
  /** Part du coût rendue à la démolition, entre 0 et 1. */
  remboursementDemolition: number;
  temps: { minutesParSaison: number; minutesParJour: number };
}
