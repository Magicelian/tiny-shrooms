// État complet de la partie : sérialisable tel quel, seul le moteur le modifie.
import type { ArbreMere, Batiment, Priorites, Reglages, Ressource, TypeBatiment } from './contrat';
import { RESSOURCES } from './contrat';
import type { Contenu } from './contenu';

export interface Etat {
  pas: number;
  graine: number;
  stocks: Record<Ressource, number>;
  batiments: Batiment[];
  prochainId: number;
  batimentsDebloques: TypeBatiment[];
  priorites: Priorites;
  arbreMere: ArbreMere;
  reglages: Reglages;
  /** Ressources dont le stock était plein au pas précédent, pour n'annoncer `stockPlein` qu'une fois. */
  stocksPleins: Ressource[];
}

export function creerEtat(contenu: Contenu, graine = 1): Etat {
  return {
    pas: 0,
    graine,
    stocks: { ...contenu.stocksDeDepart },
    batiments: [],
    prochainId: 1,
    batimentsDebloques: [...contenu.batimentsDeDepart],
    priorites: { recolter: 0.5, construire: 0.5, stocker: 0.5, soignerArbre: 0.5 },
    arbreMere: { stade: 'pousse', avancement: 0, mycelium: 0, floraisonPossible: false },
    reglages: {
      langue: 'fr',
      sonActive: false,
      volume: 0.5,
      opacite: 1,
      toujoursAuDessus: true,
      lancementAuDemarrage: false,
    },
    stocksPleins: [],
  };
}

export function plafonds(etat: Etat, contenu: Contenu): Record<Ressource, number> {
  const resultat = { ...contenu.plafondsDeBase };
  for (const b of etat.batiments) {
    if (b.chantier !== null) continue;
    const stockage = contenu.batiments[b.type].stockage ?? {};
    for (const r of RESSOURCES) resultat[r] += stockage[r] ?? 0;
  }
  return resultat;
}
