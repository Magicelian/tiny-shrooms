// Critère de l'étape 14 : un joueur scripté renaît deux fois ; grâce aux bonus, chaque bourg arrive
// nettement plus vite que le précédent, et le prestige survit à la sauvegarde.
import { describe, expect, it } from 'vitest';
import { BONUS_PRESTIGE, charger, coutBonus, creerEtat, Moteur, serialiser, type Commande, type Etat } from '@tiny-shrooms/engine';
import { contenu } from './index';
import { BOURG, Joueur, PAS_PAR_SECONDE } from './joueur';

const HEURES_MAX = 20;
/** Après le bourg, le joueur laisse grandir la ville avant de renaître. */
const MINUTES_APRES_BOURG = 30;

function commander(moteur: Moteur, commande: Commande): boolean {
  const message = moteur.recevoir({ type: 'commande', commande }, 0).find((m) => m.type === 'instantane');
  return message?.type === 'instantane' && !message.evenements.some((e) => e.type === 'commandeRefusee');
}

/** Dépense les graines : l'accueil des logements d'abord (la population fixe le rythme), puis le bonus le moins cher. */
function depenser(moteur: Moteur): void {
  const etat = moteur.etatCourant;
  for (;;) {
    const prix = BONUS_PRESTIGE.map((b) => [b, coutBonus(contenu, b, etat.prestige.bonus[b])] as const)
      .filter((x): x is readonly [(typeof BONUS_PRESTIGE)[number], number] => x[1] !== null && x[1] <= etat.prestige.graines)
      .sort((a, b) => Number(b[0] === 'logement') - Number(a[0] === 'logement') || a[1] - b[1]);
    if (prix.length === 0 || !commander(moteur, { type: 'acheterBonus', bonus: prix[0]![0] })) return;
  }
}

/** Joue jusqu'au bourg ; renvoie la durée en secondes de jeu. */
function jusquAuBourg(moteur: Moteur, joueur: Joueur): number {
  let secondes = 0;
  for (; secondes < HEURES_MAX * 3600 && moteur.etatCourant.palier < BOURG; secondes += 5) {
    joueur.jouer();
    moteur.simuler(5 * PAS_PAR_SECONDE);
  }
  return secondes;
}

describe('Renaissances successives', () => {
  it.each([1, 2])('graine %i : chaque bourg arrive plus vite que le précédent', (graine) => {
    const moteur = new Moteur(contenu, 0, creerEtat(contenu, graine));
    const joueur = new Joueur(moteur);
    const etat = moteur.etatCourant as Etat;
    const durees: number[] = [];
    const gains: number[] = [];
    for (let partie = 0; partie < 3; partie++) {
      durees.push(jusquAuBourg(moteur, joueur));
      expect(etat.palier).toBe(BOURG);
      if (partie === 2) break;
      // Le joueur continue de jouer, pose le sanctuaire dès qu'il le peut, puis renaît.
      let sanctuaire = false;
      for (let s = 0; s < MINUTES_APRES_BOURG * 60 || !etat.batiments.some((b) => b.type === 'sanctuaire' && b.chantier === null); s += 5) {
        if (!sanctuaire) sanctuaire = joueur.poser('sanctuaire') || (joueur.faireDeLaPlace() && false);
        if (sanctuaire) joueur.jouer();
        moteur.simuler(5 * PAS_PAR_SECONDE);
        expect(s).toBeLessThan(HEURES_MAX * 3600);
      }
      const avant = etat.prestige.graines;
      expect(commander(moteur, { type: 'renaitre' })).toBe(true);
      gains.push(etat.prestige.graines - avant);
      depenser(moteur);
      // La sauvegarde garde le prestige tel quel.
      expect(charger(serialiser(etat)).prestige).toEqual(etat.prestige);
    }
    console.log(
      `graine ${graine} : bourg en ${durees.map((d) => `${(d / 60).toFixed(0)} min`).join(' → ')} ; graines ${gains.join(' + ')} ; bonus ${JSON.stringify(etat.prestige.bonus)}`,
    );
    expect(etat.prestige.renaissances).toBe(2);
    expect(durees[1]!).toBeLessThan(durees[0]! * 0.9);
    expect(durees[2]!).toBeLessThan(durees[1]!);
  }, 180_000);
});
