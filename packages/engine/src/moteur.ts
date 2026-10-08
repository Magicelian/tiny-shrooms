// Le moteur tel que le Worker le voit : des messages entrent, des messages sortent.
// Le temps réel est toujours passé en paramètre, pour rester testable.
import type { Evenement, MessageDepuisMoteur, MessageVersMoteur } from './contrat';
import type { Contenu } from './contenu';
import { creerPartie, type Etat, type Partie } from './etat';
import { casesLibres } from './grille';
import { Horloge } from './horloge';
import { chargerPremiereValide, serialiser } from './sauvegarde';
import { appliquerCommande, avancer, instantane } from './simulation';

export class Moteur {
  private partie: Partie;
  private readonly horloge: Horloge;
  private evenements: Evenement[] = [];
  /** Indice de la dernière île envoyée au frontend : on renvoie l'île quand l'île affichée change. */
  private ileEnvoyee = -1;

  constructor(
    private readonly contenu: Contenu,
    maintenantMs: number,
    partie?: Partie,
  ) {
    this.partie = partie ?? creerPartie(contenu);
    this.horloge = new Horloge(maintenantMs);
  }

  /** L'île affichée, en lecture seule : pour les tests et les simulations. */
  get etatCourant(): Readonly<Etat> {
    return this.partie.iles[this.partie.vue]!;
  }

  /** Toute la partie, en lecture seule : pour les tests et la sauvegarde. */
  get partieCourante(): Readonly<Partie> {
    return this.partie;
  }

  recevoir(message: MessageVersMoteur, maintenantMs: number): MessageDepuisMoteur[] {
    switch (message.type) {
      case 'demarrer': {
        const reprise = chargerPremiereValide(message.sauvegardes);
        this.partie = reprise && 'partie' in reprise ? reprise.partie : creerPartie(this.contenu);
        this.evenements = [];
        // Le temps passé jeu fermé ne compte pas : l'horloge repart d'ici.
        this.horloge.reveil(maintenantMs);
        this.horloge.ecartMaxMs = message.ecartMaxMs;
        const origine =
          message.sauvegardes.length === 0 ? 'nouvelle'
          : reprise === null ? 'illisible'
          : 'ancienne' in reprise ? 'ancienne'
          : reprise.rang === 0 ? 'sauvegarde'
          : 'secours';
        return [this.messageIle(), { type: 'partieChargee', origine }, this.publier()];
      }
      case 'commande':
        this.rattraper(this.horloge.pasARattraper(maintenantMs));
        this.evenements.push(...appliquerCommande(this.partie, this.contenu, message.commande));
        return this.publierAvecIle();
      case 'veille':
        // Le Worker a pu geler avant de lire ce message : on s'arrête à l'instant signalé par Rust.
        this.rattraper(this.horloge.veille(Math.min(message.momentMs, maintenantMs)));
        return this.publierAvecIle();
      case 'reveil':
        this.horloge.reveil(maintenantMs);
        return this.publierAvecIle();
      case 'battre':
        return this.battre(maintenantMs);
      case 'sauvegarder':
        return [{ type: 'sauvegarde', contenu: serialiser(this.partie) }];
    }
  }

  /** Appelé régulièrement : simule tout le temps écoulé puis publie un seul instantané. */
  battre(maintenantMs: number): MessageDepuisMoteur[] {
    this.rattraper(this.horloge.pasARattraper(maintenantMs));
    return this.publierAvecIle();
  }

  /**
   * Instantané, précédé de l'île affichée si elle a changé depuis le dernier envoi : souche, case défrichée,
   * nouvelle partie ou autre île affichée.
   */
  private publierAvecIle(): MessageDepuisMoteur[] {
    const changee =
      this.ileEnvoyee !== this.partie.vue ||
      this.evenements.some((e) => e.type === 'soucheRetiree' || e.type === 'defriche' || e.type === 'partieRecommencee');
    const ile = changee ? this.messageIle() : null;
    const instantane = this.publier();
    return ile ? [ile, instantane] : [instantane];
  }

  private messageIle(): MessageDepuisMoteur {
    this.ileEnvoyee = this.partie.vue;
    return { type: 'ile', ile: this.partie.iles[this.partie.vue]!.ile, indice: this.partie.vue };
  }

  /** Avance d'un nombre de pas donné, sans horloge : pour les simulations sans affichage. */
  simuler(pas: number): Evenement[] {
    this.rattraper(pas);
    const evenements = this.evenements;
    this.evenements = [];
    return evenements;
  }

  /** Cases constructibles, de la plus proche à la plus lointaine de la souche-dépôt. */
  casesLibres() {
    return casesLibres(this.partie.iles[this.partie.vue]!);
  }

  private rattraper(pas: number): void {
    for (let i = 0; i < pas; i++) this.evenements.push(...avancer(this.partie, this.contenu));
  }

  private publier(): MessageDepuisMoteur {
    const evenements = this.evenements;
    this.evenements = [];
    return {
      type: 'instantane',
      instantane: instantane(this.partie, this.contenu, this.horloge.enPause),
      evenements,
    };
  }
}
