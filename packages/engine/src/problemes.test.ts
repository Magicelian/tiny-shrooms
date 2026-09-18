import { describe, expect, it } from 'vitest';
import type { Batiment, Instantane } from './contrat';
import { problemes } from './problemes';

/** Juste ce que lit `problemes`. */
function village(partiel: { faim?: boolean; saison?: 'hiver' | 'ete'; feux?: (number | null)[]; debloque?: boolean }): Instantane {
  return {
    faim: partiel.faim ?? false,
    temps: { saison: partiel.saison ?? 'ete' },
    habitants: [{}],
    batiments: (partiel.feux ?? []).map((chantier) => ({ type: 'feuDeCamp', chantier }) as Batiment),
    batimentsDebloques: partiel.debloque === false ? [] : ['feuDeCamp'],
  } as unknown as Instantane;
}

describe('problemes', () => {
  it('rien à signaler dans un village nourri en été', () => {
    expect(problemes(village({}))).toEqual([]);
  });

  it('signale la faim', () => {
    expect(problemes(village({ faim: true }))).toEqual(['faim']);
  });

  it("signale le froid l'hiver tant qu'aucun feu n'est achevé", () => {
    expect(problemes(village({ saison: 'hiver' }))).toEqual(['froid']);
    expect(problemes(village({ saison: 'hiver', feux: [0.5] }))).toEqual(['froid']);
    expect(problemes(village({ saison: 'hiver', feux: [null] }))).toEqual([]);
  });

  it("ne signale pas le froid quand on ne sait pas encore bâtir de feu", () => {
    expect(problemes(village({ saison: 'hiver', debloque: false }))).toEqual([]);
  });
});
