// État affiché par l'interface : le dernier instantané du moteur et ce que le joueur est en train de faire.
// Rien ici ne modifie la partie : les changements passent par des commandes envoyées au moteur.
import { useEffect, useState } from 'preact/hooks';
import type { Case, IdBatiment, Ile, Instantane, Ressource, TypeBatiment } from '@tiny-shrooms/engine';
import { langueActuelle, type Langue } from '@tiny-shrooms/i18n';

/**
 * Bulle ouverte au clic. `haut` : la bulle se place dans la moitié haute de la fenêtre,
 * pour laisser voir la case visée quand celle-ci est en bas.
 */
export type Bulle =
  | { type: 'construire'; case: Case; choix: TypeBatiment | null; haut: boolean }
  | { type: 'batiment'; id: IdBatiment; haut: boolean }
  /** Souche-dépôt, arbre, buisson ou plante : ce qu'on peut faire arracher. */
  | { type: 'nature'; case: Case; haut: boolean };

/** Petit chiffre qui s'envole d'un élément récolté, en pixels de la fenêtre. */
export interface Envol {
  id: number;
  x: number;
  y: number;
  ressource: Ressource;
  quantite: number;
}

export interface Message {
  id: number;
  texte: string;
}

export interface EtatInterface {
  ile: Ile | null;
  instantane: Instantane | null;
  /** Sans le focus, aucune commande n'est proposée. */
  focus: boolean;
  /** Position de la fenêtre verrouillée (menu de l'icône) : ⌘ + glisser ne fait rien. */
  verrouillee: boolean;
  /** Change à chaque changement de langue, pour tout redessiner. */
  langue: Langue;
  bulle: Bulle | null;
  /** Après la première renaissance : petite bulle au-dessus de la souche, jusqu'à ce qu'on l'ouvre. */
  astuceSouche: boolean;
  /** Bâtiment en cours de déplacement : il suit la souris jusqu'au clic. */
  deplacement: IdBatiment | null;
  /** Bonus de voisinage à l'emplacement visé, pendant le déplacement ou le choix d'un bâtiment. */
  bonusVise: number | null;
  messages: Message[];
  envols: Envol[];
  /** Menu de démarrage ouvert (`confirmer` : demande avant d'effacer la partie), ou `null` en jeu. */
  menu: 'accueil' | 'confirmer' | 'parametres' | null;
  /** Une partie enregistrée a été reprise : le menu propose « Continuer » plutôt que « Jouer ». */
  partieReprise: boolean;
  son: boolean;
}

type Abonne = () => void;

/** Doit suivre la durée de l'animation `envol` dans interface.css. */
const DUREE_ENVOL_MS = 900;

export class Magasin {
  private etat: EtatInterface = {
    ile: null,
    instantane: null,
    focus: false,
    verrouillee: false,
    langue: langueActuelle(),
    bulle: null,
    astuceSouche: false,
    deplacement: null,
    bonusVise: null,
    messages: [],
    envols: [],
    menu: null,
    partieReprise: false,
    son: false,
  };
  private readonly abonnes = new Set<Abonne>();
  private prochainMessage = 0;

  get valeur(): Readonly<EtatInterface> {
    return this.etat;
  }

  modifier(changement: Partial<EtatInterface>): void {
    const avant = this.etat;
    this.etat = { ...avant, ...changement };
    if ((Object.keys(changement) as (keyof EtatInterface)[]).some((k) => avant[k] !== this.etat[k])) {
      this.abonnes.forEach((f) => f());
    }
  }

  annoncer(texte: string): void {
    const message = { id: this.prochainMessage++, texte };
    this.modifier({ messages: [...this.etat.messages.slice(-1), message] });
    setTimeout(() => this.modifier({ messages: this.etat.messages.filter((m) => m !== message) }), 2500);
  }

  envoler(envol: Omit<Envol, 'id'>): void {
    const nouvel = { ...envol, id: this.prochainMessage++ };
    this.modifier({ envols: [...this.etat.envols, nouvel] });
    setTimeout(() => this.modifier({ envols: this.etat.envols.filter((e) => e !== nouvel) }), DUREE_ENVOL_MS);
  }

  abonner(f: Abonne): () => void {
    this.abonnes.add(f);
    return () => this.abonnes.delete(f);
  }
}

/** Relit le magasin à chaque changement. */
export function useMagasin(magasin: Magasin): Readonly<EtatInterface> {
  const [, rafraichir] = useState(0);
  useEffect(() => magasin.abonner(() => rafraichir((n) => n + 1)), [magasin]);
  return magasin.valeur;
}
