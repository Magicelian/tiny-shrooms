// Saisons, météo et froid : tout se déduit du pas et de la graine, rien n'est stocké en plus.
import type { Meteo, Position, Ressource, Saison } from './contrat';
import { SAISONS } from './contrat';
import type { Contenu } from './contenu';
import type { Etat } from './etat';
import { creerHasard } from './hasard';
import { PAS_PAR_MINUTE } from './temps';

const METEOS: readonly Meteo[] = ['soleil', 'pluie', 'vent', 'neige'];

export interface Calendrier {
  /** Nombre de saisons entières écoulées depuis le début de la partie. */
  rang: number;
  saison: Saison;
  annee: number;
  /** Avancement dans la saison, entre 0 et 1. */
  avancement: number;
}

export function calendrier(pas: number, contenu: Contenu): Calendrier {
  const minutes = pas / PAS_PAR_MINUTE;
  const { minutesParSaison } = contenu.temps;
  const rang = Math.floor(minutes / minutesParSaison);
  return {
    rang,
    saison: SAISONS[rang % SAISONS.length]!,
    annee: Math.floor(rang / SAISONS.length) + 1,
    avancement: (minutes % minutesParSaison) / minutesParSaison,
  };
}

/** Météo tirée au sort par période, selon la saison au début de la période ; la même graine donne le même ciel. */
export function meteoAu(pas: number, graine: number, contenu: Contenu): Meteo {
  const pasParPeriode = contenu.meteo.minutesParPeriode * PAS_PAR_MINUTE;
  const periode = Math.floor(pas / pasParPeriode);
  const poids = contenu.meteo.probabilites[calendrier(periode * pasParPeriode, contenu).saison];
  const total = METEOS.reduce((s, m) => s + (poids[m] ?? 0), 0);
  let tirage = creerHasard(graine ^ Math.imul(periode + 1, 0x9e3779b1))() * total;
  for (const m of METEOS) {
    tirage -= poids[m] ?? 0;
    if (tirage < 0) return m;
  }
  return 'soleil';
}

/** Multiplicateur de production d'une ressource dû à la saison et à la météo. */
export function facteurSaison(etat: Etat, contenu: Contenu, ressource: Ressource): number {
  const { saison } = calendrier(etat.pas, contenu);
  const meteo = meteoAu(etat.pas, etat.graine, contenu);
  return (contenu.saisons.production[saison][ressource] ?? 1) * (contenu.meteo.production[meteo][ressource] ?? 1);
}

export function estLHiver(etat: Etat, contenu: Contenu): boolean {
  return calendrier(etat.pas, contenu).saison === 'hiver';
}

/** Centre du feu de camp allumé le plus proche, s'il y en a un. */
export function feuLePlusProche(etat: Etat, position: Position): Position | null {
  let meilleur: Position | null = null;
  let ecart = Infinity;
  for (const b of etat.batiments) {
    if (b.type !== 'feuDeCamp' || b.chantier !== null) continue;
    const centre = { x: b.case.x + 0.5, y: b.case.y + 0.5 };
    const d = Math.hypot(centre.x - position.x, centre.y - position.y);
    if (d < ecart) [meilleur, ecart] = [centre, d];
  }
  return meilleur;
}

/**
 * Cadence de travail entre 0 et 1 : l'hiver ralentit loin d'un feu de camp, la faim ralentit toujours.
 * `position` est celle du poste de travail.
 */
export function cadenceTravail(etat: Etat, contenu: Contenu, position: Position, nourri: boolean): number {
  let cadence = nourri ? 1 : contenu.habitants.travailAffame;
  if (estLHiver(etat, contenu)) {
    const feu = feuLePlusProche(etat, position);
    const auChaud = feu !== null && Math.max(Math.abs(feu.x - position.x), Math.abs(feu.y - position.y)) <= contenu.saisons.rayonChaleur + 0.01;
    if (!auChaud) cadence *= contenu.saisons.travailAuFroid;
  }
  return cadence;
}
