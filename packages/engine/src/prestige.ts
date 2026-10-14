// Prestige et archipel : chaque île débloquée par une offrande rapporte des graines, dépensées en bonus permanents.
// Les fonctions pures ne lisent que des types du contrat : l'interface s'en sert pour afficher coûts et effets.
import type { Batiment, BonusPrestige, Offrande, Prestige, Quantites, Ressource, TypeBatiment } from './contrat';
import { RESSOURCES } from './contrat';
import type { Contenu } from './contenu';
import { ajouterIle, creerPartie, type Etat, type Partie } from './etat';
import { calendrier } from './saisons';

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
  return { graines: 0, bonus: { production: 0, depart: 0, construction: 0, logement: 0 } };
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

/** Graines gagnées en débloquant l'île suivante, avec cette population maximale sur l'île en cours. */
export function gainGraines(contenu: Contenu, populationMax: number): number {
  const { diviseur, puissance } = contenu.prestige.gain;
  return Math.floor((populationMax / diviseur) ** puissance);
}

/** Prix du prochain niveau d'un bonus, ou `null` au niveau maximal. */
export function coutBonus(contenu: Contenu, bonus: BonusPrestige, niveau: number): number | null {
  const def = contenu.prestige.bonus[bonus];
  return niveau >= def.niveauMax ? null : Math.round(def.cout * def.hausseCout ** niveau);
}

/** Coût d'un bâtiment, réduction de prestige et hausse par exemplaire déjà posé (`batiments`) comprises. */
export function coutBatiment(
  contenu: Contenu,
  bonus: Record<BonusPrestige, number>,
  type: TypeBatiment,
  batiments: readonly Pick<Batiment, 'type'>[] = [],
): Quantites {
  const exemplaires = batiments.filter((b) => b.type === type).length;
  const facteur = effetsPrestige(contenu, bonus).cout * (1 + contenu.hausseParExemplaire) ** exemplaires;
  const cout: Quantites = {};
  const base = contenu.batiments[type].cout;
  for (const r of RESSOURCES) {
    if (base[r] !== undefined) cout[r] = Math.ceil(base[r] * facteur);
  }
  return cout;
}

/** Offrande en cours sur cette île : seulement la dernière débloquée, tant qu'il reste des îles. */
export function offrande(etat: Etat, contenu: Contenu): Offrande | null {
  const indice = etat.partie.iles.indexOf(etat);
  const objectif = contenu.archipel.offrandes[indice];
  if (!objectif || indice !== etat.partie.iles.length - 1) return null;
  return { objectif: { ...objectif }, depose: { ...etat.offrande }, graines: gainGraines(contenu, etat.populationMax), reserve: reserveDHiver(etat.partie, contenu) };
}

/**
 * Baies séchées à garder pour l'hiver, qui ne produit aucune baie : en automne, de quoi nourrir tout l'archipel un hiver
 * entier ; en hiver, jusqu'au printemps. Les baies fraîches en stock comptent d'abord.
 */
export function reserveDHiver(partie: Partie, contenu: Contenu): Quantites {
  const { saison, avancement } = calendrier(partie.pas, contenu);
  const minutes = contenu.temps.minutesParSaison * (saison === 'automne' ? 1 : saison === 'hiver' ? 1 - avancement : 0);
  const population = partie.iles.reduce((n, ile) => n + ile.habitants.length, 0);
  const manque = population * contenu.habitants.baiesParMinute * minutes - partie.stocks.baies;
  const sechees = Math.ceil(Math.max(0, manque) / contenu.habitants.valeurBaieSechee);
  return sechees > 0 ? { baiesSechees: sechees } : {};
}

/** Vrai si un sanctuaire achevé permet de déposer l'offrande. */
export function sanctuaireAcheve(etat: Etat): boolean {
  return etat.batiments.some((b) => b.type === 'sanctuaire' && b.chantier === null);
}

/** Dépose du stock commun ce qui manque à l'offrande, autant que possible ; rend ce qui a été déposé. */
export function offrir(etat: Etat, contenu: Contenu): Quantites {
  const depose: Quantites = {};
  const o = offrande(etat, contenu);
  const objectif = o?.objectif ?? {};
  for (const r of Object.keys(objectif) as Ressource[]) {
    const manque = (objectif[r] ?? 0) - (etat.offrande[r] ?? 0);
    // Le stock s'affiche arrondi à l'unité inférieure : on ne dépose que des unités entières.
    const quantite = Math.min(manque, Math.floor(etat.partie.stocks[r] - (o?.reserve[r] ?? 0)));
    if (quantite <= 0) continue;
    etat.partie.stocks[r] -= quantite;
    etat.offrande[r] = (etat.offrande[r] ?? 0) + quantite;
    depose[r] = quantite;
  }
  return depose;
}

/** Vrai si l'offrande est complète. */
export function offrandeRemplie(etat: Etat, contenu: Contenu): boolean {
  const o = offrande(etat, contenu);
  return !!o && (Object.keys(o.objectif) as Ressource[]).every((r) => (o.depose[r] ?? 0) >= (o.objectif[r] ?? 0));
}

/** Ajoute l'île suivante, l'affiche et donne les graines ; rend leur nombre. */
export function debloquerIle(etat: Etat, contenu: Contenu): number {
  const gain = gainGraines(contenu, etat.populationMax);
  etat.partie.prestige.graines += gain;
  ajouterIle(etat.partie, contenu);
  etat.partie.vue = etat.partie.iles.length - 1;
  return gain;
}

/** Nouvelle partie à zéro, prestige compris ; seuls les réglages restent. L'objet `partie` est modifié sur place. */
export function recommencer(partie: Partie, contenu: Contenu, graine: number): void {
  const neuve = creerPartie(contenu, graine);
  neuve.reglages = partie.reglages;
  Object.assign(partie, neuve);
  // Les îles neuves pointent vers l'objet qui vient d'être recopié : on les rattache à celui qu'on garde.
  for (const ile of partie.iles) ile.partie = partie;
}
