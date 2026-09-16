// Interface : reçoit les messages du moteur, traduit la souris en commandes et en mouvements de caméra.
import { render } from 'preact';
import type { Batiment, Case, Commande, Contenu, IdBatiment, MessageDepuisMoteur, TypeBatiment } from '@tiny-shrooms/engine';
import { bonusVoisinage, emplacementRefuse } from '@tiny-shrooms/engine';
import { t } from '@tiny-shrooms/i18n';
import { installerCurseurs, type Curseur } from './curseurs';
import { abordable, nomBatiment, nomRessource } from './format';
import { Interface } from './interface';
import { Magasin, type Bulle } from './magasin';

/** Ce que l'interface attend du rendu de l'îlot. */
export interface SceneInteractive {
  readonly canevas: HTMLCanvasElement;
  viser(x: number, y: number): { case: Case | null; batiment: IdBatiment | null };
  afficherGrille(visible: boolean): void;
  montrerFantome(c: Case, type: TypeBatiment | null, valide: boolean): void;
  cacherFantome(): void;
  tourner(sens: 1 | -1): void;
  basculerZoom(): void;
  zoomer(sens: 1 | -1): void;
  glisser(dx: number, dy: number): void;
}

export interface OptionsInterface {
  scene: SceneInteractive;
  contenu: Contenu;
  envoyer(commande: Commande): void;
  /** Couleurs du rendu, pour que les pastilles de l'interface y correspondent. */
  couleurs: { batiments: Record<TypeBatiment, number>; chapeaux: readonly number[] };
  /** Déplace la fenêtre tant que le bouton reste enfoncé (Tauri) ; absent dans un navigateur. */
  deplacerFenetre?: () => void;
  /** Verrouille ou libère la position de la fenêtre (Tauri). */
  verrouiller?: (verrouillee: boolean) => void;
}

/** Distance en pixels au-delà de laquelle un appui devient un glisser et non plus un clic. */
const SEUIL_GLISSER = 4;
/** Défilement cumulé (en pixels) qui vaut un palier de zoom ; au-delà d'une pause, le cumul repart de zéro. */
const PAS_MOLETTE = 100;
const PAUSE_MOLETTE_MS = 200;
/** Un appui arrivé si tôt après la prise du focus est le clic qui l'a donné : il n'agit pas. */
const DELAI_FOCUS_MS = 250;

/** Appui en cours sur l'îlot : pas encore décidé, glisser de la vue, ou ⌘ + glisser refusé (fenêtre verrouillée). */
interface Appui {
  x: number;
  y: number;
  mode: 'attente' | 'vue' | 'bloque';
  fenetre: boolean;
}

export class ControleurInterface {
  readonly magasin = new Magasin();
  private souris: { x: number; y: number } | null = null;
  private appui: Appui | null = null;
  private focusDepuis = -Infinity;
  private molette = { cumul: 0, dernier: 0 };
  private curseur: Curseur = 'fleche';

