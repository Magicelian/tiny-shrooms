import { describe, expect, it } from 'vitest';
import type { Contenu } from './contenu';
import type { Batiment, Saison } from './contrat';
import { problemes, problemesDe, type VueProblemes } from './problemes';

/** Juste ce que lit `problemesDe`. */
const contenu = { habitants: { depart: { seuil: 0.5, delaiSecondes: 90, minimum: 1 } } } as unknown as Contenu;

function village(partiel: { faim?: boolean; saison?: Saison; feux?: (number | null)[]; debloque?: boolean; bienEtre?: number[] }): [VueProblemes, Saison] {
  const ile: VueProblemes = {
    faim: partiel.faim ?? false,
    habitants: (partiel.bienEtre ?? [1]).map((bienEtre) => ({ bienEtre })),
    batiments: (partiel.feux ?? []).map((chantier) => ({ type: 'feuDeCamp', chantier }) as Batiment),
    batimentsDebloques: partiel.debloque === false ? [] : ['feuDeCamp'],
  };
  return [ile, partiel.saison ?? 'ete'];
}

describe('problemes', () => {
  it('signale les départs quand le bonheur moyen passe sous le seuil', () => {
    expect(problemesDe(...village({ bienEtre: [0.3, 0.6] }), contenu)).toEqual(['malheur']);
    expect(problemesDe(...village({ bienEtre: [0.5, 0.6] }), contenu)).toEqual([]);
    // Au minimum, plus personne ne part.
    expect(problemesDe(...village({ bienEtre: [0.1] }), contenu)).toEqual([]);
  });

  it('rien à signaler dans un village nourri en été', () => {
    expect(problemesDe(...village({}), contenu)).toEqual([]);
  });

  it('signale la faim', () => {
    expect(problemesDe(...village({ faim: true }), contenu)).toEqual(['faim']);
  });

  it("signale le froid l'hiver tant qu'aucun feu n'est achevé", () => {
    expect(problemesDe(...village({ saison: 'hiver' }), contenu)).toEqual(['froid']);
    expect(problemesDe(...village({ saison: 'hiver', feux: [0.5] }), contenu)).toEqual(['froid']);
    expect(problemesDe(...village({ saison: 'hiver', feux: [null] }), contenu)).toEqual([]);
  });

  it("ne signale pas le froid quand on ne sait pas encore bâtir de feu", () => {
    expect(problemesDe(...village({ saison: 'hiver', debloque: false }), contenu)).toEqual([]);
  });

  it('réunit les problèmes de toutes les îles, sans doublon', () => {
    const iles = [['malheur', 'faim'], [], ['faim', 'froid']].map((p) => ({ palier: 0, habitants: 1, problemes: p }));
    expect(problemes({ iles } as Parameters<typeof problemes>[0])).toEqual(['faim', 'froid', 'malheur']);
  });
});
