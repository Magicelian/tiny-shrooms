// Développement seulement : `/demo.html?graine=1&minutes=45` fait jouer le joueur scripté des tests,
// écrit la partie obtenue à la place de celle du navigateur, puis ouvre le jeu dessus.
import { contenu } from '@tiny-shrooms/content';
import { creerEtat, Moteur, serialiser } from '@tiny-shrooms/engine';
import { Joueur, PAS_PAR_SECONDE } from '../../../packages/content/src/joueur';

const parametres = new URLSearchParams(location.search);
const graine = Number(parametres.get('graine') ?? 1);
const minutes = Number(parametres.get('minutes') ?? 45);

const moteur = new Moteur(contenu, 0, creerEtat(contenu, graine));
const joueur = new Joueur(moteur);
for (let s = 0; s < minutes * 60; s += 5) {
  for (let n = 0; n < 20 && joueur.jouer(); n++);
  moteur.simuler(5 * PAS_PAR_SECONDE);
}
localStorage.setItem('tiny-shrooms.partie', serialiser(moteur.etatCourant));
location.replace('/');