  constructor(
    racine: HTMLElement,
    private readonly options: OptionsInterface,
  ) {
    installerCurseurs(document.documentElement);
    render(<Interface controleur={this} />, racine);
    this.magasin.modifier({ focus: document.hasFocus(), fenetreMobile: !!options.deplacerFenetre });
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
    if (message.type === 'partieChargee') {
      if (message.origine === 'secours') this.magasin.annoncer(t('message.partieSecours'));
      if (message.origine === 'illisible') this.magasin.annoncer(t('message.partieIllisible'));
      if (message.origine === 'ancienne') this.magasin.annoncer(t('message.partieAncienne'));
    }
    if (message.type !== 'instantane') return;
    const avant = this.magasin.valeur.instantane?.batimentsDebloques;
    for (const type of avant ? message.instantane.batimentsDebloques : []) {
      if (!avant!.includes(type)) this.magasin.annoncer(t('message.planObtenu', { batiment: nomBatiment(type) }));
    }
    this.magasin.modifier({ instantane: message.instantane });
    // Le bâtiment visé a disparu (démoli) : sa bulle ou son déplacement n'ont plus d'objet.
    const { bulle, deplacement } = this.magasin.valeur;
    const vise = bulle?.type === 'batiment' ? bulle.id : deplacement;
    if (vise !== null && !this.batiment(vise)) this.fermer();
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

  /** Sortie du curseur signalée de l'extérieur (Rust) : `mouseleave` manque parfois une sortie rapide. */
  signalerSurvol(dedans: boolean): void {
    if (dedans) return;
    this.souris = null;
    this.majVisee();
  }

  /** Position de la fenêtre verrouillée ou libre, qu'importe d'où vient le changement (réglages ou icône). */
  signalerVerrouillage(verrouillee: boolean): void {
    this.magasin.modifier({ verrouillee });
  }

  verrouiller(verrouillee: boolean): void {
    this.magasin.modifier({ verrouillee });
    this.options.verrouiller?.(verrouillee);
  }

  basculerReglages(): void {
    this.ouvrir(this.magasin.valeur.bulle?.type === 'reglages' ? null : { type: 'reglages' });
  }

  /** Choix d'un bâtiment dans la bulle de construction : son fantôme apparaît sur la case. */
  choisir(type: TypeBatiment): void {
    const { bulle } = this.magasin.valeur;
    if (bulle?.type === 'construire') this.ouvrir({ ...bulle, choix: type });
  }

  construire(): void {
    const { bulle } = this.magasin.valeur;
    if (bulle?.type !== 'construire' || !bulle.choix) return;
    this.envoyer({ type: 'poserBatiment', batiment: bulle.choix, case: bulle.case, orientation: 0 });
    this.fermer();
  }

  commencerDeplacement(id: IdBatiment): void {
    this.magasin.modifier({ bulle: null, deplacement: id });
    this.options.scene.afficherGrille(true);
    this.majVisee();
  }

  /** Échap, clic droit ou clic ailleurs : la bulle ou le déplacement en cours se referment. */
  fermer(): void {
    this.ouvrir(null);
  }

  batiment(id: IdBatiment): Batiment | undefined {
    return this.magasin.valeur.instantane?.batiments.find((b) => b.id === id);
  }

  private ouvrir(bulle: Bulle | null): void {
    this.magasin.modifier({ bulle, deplacement: null, bonusVise: null });
    this.options.scene.afficherGrille(bulle?.type === 'construire' && bulle.choix !== null);
    this.majVisee();
  }

  private brancherSouris(): void {
    const { canevas } = this.options.scene;
    const racine = document.documentElement;
    // Sans le focus, rien ne se révèle ; le focus revenu, on attend que la souris bouge.
    window.addEventListener('focus', () => {
      this.focusDepuis = performance.now();
      this.magasin.modifier({ focus: true });
    });
    window.addEventListener('blur', () => {
      this.appui = null;
      this.souris = null;
      this.magasin.modifier({ focus: false });
      this.fermer();
    });
    racine.addEventListener('mouseleave', () => this.signalerSurvol(false));
    window.addEventListener('pointermove', (e) => {
      if (!this.magasin.valeur.focus) return;
      this.souris = e.target === canevas ? { x: e.clientX, y: e.clientY } : null;
      const appui = this.appui;
      if (appui?.mode === 'attente' && Math.hypot(e.clientX - appui.x, e.clientY - appui.y) > SEUIL_GLISSER) {
        if (!appui.fenetre) appui.mode = 'vue';
        else if (this.magasin.valeur.verrouillee || !this.options.deplacerFenetre) appui.mode = 'bloque';
        else {
          // La fenêtre suit la souris jusqu'au relâchement ; la vue web ne reçoit plus rien d'ici là.
          this.appui = null;
          this.options.deplacerFenetre();
        }
      }
      if (this.appui?.mode === 'vue') {
        this.options.scene.glisser(e.clientX - this.appui.x, e.clientY - this.appui.y);
        this.appui.x = e.clientX;
        this.appui.y = e.clientY;
      }
      this.majVisee();
    });
    canevas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (!document.hasFocus() || performance.now() - this.focusDepuis < DELAI_FOCUS_MS) {
        this.focusDepuis = performance.now();
        return;
      }
      this.appui = { x: e.clientX, y: e.clientY, mode: 'attente', fenetre: e.metaKey };
      canevas.setPointerCapture(e.pointerId);
      this.majCurseur(this.curseur);
    });
    canevas.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !this.appui) return;
      const { mode } = this.appui;
      this.appui = null;
      if (mode === 'attente') this.cliquer(e.clientX, e.clientY);
      this.majCurseur(this.curseur);
    });
    canevas.addEventListener('pointercancel', () => {
      this.appui = null;
      this.majCurseur(this.curseur);
    });
    canevas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.fermer();
    });
    canevas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (!this.magasin.valeur.focus) return;
        const pas = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? e.deltaY : e.deltaY * PAS_MOLETTE;
        const m = this.molette;
        if (e.timeStamp - m.dernier > PAUSE_MOLETTE_MS) m.cumul = 0;
        m.dernier = e.timeStamp;
        m.cumul += pas;
        // Molette vers le haut : on s'approche. Un seul palier par cran, même sur un pavé tactile.
        while (Math.abs(m.cumul) >= PAS_MOLETTE) {
          this.options.scene.zoomer(m.cumul < 0 ? 1 : -1);
          m.cumul -= Math.sign(m.cumul) * PAS_MOLETTE;
        }
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.fermer();
      else if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      else if (e.key === 'ArrowLeft' || e.key === 'q') this.tourner(-1);
      else if (e.key === 'ArrowRight' || e.key === 'e') this.tourner(1);
      else if (e.key === 'z') this.basculerZoom();
    });
  }

  private cliquer(x: number, y: number): void {
    const { ile, instantane, bulle, deplacement } = this.magasin.valeur;
    if (!ile || !instantane) return;
    const visee = this.options.scene.viser(x, y);
    if (deplacement !== null) {
      if (visee.case && emplacementRefuse(ile, instantane.batiments, visee.case, deplacement) === null) {
        const orientation = this.batiment(deplacement)?.orientation ?? 0;
        this.envoyer({ type: 'deplacerBatiment', id: deplacement, case: visee.case, orientation });
        this.fermer();
      }
      return;
    }
    // Un clic ailleurs referme la bulle, sans rien ouvrir d'autre.
    if (bulle) return this.fermer();
    const haut = y > window.innerHeight / 2;
    const id = visee.batiment ?? this.batimentSur(visee.case);
    if (id !== null) this.ouvrir({ type: 'batiment', id, haut });
    else if (visee.case && emplacementRefuse(ile, instantane.batiments, visee.case) === null) {
      this.ouvrir({ type: 'construire', case: visee.case, choix: null, haut });
    }
  }

  private batimentSur(c: Case | null): IdBatiment | null {
    if (!c) return null;
    const b = this.magasin.valeur.instantane?.batiments.find((x) => x.case.x === c.x && x.case.y === c.y);
    return b?.id ?? null;
  }

  /** Met à jour le fantôme, le surlignage et le curseur selon la bulle ouverte et ce qui est sous la souris. */
  private majVisee(): void {
    const { scene } = this.options;
    const { ile, instantane, bulle, deplacement } = this.magasin.valeur;
    if (!ile || !instantane) return;
    const { batiments } = instantane;
    // Bulle de construction : le fantôme reste sur sa case, où que soit la souris.
    if (bulle?.type === 'construire') {
      const { choix } = bulle;
      scene.montrerFantome(bulle.case, choix, !choix || abordable(this.contenu.batiments[choix].cout, instantane.stocks));
      this.magasin.modifier({ bonusVise: choix && bonusVoisinage(ile, batiments, this.contenu, choix, bulle.case) });
      return this.majCurseur('fleche');
    }
    const visee = this.souris ? scene.viser(this.souris.x, this.souris.y) : null;
    const deplace = deplacement === null ? undefined : this.batiment(deplacement);
    if (deplace) {
      const autres = batiments.filter((b) => b.id !== deplace.id);
      const libre = !!visee?.case && emplacementRefuse(ile, autres, visee.case) === null;
      if (visee?.case) scene.montrerFantome(visee.case, deplace.type, libre);
      else scene.cacherFantome();
      this.magasin.modifier({ bonusVise: libre ? bonusVoisinage(ile, autres, this.contenu, deplace.type, visee!.case!) : null });
      return this.majCurseur('marteau');
    }
    const id = visee ? (visee.batiment ?? this.batimentSur(visee.case)) : null;
    const survole = id === null ? undefined : this.batiment(id);
    const libre = !survole && !!visee?.case && emplacementRefuse(ile, batiments, visee.case) === null;
    // Le bâtiment de la bulle reste surligné ; sinon, ce qu'on pourrait cliquer sous la souris.
    const cible = bulle?.type === 'batiment' ? this.batiment(bulle.id) : survole;
    if (cible) scene.montrerFantome(cible.case, null, true);
    else if (libre && !bulle) scene.montrerFantome(visee!.case!, null, true);
    else scene.cacherFantome();
    this.majCurseur(bulle ? 'fleche' : survole ? 'main' : libre ? 'marteau' : 'fleche');
  }

  /** Main fermée pendant un glisser, sinon la variante choisie selon ce qui est visé. */
  private majCurseur(curseur: Curseur): void {
    this.curseur = curseur;
    const affiche = this.appui?.mode === 'vue' ? 'poing' : curseur;
    this.options.scene.canevas.style.cursor = `var(--curseur-${affiche})`;
  }
}
