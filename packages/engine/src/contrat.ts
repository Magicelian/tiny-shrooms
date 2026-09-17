// Contrat entre le moteur (Worker) et le frontend : types seuls, aucune logique.
// Le frontend envoie des commandes et reçoit des instantanés ; il ne modifie jamais l'état.

// ─── Repère ──────────────────────────────────────────────────────────────────
// Grille carrée, vue de dessus : x croît vers l'est, y vers le sud, origine au coin nord-ouest.
// Une case vaut 1 unité de monde : la case (x, y) couvre [x, x+1) × [y, y+1).
// Le renderer projette y sur l'axe z de Three.js. L'île est plate en V1.

/** Coordonnées entières d'une case. */
export interface Case {
  x: number;
  y: number;
}

/** Position continue sur la grille, en unités de case (pour ce qui se déplace). */
export interface Position {
  x: number;
  y: number;
}

/** Quart de tour, dans le sens horaire vu de dessus. */
export type Orientation = 0 | 1 | 2 | 3;

// ─── Ressources ──────────────────────────────────────────────────────────────

export const RESSOURCES = ['baies', 'baiesSechees', 'boisMort', 'mousse', 'spores'] as const;
export type Ressource = (typeof RESSOURCES)[number];

export type Quantites = Partial<Record<Ressource, number>>;

export interface Stock {
  quantite: number;
  plafond: number;
  /** Variation nette par minute de jeu, pour les infobulles. */
  productionParMinute: number;
}

// ─── Île ─────────────────────────────────────────────────────────────────────

export type Terrain = 'vide' | 'herbe' | 'foret' | 'buisson' | 'eau' | 'rocher';

export type Biome = 'foret';

// ─── Éléments naturels ───────────────────────────────────────────────────────

/** Ce qu'on récolte à la main : un clic donne un peu de ressource et épuise l'élément, qui repousse. */
export const TYPES_ELEMENT = ['buisson', 'boisMort', 'mousse'] as const;
export type TypeElement = (typeof TYPES_ELEMENT)[number];

/** Ce qu'on peut faire arracher : un arbre de la forêt, un buisson sauvage, une plante semée sur l'herbe. */
export type Defrichable = 'arbre' | 'buisson' | 'plante';

/** Case en cours de défrichage. */
export interface Defrichage {
  case: Case;
  nature: Defrichable;
  /** Entre 0 et 1. */
  avancement: number;
}

/** Indice de l'élément dans `Ile.elements`. */
export type IdElement = number;

export interface ElementNaturel {
  type: TypeElement;
  /** Une case par élément ; elle ne peut pas recevoir de bâtiment. */
  case: Case;
}

/** Description de l'île, envoyée au démarrage et à chaque changement d'île, pas à chaque pas. */
export interface Ile {
  biome: Biome;
  largeur: number;
  profondeur: number;
  /** Terrain case par case, indexé par `y * largeur + x`. */
  terrain: Terrain[];
  /** Coin nord-ouest de l'emprise de la souche-dépôt. */
  souche: Case;
  /** Côté de l'emprise carrée de la souche, en cases. */
  tailleSouche: number;
  /** Faux une fois la souche arrachée : ses cases deviennent constructibles. */
  soucheEnPlace: boolean;
  /** Éléments naturels récoltables, placés d'après la graine. */
  elements: ElementNaturel[];
}

// ─── Bâtiments ───────────────────────────────────────────────────────────────

export const TYPES_BATIMENT = [
  'hutte',
  'cueillette',
  'tasDeBois',
  'tapisDeMousse',
  'gardeManger',
  'remise',
  'sechoir',
  'feuDeCamp',
  'atelier',
  'puits',
  'marche',
  'sanctuaire',
] as const;
export type TypeBatiment = (typeof TYPES_BATIMENT)[number];

export type IdBatiment = number;

export interface Batiment {
  id: IdBatiment;
  type: TypeBatiment;
  /** Coin nord-ouest de l'emprise ; la taille de l'emprise vient de `packages/content`. */
  case: Case;
  orientation: Orientation;
  niveau: number;
  /** Avancement du chantier entre 0 et 1, ou `null` une fois construit. */
  chantier: number | null;
  /** Logements : avancement de la montée au rang suivant, payée et en travaux, ou `null`. */
  agrandissement: number | null;
  /** Bonus de voisinage appliqué, en multiplicateur (1 = aucun). */
  bonusVoisinage: number;
  /**
   * Logements seulement : besoins du rang actuel et du rang suivant, satisfaits ou non.
   * Vide pour les autres bâtiments et les chantiers.
   */
  besoins: Partial<Record<Besoin, boolean>>;
}

/**
 * Besoins d'un logement : la nourriture du village, la proximité d'un bâtiment (chaleur, eau, commerce)
 * ou une ressource consommée par le logement lui-même (mousse).
 */
