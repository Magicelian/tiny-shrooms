// Critère de l'étape 13 : depuis une partie neuve, un joueur scripté (`joueur.ts`) atteint le palier bourg.
import { describe, expect, it } from 'vitest';
import { creerEtat, Moteur, terrainEn } from '@tiny-shrooms/engine';
import { contenu } from './index';
import { BOURG, Joueur, PAS_PAR_SECONDE } from './joueur';

const HEURES_MAX = 20;

describe('Joueur scripté jusqu’au bourg', () => {
  it.each([1, 2, 3])('graine %i : palier bourg atteint sans jamais perdre d’habitant ni marcher sur l’eau', (graine) => {
    const moteur = new Moteur(contenu, 0, creerEtat(contenu, graine));
    const joueur = new Joueur(moteur);
    const paliers: string[] = [];
    let population = 0;
    let secondes = 0;
    for (; secondes < HEURES_MAX * 3600 && moteur.etatCourant.palier < BOURG; secondes += 5) {
      joueur.jouer();
      for (const e of moteur.simuler(5 * PAS_PAR_SECONDE)) {
        if (e.type === 'palierAtteint') paliers.push(`${contenu.paliers[e.palier]!.nom} à ${(secondes / 3600).toFixed(1)} h`);
      }
      expect(moteur.etatCourant.habitants.length).toBeGreaterThanOrEqual(population);
      // Personne ne marche sur l'eau.
      const { ile } = moteur.etatCourant;
      const mouilles = moteur.etatCourant.habitants.filter((h) => terrainEn(ile, Math.floor(h.position.x), Math.floor(h.position.y)) === 'eau');
      expect(mouilles.map((h) => h.position)).toEqual([]);
      population = moteur.etatCourant.habitants.length;
    }
    const etat = moteur.etatCourant;
    const rangs = [1, 2, 3].map((n) => etat.batiments.filter((b) => b.type === 'hutte' && b.niveau === n).length);
    console.log(`graine ${graine} : ${paliers.join(', ')} ; ${population} habitants, logements par rang ${rangs.join('/')}`);
    expect(etat.palier).toBe(BOURG);
  }, 30_000);
});
