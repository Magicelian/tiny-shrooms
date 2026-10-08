// Critère de l'étape 18 : au bourg, l'offrande du sanctuaire débloque l'île suivante en ~1 h de jeu attentif ;
// la première île continue de vivre pendant qu'on bâtit la seconde, qui atteint le bourg plus vite.
import { describe, expect, it } from 'vitest';
import { BONUS_PRESTIGE, charger, coutBonus, creerPartie, Moteur, serialiser, type Commande, type Etat } from '@tiny-shrooms/engine';
import { contenu } from './index';
import { BOURG, Joueur, PAS_PAR_SECONDE } from './joueur';

const HEURES_MAX = 20;
// Écrit même quand le test passe (vitest tait `console.log`).
declare const process: { stderr: { write(texte: string): void } };

function commander(moteur: Moteur, commande: Commande): boolean {
  const message = moteur.recevoir({ type: 'commande', commande }, 0).find((m) => m.type === 'instantane');
  return message?.type === 'instantane' && !message.evenements.some((e) => e.type === 'commandeRefusee');
}

/** Dépense les graines : l'accueil des logements d'abord (la population fixe le rythme), puis le bonus le moins cher. */
function depenser(moteur: Moteur): void {
  const { prestige } = moteur.partieCourante;
  for (;;) {
    const prix = BONUS_PRESTIGE.map((b) => [b, coutBonus(contenu, b, prestige.bonus[b])] as const)
      .filter((x): x is readonly [(typeof BONUS_PRESTIGE)[number], number] => x[1] !== null && x[1] <= prestige.graines)
      .sort((a, b) => Number(b[0] === 'logement') - Number(a[0] === 'logement') || a[1] - b[1]);
    if (prix.length === 0 || !commander(moteur, { type: 'acheterBonus', bonus: prix[0]![0] })) return;
  }
}

describe('Archipel', () => {
  it.each([1, 2, 3])('graine %i : l’offrande débloque l’île 2 en ~1 h, qui atteint le bourg plus vite', (graine) => {
    const moteur = new Moteur(contenu, 0, creerPartie(contenu, graine));
    const joueur = new Joueur(moteur);
    const partie = moteur.partieCourante;
    const instants: number[] = [];
    let secondes = 0;
    let faimSurLaPremiere = 0;
    const jouer = () => {
      joueur.jouer();
      moteur.simuler(5 * PAS_PAR_SECONDE);
      secondes += 5;
      expect(secondes).toBeLessThan(HEURES_MAX * 3600);
    };
    while (moteur.etatCourant.palier < BOURG) jouer();
    instants.push(secondes);
    while (partie.iles.length < 2) jouer();
    instants.push(secondes);
    expect(partie.vue).toBe(1);
    const graines = partie.prestige.graines;
    expect(graines).toBeGreaterThan(0);
    depenser(moteur);
    while (moteur.etatCourant.palier < BOURG) {
      jouer();
      if ((partie.iles[0] as Etat).faim) faimSurLaPremiere++;
    }
    instants.push(secondes);
    const [bourg1, ile2, bourg2] = instants.map((s) => s / 60) as [number, number, number];
    const premiere = partie.iles[0]!;
    process.stderr.write(
      `graine ${graine} : bourg ${bourg1.toFixed(0)} min, île 2 ${(ile2 - bourg1).toFixed(0)} min plus tard (+${graines} graines), ` +
        `bourg de l'île 2 en ${(bourg2 - ile2).toFixed(0)} min ; île 1 : ${premiere.habitants.length} habitants (max ${premiere.populationMax}), ` +
        `faim ${((faimSurLaPremiere * 5) / 60).toFixed(0)} min\n`,
    );
    expect(ile2 - bourg1).toBeGreaterThan(30);
    expect(ile2 - bourg1).toBeLessThan(90);
    expect(bourg2 - ile2).toBeLessThan(bourg1);
    // La première île vit sans qu'on s'en occupe : elle garde l'essentiel de ses habitants.
    expect(premiere.habitants.length).toBeGreaterThan(premiere.populationMax * 0.8);
    // La sauvegarde garde les deux îles et le prestige.
    const relue = charger(serialiser(partie));
    expect(relue.iles).toHaveLength(2);
    expect(relue.prestige).toEqual(partie.prestige);
  }, 300_000);
});
