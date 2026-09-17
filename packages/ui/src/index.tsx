// Interface : reçoit les messages du moteur, traduit la souris en commandes et en mouvements de caméra.
import { render } from 'preact';
import type { Batiment, Case, Commande, Contenu, Defrichable, IdBatiment, Ile, Instantane, MessageDepuisMoteur, TypeBatiment } from '@tiny-shrooms/engine';
import { bonusVoisinage, casesCouvertes, centreSouche, coutBatiment, dansLaSouche, elementEn, emplacementRefuse, natureEn } from '@tiny-shrooms/engine';
import { choisirLangue, t, type Langue } from '@tiny-shrooms/i18n';

export type { Langue };
import { installerCurseurs, type Curseur } from './curseurs';
import { abordable, nomBatiment, nomPalier, nomPose, nomRang, nomRessource } from './format';
import { Interface } from './interface';
import { Magasin, type Bulle } from './magasin';
import { Sons, type Effet } from './sons';

/** Ce que l'interface attend du rendu de l'îlot. */
export interface SceneInteractive {
  readonly canevas: HTMLCanvasElement;
  viser(x: number, y: number): { case: Case | null; batiment: IdBatiment | null };
  afficherGrille(visible: boolean): void;
  montrerFantome(c: Case, type: TypeBatiment | null, valide: boolean): void;
  cacherFantome(): void;
  /** Boîte par-dessus un bâtiment ou une emprise du décor ; `null` l'efface. */
  surligner(cible: { batiment: IdBatiment } | { case: Case; taille: number; hauteur: number } | null): void;
  /** Surligne les cases à portée d'un service ; une liste vide efface la zone. */
  montrerPortee(cases: readonly Case[]): void;
  tourner(sens: 1 | -1): void;
  basculerZoom(): void;
  zoomer(sens: 1 | -1): void;
  glisser(dx: number, dy: number): void;
  /** Point de la fenêtre où s'affiche la position (x, y) de l'île à cette hauteur. */
  projeter(x: number, y: number, hauteur: number): { x: number; y: number } | null;
}

export interface OptionsInterface {
  scene: SceneInteractive;
  contenu: Contenu;
  envoyer(commande: Commande): void;
  /** Couleurs du rendu, pour que les pastilles de l'interface y correspondent. */
  couleurs: { batiments: Record<TypeBatiment, number>; chapeaux: readonly number[] };
  /** Images des modèles pour les bulles ; absentes, les bulles s'en passent. */
  vignettes?: {
    batiment(type: TypeBatiment, niveau?: number): string;
    nature(nom: 'arbre' | 'buisson' | 'souche' | 'boisMort' | 'mousse' | 'baies'): string;
  };
  /** Déplace la fenêtre tant que le bouton reste enfoncé (Tauri) ; absent dans un navigateur. */
  deplacerFenetre?: () => void;
  /** Menu de démarrage : absent, la partie commence tout de suite. */
  demarrage?: {
    /** Simulation arrêtée tant que le menu est ouvert. */
    pause(enPause: boolean): void;
    /** Réglages demandés depuis le menu ; la valeur retenue revient par `signalerSon` / `signalerLangue`. */
    son(actif: boolean): void;
    langue(langue: Langue): void;
    /** Absent dans un navigateur. */
    quitter?: () => void;
  };
}

/** Pendant le menu de démarrage, l'île fait un quart de tour à ce rythme. */
const TOUR_ACCUEIL_MS = 6000;

/** Hauteur du surlignage de ce qu'on peut faire arracher. */
const HAUTEURS_NATURE: Record<Defrichable, number> = { arbre: 1.3, buisson: 0.6, plante: 0.35 };

/** Ce qu'on peut faire arracher sur une case : la souche-dépôt, ou un arbre, un buisson, une plante. */
export function natureVisee(ile: Ile, c: Case): Defrichable | 'souche' | null {
  return dansLaSouche(ile, c.x, c.y) ? 'souche' : natureEn(ile, c);
}

/** Emprise à surligner pour la nature d'une case. */
function zoneNature(ile: Ile, c: Case, nature: Defrichable | 'souche') {
  if (nature === 'souche') return { case: ile.souche, taille: ile.tailleSouche, hauteur: 0.8 };
  return { case: c, taille: 1, hauteur: HAUTEURS_NATURE[nature] };
}

/** Distance en pixels au-delà de laquelle un appui devient un glisser et non plus un clic. */
const SEUIL_GLISSER = 4;
/** Défilement cumulé (en pixels) qui vaut un palier de zoom ; au-delà d'une pause, le cumul repart de zéro. */
const PAS_MOLETTE = 100;
const PAUSE_MOLETTE_MS = 200;
/** Hauteur, en unités du monde, où l'astuce pointe la souche (juste au-dessus de son sommet). */
const HAUTEUR_ASTUCE = 1.4;

