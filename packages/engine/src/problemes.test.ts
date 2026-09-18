import { describe, expect, it } from 'vitest';
import type { Contenu } from './contenu';
import type { Batiment, Instantane } from './contrat';
import { problemes } from './problemes';

/** Juste ce que lit `problemes`. */
const contenu = { habitants: { depart: { seuil: 0.5, delaiSecondes: 90, minimum: 1 } } } as unknown as Contenu;

function village(partiel: { faim?: boolean; saison?: 'hiver' | 'ete'; feux?: (number | null)[]; debloque?: boolean; bienEtre?: number[] }): Instantane {
  return {
    faim: partiel.faim ?? false,
    temps: { saison: partiel.saison ?? 'ete' },
    habitants: (partiel.bienEtre ?? [1]).map((bienEtre) => ({ bienEtre })),
    batiments: (partiel.feux ?? []).map((chantier) => ({ type: 'feuDeCamp', chantier }) as Batiment),
    batimentsDebloques: partiel.debloque === false ? [] : ['feuDeCamp'],
  } as unknown as Instantane;
}

describe('problemes', () => {
  it('signale les départs quand le bonheur moyen passe sous le seuil', () => {
    expect(problemes(village({ bienEtre: [0.3, 0.6] }), contenu)).toEqual(['malheur']);
    expect(problemes(village({ bienEtre: [0.5, 0.6] }), contenu)).toEqual([]);
    // Au minimum, plus personne ne part.
    expect(problemes(village({ bienEtre: [0.1] }), contenu)).toEqual([]);
  });

  it('rien à signaler dans un village nourri en été', () => {
    expect(problemes(village({}), contenu)).toEqual([]);
  });

  it('signale la faim', () => {
    expect(problemes(village({ faim: true }), contenu)).toEqual(['faim']);
  });

  it("signale le froid l'hiver tant qu'aucun feu n'est achevé", () => {
    expect(problemes(village({ saison: 'hiver' }), contenu)).toEqual(['froid']);
    expect(problemes(village({ saison: 'hiver', feux: [0.5] }), contenu)).toEqual(['froid']);
    expect(problemes(village({ saison: 'hiver', feux: [null] }), contenu)).toEqual([]);
  });

  it("ne signale pas le froid quand on ne sait pas encore bâtir de feu", () => {
    expect(problemes(village({ saison: 'hiver', debloque: false }), contenu)).toEqual([]);
  });
});
