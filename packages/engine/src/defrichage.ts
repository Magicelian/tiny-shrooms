// Défrichage : arbres, buissons sauvages et plantes qu'on paie pour faire arracher, comme un chantier.
// Une case défrichée redevient de l'herbe constructible ; l'île change, le frontend reçoit la nouvelle.
import type { Case, Defrichable, Evenement, Ile, RaisonRefus } from './contrat';
import { RESSOURCES } from './contrat';
import type { Contenu } from './contenu';
import { plafonds, type Etat } from './etat';
import { payer } from './ameliorations';
import { majBonusVoisinage } from './grille';
import { elementEn, terrainEn } from './ile';
import { PAS_DE_SIMULATION_MS } from './temps';

/** Ce qu'on arracherait sur cette case, ou `null` s'il n'y a rien à défricher. */
export function natureEn(ile: Ile, c: Case): Defrichable | null {
  const terrain = terrainEn(ile, c.x, c.y);
  if (terrain === 'foret') return 'arbre';
  if (terrain === 'buisson') return 'buisson';
  if (terrain === 'herbe' && elementEn(ile, c.x, c.y) >= 0) return 'plante';
  return null;
}

export function memeCase(a: Case, b: Case): boolean {
  return a.x === b.x && a.y === b.y;
}

export function demanderDefrichage(etat: Etat, contenu: Contenu, c: Case): RaisonRefus | null {
  const nature = natureEn(etat.ile, c);
  if (!nature) return 'introuvable';
  if (etat.defrichages.some((d) => memeCase(d.case, c))) return 'indisponible';
  if (!payer(etat, contenu.defrichage[nature].cout)) return 'ressourcesInsuffisantes';
  etat.defrichages.push({ case: { ...c }, nature, avancement: 0 });
  return null;
}

/** Fait avancer le défrichage d'une case d'un pas ; une fois fini, la case redevient de l'herbe. */
export function avancerDefrichage(etat: Etat, contenu: Contenu, c: Case, cadence: number, evenements: Evenement[]): void {
  const i = etat.defrichages.findIndex((d) => memeCase(d.case, c));
  const d = etat.defrichages[i];
  if (!d) return;
  const def = contenu.defrichage[d.nature];
  const pasNecessaires = (def.secondes * 1000) / PAS_DE_SIMULATION_MS;
  d.avancement = pasNecessaires > 0 ? d.avancement + cadence / pasNecessaires : 1;
  if (d.avancement < 1 - 1e-9) return;

  etat.defrichages.splice(i, 1);
  const { ile } = etat;
  ile.terrain[c.y * ile.largeur + c.x] = 'herbe';
  // L'élément disparaît avec sa repousse ; les indices suivants se décalent.
  const element = elementEn(ile, c.x, c.y);
  if (element >= 0) {
    ile.elements.splice(element, 1);
    etat.pousses.splice(element, 1);
  }
  const max = plafonds(etat, contenu);
  for (const r of RESSOURCES) {
    const gain = def.gain?.[r] ?? 0;
    if (gain > 0) etat.stocks[r] = Math.max(etat.stocks[r], Math.min(max[r], etat.stocks[r] + gain));
  }
  majBonusVoisinage(etat, contenu);
  evenements.push({ type: 'defriche', case: { ...c }, nature: d.nature });
}
