// Critères des étapes 20 et 21, sur une même partie (jouer jusqu'à l'île 4 est long, on ne le fait qu'une fois).
// Prairie (île 3) : l'offrande de l'île 2, surtout en baies séchées, l'ouvre en ~1 h 30 de jeu attentif après le bourg
// de l'île 2 ; grâce aux ruches, chaque cueillette y produit plus que sur l'île 1, et la prairie à son bourg fait déjà
// plus de baies que l'île 1, pourtant plus peuplée.
// Grotte (île 4) : l'offrande de l'île 3, surtout en spores, l'ouvre en ~1 h 30 à 2 h après le bourg de la prairie ;
// grâce aux champignonnières, la grotte à son bourg fait au moins deux fois plus de spores que l'île 1.
import { describe, expect, it } from 'vitest';
import { creerPartie, multiplicateur, Moteur, rangLogement, type Etat } from '@tiny-shrooms/engine';
import { contenu } from './index';
import { BOURG, depenser, Joueur, PAS_PAR_SECONDE } from './joueur';

const HEURES_MAX = 45;
// Écrit même quand le test passe (vitest tait `console.log`).
declare const process: { stderr: { write(texte: string): void } };

/** Baies que produiraient les bâtiments achevés de l'île, tous postes pourvus, ruches comprises. */
function baiesParMinute(etat: Etat): number {
  return etat.batiments
    .filter((b) => b.chantier === null)
    .reduce((somme, b) => {
      const def = contenu.batiments[b.type];
      return somme + (def.production?.baies ?? 0) * (def.postes ?? 1) * multiplicateur(b);
    }, 0);
}

/** Spores que donneraient les logements pleins et les bâtiments achevés de l'île, tous postes pourvus. */
function sporesParMinute(etat: Etat): number {
  return etat.batiments
    .filter((b) => b.chantier === null)
    .reduce((somme, b) => {
      const def = contenu.batiments[b.type];
      const rang = rangLogement(contenu, b);
      return somme + (def.production?.spores ?? 0) * (def.postes ?? 1) * multiplicateur(b) + (rang ? rang.sporesParMinute * rang.places : 0);
    }, 0);
}

describe('Prairie puis grotte', () => {
  it.each([1, 2, 3])('graine %i : la prairie, riche en baies, puis la grotte, riche en spores', (graine) => {
    const moteur = new Moteur(contenu, 0, creerPartie(contenu, graine));
    const joueur = new Joueur(moteur);
    const partie = moteur.partieCourante;
    let secondes = 0;
    const jouer = () => {
      joueur.jouer();
      moteur.simuler(5 * PAS_PAR_SECONDE);
      secondes += 5;
      expect(secondes).toBeLessThan(HEURES_MAX * 3600);
    };
    const jusquA = (fini: () => boolean) => {
      while (!fini()) jouer();
      return secondes / 60;
    };
    jusquA(() => partie.iles.length === 2);
    depenser(joueur);
    const bourg2 = jusquA(() => moteur.etatCourant.palier >= BOURG);
    const ile3 = jusquA(() => partie.iles.length === 3);
    depenser(joueur);
    const bourg3 = jusquA(() => moteur.etatCourant.palier >= BOURG);
    const [premiere, marais, prairie] = partie.iles as [Etat, Etat, Etat];
    const ruches = prairie.batiments.filter((b) => b.type === 'ruche').length;
    const parCueillette = (e: Etat) => baiesParMinute(e) / e.batiments.filter((b) => b.type === 'cueillette' && b.chantier === null).length;
    process.stderr.write(
      `graine ${graine} : île 3 ${(ile3 - bourg2).toFixed(0)} min après le bourg de l'île 2, son bourg en ${(bourg3 - ile3).toFixed(0)} min ; ` +
        `baies/min : île 1 ${baiesParMinute(premiere).toFixed(0)}, marais ${baiesParMinute(marais).toFixed(0)}, ` +
        `prairie ${baiesParMinute(prairie).toFixed(0)} (${ruches} ruches) ; par cueillette : île 1 ${parCueillette(premiere).toFixed(1)}, ` +
        `prairie ${parCueillette(prairie).toFixed(1)} ; séchoirs île 2 : ${marais.batiments.filter((b) => b.type === 'sechoir').length}\n`,
    );
    expect(prairie.ile.biome).toBe('prairie');
    expect(ile3 - bourg2).toBeGreaterThan(60);
    expect(ile3 - bourg2).toBeLessThan(150);
    expect(ruches).toBeGreaterThan(0);
    expect(parCueillette(prairie)).toBeGreaterThan(parCueillette(premiere) * 1.5);
    expect(baiesParMinute(prairie)).toBeGreaterThan(baiesParMinute(premiere));

    const ile4 = jusquA(() => partie.iles.length === 4);
    depenser(joueur);
    const bourg4 = jusquA(() => moteur.etatCourant.palier >= BOURG);
    const grotte = partie.iles[3]!;
    const champignonnieres = grotte.batiments.filter((b) => b.type === 'champignonniere').length;
    process.stderr.write(
      `graine ${graine} : île 4 ${(ile4 - bourg3).toFixed(0)} min après le bourg de la prairie, son bourg en ${(bourg4 - ile4).toFixed(0)} min ; ` +
        `spores/min : île 1 ${sporesParMinute(premiere).toFixed(0)} (${premiere.habitants.length} habitants), ` +
        `grotte ${sporesParMinute(grotte).toFixed(0)} (${grotte.habitants.length} habitants, ${champignonnieres} champignonnières) ; ` +
        `faim sur l'archipel : ${partie.iles.filter((e) => e.faim).length} île(s)\n`,
    );
    expect(grotte.ile.biome).toBe('grotte');
    expect(ile4 - bourg3).toBeGreaterThan(60);
    expect(ile4 - bourg3).toBeLessThan(150);
    expect(champignonnieres).toBeGreaterThan(0);
    expect(sporesParMinute(grotte)).toBeGreaterThan(sporesParMinute(premiere) * 2);
  }, 3_600_000);
});
