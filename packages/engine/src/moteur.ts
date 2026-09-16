// Le moteur tel que le Worker le voit : des messages entrent, des messages sortent.
// Le temps réel est toujours passé en paramètre, pour rester testable.
import type { Evenement, MessageDepuisMoteur, MessageVersMoteur } from './contrat';
import type { Contenu } from './contenu';
import { creerEtat, type Etat } from './etat';
import { casesLibres } from './grille';
import { Horloge } from './horloge';
import { chargerPremiereValide, serialiser } from './sauvegarde';
import { appliquerCommande, avancer, instantane } from './simulation';

export class Moteur {
  private etat: Etat;
  private readonly horloge: Horloge;
  private evenements: Evenement[] = [];

  constructor(
    private readonly contenu: Contenu,
    maintenantMs: number,
    etat?: Etat,
  ) {
    this.etat = etat ?? creerEtat(contenu);
    this.horloge = new Horloge(maintenantMs);
  }

  /** Lecture seule, pour les tests et la sauvegarde. */
  get etatCourant(): Readonly<Etat> {
    return this.etat;
  }

  recevoir(message: MessageVersMoteur, maintenantMs: number): MessageDepuisMoteur[] {
    switch (message.type) {
      case 'demarrer': {
        const reprise = chargerPremiereValide(message.sauvegardes);
        this.etat = reprise?.etat ?? creerEtat(this.contenu);
        this.evenements = [];
        // Le temps passé jeu fermé ne compte pas : l'horloge repart d'ici.
        this.horloge.reveil(maintenantMs);
        const origine =
          message.sauvegardes.length === 0 ? 'nouvelle'
          : reprise === null ? 'illisible'
          : reprise.rang === 0 ? 'sauvegarde'
          : 'secours';
        return [{ type: 'ile', ile: this.etat.ile }, { type: 'partieChargee', origine }, this.publier()];
      }
      case 'commande':
        this.rattraper(this.horloge.pasARattraper(maintenantMs));
        this.evenements.push(...appliquerCommande(this.etat, this.contenu, message.commande));
        return [this.publier()];
      case 'veille':
        // Le Worker a pu geler avant de lire ce message : on s'arrête à l'instant signalé par Rust.
        this.rattraper(this.horloge.veille(Math.min(message.momentMs, maintenantMs)));
        return [this.publier()];
      case 'reveil':
        this.horloge.reveil(maintenantMs);
        return [this.publier()];
      case 'battre':
        return this.battre(maintenantMs);
      case 'sauvegarder':
        return [{ type: 'sauvegarde', contenu: serialiser(this.etat) }];
    }
  }

  /** Appelé régulièrement : simule tout le temps écoulé puis publie un seul instantané. */
  battre(maintenantMs: number): MessageDepuisMoteur[] {
    this.rattraper(this.horloge.pasARattraper(maintenantMs));
    return [this.publier()];
  }

  /** Avance d'un nombre de pas donné, sans horloge : pour les simulations sans affichage. */
  simuler(pas: number): Evenement[] {
    this.rattraper(pas);
    const evenements = this.evenements;
    this.evenements = [];
    return evenements;
  }

  /** Cases constructibles, de la plus proche à la plus lointaine de l'arbre-mère. */
  casesLibres() {
    return casesLibres(this.etat);
  }

  private rattraper(pas: number): void {
    for (let i = 0; i < pas; i++) this.evenements.push(...avancer(this.etat, this.contenu));
  }

  private publier(): MessageDepuisMoteur {
    const evenements = this.evenements;
    this.evenements = [];
    return {
      type: 'instantane',
      instantane: instantane(this.etat, this.contenu, this.horloge.enPause),
      evenements,
    };
  }
}