/** Un appui arrivé si tôt après la prise du focus est le clic qui l'a donné : il n'agit pas. */
const DELAI_FOCUS_MS = 250;

/** Appui en cours sur l'îlot : pas encore décidé, glisser de la vue, ou ⌘ + glisser refusé (fenêtre verrouillée). */
interface Appui {
  x: number;
  y: number;
  mode: 'attente' | 'vue';
  fenetre: boolean;
}

/** Son joué dès l'envoi d'une commande (le refus éventuel a le sien). */
const SON_COMMANDE: Partial<Record<Commande['type'], Effet>> = {
  poserBatiment: 'poser',
  demolir: 'demolir',
  deplacerBatiment: 'poser',
  defricher: 'arracher',
  retirerSouche: 'arracher',
  annulerArrachage: 'fermer',
  ameliorer: 'termine',
  acheterBonus: 'termine',
};

export class ControleurInterface {
  readonly magasin = new Magasin();
  readonly sons = new Sons();
  private souris: { x: number; y: number } | null = null;
  private appui: Appui | null = null;
  private focusDepuis = -Infinity;
  private molette = { cumul: 0, dernier: 0 };
  private curseur: Curseur = 'fleche';
  /** Point cliqué pour chaque récolte envoyée, d'où partira son chiffre. */
  private readonly recoltes = new Map<number, { x: number; y: number }>();
  private tourAccueil: ReturnType<typeof setInterval> | null = null;

  constructor(
    racine: HTMLElement,
    private readonly options: OptionsInterface,
  ) {
    installerCurseurs();
    render(<Interface controleur={this} />, racine);
    this.magasin.modifier({ focus: document.hasFocus() });
    this.brancherSouris();
    if (options.demarrage) {
      this.magasin.modifier({ menu: 'accueil' });
      this.tourAccueil = setInterval(() => this.options.scene.tourner(1), TOUR_ACCUEIL_MS);
    }
  }

  get quittable(): boolean {
    return !!this.options.demarrage?.quitter;
  }

  /** Ferme le menu de démarrage : la simulation reprend. */
  continuer(): void {
    if (this.magasin.valeur.menu === null) return;
    if (this.tourAccueil !== null) clearInterval(this.tourAccueil);
    this.tourAccueil = null;
    this.magasin.modifier({ menu: null });
    this.options.demarrage?.pause(false);
    this.sons.jouer('termine');
  }

  montrerCommandes(visibles: boolean): void {
    this.magasin.modifier({ menu: visibles ? 'commandes' : 'accueil' });
    this.sons.jouer(visibles ? 'termine' : 'fermer');
  }

  demanderRecommencer(confirmer: boolean): void {
    this.magasin.modifier({ menu: confirmer ? 'confirmer' : 'accueil' });
    this.sons.jouer(confirmer ? 'refus' : 'fermer');
  }

  /** Efface la partie (prestige compris) pour une île tirée au hasard, puis lance le jeu. */
  recommencer(): void {
    this.options.envoyer({ type: 'recommencer', graine: Math.floor(Math.random() * 2 ** 31) + 1 });
    this.magasin.modifier({ astuceSouche: false });
    this.continuer();
  }

  reglerSon(): void {
    this.options.demarrage?.son(!this.magasin.valeur.son);
  }

  reglerLangue(langue: Langue): void {
    this.options.demarrage?.langue(langue);
  }

  quitter(): void {
    this.options.demarrage?.quitter?.();
  }

  signalerSon(actif: boolean): void {
    this.sons.activer(actif);
    this.magasin.modifier({ son: actif });
  }

  get contenu(): Contenu {
    return this.options.contenu;
  }

