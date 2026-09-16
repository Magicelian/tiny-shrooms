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

/** Description de l'île, envoyée au démarrage et à chaque changement d'île, pas à chaque pas. */
export interface Ile {
  biome: Biome;
  largeur: number;
  profondeur: number;
  /** Terrain case par case, indexé par `y * largeur + x`. */
  terrain: Terrain[];
  /** Coin nord-ouest de l'emprise de l'arbre-mère. */
  arbreMere: Case;
  /** Côté de l'emprise carrée de l'arbre-mère, en cases. */
  tailleArbreMere: number;
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
  'relais',
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
  /** Bonus de voisinage appliqué, en multiplicateur (1 = aucun). */
  bonusVoisinage: number;
}

export const AMELIORATIONS_VILLAGE = ['vitesse', 'outils'] as const;
export type AmeliorationVillage = (typeof AMELIORATIONS_VILLAGE)[number];

// ─── Habitants ───────────────────────────────────────────────────────────────

export const TACHES = ['recolter', 'construire', 'stocker', 'soignerArbre'] as const;
export type Tache = (typeof TACHES)[number];

/** Poids de chaque tâche, entre 0 et 1. */
export type Priorites = Record<Tache, number>;

/** Ce que l'habitant fait en ce moment, pour choisir l'animation. */
export type Activite = 'attend' | 'marche' | 'porte' | 'recolte' | 'construit' | 'dort' | 'seRechauffe';

export type IdHabitant = number;

export interface Habitant {
  id: IdHabitant;
  position: Position;
  /** Direction du regard, en radians, 0 vers l'est. */
  direction: number;
  activite: Activite;
  tache: Tache | null;
  /** Tâche imposée par le joueur, ou `null` si l'habitant suit les priorités. */
  epingle: Tache | null;
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
  meteo: Meteo;
  /** Vrai pendant une veille signalée par Rust. */
  enPause: boolean;
}

// ─── Arbre-mère ──────────────────────────────────────────────────────────────

export const STADES_ARBRE = ['pousse', 'arbuste', 'arbre', 'floraison'] as const;
export type StadeArbre = (typeof STADES_ARBRE)[number];

export interface ArbreMere {
  stade: StadeArbre;
  /** Avancement vers le stade suivant, entre 0 et 1. */
  avancement: number;
  /** Étendue du mycélium sous l'île, entre 0 et 1. */
  mycelium: number;
  /** Vrai quand la floraison peut être déclenchée. */
  floraisonPossible: boolean;
}

// ─── Visiteurs ───────────────────────────────────────────────────────────────

export type IdVisiteur = number;

export type Visiteur = { id: IdVisiteur; arriveAuPas: number } & (
  | { type: 'herisson'; donne: Quantites; demande: Quantites }
  | { type: 'escargot'; demande: Quantites; recompense: { spores: number } | { plan: TypeBatiment } }
  | { type: 'luciole'; multiplicateur: number; dureePas: number }
);

export type TypeVisiteur = Visiteur['type'];

export interface BonusActif {
  source: TypeVisiteur;
  multiplicateur: number;
  pasRestants: number;
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
  priorites: Priorites;
  arbreMere: ArbreMere;
  visiteurs: Visiteur[];
  bonus: BonusActif[];
  batimentsDebloques: TypeBatiment[];
  ameliorations: Record<AmeliorationVillage, number>;
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
  | { type: 'ameliorer'; cible: { batiment: IdBatiment } | { village: AmeliorationVillage } }
  | { type: 'reglerPriorites'; priorites: Priorites }
  | { type: 'epinglerHabitant'; id: IdHabitant; tache: Tache | null }
  | { type: 'repondreVisiteur'; id: IdVisiteur; accepte: boolean }
  | { type: 'nourrirArbre'; spores: number }
  | { type: 'fleurir' }
  | CommandeReglage;

export type TypeCommande = Commande['type'];

// ─── Événements ponctuels (moteur → frontend) ────────────────────────────────

export type RaisonRefus =
  | 'ressourcesInsuffisantes'
  | 'emplacementOccupe'
  | 'horsIle'
  | 'nonDebloque'
  | 'introuvable'
  /** L'action n'est pas possible pour l'instant (floraison pas prête, fonction à venir…). */
  | 'indisponible';

export type Evenement =
  | { type: 'visiteurArrive'; visiteur: Visiteur }
  | { type: 'saisonChangee'; saison: Saison }
  | { type: 'stadeAtteint'; stade: StadeArbre }
  | { type: 'stockPlein'; ressource: Ressource }
  | { type: 'habitantArrive'; id: IdHabitant }
  | { type: 'constructionTerminee'; id: IdBatiment }
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
  | { type: 'sauvegarder' };

export type MessageDepuisMoteur =
  | { type: 'ile'; ile: Ile }
  /**
   * Réponse à `demarrer`. `secours` : le fichier principal était illisible, une copie a pris le relais ;
   * `illisible` : aucun fichier n'a pu être relu, une nouvelle partie commence.
   */
  | { type: 'partieChargee'; origine: 'nouvelle' | 'sauvegarde' | 'secours' | 'illisible' }
  /** Émis à chaque pas, avec les événements survenus depuis le précédent. */
  | { type: 'instantane'; instantane: Instantane; evenements: Evenement[] }
  /** Réponse à `sauvegarder`, JSON prêt à écrire (format et version dans `sauvegarde.ts`). */
  | { type: 'sauvegarde'; contenu: string };
