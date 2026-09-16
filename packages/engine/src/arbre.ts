// Arbre-mère : croissance par stades, déblocages, floraison ; améliorations du village achetées à l'atelier.
import type { AmeliorationVillage, ArbreMere, Evenement, Quantites, RaisonRefus } from './contrat';
import { RESSOURCES, STADES_ARBRE } from './contrat';
import type { Contenu } from './contenu';
import type { Etat } from './etat';

/** Ce que la sauvegarde retient de l'arbre ; le reste se déduit. */
export type ArbreEtat = Pick<ArbreMere, 'stade' | 'avancement' | 'floraisonPossible' | 'floraisons'>;

/** Spores nécessaires pour quitter le stade courant, `null` au dernier stade. */
function seuil(arbre: ArbreEtat, contenu: Contenu): number | null {
  return arbre.stade === 'floraison' ? null : contenu.arbreMere.sporesParStade[arbre.stade];
}

/**
 * Donne des spores à l'arbre, en franchissant autant de stades que nécessaire.
 * Renvoie la quantité absorbée : rien au dernier stade.
 */
export function donnerSpores(etat: Etat, contenu: Contenu, quantite: number, evenements: Evenement[]): number {
  const arbre = etat.arbreMere;
  let reste = quantite;
  for (let s = seuil(arbre, contenu); s !== null && reste > 0; s = seuil(arbre, contenu)) {
    const pris = Math.min(reste, (1 - arbre.avancement) * s);
    reste -= pris;
    arbre.avancement += pris / s;
    if (arbre.avancement < 1 - 1e-9) break;
    arbre.stade = STADES_ARBRE[STADES_ARBRE.indexOf(arbre.stade) + 1]!;
    arbre.avancement = 0;
    const debloques = (contenu.arbreMere.deblocages[arbre.stade] ?? []).filter((b) => !etat.batimentsDebloques.includes(b));
    etat.batimentsDebloques.push(...debloques);
    if (arbre.stade === 'floraison') arbre.floraisonPossible = true;
    evenements.push({ type: 'stadeAtteint', stade: arbre.stade, debloques });
  }
  return quantite - reste;
}

export function fleurir(etat: Etat): RaisonRefus | null {
  if (!etat.arbreMere.floraisonPossible) return 'indisponible';
  etat.arbreMere.floraisonPossible = false;
  etat.arbreMere.floraisons++;
  return null;
}

/** Étendue du mycélium : part des spores apportées sur l'ensemble des stades. */
export function mycelium(arbre: ArbreEtat, contenu: Contenu): number {
  const seuils = Object.values(contenu.arbreMere.sporesParStade);
  const total = seuils.reduce((a, b) => a + b, 0);
  let donne = 0;
  for (const stade of STADES_ARBRE) {
    if (stade === arbre.stade) break;
    donne += contenu.arbreMere.sporesParStade[stade as keyof typeof contenu.arbreMere.sporesParStade];
  }
  donne += arbre.avancement * (seuil(arbre, contenu) ?? 0);
  return total > 0 ? Math.min(1, donne / total) : 1;
}

export function sporesRestantes(arbre: ArbreEtat, contenu: Contenu): number {
  const s = seuil(arbre, contenu);
  return s === null ? 0 : Math.max(0, Math.ceil((1 - arbre.avancement) * s - 1e-6));
}

// ─── Améliorations ───────────────────────────────────────────────────────────

/** Coût du prochain niveau, ou `null` si le niveau maximal est atteint. */
export function coutAmelioration(contenu: Contenu, amelioration: AmeliorationVillage, niveau: number): Quantites | null {
  const def = contenu.ameliorations[amelioration];
  if (niveau >= def.niveauMax) return null;
  const cout: Quantites = {};
  for (const r of RESSOURCES) {
    if (def.cout[r] !== undefined) cout[r] = Math.round(def.cout[r] * def.hausseCout ** niveau);
  }
  return cout;
}

/** Multiplicateur apporté par une amélioration (1 au niveau 0). */
export function effetAmelioration(etat: Etat, contenu: Contenu, amelioration: AmeliorationVillage): number {
  return 1 + contenu.ameliorations[amelioration].effet * etat.ameliorations[amelioration];
}