export const BESOINS = ['nourriture', 'chaleur', 'eau', 'mousse', 'commerce'] as const;
export type Besoin = (typeof BESOINS)[number];

export const AMELIORATIONS_VILLAGE = ['vitesse', 'outils'] as const;
export type AmeliorationVillage = (typeof AMELIORATIONS_VILLAGE)[number];

// ─── Renaissance ─────────────────────────────────────────────────────────────

/** Bonus permanents achetés en graines de prestige ; ils survivent aux renaissances. */
export const BONUS_PRESTIGE = ['production', 'depart', 'construction', 'logement'] as const;
export type BonusPrestige = (typeof BONUS_PRESTIGE)[number];

export interface Prestige {
  /** Graines de prestige à dépenser. */
  graines: number;
  renaissances: number;
  /** Niveau acheté de chaque bonus. */
  bonus: Record<BonusPrestige, number>;
  /** Plus grand nombre d'habitants de la partie en cours : il fixe le gain de la prochaine renaissance. */
  populationMax: number;
}

// ─── Habitants ───────────────────────────────────────────────────────────────

/** `tenir` : occuper un emploi sans production (marché). */
/** `arracher` : travailler au retrait de la souche-dépôt. */
export const TACHES = ['recolter', 'construire', 'stocker', 'tenir', 'arracher'] as const;
export type Tache = (typeof TACHES)[number];

/** Ce que l'habitant fait en ce moment, pour choisir l'animation. */
export type Activite = 'attend' | 'marche' | 'porte' | 'recolte' | 'construit' | 'tient' | 'dort' | 'seRechauffe';

export type IdHabitant = number;

export interface Habitant {
  id: IdHabitant;
  position: Position;
  /** Direction du regard, en radians, 0 vers l'est. */
  direction: number;
  activite: Activite;
  tache: Tache | null;
  /** Bâtiment où l'habitant récolte ou construit en ce moment, pour compter les emplois pourvus. */
  lieu: IdBatiment | null;
  /** Entre 0 et 1. */
  bienEtre: number;
  /** Indice dans la palette des chapeaux. */
  chapeau: number;
}

// ─── Temps, saisons, météo ───────────────────────────────────────────────────

export const SAISONS = ['printemps', 'ete', 'automne', 'hiver'] as const;
export type Saison = (typeof SAISONS)[number];

export type Meteo = 'soleil' | 'pluie' | 'vent' | 'neige';

export interface Temps {
  /** Pas de simulation écoulés depuis le début de la partie. */
  pas: number;
  annee: number;
  saison: Saison;
  /** Avancement dans la saison, entre 0 et 1. */
  avancementSaison: number;
  /** Heure du jour entre 0 et 1 (0 = minuit). */
  heure: number;
  /** Les habitants dorment : rien ne se récolte ni ne se livre. */
  nuit: boolean;
  meteo: Meteo;
  /** Vrai pendant une veille signalée par Rust. */
  enPause: boolean;
}

// ─── Réglages ────────────────────────────────────────────────────────────────

export interface Reglages {
  langue: 'fr' | 'en';
  sonActive: boolean;
  /** Entre 0 et 1. */
  volume: number;
  /** Opacité de la fenêtre, entre 0 et 1 ; appliquée par Rust. */
  opacite: number;
  toujoursAuDessus: boolean;
  lancementAuDemarrage: boolean;
}

// ─── Instantané ──────────────────────────────────────────────────────────────

/** État léger émis à chaque pas de simulation (toutes les 250 ms). */
export interface Instantane {
  temps: Temps;
  stocks: Record<Ressource, Stock>;
  batiments: Batiment[];
  habitants: Habitant[];
  /** Repousse de chaque élément naturel (même ordre que `Ile.elements`), entre 0 et 1 : 1 = récoltable. */
  pousses: number[];
  batimentsDebloques: TypeBatiment[];
  /** Avancement du retrait de la souche entre 0 et 1, ou `null` s'il n'est pas en cours. */
  retraitSouche: number | null;
  defrichages: Defrichage[];
  /** Indice du palier de population atteint dans `contenu.paliers` ; ne redescend jamais. */
  palier: number;
  ameliorations: Record<AmeliorationVillage, number>;
  /** Plus rien à manger : les habitants travaillent moins vite et leur bien-être baisse. */
  faim: boolean;
  prestige: Prestige;
  reglages: Reglages;
}

// ─── Commandes (frontend → moteur) ───────────────────────────────────────────

type CommandeReglage = {
  [Cle in keyof Reglages]: { type: 'modifierReglage'; cle: Cle; valeur: Reglages[Cle] };
}[keyof Reglages];

