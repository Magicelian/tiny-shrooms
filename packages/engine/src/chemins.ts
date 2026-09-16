// Déplacements : plus court chemin sur la grille, qui contourne bâtiments, souche, eau et rochers.
// Les grilles et les trajets sont des caches recalculables, hors de l'état sauvegardé.
import type { Position } from './contrat';
import type { Etat, HabitantEtat } from './etat';
import { dansLaSouche, terrainEn } from './ile';

/** Une case dont le centre est à moins de `rayon + MARGE_BUT` de la cible permet de finir en ligne droite. */
const MARGE_BUT = 0.75;
/** Demi-largeur d'un habitant : il ne frôle pas les coins des bâtiments. */
const CARRURE = 0.2;
/** Pas d'échantillonnage d'un segment, en cases. */
const PAS_VISEE = 0.25;
/** Distance à laquelle un point de passage est atteint. */
const ATTEINT = 0.05;

interface Grille {
  version: number;
  signature: string;
  largeur: number;
  profondeur: number;
  bloquee: Uint8Array;
}

interface Trajet {
  cle: string;
  /** Centres des cases à traverser ; `null` : aucun chemin, on marche droit. */
  points: Position[] | null;
}

const grilles = new WeakMap<Etat, Grille>();
const trajets = new WeakMap<HabitantEtat, Trajet>();
let prochaineVersion = 1;

/** Met à jour la grille des cases infranchissables ; à appeler une fois par pas, avant de déplacer qui que ce soit. */
export function preparerGrille(etat: Etat): void {
  const signature = `${etat.ile.soucheEnPlace};` + etat.batiments.map((b) => `${b.case.x},${b.case.y}`).join(';');
  if (grilles.get(etat)?.signature === signature) return;
  const { ile } = etat;
  const bloquee = new Uint8Array(ile.largeur * ile.profondeur);
  for (let y = 0; y < ile.profondeur; y++) {
    for (let x = 0; x < ile.largeur; x++) {
      const terrain = terrainEn(ile, x, y);
      if (terrain === 'vide' || terrain === 'eau' || terrain === 'rocher' || dansLaSouche(ile, x, y)) bloquee[y * ile.largeur + x] = 1;
    }
  }
  for (const b of etat.batiments) bloquee[b.case.y * ile.largeur + b.case.x] = 1;
  grilles.set(etat, { version: prochaineVersion++, signature, largeur: ile.largeur, profondeur: ile.profondeur, bloquee });
}

/**
 * Prochain point vers lequel marcher pour rejoindre `cible` à `rayon` près : la cible elle-même quand
 * la voie est libre, sinon le prochain point de passage d'un chemin qui contourne les obstacles.
 */
export function etapeVers(etat: Etat, h: HabitantEtat, cible: Position, rayon: number): Position {
  const g = grilles.get(etat);
  if (!g || visible(g, h.position, cible, rayon)) {
    trajets.delete(h);
    return cible;
  }
  const cle = `${cible.x},${cible.y},${rayon},${g.version}`;
  let trajet = trajets.get(h);
  if (!trajet || trajet.cle !== cle || trajet.points?.length === 0) {
    trajet = { cle, points: chercher(g, h.position, cible, rayon) };
    trajets.set(h, trajet);
  }
  const points = trajet.points;
  if (!points) return cible;
  while (points.length > 0 && distance(h.position, points[0]!) < ATTEINT) points.shift();
  // Raccourci : on vise le point suivant dès qu'il est en vue.
  while (points.length > 1 && visible(g, h.position, points[1]!)) points.shift();
  return points[0] ?? cible;
}

function bloquee(g: Grille, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= g.largeur || y >= g.profondeur) return true;
  return g.bloquee[y * g.largeur + x] === 1;
}

/**
 * Vrai si l'on peut aller en ligne droite de `a` vers `b` sans toucher d'obstacle. La case de départ est
 * toujours franchissable (un bâtiment a pu être posé sous l'habitant) ; avec `rayon`, les abords de la
 * cible aussi, puisque l'habitant s'arrête avant.
 */
function visible(g: Grille, a: Position, b: Position, rayon?: number): boolean {
  const longueur = distance(a, b);
  const n = Math.ceil(longueur / PAS_VISEE);
  const depart = { x: Math.floor(a.x), y: Math.floor(a.y) };
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (rayon !== undefined && distance({ x, y }, b) <= rayon + 0.5) return true;
    for (const [dx, dy] of [[-CARRURE, -CARRURE], [CARRURE, -CARRURE], [-CARRURE, CARRURE], [CARRURE, CARRURE]] as const) {
      const cx = Math.floor(x + dx);
      const cy = Math.floor(y + dy);
      if ((cx !== depart.x || cy !== depart.y) && bloquee(g, cx, cy)) return false;
    }
  }
  return true;
}

/** A* à 8 directions, sans couper les coins ; renvoie les centres des cases après la case de départ. */
function chercher(g: Grille, depuis: Position, cible: Position, rayon: number): Position[] | null {
  const n = g.largeur * g.profondeur;
  const centre = (i: number): Position => ({ x: (i % g.largeur) + 0.5, y: Math.floor(i / g.largeur) + 0.5 });
  const estimation = (i: number) => Math.max(0, distance(centre(i), cible) - rayon - MARGE_BUT);
  const depart = Math.floor(depuis.y) * g.largeur + Math.floor(depuis.x);
  if (depart < 0 || depart >= n) return null;

  const cout = new Float64Array(n).fill(Infinity);
  const precedent = new Int32Array(n).fill(-1);
  const ferme = new Uint8Array(n);
  const ouverts = [depart];
  cout[depart] = 0;
  while (ouverts.length > 0) {
    let meilleur = 0;
    for (let k = 1; k < ouverts.length; k++) {
      if (cout[ouverts[k]!]! + estimation(ouverts[k]!) < cout[ouverts[meilleur]!]! + estimation(ouverts[meilleur]!)) meilleur = k;
    }
    const i = ouverts.splice(meilleur, 1)[0]!;
    if (ferme[i]) continue;
    ferme[i] = 1;
    if (i !== depart && distance(centre(i), cible) <= rayon + MARGE_BUT) return remonter(precedent, i, depart, centre);
    const x = i % g.largeur;
    const y = Math.floor(i / g.largeur);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx === 0 && dy === 0) || bloquee(g, x + dx, y + dy)) continue;
        if (dx !== 0 && dy !== 0 && (bloquee(g, x + dx, y) || bloquee(g, x, y + dy))) continue;
        const j = (y + dy) * g.largeur + x + dx;
        const c = cout[i]! + (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
        if (ferme[j] || c >= cout[j]!) continue;
        cout[j] = c;
        precedent[j] = i;
        ouverts.push(j);
      }
    }
  }
  return null;
}

function remonter(precedent: Int32Array, fin: number, depart: number, centre: (i: number) => Position): Position[] {
  const points: Position[] = [];
  for (let i = fin; i !== depart && i >= 0; i = precedent[i]!) points.unshift(centre(i));
  return points;
}

function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
