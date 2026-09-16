// État complet de la partie : sérialisable tel quel, seul le moteur le modifie.
import type {
  AmeliorationVillage,
  Batiment,
  Case,
  Defrichage,
  Habitant,
  IdBatiment,
  Ile,
  Position,
  Prestige,
  Quantites,
  Reglages,
  Ressource,
  TypeBatiment,
} from './contrat';
import { RESSOURCES } from './contrat';
import type { Contenu } from './contenu';
import { centreSouche, genererIle } from './ile';
import { effetsPrestige, prestigeNeuf } from './prestige';
import { PAS_PAR_MINUTE } from './temps';

export interface BatimentEtat extends Batiment {
  /** Récolte en attente d'être portée jusqu'à un dépôt. */
  reserve: Quantites;
}

export type Mission =
  | { tache: 'recolter'; batiment: IdBatiment }
  | { tache: 'construire'; batiment: IdBatiment }
  | { tache: 'tenir'; batiment: IdBatiment }
  /** `case` nulle : la souche-dépôt. */
  | { tache: 'arracher'; case: Case | null }
  | { tache: 'stocker'; etape: 'prendre'; batiment: IdBatiment }
  | { tache: 'stocker'; etape: 'deposer'; destination: Position; rayon: number };

export interface HabitantEtat extends Omit<Habitant, 'lieu'> {
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
  /** Repousse de chaque élément naturel de l'île, entre 0 et 1. */
  pousses: number[];
  prochainIdHabitant: number;
  pasAvantArrivee: number;
  batimentsDebloques: TypeBatiment[];
  /** Indice du palier de population atteint. */
  palier: number;
  /** Avancement du retrait de la souche entre 0 et 1, ou `null` s'il n'est pas en cours. */
  retraitSouche: number | null;
  /** Cases en cours de défrichage, dans l'ordre des commandes. */
  defrichages: Defrichage[];
  ameliorations: Record<AmeliorationVillage, number>;
  /** Gardé d'une renaissance à l'autre. */
  prestige: Prestige;
  reglages: Reglages;
  /** Ressources dont le stock était plein au pas précédent, pour n'annoncer `stockPlein` qu'une fois. */
  stocksPleins: Ressource[];
  /** Livraisons posées au dépôt, rangées dans les stocks peu à peu, au rythme de la production. */
  arrivages: Record<Ressource, number>;
}

export function creerEtat(contenu: Contenu, graine = 1, prestige: Prestige = prestigeNeuf()): Etat {
  const ile = genererIle(contenu.ile.taille, graine);
  const effets = effetsPrestige(contenu, prestige.bonus);
  const stocks = { ...contenu.stocksDeDepart };
  for (const r of RESSOURCES) stocks[r] += effets.stocksDeDepart[r] ?? 0;
  const etat: Etat = {
    pas: 0,
    graine,
    ile,
    stocks,
    batiments: [],
    prochainId: 1,
    habitants: [],
    pousses: ile.elements.map(() => 1),
    prochainIdHabitant: 1,
    pasAvantArrivee: contenu.habitants.delaiArriveeSecondes * effets.arrivee * (PAS_PAR_MINUTE / 60),
    batimentsDebloques: [...(contenu.paliers[0]?.debloque ?? [])],
    palier: 0,
    retraitSouche: null,
    defrichages: [],
    ameliorations: { vitesse: 0, outils: 0 },
    prestige,
    reglages: {
      langue: 'fr',
      sonActive: false,
      volume: 0.5,
      opacite: 1,
      toujoursAuDessus: true,
      lancementAuDemarrage: false,
    },
    stocksPleins: [],
    arrivages: { baies: 0, baiesSechees: 0, boisMort: 0, mousse: 0, spores: 0 },
  };
  for (let i = 0; i < contenu.habitants.auDepart + effets.habitantsDeDepart; i++) ajouterHabitant(etat);
  prestige.populationMax = Math.max(prestige.populationMax, etat.habitants.length);
  return etat;
}

/** Fait apparaître un habitant au pied de la souche-dépôt. */
export function ajouterHabitant(etat: Etat): HabitantEtat {
  const id = etat.prochainIdHabitant++;
  const centre = centreSouche(etat.ile);
  const angle = id * 2.4;
  // Sur le pourtour carré de l'emprise, pour ne jamais apparaître dans la souche, même en diagonale.
  const ecart = etat.ile.tailleSouche / 2 + 0.4;
  const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
  const echelle = ecart / Math.max(Math.abs(dx), Math.abs(dy));
  const habitant: HabitantEtat = {
    id,
    position: { x: centre.x + dx * echelle, y: centre.y + dy * echelle },
    direction: angle,
    activite: 'attend',
    tache: null,
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
