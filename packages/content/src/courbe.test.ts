// Courbe de l'étape 16 : ce que voit un joueur attentif et un joueur distrait, qui ne regarde l'île que de temps en temps.
import { describe, expect, it } from 'vitest';
import { creerEtat, Moteur } from '@tiny-shrooms/engine';
import { contenu } from './index';
import { BOURG, Joueur, PAS_PAR_SECONDE } from './joueur';

const HEURES_MAX = 8;
// Écrit même quand le test passe (vitest tait `console.log`).
declare const process: { stderr: { write(texte: string): void } };

interface Profil {
  nom: string;
  /** Secondes entre deux visites, selon le temps de jeu écoulé. */
  intervalle: (secondes: number) => number;
}

const PROFILS: Profil[] = [
  { nom: 'attentif', intervalle: () => 5 },
  // Regarde de près le premier quart d'heure, puis jette un œil toutes les 10 minutes.
  { nom: 'distrait', intervalle: (s) => (s < 15 * 60 ? 5 : 600) },
];

/** Nouveautés visibles : paliers, premier bâtiment achevé de chaque type, premier logement de chaque rang, niveaux d'atelier. */
function nouveautes(moteur: Moteur): string[] {
  const etat = moteur.etatCourant;
  const cles = contenu.paliers.slice(1, etat.palier + 1).map((p) => `palier ${p.nom}`);
  for (const b of etat.batiments) {
    if (b.chantier !== null) continue;
    cles.push(b.type);
    if (b.type === 'hutte') for (let n = 2; n <= b.niveau; n++) cles.push(`rang ${n}`);
  }
  const { vitesse, outils } = etat.ameliorations;
  for (let n = 1; n <= vitesse + outils; n++) cles.push(`atelier ${n}`);
  return cles;
}

function jouer(graine: number, profil: Profil) {
  const moteur = new Moteur(contenu, 0, creerEtat(contenu, graine));
  const joueur = new Joueur(moteur);
  const vus = new Set<string>();
  const jalons: [number, string][] = [];
  let secondes = 0;
  let prochaineVisite = 0;
  while (secondes < HEURES_MAX * 3600 && moteur.etatCourant.palier < BOURG) {
    if (secondes >= prochaineVisite) {
      // Une visite : le joueur lance tout ce qu'il peut (deux chantiers au plus à la fois).
      for (let n = 0; n < 20 && joueur.jouer(); n++);
      prochaineVisite = secondes + profil.intervalle(secondes);
    }
    moteur.simuler(5 * PAS_PAR_SECONDE);
    for (const cle of nouveautes(moteur)) {
      if (vus.has(cle)) continue;
      vus.add(cle);
      jalons.push([secondes, cle]);
    }
    secondes += 5;
  }
  const ecarts = jalons.map(([s], i) => s - (i > 0 ? jalons[i - 1]![0] : 0));
  return { secondes, bourg: secondes, jalons, ecartMax: Math.max(...ecarts), population: moteur.etatCourant.habitants.length };
}

const duree = (s: number) => `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`;

describe('Courbe de progression', () => {
  it.each(PROFILS.flatMap((p) => [1, 2, 3].map((g) => [p.nom, g, p] as const)))('%s, graine %i', (_, graine, profil) => {
    const r = jouer(graine, profil);
    process.stderr.write(
      `${profil.nom} ${graine} : bourg à ${duree(r.bourg)}, plus long creux ${duree(r.ecartMax)}\n  ` +
        r.jalons.map(([s, c]) => `${duree(s)} ${c}`).join(' · ') + "\n",
    );
    // Cible de l'étape 16 : jamais de fin, mais toujours du neuf. Le joueur attentif met plus d'une heure et quart,
    // le distrait une demi-journée de travail, sans jamais attendre plus de 1 h 30 une nouveauté.
    if (profil.nom === 'attentif') expect(r.secondes).toBeGreaterThan(1.25 * 3600);
    else {
      expect(r.secondes).toBeGreaterThan(2.5 * 3600);
      expect(r.secondes).toBeLessThan(6 * 3600);
      expect(r.ecartMax).toBeLessThanOrEqual(90 * 60);
    }
  }, 300_000);
});
