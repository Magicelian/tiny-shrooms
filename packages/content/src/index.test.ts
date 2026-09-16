// Critère de l'étape 1 : une simulation sans affichage produit les quantités attendues sur 1 h.
import { describe, expect, it } from 'vitest';
import { Moteur, PAS_PAR_MINUTE, type Commande, type TypeBatiment } from '@tiny-shrooms/engine';
import { contenu } from './index';

const poser = (batiment: TypeBatiment): Commande => ({ type: 'poserBatiment', batiment, case: { x: 0, y: 0 }, orientation: 0 });

describe('Une heure simulée avec le contenu de la V1', () => {
  const moteur = new Moteur(contenu, 0);
  for (const b of ['cueillette', 'tasDeBois', 'gardeManger'] as const) {
    moteur.recevoir({ type: 'commande', commande: poser(b) }, 0);
  }

  it('paie les trois bâtiments sur le stock de départ', () => {
    expect(moteur.etatCourant.stocks).toMatchObject({ baies: 10, boisMort: 20 });
  });

  it('produit ce que prévoient les débits après 10 minutes', () => {
    moteur.simuler(10 * PAS_PAR_MINUTE);
    // Chantiers de 20 s : la production démarre au 80e pas, soit 2 321 pas productifs.
    const { baies, boisMort, spores, mousse } = moteur.etatCourant.stocks;
    expect(baies).toBeCloseTo(10 + (6 * 2321) / PAS_PAR_MINUTE, 6);
    expect(boisMort).toBeCloseTo(20 + (5 * 2321) / PAS_PAR_MINUTE, 6);
    expect(spores).toBeCloseTo(10, 6);
    expect(mousse).toBe(10);
  });

  it('plafonne chaque stock au bout d’une heure', () => {
    const evenements = moteur.simuler(50 * PAS_PAR_MINUTE);
    expect(moteur.etatCourant.stocks).toMatchObject({ baies: 150, boisMort: 80, spores: 20, mousse: 10 });
    expect(evenements.filter((e) => e.type === 'stockPlein').map((e) => e.type === 'stockPlein' && e.ressource).sort()).toEqual(
      ['baies', 'boisMort', 'spores'],
    );
  });
});
