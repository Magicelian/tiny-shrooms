// Mise en mots des données du contenu : coûts, effets et bonus des bâtiments.
import type { Cle } from '@tiny-shrooms/i18n';
import { nombre, t } from '@tiny-shrooms/i18n';
import type { Batiment, Besoin, Contenu, Quantites, Ressource, Stock, TypeBatiment } from '@tiny-shrooms/engine';
import { RESSOURCES, TYPES_BATIMENT } from '@tiny-shrooms/engine';

export function nomRessource(r: Ressource): string {
  return t(`ressource.${r}`);
}

/** Nom d'un bâtiment ; un logement prend le nom de son rang. */
export function nomBatiment(type: TypeBatiment, contenu?: Contenu, niveau = 1): string {
  if (contenu?.batiments[type].logement) return nomRang(niveau);
  return t(`batiment.${type}`);
}

export function nomRang(niveau: number): string {
  return t(`rang.${niveau}` as Cle);
}

export function nomBesoin(besoin: Besoin): string {
  return t(`besoin.${besoin}`);
}

export function nomPalier(contenu: Contenu, palier: number): string {
  return t(`palier.${contenu.paliers[palier]?.nom ?? ''}` as Cle);
}

/** Nom affiché d'un bâtiment posé. */
export function nomPose(contenu: Contenu, b: Pick<Batiment, 'type' | 'niveau'>): string {
  return nomBatiment(b.type, contenu, b.niveau);
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
  if (def.logement) lignes.push(t('effet.logement', { nombre: contenu.logement.rangs[0]?.places ?? 0 }));
  if (def.stockage) lignes.push(t('effet.stockage', { liste: listeQuantites(def.stockage).replace(/^|, /g, '$&+') }));
  const besoin = (Object.keys(contenu.logement.sources) as Besoin[]).find((b) => contenu.logement.sources[b] === type);
  if (besoin && def.portee) lignes.push(t('effet.portee', { besoin: nomBesoin(besoin), portee: def.portee }));
  if (def.postes && !def.production) lignes.push(t('effet.tenu'));
  if (type === 'sanctuaire') lignes.push(t('effet.sanctuaire'));
  if (lignes.length === 0) lignes.push(t('effet.aVenir'));
  for (const regle of def.voisinage ?? []) {
    const voisin = (TYPES_BATIMENT as readonly string[]).includes(regle.voisin)
      ? nomBatiment(regle.voisin as TypeBatiment).toLowerCase()
      : t(`terrain.${regle.voisin}` as Cle);
    lignes.push(t('effet.voisinage', { pourcent: pourcent(regle.bonus), voisin }));
  }
  return lignes;
}
