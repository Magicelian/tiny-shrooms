// État complet de la partie : sérialisable tel quel, seul le moteur le modifie.
import type {
  AmeliorationVillage,
  Batiment,
  BonusActif,
  Habitant,
  IdBatiment,
  Ile,
  Position,
  Priorites,
  Quantites,
  Reglages,
  Ressource,
  TypeBatiment,
  Visiteur,
} from './contrat';
import { RESSOURCES } from './contrat';
import type { ArbreEtat } from './arbre';
import type { Contenu } from './contenu';
import { centreArbre, genererIle } from './ile';
import { PAS_PAR_MINUTE } from './temps';

export interface BatimentEtat extends Batiment {
  /** Récolte en attente d'être portée jusqu'à un dépôt. */
  reserve: Quantites;
}

export type Mission =
  | { tache: 'recolter'; batiment: IdBatiment }
  | { tache: 'construire'; batiment: IdBatiment }
  | { tache: 'stocker'; etape: 'prendre'; batiment: IdBatiment }
  | { tache: 'stocker'; etape: 'deposer'; destination: Position; rayon: number }
  | { tache: 'soignerArbre' };

export interface HabitantEtat extends Habitant {
  mission: Mission | null;
  charge: { ressource: Ressource; quantite: number } | null;
  pasDepuisChoix: number;
}

export interface Etat {
  pas: number;
  graine: number;
  ile: Ile;
  stocks: Record<Ressource, number>;
  batiments: BatimentEtat[];
  prochainId: number;
  habitants: HabitantEtat[];
  prochainIdHabitant: number;
  pasAvantArrivee: number;
  batimentsDebloques: TypeBatiment[];
  priorites: Priorites;
  arbreMere: ArbreEtat;
  ameliorations: Record<AmeliorationVillage, number>;
  reglages: Reglages;
  visiteurs: Visiteur[];
  prochainIdVisiteur: number;
  /** Pas restant avant le prochain visiteur, décomptés seulement quand un relais a de la place. */
  pasAvantVisiteur: number;
  bonus: BonusActif[];
  /** Ressources dont le stock était plein au pas précédent, pour n'annoncer `stockPlein` qu'une fois. */
  stocksPleins: Ressource[];
}

export function creerEtat(contenu: Contenu, graine = 1): Etat {
  const etat: Etat = {
    pas: 0,
    graine,
    ile: genererIle(contenu.ile.taille, graine),
    stocks: { ...contenu.stocksDeDepart },
    batiments: [],
    prochainId: 1,
    habitants: [],
    prochainIdHabitant: 1,
    pasAvantArrivee: contenu.habitants.delaiArriveeSecondes * (PAS_PAR_MINUTE / 60),
    batimentsDebloques: [...contenu.batimentsDeDepart],
    priorites: { recolter: 0.5, construire: 0.5, stocker: 0.5, soignerArbre: 0.5 },
    arbreMere: { stade: 'pousse', avancement: 0, floraisonPossible: false, floraisons: 0 },
    ameliorations: { vitesse: 0, outils: 0 },
    reglages: {
      langue: 'fr',
      sonActive: false,
      volume: 0.5,
      opacite: 1,
      toujoursAuDessus: true,
      lancementAuDemarrage: false,
    },
    stocksPleins: [],
    // Le premier visiteur arrive dès que le premier relais est construit.
    visiteurs: [],
    prochainIdVisiteur: 1,
    pasAvantVisiteur: 0,
    bonus: [],
  };
  for (let i = 0; i < contenu.habitants.auDepart; i++) ajouterHabitant(etat);
  return etat;
}

/** Fait apparaître un habitant au pied de l'arbre-mère. */
export function ajouterHabitant(etat: Etat): HabitantEtat {
  const id = etat.prochainIdHabitant++;
  const centre = centreArbre(etat.ile);
  const angle = id * 2.4;
  const rayon = etat.ile.tailleArbreMere / 2 + 0.4;
  const habitant: HabitantEtat = {
    id,
    position: { x: centre.x + Math.cos(angle) * rayon, y: centre.y + Math.sin(angle) * rayon },
    direction: angle,
    activite: 'attend',
    tache: null,
    epingle: null,
    bienEtre: 0.5,
    chapeau: id - 1,
    mission: null,
    charge: null,
    pasDepuisChoix: 0,
  };
  etat.habitants.push(habitant);
  return habitant;
}

export function plafonds(etat: Etat, contenu: Contenu): Record<Ressource, number> {
  const resultat = { ...contenu.plafondsDeBase };
  for (const b of etat.batiments) {
    if (b.chantier !== null) continue;
    const stockage = contenu.batiments[b.type].stockage ?? {};
    for (const r of RESSOURCES) resultat[r] += stockage[r] ?? 0;
  }
  return resultat;
}
