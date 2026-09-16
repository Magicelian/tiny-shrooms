// État affiché par l'interface : le dernier instantané du moteur et ce que le joueur est en train de faire.
// Rien ici ne modifie la partie : les changements passent par des commandes envoyées au moteur.
import { useEffect, useState } from 'preact/hooks';
import type { IdBatiment, Ile, Instantane, TypeBatiment } from '@tiny-shrooms/engine';

export type Panneau = 'construire' | 'reglages' | { batiment: IdBatiment };

export interface Message {
  id: number;
  texte: string;
}

export interface EtatInterface {
  ile: Ile | null;
  instantane: Instantane | null;
  /** La souris est-elle au-dessus de la fenêtre ? Sinon, l'îlot reste seul. */
  survol: boolean;
  /** Sans le focus, rien ne se révèle au passage de la souris. */
  focus: boolean;
  /** La fenêtre peut-elle être déplacée (Tauri) et sa position est-elle verrouillée ? */
  fenetreMobile: boolean;
  verrouillee: boolean;
  panneau: Panneau | null;
  /** Bâtiment en cours de placement. */
  placement: TypeBatiment | null;
  /** Bonus de voisinage à l'emplacement visé, pendant le placement. */
  bonusVise: number | null;
  messages: Message[];
}

type Abonne = () => void;

export class Magasin {
  private etat: EtatInterface = {
    ile: null,
    instantane: null,
    survol: false,
    focus: false,
    fenetreMobile: false,
    verrouillee: false,
    panneau: null,
    placement: null,
    bonusVise: null,
    messages: [],
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
