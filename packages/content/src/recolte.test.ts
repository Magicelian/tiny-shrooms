// Critère de l'étape 12 : depuis une partie neuve, la première hutte se construit en récoltant à la main.
// Joueur scripté : il clique chaque seconde sur le bois mort prêt, pose la hutte dès qu'il peut la payer.
import { describe, expect, it } from 'vitest';
import { Moteur, PAS_PAR_MINUTE, type Commande } from '@tiny-shrooms/engine';
import { contenu } from './index';

const PAS_PAR_SECONDE = PAS_PAR_MINUTE / 60;

function premiereHutte(graine: number): { moteur: Moteur; posee: number; achevee: number } {
  const moteur = new Moteur(contenu, graine);
  const commander = (commande: Commande) => moteur.recevoir({ type: 'commande', commande }, 0);
  let posee = -1;
  for (let seconde = 1; seconde <= 600; seconde++) {
    moteur.simuler(PAS_PAR_SECONDE);
    const etat = moteur.etatCourant;
    if (posee < 0) {
      etat.ile.elements.forEach((e, element) => {
        if (e.type === 'boisMort' && etat.pousses[element]! >= 1) commander({ type: 'recolter', element });
      });
      if (etat.stocks.boisMort >= contenu.batiments.hutte.cout.boisMort!) {
        const c = moteur.casesLibres()[0]!;
        commander({ type: 'poserBatiment', batiment: 'hutte', case: c, orientation: 0 });
        posee = seconde;
      }
    } else if (etat.batiments[0]!.chantier === null) return { moteur, posee, achevee: seconde };
  }
  throw new Error('hutte jamais achevée');
}

describe('Partie neuve', () => {
  it('commence sans habitant ni stock', () => {
    const { habitants, stocks, batiments } = new Moteur(contenu, 0).etatCourant;
    expect(habitants).toHaveLength(0);
    expect(batiments).toHaveLength(0);
    expect(Object.values(stocks).every((q) => q === 0)).toBe(true);
  });

  it.each([0, 1, 2, 3, 4])('graine %i : première hutte achevée en 2 à 4 min, à la main', (graine) => {
    const { posee, achevee } = premiereHutte(graine);
    console.log(`graine ${graine} : hutte posée à ${posee} s, achevée à ${achevee} s`);
    expect(achevee).toBeGreaterThanOrEqual(120);
    expect(achevee).toBeLessThanOrEqual(240);
  });

  it('un premier habitant arrive sans hutte, logé à la souche', () => {
    const moteur = new Moteur(contenu, 0);
    moteur.simuler(30 * PAS_PAR_SECONDE);
    expect(moteur.etatCourant.habitants).toHaveLength(1);
  });

  it('deux autres habitants s’installent ensuite dans la hutte, si on cueille des baies', () => {
    const { moteur } = premiereHutte(0);
    expect(moteur.etatCourant.habitants).toHaveLength(1);
    // Il faut aussi de quoi manger : le joueur cueille les buissons prêts, toutes les 5 s.
    for (let s = 0; s < 180; s += 5) {
      const { ile, pousses } = moteur.etatCourant;
      ile.elements.forEach((e, element) => {
        if (e.type === 'buisson' && pousses[element]! >= 1) moteur.recevoir({ type: 'commande', commande: { type: 'recolter', element } }, 0);
      });
      moteur.simuler(5 * PAS_PAR_SECONDE);
    }
    expect(moteur.etatCourant.habitants).toHaveLength(3);
  });
});