export type Commande =
  | { type: 'poserBatiment'; batiment: TypeBatiment; case: Case; orientation: Orientation }
  | { type: 'deplacerBatiment'; id: IdBatiment; case: Case; orientation: Orientation }
  | { type: 'demolir'; id: IdBatiment }
  | { type: 'recolter'; element: IdElement }
  /** Paie le retrait de la souche-dépôt ; les habitants l'arrachent ensuite comme un chantier. */
  | { type: 'retirerSouche' }
  /** Paie l'arrachage de l'arbre, du buisson ou de la plante de cette case. */
  | { type: 'defricher'; case: Case }
  /** Annule l'arrachage en cours sur cette case (`null` : la souche) et rend tout ce qu'il a coûté. */
  | { type: 'annulerArrachage'; case: Case | null }
  /** Sur un logement, la montée au rang suivant ; sur le village, un niveau d'amélioration de l'atelier. */
  | { type: 'ameliorer'; cible: { batiment: IdBatiment } | { village: AmeliorationVillage } }
  /** Au sanctuaire : efface l'île et le village contre des graines de prestige. */
  | { type: 'renaitre' }
  /** Dépense des graines de prestige ; possible à tout moment (juste après une renaissance notamment). */
  | { type: 'acheterBonus'; bonus: BonusPrestige }
  /** Menu de démarrage : tout effacer, prestige compris, et repartir sur l'île de cette graine. */
  | { type: 'recommencer'; graine: number }
  | CommandeReglage;

export type TypeCommande = Commande['type'];

// ─── Événements ponctuels (moteur → frontend) ────────────────────────────────

export type RaisonRefus =
  | 'ressourcesInsuffisantes'
  | 'emplacementOccupe'
  | 'horsIle'
  | 'nonDebloque'
  | 'introuvable'
  /** Élément naturel pas encore repoussé. */
  | 'pasPret'
  | 'stockPlein'
  /** Montée en gamme : un besoin du rang suivant n'est pas satisfait. */
  | 'besoinsManquants'
  /** Il faut garder au moins un dépôt achevé (garde-manger, remise) une fois la souche partie. */
  | 'depotRequis'
  /** L'action n'est pas possible pour l'instant (fonction à venir…). */
  | 'indisponible';

export type Evenement =
  | { type: 'saisonChangee'; saison: Saison }
  | { type: 'stockPlein'; ressource: Ressource }
  | { type: 'habitantArrive'; id: IdHabitant }
  | { type: 'constructionTerminee'; id: IdBatiment }
  | { type: 'palierAtteint'; palier: number; debloques: TypeBatiment[] }
  | { type: 'logementAmeliore'; id: IdBatiment; niveau: number }
  | { type: 'soucheRetiree' }
  /** Nouvelle île : l'instantané suivant décrit déjà la nouvelle partie. */
  | { type: 'renaissance'; graines: number }
  | { type: 'partieRecommencee' }
  | { type: 'defriche'; case: Case; nature: Defrichable }
  | { type: 'recolte'; element: IdElement; ressource: Ressource; quantite: number }
  | { type: 'commandeRefusee'; commande: Commande; raison: RaisonRefus };

// ─── Protocole du Worker ─────────────────────────────────────────────────────

export type MessageVersMoteur =
  /**
   * Lance la simulation. `sauvegardes` : fichiers bruts du plus récent au plus ancien (principal puis
   * copies de secours) ; le moteur reprend le premier lisible, ou une nouvelle partie si la liste est vide.
   */
  | { type: 'demarrer'; sauvegardes: string[] }
  | { type: 'commande'; commande: Commande }
  /** Veille ou réveil du système, signalés par Rust : seule cause de pause. */
  /** `momentMs` : instant de l'endormissement vu par Rust, le Worker a pu geler avant de lire ce message. */
  | { type: 'veille'; momentMs: number }
  | { type: 'reveil' }
  /** Pouls envoyé par Rust fenêtre cachée : le Worker a pu geler, on rattrape le temps écoulé tout de suite. */
  | { type: 'battre' }
  | { type: 'sauvegarder' };

export type MessageDepuisMoteur =
  | { type: 'ile'; ile: Ile }
  /**
   * Réponse à `demarrer`. `secours` : le fichier principal était illisible, une copie a pris le relais ;
   * `illisible` : aucun fichier n'a pu être relu, une nouvelle partie commence ;
   * `ancienne` : la sauvegarde date d'avant la réorientation (version < 4), une nouvelle partie commence et
   * le frontend doit archiver l'ancien fichier avant la prochaine écriture.
   */
  | { type: 'partieChargee'; origine: 'nouvelle' | 'sauvegarde' | 'secours' | 'illisible' | 'ancienne' }
  /** Émis à chaque pas, avec les événements survenus depuis le précédent. */
  | { type: 'instantane'; instantane: Instantane; evenements: Evenement[] }
  /** Réponse à `sauvegarder`, JSON prêt à écrire (format et version dans `sauvegarde.ts`). */
  | { type: 'sauvegarde'; contenu: string };
