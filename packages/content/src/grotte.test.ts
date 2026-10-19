// Critère de l'étape 21 : l'île 4 est une grotte (rochers, champignons luisants), seule à proposer la champignonnière,
// qui se pose contre un rocher. Les luisants s'arrachent et rapportent des spores. La production est mesurée dans
// `prairie-grotte.ts`, qui joue jusqu'au bourg de la grotte.
import { describe, expect, it } from 'vitest';
import { ajouterIle, casesLibres, creerPartie, natureEn, terrainManquant, type Etat, type Terrain } from '@tiny-shrooms/engine';
import { contenu } from './index';

function compter(etat: Etat, terrain: Terrain): number {
  return etat.ile.terrain.filter((t) => t === terrain).length;
}

describe('Grotte', () => {
  it.each([1, 2, 3])('graine %i : rochers et luisants, champignonnière contre un rocher seulement', (graine) => {
    const partie = creerPartie(contenu, graine);
    for (let i = 0; i < 3; i++) ajouterIle(partie, contenu);
    const [foret, , prairie, grotte] = partie.iles as [Etat, Etat, Etat, Etat];
    expect(grotte.ile.biome).toBe('grotte');
    expect(compter(grotte, 'rocher')).toBeGreaterThan(compter(foret, 'rocher') * 3);
    expect(compter(grotte, 'luisants')).toBeGreaterThan(8);
    expect(compter(grotte, 'foret')).toBeLessThan(compter(foret, 'foret') / 3);

    expect(prairie.batimentsDebloques).not.toContain('champignonniere');
    expect(grotte.batimentsDebloques).toContain('champignonniere');
    const libres = casesLibres(grotte);
    // Assez de place pour bâtir, et assez de cases contre un rocher, sans que toutes le soient.
    expect(libres.length).toBeGreaterThan(40);
    const contreUnRocher = libres.filter((c) => terrainManquant(grotte.ile, contenu, 'champignonniere', c) === null);
    expect(contreUnRocher.length).toBeGreaterThan(6);
    expect(contreUnRocher.length).toBeLessThan(libres.length);

    const i = grotte.ile.terrain.findIndex((t) => t === 'luisants');
    const c = { x: i % grotte.ile.largeur, y: Math.floor(i / grotte.ile.largeur) };
    expect(natureEn(grotte.ile, c)).toBe('luisant');
    expect(contenu.defrichage.luisant.gain?.spores ?? 0).toBeGreaterThan(contenu.defrichage.luisant.cout.spores ?? 0);
  });
});
