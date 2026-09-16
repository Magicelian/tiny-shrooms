// Mise en mots des données du contenu : coûts, effets et bonus des bâtiments.
import type { Cle } from '@tiny-shrooms/i18n';
import { nombre, t } from '@tiny-shrooms/i18n';
import type { Contenu, Quantites, Ressource, Stock, TypeBatiment } from '@tiny-shrooms/engine';
import { RESSOURCES, TYPES_BATIMENT } from '@tiny-shrooms/engine';

export function nomRessource(r: Ressource): string {
  return t(`ressource.${r}`);
}

export function nomBatiment(type: TypeBatiment): string {
  return t(`batiment.${type}`);
}

/** « 20 bois mort, 5 baies » ; `suffixe` s'ajoute à chaque quantité. */
export function listeQuantites(quantites: Quantites, facteur = 1, suffixe = ''): string {
  return RESSOURCES.filter((r) => quantites[r])
    .map((r) => `${nombre((quantites[r] ?? 0) * facteur, 1)} ${nomRessource(r).toLowerCase()}${suffixe}`)
    .join(', ');
}

export function abordable(cout: Quantites, stocks: Record<Ressource, Stock>): boolean {
  return RESSOURCES.every((r) => stocks[r].quantite >= (cout[r] ?? 0));
}

export function pourcent(valeur: number): string {
  return nombre(Math.round(valeur * 100));
}

/** Phrases décrivant ce que fait un type de bâtiment. */
export function effets(contenu: Contenu, type: TypeBatiment): string[] {
  const def = contenu.batiments[type];
  const lignes: string[] = [];
  if (def.production) lignes.push(t('effet.production', { liste: listeQuantites(def.production, 1, '/min') }));
  if (def.consommation) lignes.push(t('effet.consommation', { liste: listeQuantites(def.consommation, 1, '/min') }));
  if (def.logement) lignes.push(t('effet.logement', { nombre: def.logement }));
  if (def.stockage) lignes.push(t('effet.stockage', { liste: listeQuantites(def.stockage).replace(/^|, /g, '$&+') }));
  if (type === 'feuDeCamp') lignes.push(t('effet.feuDeCamp'));
  if (type === 'relais') lignes.push(t('effet.relais', { nombre: contenu.visiteurs.capaciteParRelais }));
  if (lignes.length === 0) lignes.push(t('effet.aVenir'));
  for (const regle of def.voisinage ?? []) {
    const voisin = (TYPES_BATIMENT as readonly string[]).includes(regle.voisin)
      ? nomBatiment(regle.voisin as TypeBatiment).toLowerCase()
      : t(`terrain.${regle.voisin}` as Cle);
    lignes.push(t('effet.voisinage', { pourcent: pourcent(regle.bonus), voisin }));
  }
  return lignes;
}
