// Améliorations du village achetées à l'atelier, et paiement d'un coût.
import type { AmeliorationVillage, Quantites } from './contrat';
import { RESSOURCES } from './contrat';
import type { Contenu } from './contenu';
import type { Etat } from './etat';
import { effetsPrestige } from './prestige';

/** Coût du prochain niveau, ou `null` si le niveau maximal est atteint. */
export function coutAmelioration(contenu: Contenu, amelioration: AmeliorationVillage, niveau: number): Quantites | null {
  const def = contenu.ameliorations[amelioration];
  if (niveau >= def.niveauMax) return null;
  const cout: Quantites = {};
  for (const r of RESSOURCES) {
    if (def.cout[r] !== undefined) cout[r] = Math.round(def.cout[r] * def.hausseCout ** niveau);
  }
  return cout;
}

/** Multiplicateur apporté par une amélioration (1 au niveau 0). */
export function effetAmelioration(etat: Etat, contenu: Contenu, amelioration: AmeliorationVillage): number {
  return 1 + contenu.ameliorations[amelioration].effet * etat.ameliorations[amelioration];
}

/** Multiplicateur de production : outils de l'atelier et bonus de prestige. */
export function bonusProduction(etat: Etat, contenu: Contenu): number {
  return effetAmelioration(etat, contenu, 'outils') * effetsPrestige(contenu, etat.prestige.bonus).production;
}

/** Prélève un coût s'il est entièrement disponible. */
export function rembourser(etat: Etat, cout: Quantites): void {
  for (const r of RESSOURCES) etat.stocks[r] += cout[r] ?? 0;
}

export function payer(etat: Etat, cout: Quantites): boolean {
  const ressources = RESSOURCES.filter((r) => cout[r] !== undefined);
  if (ressources.some((r) => etat.stocks[r] < (cout[r] ?? 0))) return false;
  for (const r of ressources) etat.stocks[r] -= cout[r] ?? 0;
  return true;
}
