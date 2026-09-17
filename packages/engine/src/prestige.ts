// Renaissance : on efface l'île et le village contre des graines de prestige, dépensées en bonus permanents.
// Les fonctions pures ne lisent que des types du contrat : l'interface s'en sert pour afficher coûts et effets.
import type { BonusPrestige, Prestige, Quantites, TypeBatiment } from './contrat';
import { RESSOURCES } from './contrat';
import type { Contenu } from './contenu';
import { creerEtat, type Etat } from './etat';
import { creerHasard } from './hasard';

/** Effets cumulés des bonus achetés. */
export interface EffetsPrestige {
  /** Multiplicateur de production (récoltes, spores, récolte à la main). */
  production: number;
  stocksDeDepart: Quantites;
  habitantsDeDepart: number;
  /** Multiplicateur appliqué au coût des constructions, entre 0 et 1. */
  cout: number;
  /** Multiplicateur de vitesse des chantiers. */
  chantier: number;
  bienEtre: number;
  /** Places de plus dans chaque logement achevé. */
  places: number;
  /** Multiplicateur du délai entre deux arrivées d'habitants, entre 0 et 1. */
  arrivee: number;
}

export function prestigeNeuf(): Prestige {
  return { graines: 0, renaissances: 0, bonus: { production: 0, depart: 0, construction: 0, logement: 0 }, populationMax: 0 };
}

export function effetsPrestige(contenu: Contenu, bonus: Record<BonusPrestige, number>): EffetsPrestige {
  const e = contenu.prestige.effets;
  const stocksDeDepart: Quantites = {};
  for (const r of RESSOURCES) {
    if (e.stocksDeDepart[r]) stocksDeDepart[r] = e.stocksDeDepart[r] * bonus.depart;
  }
  return {
    production: 1 + e.production * bonus.production,
    stocksDeDepart,
    habitantsDeDepart: e.habitantsDeDepart * bonus.depart,
    cout: Math.max(0, 1 - e.reductionCout * bonus.construction),
    chantier: 1 + e.vitesseChantier * bonus.construction,
    bienEtre: e.bienEtre * bonus.logement,
    places: e.places * bonus.logement,
    arrivee: Math.max(0.1, 1 - e.accueil * bonus.logement),
  };
}

/** Graines gagnées en renaissant avec cette population maximale. */
export function gainRenaissance(contenu: Contenu, populationMax: number): number {
  const { diviseur, puissance } = contenu.prestige.gain;
  return Math.floor((populationMax / diviseur) ** puissance);
}

/** Prix du prochain niveau d'un bonus, ou `null` au niveau maximal. */
export function coutBonus(contenu: Contenu, bonus: BonusPrestige, niveau: number): number | null {
  const def = contenu.prestige.bonus[bonus];
  return niveau >= def.niveauMax ? null : Math.round(def.cout * def.hausseCout ** niveau);
}

/** Coût d'un bâtiment, réduction de prestige comprise. */
export function coutBatiment(contenu: Contenu, bonus: Record<BonusPrestige, number>, type: TypeBatiment): Quantites {
  const facteur = effetsPrestige(contenu, bonus).cout;
  const cout: Quantites = {};
  const base = contenu.batiments[type].cout;
  for (const r of RESSOURCES) {
    if (base[r] !== undefined) cout[r] = Math.ceil(base[r] * facteur);
  }
  return cout;
}

/** Vrai si un sanctuaire achevé permet de renaître. */
export function peutRenaitre(etat: Etat): boolean {
  return etat.batiments.some((b) => b.type === 'sanctuaire' && b.chantier === null);
}

/** Nouvelle partie à zéro, prestige compris ; seuls les réglages restent. L'objet `etat` est modifié sur place. */
export function recommencer(etat: Etat, contenu: Contenu, graine: number): void {
  const reglages = etat.reglages;
  Object.assign(etat, creerEtat(contenu, graine), { reglages });
}

/**
 * Remplace la partie par une nouvelle, sur une autre île ; seul le prestige, enrichi du gain, et les
 * réglages sont gardés. L'objet `etat` est modifié sur place : le moteur et ses caches le gardent.
 */
export function renaitre(etat: Etat, contenu: Contenu): number {
  const gain = gainRenaissance(contenu, etat.prestige.populationMax);
  const prestige: Prestige = {
    graines: etat.prestige.graines + gain,
    renaissances: etat.prestige.renaissances + 1,
    bonus: { ...etat.prestige.bonus },
    populationMax: 0,
  };
  const graine = Math.floor(creerHasard(etat.graine)() * 2 ** 31) + 1;
  const reglages = etat.reglages;
  const neuf = creerEtat(contenu, graine, prestige);
  // Les clés sont les mêmes : on remplace tout le contenu sans changer d'objet.
  Object.assign(etat, neuf, { reglages });
  return gain;
}