  get vignettes(): OptionsInterface['vignettes'] {
    return this.options.vignettes;
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
      this.magasin.modifier({ partieReprise: message.origine === 'sauvegarde' || message.origine === 'secours' });
    }
    if (message.type !== 'instantane') return;
    this.magasin.modifier({ instantane: message.instantane });
    this.sons.ambiancer(message.instantane.temps);
    // Le bâtiment visé a disparu (démoli) : sa bulle ou son déplacement n'ont plus d'objet.
    const { bulle, deplacement } = this.magasin.valeur;
    const vise = bulle?.type === 'batiment' ? bulle.id : deplacement;
    if (vise !== null && !this.batiment(vise)) this.fermer();
    // Plus rien à arracher sur la case de la bulle : elle se referme.
    const { ile } = this.magasin.valeur;
    if (bulle?.type === 'nature' && ile && !natureVisee(ile, bulle.case)) this.fermer();
    for (const e of message.evenements) {
      if (e.type === 'recolte') {
        const point = this.recoltes.get(e.element);
        this.recoltes.delete(e.element);
        if (point) this.magasin.envoler({ ...point, ressource: e.ressource, quantite: e.quantite });
        this.sons.jouer('recolte');
      } else if (e.type === 'commandeRefusee') {
        this.sons.jouer('refus');
        if (e.commande.type === 'recolter') this.recoltes.delete(e.commande.element);
        this.magasin.annoncer(t(`refus.${e.raison}`));
      }
      else if (e.type === 'habitantArrive') {
        this.magasin.annoncer(t('message.habitantArrive'));
        this.sons.jouer('arrivee');
      }
      else if (e.type === 'stockPlein') this.magasin.annoncer(t('message.stockPlein', { ressource: nomRessource(e.ressource) }));
      else if (e.type === 'constructionTerminee') {
        const b = message.instantane.batiments.find((x) => x.id === e.id);
        if (b) this.magasin.annoncer(t('message.constructionTerminee', { batiment: nomPose(this.contenu, b) }));
        this.sons.jouer('termine');
      } else if (e.type === 'renaissance') {
        this.fermer();
        this.magasin.annoncer(t('message.renaissance', { graines: e.graines }));
        this.sons.jouer('renaissance');
        if (message.instantane.prestige.renaissances === 1) this.magasin.modifier({ astuceSouche: true });
      } else if (e.type === 'soucheRetiree') {
        this.magasin.annoncer(t('message.soucheRetiree'));
        this.sons.jouer('termine');
      } else if (e.type === 'palierAtteint') {
        const palier = nomPalier(this.contenu, e.palier);
        const liste = e.debloques.map((type) => nomBatiment(type)).join(', ');
        this.magasin.annoncer(liste ? t('message.palierAtteint', { palier, liste }) : t('message.palierAtteintSeul', { palier }));
        this.sons.jouer('palier');
      } else if (e.type === 'logementAmeliore') {
        this.magasin.annoncer(t('message.logementAmeliore', { rang: nomRang(e.niveau) }));
        this.sons.jouer('termine');
      }
    }
    // Le village a changé : l'aperçu sous la souris aussi.
    this.majVisee();
  }

  envoyer(commande: Commande): void {
    this.options.envoyer(commande);
    const son = SON_COMMANDE[commande.type];
    if (son) this.sons.jouer(son);
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

  /** Position de la fenêtre verrouillée ou libre, depuis le menu de l'icône. */
  signalerVerrouillage(verrouillee: boolean): void {
    this.magasin.modifier({ verrouillee });
  }

  /** Langue choisie dans le menu de l'icône (ou celle du système). */
  signalerLangue(langue: Langue): void {
    choisirLangue(langue);
    this.magasin.modifier({ langue });
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

  /** Au-dessus du centre de la souche, là où s'accroche l'astuce. */
  pointSouche(): { x: number; y: number } | null {
    const ile = this.magasin.valeur.ile;
    if (!ile?.soucheEnPlace) return null;
    const c = centreSouche(ile);
    return this.options.scene.projeter(c.x, c.y, HAUTEUR_ASTUCE);
  }

  private ouvrir(bulle: Bulle | null): void {
    const { ile, bulle: avant } = this.magasin.valeur;
    if (!bulle && avant) this.sons.jouer('fermer');
    else if (bulle && avant?.type === bulle.type && bulle.type === 'construire') this.sons.jouer('choisir');
    else if (bulle) this.sons.jouer('ouvrir');
    const souche = bulle?.type === 'nature' && !!ile && dansLaSouche(ile, bulle.case.x, bulle.case.y);
    this.magasin.modifier({ bulle, deplacement: null, bonusVise: null, ...(souche ? { astuceSouche: false } : {}) });
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
        // Fenêtre verrouillée ou simple navigateur : le glisser déplace la vue, faute de mieux.
        if (!appui.fenetre || this.magasin.valeur.verrouillee || !this.options.deplacerFenetre) appui.mode = 'vue';
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
      if (e.button !== 0 || this.magasin.valeur.menu !== null) return;
      if (!document.hasFocus() || performance.now() - this.focusDepuis < DELAI_FOCUS_MS) {
        this.focusDepuis = performance.now();
        return;
      }
      // Glisser seul déplace la fenêtre ; avec ⌘ (Ctrl sous Windows), il déplace la vue.
      this.appui = { x: e.clientX, y: e.clientY, mode: 'attente', fenetre: !(e.metaKey || e.ctrlKey) };
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
        if (!this.magasin.valeur.focus || this.magasin.valeur.menu !== null) return;
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
      if (this.magasin.valeur.menu !== null) {
        if (e.key === 'Enter') this.continuer();
        else if (e.key === 'Escape') this.demanderRecommencer(false);
        return;
      }
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
    const element = visee.case ? elementEn(ile, visee.case.x, visee.case.y) : -1;
    const nature = visee.case ? natureVisee(ile, visee.case) : null;
    if (id !== null) this.ouvrir({ type: 'batiment', id, haut });
    // Un élément prêt se récolte d'un clic ; épuisé ou stock plein, il ouvre sa bulle comme un arbre.
    else if (this.recoltable(ile, instantane, element)) {
      this.recoltes.set(element, { x, y });
      this.envoyer({ type: 'recolter', element });
    } else if (nature) this.ouvrir({ type: 'nature', case: visee.case!, haut });
    else if (visee.case && emplacementRefuse(ile, instantane.batiments, visee.case) === null) {
      this.ouvrir({ type: 'construire', case: visee.case, choix: null, haut });
    }
  }

  /** Prêt à cueillir, et avec de la place dans le stock pour ce qu'il donne. */
  private recoltable(ile: Ile, instantane: Instantane, element: number): boolean {
    if (element < 0 || (instantane.pousses[element] ?? 0) < 1) return false;
    const stock = instantane.stocks[this.contenu.recolte[ile.elements[element]!.type].ressource];
    return stock.quantite < stock.plafond;
  }

  private batimentSur(c: Case | null): IdBatiment | null {
    if (!c) return null;
    const b = this.magasin.valeur.instantane?.batiments.find((x) => x.case.x === c.x && x.case.y === c.y);
    return b?.id ?? null;
  }

  /** Met à jour le fantôme, le surlignage et le curseur selon la bulle ouverte et ce qui est sous la souris. */
  private majVisee(): void {
    const { scene } = this.options;
    const { ile, instantane, bulle, deplacement, menu } = this.magasin.valeur;
    if (!ile || !instantane || menu !== null) return;
    const { batiments } = instantane;
    // Bulle de construction : le fantôme reste sur sa case, où que soit la souris.
    if (bulle?.type === 'construire') {
      const { choix } = bulle;
      scene.montrerFantome(bulle.case, choix, !choix || abordable(coutBatiment(this.contenu, instantane.prestige.bonus, choix), instantane.stocks));
      scene.montrerPortee(choix ? casesCouvertes(ile, this.contenu, { type: choix, case: bulle.case }) : []);
      scene.surligner(null);
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
      scene.montrerPortee(visee?.case ? casesCouvertes(ile, this.contenu, { type: deplace.type, case: visee.case }) : []);
      scene.surligner(null);
      this.magasin.modifier({ bonusVise: libre ? bonusVoisinage(ile, autres, this.contenu, deplace.type, visee!.case!) : null });
      return this.majCurseur('marteau');
    }
    const id = visee ? (visee.batiment ?? this.batimentSur(visee.case)) : null;
    const survole = id === null ? undefined : this.batiment(id);
    const libre = !survole && !!visee?.case && emplacementRefuse(ile, batiments, visee.case) === null;
    const element = !survole && visee?.case ? elementEn(ile, visee.case.x, visee.case.y) : -1;
    const recoltable = this.recoltable(ile, instantane, element);
    const nature = !survole && visee?.case ? natureVisee(ile, visee.case) : null;
    // Ce que vise la bulle reste surligné ; sinon, ce qu'on pourrait cliquer sous la souris.
    const cible = bulle?.type === 'batiment' ? this.batiment(bulle.id) : bulle ? undefined : survole;
    const caseNature = bulle?.type === 'nature' ? bulle.case : !bulle && nature ? visee!.case! : null;
    const natureCible = caseNature && natureVisee(ile, caseNature);
    scene.montrerPortee(cible ? casesCouvertes(ile, this.contenu, cible) : []);
    if (cible) scene.surligner({ batiment: cible.id });
    else if (caseNature && natureCible) scene.surligner(zoneNature(ile, caseNature, natureCible));
    else scene.surligner(null);
    // Le carré au sol ne sert plus qu'aux cases libres, là où rien ne le cache.
    if (libre && !bulle) scene.montrerFantome(visee!.case!, null, true);
    else scene.cacherFantome();
    this.majCurseur(bulle ? 'fleche' : survole || recoltable || nature ? 'main' : libre ? 'marteau' : 'fleche');
  }

  /** Main fermée pendant un glisser, sinon la variante choisie selon ce qui est visé. */
  private majCurseur(curseur: Curseur): void {
    this.curseur = curseur;
    const affiche = this.appui?.mode === 'vue' ? 'poing' : curseur;
    const { dataset } = this.options.scene.canevas;
    if (dataset.curseur !== affiche) dataset.curseur = affiche;
  }
}
