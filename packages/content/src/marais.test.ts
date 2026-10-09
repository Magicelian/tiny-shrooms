// Critère de l'étape 19 : l'île 2 est un marais (mares, roseaux, mousse), seule à proposer la tourbière,
// qui se pose contre l'eau. La production de mousse est mesurée dans `archipel.test.ts`.
import { describe, expect, it } from 'vitest';
import { ajouterIle, casesLibres, creerPartie, natureEn, terrainEn, terrainManquant, type Etat, type Terrain } from '@tiny-shrooms/engine';
import { contenu } from './index';

function compter(etat: Etat, terrain: Terrain): number {
  return etat.ile.terrain.filter((t) => t === terrain).length;
}

describe('Marais', () => {
  it.each([1, 2, 3])('graine %i : mares et roseaux, tourbière contre l’eau seulement', (graine) => {
    const partie = creerPartie(contenu, graine);
    const foret = partie.iles[0]!;
    const marais = ajouterIle(partie, contenu);
    expect(foret.ile.biome).toBe('foret');
    expect(marais.ile.biome).toBe('marais');
    expect(compter(marais, 'eau')).toBeGreaterThan(compter(foret, 'eau'));
    expect(compter(marais, 'roseaux')).toBeGreaterThan(compter(marais, 'foret') * 2);
    expect(marais.ile.elements.filter((e) => e.type === 'mousse').length).toBeGreaterThan(foret.ile.elements.filter((e) => e.type === 'mousse').length);

    expect(foret.batimentsDebloques).not.toContain('tourbiere');
    expect(marais.batimentsDebloques).toContain('tourbiere');
    const libres = casesLibres(marais);
    const auBord = libres.filter((c) => terrainManquant(marais.ile, contenu, 'tourbiere', c) === null);
    expect(auBord.length).toBeGreaterThan(3);
    expect(auBord.length).toBeLessThan(libres.length);

    const roseau = marais.ile.terrain.findIndex((t) => t === 'roseaux');
    const c = { x: roseau % marais.ile.largeur, y: Math.floor(roseau / marais.ile.largeur) };
    expect(terrainEn(marais.ile, c.x, c.y)).toBe('roseaux');
    expect(natureEn(marais.ile, c)).toBe('roseau');
  });
});
