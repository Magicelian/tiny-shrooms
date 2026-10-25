// Critères des étapes 20 à 22, sur une même partie (jouer jusqu'à l'île 5 est long, on ne le fait qu'une fois) ;
// un fichier de test par graine (`iles-3-a-5-1.test.ts`…), pour que vitest les fasse tourner en parallèle.
// Prairie (île 3) : l'offrande de l'île 2, surtout en baies séchées, l'ouvre en ~1 h 30 de jeu attentif après le bourg
// de l'île 2 ; grâce aux ruches, chaque cueillette y produit plus que sur l'île 1, et la prairie à son bourg fait déjà
// plus de baies que l'île 1, pourtant plus peuplée.
// Grotte (île 4) : l'offrande de l'île 3, surtout en spores, l'ouvre en ~1 h 30 à 2 h après le bourg de la prairie ;
// grâce aux champignonnières, la grotte à son bourg fait au moins deux fois plus de spores que l'île 1.
// Futaie (île 5) : l'offrande de la grotte, surtout en bois mort, l'ouvre en ~1 h 30 à 2 h après le bourg de la grotte ;
// grâce aux scieries, la futaie à son bourg fait au moins deux fois plus de bois que l'île 1.
import { expect } from 'vitest';
import { creerPartie, multiplicateur, Moteur, offrande, rangLogement, RESSOURCES, type Etat } from '@tiny-shrooms/engine';
import { contenu } from './index';
import { BOURG, depenser, Joueur, PAS_PAR_SECONDE } from './joueur';

const HEURES_MAX = 60;
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

/** Bois mort que produiraient les bâtiments achevés de l'île, tous postes pourvus. */
function boisParMinute(etat: Etat): number {
  return etat.batiments
    .filter((b) => b.chantier === null)
    .reduce((somme, b) => {
      const def = contenu.batiments[b.type];
      return somme + (def.production?.boisMort ?? 0) * (def.postes ?? 1) * multiplicateur(b);
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

export const DUREE_MAX_MS = 3_600_000;

/** Joue une partie jusqu'au bourg de la futaie et vérifie les critères de la prairie, de la grotte, puis de la futaie. */
export function ilesTroisACinq(graine: number): void {
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

  // Minute où chaque ressource de l'offrande en cours est complète : dit laquelle fixe le rythme.
  const jusquAIle = (n: number, depuis: number) => {
    const remplies: string[] = [];
    const ile = partie.iles[n - 2]!;
    const minute = jusquA(() => {
      const o = partie.iles.length === n - 1 ? offrande(ile, contenu) : null;
      for (const r of RESSOURCES) {
        const fait = o && (o.objectif[r] ?? 0) > 0 && (o.depose[r] ?? 0) >= (o.objectif[r] ?? 0);
        if (fait && !remplies.some((x) => x.startsWith(r))) remplies.push(`${r} ${(secondes / 60 - depuis).toFixed(0)}`);
      }
      return partie.iles.length === n;
    });
    return { minute, remplies };
  };
  const { minute: ile4, remplies } = jusquAIle(4, bourg3);
  depenser(joueur);
  const bourg4 = jusquA(() => moteur.etatCourant.palier >= BOURG);
  const grotte = partie.iles[3]!;
  const champignonnieres = grotte.batiments.filter((b) => b.type === 'champignonniere').length;
  process.stderr.write(
    `graine ${graine} : île 4 ${(ile4 - bourg3).toFixed(0)} min après le bourg de la prairie, son bourg en ${(bourg4 - ile4).toFixed(0)} min ; ` +
      `spores/min : île 1 ${sporesParMinute(premiere).toFixed(0)} (${premiere.habitants.length} habitants), ` +
      `grotte ${sporesParMinute(grotte).toFixed(0)} (${grotte.habitants.length} habitants, ${champignonnieres} champignonnières) ; ` +
      `faim sur l'archipel : ${partie.iles.filter((e) => e.faim).length} île(s) ; offrande remplie (min) : ${remplies.join(', ')}\n`,
  );
  expect(grotte.ile.biome).toBe('grotte');
  expect(ile4 - bourg3).toBeGreaterThan(60);
  expect(ile4 - bourg3).toBeLessThan(150);
  expect(champignonnieres).toBeGreaterThan(0);
  expect(sporesParMinute(grotte)).toBeGreaterThan(sporesParMinute(premiere) * 2);

  const { minute: ile5, remplies: remplies5 } = jusquAIle(5, bourg4);
  depenser(joueur);
  const bourg5 = jusquA(() => moteur.etatCourant.palier >= BOURG);
  const futaie = partie.iles[4]!;
  const scieries = futaie.batiments.filter((b) => b.type === 'scierie').length;
  process.stderr.write(
    `graine ${graine} : île 5 ${(ile5 - bourg4).toFixed(0)} min après le bourg de la grotte, son bourg en ${(bourg5 - ile5).toFixed(0)} min ; ` +
      `bois/min : île 1 ${boisParMinute(premiere).toFixed(0)}, futaie ${boisParMinute(futaie).toFixed(0)} ` +
      `(${futaie.habitants.length} habitants, ${scieries} scieries) ; ` +
      `faim sur l'archipel : ${partie.iles.filter((e) => e.faim).length} île(s) ; offrande remplie (min) : ${remplies5.join(', ')}\n`,
  );
  expect(futaie.ile.biome).toBe('futaie');
  expect(ile5 - bourg4).toBeGreaterThan(60);
  expect(ile5 - bourg4).toBeLessThan(150);
  expect(scieries).toBeGreaterThan(0);
  expect(boisParMinute(futaie)).toBeGreaterThan(boisParMinute(premiere) * 2);
}
