// État de la partie : le commun à toutes les îles (`Partie`) et chaque île avec son village (`Etat`).
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
import { creerHasard } from './hasard';
import { centreSouche, genererIle } from './ile';
import { disponibleSur } from './grille';
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

/**
 * Partie complète : ce qui est commun à toutes les îles, puis les îles. Sérialisable une fois retiré le lien
 * `partie` de chaque île (voir `sauvegarde.ts`) ; seul le moteur la modifie.
 */
export interface Partie {
  pas: number;
  /** Graine de la météo et des îles à venir ; la première île a la même. */
  graine: number;
  /** Stock commun à toutes les îles. */
  stocks: Record<Ressource, number>;
  /** Livraisons posées aux dépôts, rangées dans les stocks peu à peu, au rythme de la production. */
  arrivages: Record<Ressource, number>;
  prestige: Prestige;
  reglages: Reglages;
  /** Îles débloquées, dans l'ordre ; toutes vivent en même temps. */
  iles: Etat[];
  /** Indice de l'île affichée : les commandes la visent. */
  vue: number;
}

/** Une île et son village ; `partie` mène à ce qui est commun (temps, stock, prestige, réglages). */
export interface Etat {
  partie: Partie;
  /** Graine qui a dessiné cette île. */
  graine: number;
  ile: Ile;
  batiments: BatimentEtat[];
  prochainId: number;
  habitants: HabitantEtat[];
  /** Repousse de chaque élément naturel de l'île, entre 0 et 1. */
  pousses: number[];
  prochainIdHabitant: number;
  pasAvantArrivee: number;
  /** Compte à rebours du prochain départ, tant que le bien-être moyen est trop bas ; absent sinon. */
  pasAvantDepart?: number;
  batimentsDebloques: TypeBatiment[];
  /** Réserves de baies vides au dernier pas : travail ralenti, bien-être en baisse. Recalculé à chaque pas. */
  faim?: boolean;
  /** Indice du palier de population atteint. */
  palier: number;
  /** Avancement du retrait de la souche entre 0 et 1, ou `null` s'il n'est pas en cours. */
  retraitSouche: number | null;
  /** Cases en cours de défrichage, dans l'ordre des commandes. */
  defrichages: Defrichage[];
  ameliorations: Record<AmeliorationVillage, number>;
  /** Plus grand nombre d'habitants de l'île : il fixe les graines gagnées en débloquant la suivante. */
  populationMax: number;
  /** Déjà déposé au sanctuaire pour débloquer l'île suivante. */
  offrande: Quantites;
}

export function creerPartie(contenu: Contenu, graine = 1, prestige: Prestige = prestigeNeuf()): Partie {
  const effets = effetsPrestige(contenu, prestige.bonus);
  const stocks = { ...contenu.stocksDeDepart };
  for (const r of RESSOURCES) stocks[r] += effets.stocksDeDepart[r] ?? 0;
  const partie: Partie = {
    pas: 0,
    graine,
    stocks,
    arrivages: { baies: 0, baiesSechees: 0, boisMort: 0, mousse: 0, spores: 0 },
    prestige,
    reglages: {
      langue: 'fr',
      sonActive: false,
      volume: 0.5,
      opacite: 1,
      toujoursAuDessus: true,
      lancementAuDemarrage: false,
    },
    iles: [],
    vue: 0,
  };
  ajouterIle(partie, contenu, graine);
  return partie;
}

/** Première île d'une partie neuve. */
export function creerEtat(contenu: Contenu, graine = 1, prestige: Prestige = prestigeNeuf()): Etat {
  return creerPartie(contenu, graine, prestige).iles[0]!;
}

/** Graine de l'île d'indice `indice`, tirée de celle de la partie ; la première île garde la même. */
export function graineIle(partie: Pick<Partie, 'graine'>, indice: number): number {
  return indice === 0 ? partie.graine : Math.floor(creerHasard(partie.graine + indice)() * 2 ** 31) + 1;
}

/** Nouvelle île vierge au bout de l'archipel, avec sa souche et ses habitants de départ. */
export function ajouterIle(partie: Partie, contenu: Contenu, graine = graineIle(partie, partie.iles.length)): Etat {
  const ile = genererIle(contenu.ile.taille, graine, contenu.archipel.biomes[partie.iles.length] ?? 'foret');
  const effets = effetsPrestige(contenu, partie.prestige.bonus);
  const etat: Etat = {
    partie,
    graine,
    ile,
    batiments: [],
    prochainId: 1,
    habitants: [],
    pousses: ile.elements.map(() => 1),
    prochainIdHabitant: 1,
    pasAvantArrivee: (contenu.habitants.premiereArriveeSecondes ?? contenu.habitants.delaiArriveeSecondes) * effets.arrivee * (PAS_PAR_MINUTE / 60),
    batimentsDebloques: (contenu.paliers[0]?.debloque ?? []).filter((type) => disponibleSur(contenu, type, ile.biome)),
    palier: 0,
    retraitSouche: null,
    defrichages: [],
    ameliorations: { vitesse: 0, outils: 0 },
    populationMax: 0,
    offrande: {},
  };
  partie.iles.push(etat);
  for (let i = 0; i < contenu.habitants.auDepart + effets.habitantsDeDepart; i++) ajouterHabitant(etat);
  etat.populationMax = etat.habitants.length;
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

/** Plafonds du stock commun : ceux de base, plus les réserves achevées de toutes les îles. */
export function plafonds(partie: Partie, contenu: Contenu): Record<Ressource, number> {
  const resultat = { ...contenu.plafondsDeBase };
  for (const b of partie.iles.flatMap((e) => e.batiments)) {
    if (b.chantier !== null) continue;
    const stockage = contenu.batiments[b.type].stockage ?? {};
    for (const r of RESSOURCES) resultat[r] += stockage[r] ?? 0;
  }
  return resultat;
}
