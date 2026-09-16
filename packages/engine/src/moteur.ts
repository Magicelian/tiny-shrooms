// Le moteur tel que le Worker le voit : des messages entrent, des messages sortent.
// Le temps réel est toujours passé en paramètre, pour rester testable.
import type { Evenement, MessageDepuisMoteur, MessageVersMoteur } from './contrat';
import type { Contenu } from './contenu';
import { creerEtat, type Etat } from './etat';
import { Horloge } from './horloge';
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
      case 'demarrer':
        this.etat = message.sauvegarde ? (JSON.parse(message.sauvegarde) as Etat) : creerEtat(this.contenu);
        this.evenements = [];
        this.horloge.reveil(maintenantMs);
        return [this.publier()];
      case 'commande':
        this.rattraper(this.horloge.pasARattraper(maintenantMs));
        this.evenements.push(...appliquerCommande(this.etat, this.contenu, message.commande));
        return [this.publier()];
      case 'veille':
        this.rattraper(this.horloge.veille(maintenantMs));
        return [this.publier()];
      case 'reveil':
        this.horloge.reveil(maintenantMs);
        return [this.publier()];
      case 'sauvegarder':
        return [{ type: 'sauvegarde', contenu: JSON.stringify(this.etat) }];
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
