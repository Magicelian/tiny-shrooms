// Interface au survol : reçoit les messages du moteur, traduit la souris en commandes.
import { render } from 'preact';
import type { Case, Commande, Contenu, IdBatiment, MessageDepuisMoteur, TypeBatiment } from '@tiny-shrooms/engine';
import { bonusVoisinage, emplacementRefuse } from '@tiny-shrooms/engine';
import { t } from '@tiny-shrooms/i18n';
import { abordable, nomBatiment, nomRessource } from './format';
import { Interface } from './interface';
import { Magasin } from './magasin';

/** Ce que l'interface attend du rendu de l'îlot. */
export interface SceneInteractive {
  readonly canevas: HTMLCanvasElement;
  viser(x: number, y: number): { case: Case | null; batiment: IdBatiment | null };
  afficherGrille(visible: boolean): void;
  montrerFantome(c: Case, type: TypeBatiment | null, valide: boolean): void;
  cacherFantome(): void;
  tourner(sens: 1 | -1): void;
  basculerZoom(): void;
}

export interface OptionsInterface {
  scene: SceneInteractive;
  contenu: Contenu;
  envoyer(commande: Commande): void;
  /** Couleurs du rendu, pour que les pastilles de l'interface y correspondent. */
  couleurs: { batiments: Record<TypeBatiment, number>; chapeaux: readonly number[] };
  /** Déplace la fenêtre tant que le bouton reste enfoncé (Tauri) ; absent dans un navigateur. */
  deplacerFenetre?: () => void;
}

/** Distance en pixels au-delà de laquelle un appui devient un déplacement de fenêtre. */
const SEUIL_GLISSER = 4;

export class ControleurInterface {
  readonly magasin = new Magasin();
  private souris: { x: number; y: number } | null = null;
  private appui: { x: number; y: number } | null = null;

  constructor(
    racine: HTMLElement,
    private readonly options: OptionsInterface,
  ) {
    render(<Interface controleur={this} />, racine);
    this.brancherSouris();
  }

  get contenu(): Contenu {
    return this.options.contenu;
  }

  get couleurs(): OptionsInterface['couleurs'] {
    return this.options.couleurs;
  }

  recevoir(message: MessageDepuisMoteur): void {
    if (message.type === 'ile') this.magasin.modifier({ ile: message.ile });
    if (message.type !== 'instantane') return;
    this.magasin.modifier({ instantane: message.instantane });
    for (const e of message.evenements) {
      if (e.type === 'commandeRefusee') this.magasin.annoncer(t(`refus.${e.raison}`));
      else if (e.type === 'habitantArrive') this.magasin.annoncer(t('message.habitantArrive'));
      else if (e.type === 'stockPlein') this.magasin.annoncer(t('message.stockPlein', { ressource: nomRessource(e.ressource) }));
      else if (e.type === 'constructionTerminee') {
        const b = message.instantane.batiments.find((x) => x.id === e.id);
        if (b) this.magasin.annoncer(t('message.constructionTerminee', { batiment: nomBatiment(b.type) }));
      }
    }
    // Le village a changé : l'aperçu sous la souris aussi.
    this.majVisee();
  }

  envoyer(commande: Commande): void {
    this.options.envoyer(commande);
  }

  tourner(sens: 1 | -1): void {
    this.options.scene.tourner(sens);
  }

  basculerZoom(): void {
    this.options.scene.basculerZoom();
  }

  /** Survol signalé de l'extérieur (Rust), car une fenêtre sans le focus ne reçoit pas la souris. */
  signalerSurvol(dedans: boolean): void {
    if (!dedans) this.souris = null;
    this.magasin.modifier({ survol: dedans });
    this.majVisee();
  }

  commencerPlacement(type: TypeBatiment): void {
    this.magasin.modifier({ placement: type, panneau: null });
    this.options.scene.afficherGrille(true);
    this.majVisee();
  }

  finirPlacement(): void {
    this.magasin.modifier({ placement: null, bonusVise: null });
    this.options.scene.afficherGrille(false);
    this.majVisee();
  }

  /** Échap : d'abord le placement, puis le panneau ouvert. */
  annuler(): void {
    if (this.magasin.valeur.placement) this.finirPlacement();
    else this.magasin.modifier({ panneau: null });
  }

  private brancherSouris(): void {
    const { canevas } = this.options.scene;
    const racine = document.documentElement;
    racine.addEventListener('mouseenter', () => this.magasin.modifier({ survol: true }));
    racine.addEventListener('mouseleave', () => this.signalerSurvol(false));
    window.addEventListener('pointermove', (e) => {
      this.magasin.modifier({ survol: true });
      this.souris = e.target === canevas ? { x: e.clientX, y: e.clientY } : null;
      this.majVisee();
      if (this.appui && Math.hypot(e.clientX - this.appui.x, e.clientY - this.appui.y) > SEUIL_GLISSER) {
        this.appui = null;
        this.options.deplacerFenetre?.();
      }
    });
    canevas.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.appui = { x: e.clientX, y: e.clientY };
    });
    canevas.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !this.appui) return;
      this.appui = null;
      this.cliquer(e.clientX, e.clientY);
    });
    canevas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.annuler();
    });
    canevas.addEventListener('wheel', () => this.basculerZoom(), { passive: true });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.annuler();
      else if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      else if (e.key === 'ArrowLeft' || e.key === 'q') this.tourner(-1);
      else if (e.key === 'ArrowRight' || e.key === 'e') this.tourner(1);
      else if (e.key === 'z') this.basculerZoom();
    });
  }

  private cliquer(x: number, y: number): void {
    const visee = this.options.scene.viser(x, y);
    const { placement } = this.magasin.valeur;
    if (placement) {
      if (visee.case) this.envoyer({ type: 'poserBatiment', batiment: placement, case: visee.case, orientation: 0 });
      return;
    }
    const batiment = visee.batiment ?? this.batimentSur(visee.case);
    this.magasin.modifier({ panneau: batiment === null ? null : { batiment } });
  }

  private batimentSur(c: Case | null): IdBatiment | null {
    if (!c) return null;
    const b = this.magasin.valeur.instantane?.batiments.find((x) => x.case.x === c.x && x.case.y === c.y);
    return b?.id ?? null;
  }

  /** Met à jour le fantôme ou le surlignage sous la souris. */
  private majVisee(): void {
    const { scene } = this.options;
    const { ile, instantane, placement } = this.magasin.valeur;
    const visee = this.souris && ile && instantane ? scene.viser(this.souris.x, this.souris.y) : null;
    if (!visee || !ile || !instantane) {
      scene.cacherFantome();
      if (placement) this.magasin.modifier({ bonusVise: null });
      return;
    }
    if (placement) {
      if (!visee.case) {
        scene.cacherFantome();
        this.magasin.modifier({ bonusVise: null });
        return;
      }
      const libre = emplacementRefuse(ile, instantane.batiments, visee.case) === null;
      const valide = libre && abordable(this.contenu.batiments[placement].cout, instantane.stocks);
      scene.montrerFantome(visee.case, placement, valide);
      const bonus = libre ? bonusVoisinage(ile, instantane.batiments, this.contenu, placement, visee.case) : null;
      this.magasin.modifier({ bonusVise: bonus });
      return;
    }
    const id = visee.batiment ?? this.batimentSur(visee.case);
    const b = id === null ? undefined : instantane.batiments.find((x) => x.id === id);
    if (b) scene.montrerFantome(b.case, null, true);
    else scene.cacherFantome();
  }
}
