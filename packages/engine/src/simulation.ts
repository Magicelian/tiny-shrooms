// Règles du jeu : un pas de simulation, les commandes et la vue publiée de l'état.
import type { Commande, Evenement, Instantane, Priorites, Quantites, RaisonRefus, Ressource, Stock } from './contrat';
import { RESSOURCES, TACHES } from './contrat';
import type { Contenu } from './contenu';
import { plafonds, type Etat } from './etat';
import { majBonusVoisinage, verifierEmplacement } from './grille';
import { avancerHabitants } from './habitants';
import { cadenceTravail, calendrier, facteurSaison, meteoAu } from './saisons';
import { heureDuJour, PAS_PAR_MINUTE } from './temps';

type Flux = Record<Ressource, number>;

/** Variations de stock qui ne passent pas par un transport : spores, repas, récoltes en cours (estimées). */
function fluxParMinute(etat: Etat, contenu: Contenu): { direct: Flux; estime: Flux } {
  const direct: Flux = { baies: 0, baiesSechees: 0, boisMort: 0, mousse: 0, spores: 0 };
  const h = contenu.habitants;
  direct.spores += contenu.arbreMere.sporesParMinute;
  for (const habitant of etat.habitants) {
    if (habitant.bienEtre >= h.seuilBonheur) direct.spores += h.sporesParHabitantHeureux;
    if (habitant.mission?.tache === 'soignerArbre' && habitant.activite === 'recolte') direct.spores += h.sporesParSoigneur;
  }

  const estime = { ...direct };
  estime.baies -= etat.habitants.length * h.baiesParMinute;
  // Estimation : on considère le village nourri tant qu'il reste de quoi manger.
  const nourri = etat.stocks.baies + etat.stocks.baiesSechees > 0;
  for (const habitant of etat.habitants) {
    const m = habitant.mission;
    if (m?.tache !== 'recolter' || habitant.activite !== 'recolte') continue;
    const b = etat.batiments.find((x) => x.id === m.batiment);
    if (!b) continue;
    const def = contenu.batiments[b.type];
    const cadence = cadenceTravail(etat, contenu, { x: b.case.x + 0.5, y: b.case.y + 0.5 }, nourri);
    for (const r of cles(def.production ?? {})) {
      estime[r] += (def.production![r] ?? 0) * b.bonusVoisinage * facteurSaison(etat, contenu, r) * cadence;
    }
    for (const r of cles(def.consommation ?? {})) estime[r] -= (def.consommation![r] ?? 0) * cadence;
  }
  return { direct, estime };
}

export function avancer(etat: Etat, contenu: Contenu): Evenement[] {
  const evenements: Evenement[] = [];
  const saisonAvant = calendrier(etat.pas, contenu).rang;
  etat.pas++;
  const saison = calendrier(etat.pas, contenu);
  if (saison.rang !== saisonAvant) evenements.push({ type: 'saisonChangee', saison: saison.saison });
  avancerHabitants(etat, contenu, evenements);

  const max = plafonds(etat, contenu);
  const { direct } = fluxParMinute(etat, contenu);
  const pleins: Ressource[] = [];
  for (const r of RESSOURCES) {
    const avant = etat.stocks[r];
    const apres = avant + direct[r] / PAS_PAR_MINUTE;
    // Un plafond abaissé (démolition) ne retire rien : il bloque seulement les gains.
    etat.stocks[r] = direct[r] >= 0 ? Math.min(apres, Math.max(max[r], avant)) : Math.max(0, apres);
    if (etat.stocks[r] >= max[r]) {
      pleins.push(r);
      if (!etat.stocksPleins.includes(r)) evenements.push({ type: 'stockPlein', ressource: r });
    }
  }
  etat.stocksPleins = pleins;
  return evenements;
}

export function appliquerCommande(etat: Etat, contenu: Contenu, commande: Commande): Evenement[] {
  const refus = (raison: RaisonRefus): Evenement[] => [{ type: 'commandeRefusee', commande, raison }];

  switch (commande.type) {
    case 'poserBatiment': {
      if (!etat.batimentsDebloques.includes(commande.batiment)) return refus('nonDebloque');
      const emplacement = verifierEmplacement(etat, commande.case);
      if (emplacement) return refus(emplacement);
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
        reserve: {},
      });
      majBonusVoisinage(etat, contenu);
      return [];
    }
    case 'deplacerBatiment': {
      const b = etat.batiments.find((x) => x.id === commande.id);
      if (!b) return refus('introuvable');
      const emplacement = verifierEmplacement(etat, commande.case, b.id);
      if (emplacement) return refus(emplacement);
      b.case = { ...commande.case };
      b.orientation = commande.orientation;
      majBonusVoisinage(etat, contenu);
      return [];
    }
    case 'demolir': {
      const i = etat.batiments.findIndex((x) => x.id === commande.id);
      if (i < 0) return refus('introuvable');
      const [b] = etat.batiments.splice(i, 1);
      const cout = contenu.batiments[b!.type].cout;
      for (const r of cles(cout)) etat.stocks[r] += (cout[r] ?? 0) * contenu.remboursementDemolition;
      // La récolte en attente n'est pas perdue.
      for (const r of cles(b!.reserve)) etat.stocks[r] += b!.reserve[r] ?? 0;
      majBonusVoisinage(etat, contenu);
      return [];
    }
    case 'reglerPriorites': {
      const priorites = {} as Priorites;
      for (const t of TACHES) priorites[t] = Math.min(1, Math.max(0, commande.priorites[t]));
      etat.priorites = priorites;
      return [];
    }
    case 'epinglerHabitant': {
      const h = etat.habitants.find((x) => x.id === commande.id);
      if (!h) return refus('introuvable');
      h.epingle = commande.tache;
      return [];
    }
    case 'modifierReglage': {
      (etat.reglages as unknown as Record<string, unknown>)[commande.cle] = commande.valeur;
      return [];
    }
    // Visiteurs, arbre-mère et améliorations arrivent aux étapes suivantes.
    case 'ameliorer':
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
  const { estime } = fluxParMinute(etat, contenu);
  const stocks = {} as Record<Ressource, Stock>;
  for (const r of RESSOURCES) {
    stocks[r] = { quantite: etat.stocks[r], plafond: max[r], productionParMinute: estime[r] };
  }
  const { saison, annee, avancement } = calendrier(etat.pas, contenu);
  return {
    temps: {
      pas: etat.pas,
      annee,
      saison,
      avancementSaison: avancement,
      heure: heureDuJour(etat.pas, contenu.temps),
      meteo: meteoAu(etat.pas, etat.graine, contenu),
      enPause,
    },
    stocks,
    batiments: etat.batiments.map(({ reserve: _reserve, ...b }) => ({ ...b, case: { ...b.case } })),
    habitants: etat.habitants.map(({ mission: _m, charge: _c, pasDepuisChoix: _p, ...h }) => ({
      ...h,
      position: { ...h.position },
    })),
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
