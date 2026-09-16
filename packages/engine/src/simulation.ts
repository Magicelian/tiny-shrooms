// Règles du jeu : un pas de simulation, les commandes et la vue publiée de l'état.
import type { Commande, Evenement, Instantane, Quantites, RaisonRefus, Ressource, Stock } from './contrat';
import { RESSOURCES } from './contrat';
import { coutAmelioration, effetAmelioration, payer } from './ameliorations';
import type { Contenu } from './contenu';
import { plafonds, type Etat } from './etat';
import { majBonusVoisinage, verifierEmplacement } from './grille';
import { avancerHabitants } from './habitants';
import { cadenceTravail, calendrier, facteurSaison, meteoAu } from './saisons';
import { heureDuJour, PAS_DE_SIMULATION_MS, PAS_PAR_MINUTE } from './temps';

type Flux = Record<Ressource, number>;

/** Variations de stock qui ne passent pas par un transport : spores, repas, récoltes en cours (estimées). */
function fluxParMinute(etat: Etat, contenu: Contenu): { direct: Flux; estime: Flux } {
  const direct: Flux = { baies: 0, baiesSechees: 0, boisMort: 0, mousse: 0, spores: 0 };
  const h = contenu.habitants;
  for (const habitant of etat.habitants) {
    if (habitant.bienEtre >= h.seuilBonheur) direct.spores += h.sporesParHabitantHeureux;
  }

  const estime = { ...direct };
  estime.baies -= etat.habitants.length * h.baiesParMinute;
  // Estimation : on considère le village nourri tant qu'il reste de quoi manger.
  const nourri = etat.stocks.baies + etat.stocks.baiesSechees > 0;
  const bonus = effetAmelioration(etat, contenu, 'outils');
  for (const habitant of etat.habitants) {
    const m = habitant.mission;
    if (m?.tache !== 'recolter' || habitant.activite !== 'recolte') continue;
    const b = etat.batiments.find((x) => x.id === m.batiment);
    if (!b) continue;
    const def = contenu.batiments[b.type];
    const cadence = cadenceTravail(etat, contenu, { x: b.case.x + 0.5, y: b.case.y + 0.5 }, nourri) * bonus;
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
  repousser(etat, contenu);

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

/** Les éléments naturels épuisés repoussent, au rythme de la saison pour leur ressource. */
function repousser(etat: Etat, contenu: Contenu): void {
  etat.ile.elements.forEach((element, i) => {
    const pousse = etat.pousses[i] ?? 1;
    if (pousse >= 1) return;
    const def = contenu.recolte[element.type];
    const pas = (def.repousseSecondes * 1000) / PAS_DE_SIMULATION_MS;
    etat.pousses[i] = Math.min(1, pousse + facteurSaison(etat, contenu, def.ressource) / pas);
  });
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
    case 'recolter': {
      const element = etat.ile.elements[commande.element];
      if (!element) return refus('introuvable');
      if ((etat.pousses[commande.element] ?? 1) < 1) return refus('pasPret');
      const { ressource, quantite } = contenu.recolte[element.type];
      const place = plafonds(etat, contenu)[ressource] - etat.stocks[ressource];
      const gain = Math.min(quantite, Math.floor(place));
      if (gain <= 0) return refus('stockPlein');
      etat.stocks[ressource] += gain;
      etat.pousses[commande.element] = 0;
      return [{ type: 'recolte', element: commande.element, ressource, quantite: gain }];
    }
    case 'modifierReglage': {
      (etat.reglages as unknown as Record<string, unknown>)[commande.cle] = commande.valeur;
      return [];
    }
    case 'ameliorer': {
      // Les améliorations propres à un bâtiment ne sont pas au programme de la V1.
      if (!('village' in commande.cible)) return refus('indisponible');
      if (!etat.batiments.some((b) => b.type === 'atelier' && b.chantier === null)) {
        return refus(etat.batimentsDebloques.includes('atelier') ? 'indisponible' : 'nonDebloque');
      }
      const amelioration = commande.cible.village;
      const cout = coutAmelioration(contenu, amelioration, etat.ameliorations[amelioration]);
      if (!cout) return refus('indisponible');
      if (!payer(etat, cout)) return refus('ressourcesInsuffisantes');
      etat.ameliorations[amelioration]++;
      return [];
    }
  }
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
    habitants: etat.habitants.map(({ mission, charge: _c, pasDepuisChoix: _p, ...h }) => ({
      ...h,
      position: { ...h.position },
      lieu: mission && mission.tache !== 'stocker' ? mission.batiment : null,
    })),
    pousses: [...etat.pousses],
    batimentsDebloques: [...etat.batimentsDebloques],
    ameliorations: { ...etat.ameliorations },
    reglages: { ...etat.reglages },
  };
}

function cles(quantites: Quantites): Ressource[] {
  return RESSOURCES.filter((r) => quantites[r] !== undefined);
}
