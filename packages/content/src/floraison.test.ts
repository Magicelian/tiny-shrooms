// Critère de l'étape 8 : partie accélérée de zéro jusqu'à la floraison, avec un joueur scripté et sobre.
import { describe, expect, it } from 'vitest';
import { Moteur, PAS_PAR_MINUTE, type Evenement, type MessageDepuisMoteur, type TypeBatiment } from '@tiny-shrooms/engine';
import { contenu } from './index';

/** Ordre de construction ; un bâtiment encore verrouillé est repris plus tard. */
const PLAN: TypeBatiment[] = [
  'cueillette', 'tasDeBois', 'hutte', 'tapisDeMousse', 'hutte', 'feuDeCamp', 'cueillette', 'remise',
  'gardeManger', 'hutte', 'tasDeBois', 'sechoir', 'relais', 'hutte', 'feuDeCamp', 'cueillette',
  'tapisDeMousse', 'hutte', 'atelier', 'hutte', 'remise', 'cueillette', 'hutte',
];

function jouer(heuresMax: number) {
  const moteur = new Moteur(contenu, 0);
  const commander = (commande: Parameters<typeof moteur.recevoir>[0] & { type: 'commande' }) => moteur.recevoir(commande, 0);
  const aFaire = [...PLAN];
  const stades: Record<string, number> = {};
  let minute = 0;
  for (; minute < heuresMax * 60 && !moteur.etatCourant.arbreMere.floraisonPossible; minute++) {
    const evenements: Evenement[] = moteur.simuler(PAS_PAR_MINUTE);
    for (const e of evenements) if (e.type === 'stadeAtteint') stades[e.stade] = minute / 60;
    const etat = moteur.etatCourant;

    const i = aFaire.findIndex((b) => etat.batimentsDebloques.includes(b));
    const suivant = aFaire[i];
    const cout = suivant ? contenu.batiments[suivant].cout : {};
    const abordable = Object.entries(cout).every(([r, q]) => etat.stocks[r as keyof typeof etat.stocks] >= q);
    if (suivant && abordable && !etat.batiments.some((b) => b.chantier !== null)) {
      const [c] = moteur.casesLibres();
      const [m] = commander({ type: 'commande', commande: { type: 'poserBatiment', batiment: suivant, case: c!, orientation: 0 } });
      if (sansRefus(m)) aFaire.splice(i, 1);
    }
    if (aFaire.length === 0) {
      for (const village of ['outils', 'vitesse'] as const) {
        commander({ type: 'commande', commande: { type: 'ameliorer', cible: { village } } });
      }
    }
    for (const v of etat.visiteurs) {
      commander({ type: 'commande', commande: { type: 'repondreVisiteur', id: v.id, accepte: v.type !== 'herisson' } });
    }
    if (etat.stocks.spores >= 1) {
      commander({ type: 'commande', commande: { type: 'nourrirArbre', spores: Math.floor(etat.stocks.spores) } });
    }
  }
  return { moteur, heures: minute / 60, stades, reste: aFaire };
}

function sansRefus(message: MessageDepuisMoteur | undefined): boolean {
  return message?.type === 'instantane' && !message.evenements.some((e) => e.type === 'commandeRefusee');
}

describe('De zéro à la floraison', () => {
  it('atteint la floraison et la déclenche', { timeout: 120_000 }, () => {
    const { moteur, heures, stades, reste } = jouer(60);
    const etat = moteur.etatCourant;
    console.log(
      `floraison en ${heures.toFixed(1)} h`,
      Object.entries(stades).map(([s, h]) => `${s} ${h.toFixed(1)} h`).join(', '),
      `· ${etat.habitants.length} habitants, ${etat.batiments.length} bâtiments, améliorations ${JSON.stringify(etat.ameliorations)}`,
      reste.length ? `· non construits : ${reste.join(', ')}` : '',
    );
    expect(etat.arbreMere.floraisonPossible).toBe(true);
    // Cible du cahier des charges : 15 à 25 h de jeu ouvert, réglée à l'étape 10.
    expect(heures).toBeGreaterThan(10);
    expect(heures).toBeLessThan(30);
    const [m] = moteur.recevoir({ type: 'commande', commande: { type: 'fleurir' } }, 0);
    expect(m?.type === 'instantane' && m.evenements).toEqual([{ type: 'floraison' }]);
  });
});

