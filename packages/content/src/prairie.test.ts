// Critère de l'étape 20 : l'île 3 est une prairie fleurie. L'offrande de l'île 2, surtout en baies séchées, l'ouvre en
// ~1 h 30 de jeu attentif après le bourg de l'île 2 ; grâce aux ruches, chaque cueillette y produit plus que sur
// l'île 1, et la prairie à son bourg fait déjà plus de baies que l'île 1, pourtant plus peuplée.
import { describe, expect, it } from 'vitest';
import { creerPartie, multiplicateur, Moteur, type Etat } from '@tiny-shrooms/engine';
import { contenu } from './index';
import { BOURG, depenser, Joueur, PAS_PAR_SECONDE } from './joueur';

const HEURES_MAX = 30;
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

describe('Prairie', () => {
  it.each([1, 2, 3])('graine %i : l’offrande de l’île 2 ouvre la prairie, riche en baies', (graine) => {
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
    expect(parCueillette(prairie)).toBeGreaterThan(parCueillette(premiere) * 1.25);
    expect(baiesParMinute(prairie)).toBeGreaterThan(baiesParMinute(premiere));
  }, 1_800_000);
});
