// Critères des étapes 1 et 2, sur le contenu de la V1 et sans affichage :
// on pose 3 bâtiments, les habitants construisent, récoltent et stockent seuls.
import { describe, expect, it } from 'vitest';
import { Moteur, PAS_PAR_MINUTE, RESSOURCES, type Evenement, type TypeBatiment } from '@tiny-shrooms/engine';
import { contenu } from './index';

describe('Une heure simulée avec le contenu de la V1', () => {
  const moteur = new Moteur(contenu, 0);
  const cases = moteur.casesLibres();
  (['cueillette', 'tasDeBois', 'hutte'] as TypeBatiment[]).forEach((batiment, i) => {
    moteur.recevoir({ type: 'commande', commande: { type: 'poserBatiment', batiment, case: cases[i]!, orientation: 0 } }, 0);
  });
  const evenements: Evenement[] = [];
  const minutes = (n: number) => evenements.push(...moteur.simuler(n * PAS_PAR_MINUTE));

  it('paie les trois bâtiments sur le stock de départ', () => {
    expect(moteur.etatCourant.batiments).toHaveLength(3);
    expect(moteur.etatCourant.stocks).toMatchObject({ baies: 10, boisMort: 25 });
  });

  it('les habitants construisent seuls les trois chantiers', () => {
    minutes(3);
    expect(evenements.filter((e) => e.type === 'constructionTerminee')).toHaveLength(3);
    expect(moteur.etatCourant.batiments.every((b) => b.chantier === null)).toBe(true);
  });

  it('puis récoltent et remplissent les stocks', () => {
    const { baies, boisMort } = moteur.etatCourant.stocks;
    minutes(12);
    expect(moteur.etatCourant.stocks.baies).toBeGreaterThan(baies + 10);
    expect(moteur.etatCourant.stocks.boisMort).toBeGreaterThan(boisMort + 10);
  });

  it('accueillent de nouveaux habitants dans la hutte', () => {
    expect(moteur.etatCourant.habitants).toHaveLength(4);
    expect(evenements.filter((e) => e.type === 'habitantArrive')).toHaveLength(2);
  });

  it('tiennent une heure sans rien perdre ni rester affamés', () => {
    minutes(45);
    const { stocks, habitants } = moteur.etatCourant;
    for (const r of RESSOURCES) expect(stocks[r]).toBeGreaterThanOrEqual(0);
    expect(stocks.spores).toBeGreaterThan(0);
    expect(Math.min(...habitants.map((h) => h.bienEtre))).toBeGreaterThan(0.6);
  });
});

// Critère de l'étape 6 : une année complète, sans préparer l'hiver.
describe('Une année sans préparer l’hiver', () => {
  const moteur = new Moteur(contenu, 0);
  const cases = moteur.casesLibres();
  (['cueillette', 'tasDeBois', 'hutte'] as TypeBatiment[]).forEach((batiment, i) => {
    moteur.recevoir({ type: 'commande', commande: { type: 'poserBatiment', batiment, case: cases[i]!, orientation: 0 } }, 0);
  });
  const saisons: string[] = [];
  const minutesParSaison = contenu.temps.minutesParSaison;
  const reserveDeBaies = () => moteur.etatCourant.batiments.reduce((s, b) => s + (b.reserve.baies ?? 0), 0);

  it('enchaîne les quatre saisons', () => {
    for (let m = 0; m < 4 * minutesParSaison; m++) {
      const habitants = moteur.etatCourant.habitants.length;
      const enReserve = reserveDeBaies();
      for (const e of moteur.simuler(PAS_PAR_MINUTE)) if (e.type === 'saisonChangee') saisons.push(e.saison);
      const { stocks } = moteur.etatCourant;
      // Rien ne se perd : ni habitant, ni stock négatif ; l'hiver, la cueillette ne produit plus rien
      // (les baies récoltées avant peuvent encore être livrées).
      expect(moteur.etatCourant.habitants.length).toBeGreaterThanOrEqual(habitants);
      for (const r of RESSOURCES) expect(stocks[r]).toBeGreaterThanOrEqual(0);
      if (m >= 3 * minutesParSaison) expect(reserveDeBaies()).toBeLessThanOrEqual(enReserve + 1e-9);
    }
    expect(saisons).toEqual(['ete', 'automne', 'hiver', 'printemps']);
  });

  it('ralentit en hiver sans rien faire perdre, puis repart', () => {
    expect(moteur.etatCourant.habitants.length).toBeGreaterThanOrEqual(4);
    const baies = moteur.etatCourant.stocks.baies + reserveDeBaies();
    moteur.simuler(10 * PAS_PAR_MINUTE);
    expect(moteur.etatCourant.stocks.baies + reserveDeBaies()).toBeGreaterThan(baies);
  });
});
