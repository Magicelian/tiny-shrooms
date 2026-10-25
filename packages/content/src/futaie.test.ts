// Critère de l'étape 22 : l'île 5 est une futaie (vieux chênes, deux mares), seule à proposer la scierie, qui se pose
// au bord de l'eau. Les vieux chênes s'abattent et rapportent beaucoup de bois. La production est mesurée dans
// `iles-3-a-5.ts`, qui joue jusqu'au bourg de la futaie.
import { describe, expect, it } from 'vitest';
import { ajouterIle, casesLibres, creerPartie, natureEn, terrainManquant, type Etat, type Terrain } from '@tiny-shrooms/engine';
import { contenu } from './index';

function compter(etat: Etat, terrain: Terrain): number {
  return etat.ile.terrain.filter((t) => t === terrain).length;
}

describe('Futaie', () => {
  it.each([1, 2, 3])('graine %i : vieux chênes et deux mares, scierie au bord de l’eau seulement', (graine) => {
    const partie = creerPartie(contenu, graine);
    for (let i = 0; i < 4; i++) ajouterIle(partie, contenu);
    const [foret, , , grotte, futaie] = partie.iles as [Etat, Etat, Etat, Etat, Etat];
    expect(futaie.ile.biome).toBe('futaie');
    expect(compter(futaie, 'chenes')).toBeGreaterThan(10);
    expect(compter(futaie, 'eau')).toBeGreaterThan(compter(foret, 'eau'));

    expect(grotte.batimentsDebloques).not.toContain('scierie');
    expect(futaie.batimentsDebloques).toContain('scierie');
    const libres = casesLibres(futaie);
    // Assez de place pour bâtir, et assez de cases au bord de l'eau, sans que toutes le soient.
    expect(libres.length).toBeGreaterThan(40);
    const auBord = libres.filter((c) => terrainManquant(futaie.ile, contenu, 'scierie', c) === null);
    expect(auBord.length).toBeGreaterThan(6);
    expect(auBord.length).toBeLessThan(libres.length);

    const i = futaie.ile.terrain.findIndex((t) => t === 'chenes');
    const c = { x: i % futaie.ile.largeur, y: Math.floor(i / futaie.ile.largeur) };
    expect(natureEn(futaie.ile, c)).toBe('chene');
    // Un vieux chêne rapporte bien plus de bois qu'un arbre ordinaire.
    expect(contenu.defrichage.chene.gain?.boisMort ?? 0).toBeGreaterThan((contenu.defrichage.arbre.gain?.boisMort ?? 0) * 2);
  });
});
