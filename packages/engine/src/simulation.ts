// Règles du jeu : un pas de simulation, les commandes et la vue publiée de l'état.
import type { Commande, Evenement, Instantane, Priorites, Quantites, Ressource, Stock } from './contrat';
import { RESSOURCES, SAISONS, TACHES } from './contrat';
import type { Contenu } from './contenu';
import { plafonds, type Etat } from './etat';
import { PAS_DE_SIMULATION_MS, PAS_PAR_MINUTE } from './temps';

type Flux = Record<Ressource, number>;

function fluxNul(): Flux {
  return { baies: 0, baiesSechees: 0, boisMort: 0, mousse: 0, spores: 0 };
}

/** Variation nette de chaque stock par minute, selon ce qui est disponible maintenant. */
function fluxParMinute(etat: Etat, contenu: Contenu, max: Record<Ressource, number>): Flux {
  const flux = fluxNul();
  flux.spores += contenu.arbreMere.sporesParMinute;
  for (const b of etat.batiments) {
    if (b.chantier !== null) continue;
    const def = contenu.batiments[b.type];
    if (!def.production) continue;
    const produits = cles(def.production);
    // Rien ne se perd : un atelier dont toutes les sorties sont pleines s'arrête.
    if (produits.every((r) => etat.stocks[r] >= max[r])) continue;
    let part = 1;
    for (const r of cles(def.consommation ?? {})) {
      const besoinParPas = (def.consommation![r] ?? 0) / PAS_PAR_MINUTE;
      part = Math.min(part, besoinParPas > 0 ? etat.stocks[r] / besoinParPas : 1);
    }
    for (const r of cles(def.consommation ?? {})) flux[r] -= (def.consommation![r] ?? 0) * part;
    for (const r of produits) flux[r] += (def.production[r] ?? 0) * part * b.bonusVoisinage;
  }
  return flux;
}

export function avancer(etat: Etat, contenu: Contenu): Evenement[] {
  const evenements: Evenement[] = [];
  etat.pas++;

  for (const b of etat.batiments) {
    if (b.chantier === null) continue;
    const pasNecessaires = (contenu.batiments[b.type].constructionSecondes * 1000) / PAS_DE_SIMULATION_MS;
    b.chantier = pasNecessaires > 0 ? b.chantier + 1 / pasNecessaires : 1;
    if (b.chantier >= 1 - 1e-9) {
      b.chantier = null;
      evenements.push({ type: 'constructionTerminee', id: b.id });
    }
  }

  const max = plafonds(etat, contenu);
  const flux = fluxParMinute(etat, contenu, max);
  const pleins: Ressource[] = [];
  for (const r of RESSOURCES) {
    const avant = etat.stocks[r];
    const apres = avant + flux[r] / PAS_PAR_MINUTE;
    // Un plafond abaissé (démolition) ne retire rien : il bloque seulement les gains.
    etat.stocks[r] = flux[r] >= 0 ? Math.min(apres, Math.max(max[r], avant)) : Math.max(0, apres);
    if (etat.stocks[r] >= max[r]) {
      pleins.push(r);
      if (!etat.stocksPleins.includes(r)) evenements.push({ type: 'stockPlein', ressource: r });
    }
  }
  etat.stocksPleins = pleins;
  return evenements;
}

export function appliquerCommande(etat: Etat, contenu: Contenu, commande: Commande): Evenement[] {
  const refus = (raison: Extract<Evenement, { type: 'commandeRefusee' }>['raison']): Evenement[] => [
    { type: 'commandeRefusee', commande, raison },
  ];

  switch (commande.type) {
    case 'poserBatiment': {
      // Le contrôle de l'emplacement arrive avec la grille (étape 2).
      if (!etat.batimentsDebloques.includes(commande.batiment)) return refus('nonDebloque');
      const def = contenu.batiments[commande.batiment];
      if (!payer(etat, def.cout)) return refus('ressourcesInsuffisantes');
      etat.batiments.push({
        id: etat.prochainId++,
        type: commande.batiment,
        case: { ...commande.case },
        orientation: commande.orientation,
        niveau: 1,
        chantier: def.constructionSecondes > 0 ? 0 : null,
        bonusVoisinage: 1,
      });
      return [];
    }
    case 'deplacerBatiment': {
      const b = etat.batiments.find((x) => x.id === commande.id);
      if (!b) return refus('introuvable');
      b.case = { ...commande.case };
      b.orientation = commande.orientation;
      return [];
    }
    case 'demolir': {
      const i = etat.batiments.findIndex((x) => x.id === commande.id);
      if (i < 0) return refus('introuvable');
      const [b] = etat.batiments.splice(i, 1);
      const cout = contenu.batiments[b!.type].cout;
      for (const r of cles(cout)) etat.stocks[r] += (cout[r] ?? 0) * contenu.remboursementDemolition;
      return [];
    }
    case 'reglerPriorites': {
      const priorites = {} as Priorites;
      for (const t of TACHES) priorites[t] = Math.min(1, Math.max(0, commande.priorites[t]));
      etat.priorites = priorites;
      return [];
    }
    case 'modifierReglage': {
      (etat.reglages as unknown as Record<string, unknown>)[commande.cle] = commande.valeur;
      return [];
    }
    // Habitants, visiteurs, arbre-mère et améliorations arrivent aux étapes suivantes.
    case 'ameliorer':
    case 'epinglerHabitant':
    case 'repondreVisiteur':
    case 'nourrirArbre':
    case 'fleurir':
      return refus('indisponible');
  }
}

function payer(etat: Etat, cout: Quantites): boolean {
  const ressources = cles(cout);
  if (ressources.some((r) => etat.stocks[r] < (cout[r] ?? 0))) return false;
  for (const r of ressources) etat.stocks[r] -= cout[r] ?? 0;
  return true;
}

export function instantane(etat: Etat, contenu: Contenu, enPause: boolean): Instantane {
  const max = plafonds(etat, contenu);
  const flux = fluxParMinute(etat, contenu, max);
  const stocks = {} as Record<Ressource, Stock>;
  for (const r of RESSOURCES) {
    stocks[r] = { quantite: etat.stocks[r], plafond: max[r], productionParMinute: flux[r] };
  }
  const minutes = etat.pas / PAS_PAR_MINUTE;
  const { minutesParSaison, minutesParJour } = contenu.temps;
  const saisons = Math.floor(minutes / minutesParSaison);
  return {
    temps: {
      pas: etat.pas,
      annee: Math.floor(saisons / SAISONS.length) + 1,
      saison: SAISONS[saisons % SAISONS.length]!,
      avancementSaison: (minutes % minutesParSaison) / minutesParSaison,
      heure: (minutes % minutesParJour) / minutesParJour,
      meteo: 'soleil',
      enPause,
    },
    stocks,
    batiments: etat.batiments.map((b) => ({ ...b, case: { ...b.case } })),
    habitants: [],
    priorites: { ...etat.priorites },
    arbreMere: { ...etat.arbreMere },
    visiteurs: [],
    bonus: [],
    batimentsDebloques: [...etat.batimentsDebloques],
    ameliorations: { vitesse: 0, outils: 0 },
    reglages: { ...etat.reglages },
  };
}

function cles(quantites: Quantites): Ressource[] {
  return RESSOURCES.filter((r) => quantites[r] !== undefined);
}
