// Règles du jeu : un pas de simulation, les commandes et la vue publiée de l'état.
import type { Commande, Evenement, Instantane, Quantites, RaisonRefus, Ressource, Stock } from './contrat';
import { RESSOURCES } from './contrat';
import { bonusProduction, coutAmelioration, payer, rembourser } from './ameliorations';
import { BONUS_PRESTIGE } from './contrat';
import { coutBatiment, coutBonus, peutRenaitre, recommencer, renaitre } from './prestige';
import type { Contenu } from './contenu';
import { ajouterHabitant, plafonds, type Etat } from './etat';
import { majBonusVoisinage, verifierEmplacement } from './grille';
import { appelerArracheurs, avancerHabitants, estLaNuit, logements } from './habitants';
import { coutTotal, majPalier, monterLogement, rangLogement } from './logements';
import { demanderDefrichage, memeCase } from './defrichage';
import type { BatimentEtat } from './etat';
import { cadenceTravail, calendrier, facteurSaison, meteoAu } from './saisons';
import { heureDuJour, PAS_DE_SIMULATION_MS, PAS_PAR_MINUTE } from './temps';

type Flux = Record<Ressource, number>;

/** Délai au bout duquel des arrivages en retard sur la production sont rangés, en minutes. */
const MINUTES_POUR_RANGER = 1;

/**
 * Variations de stock par minute. `direct` : ce qui ne passe pas par un transport (spores) ;
 * `production` : récoltes en cours ; `estime` : bilan affiché, repas et consommations compris.
 */
function fluxParMinute(etat: Etat, contenu: Contenu): { direct: Flux; production: Flux; estime: Flux } {
  const direct: Flux = { baies: 0, baiesSechees: 0, boisMort: 0, mousse: 0, spores: 0 };
  const h = contenu.habitants;
  const { loges } = logements(etat, contenu);
  const bonus = bonusProduction(etat, contenu);
  for (const habitant of etat.habitants) {
    const logement = loges.get(habitant.id);
    if (!logement) continue;
    const rang = logement === true ? contenu.logement.rangs[0] : rangLogement(contenu, logement);
    const joie = Math.max(0, (habitant.bienEtre - h.seuilBonheur) / (1 - h.seuilBonheur));
    direct.spores += (rang?.sporesParMinute ?? 0) * Math.min(1, joie) * bonus;
  }

  const production: Flux = { baies: 0, baiesSechees: 0, boisMort: 0, mousse: 0, spores: 0 };
  const estime = { ...direct };
  // Les consommations des logements sont déjà prélevées pas à pas ; on les montre dans la tendance.
  for (const b of etat.batiments) {
    const consommation = b.chantier === null ? rangLogement(contenu, b)?.consommation : undefined;
    for (const r of cles(consommation ?? {})) estime[r] -= consommation![r] ?? 0;
  }
  estime.baies -= etat.habitants.length * h.baiesParMinute;
  // Estimation : on considère le village nourri tant qu'il reste de quoi manger.
  const nourri = etat.stocks.baies + etat.stocks.baiesSechees > 0;
  for (const habitant of etat.habitants) {
    const m = habitant.mission;
    if (m?.tache !== 'recolter' || habitant.activite !== 'recolte') continue;
    const b = etat.batiments.find((x) => x.id === m.batiment);
    if (!b) continue;
    const def = contenu.batiments[b.type];
    const cadence = cadenceTravail(etat, contenu, { x: b.case.x + 0.5, y: b.case.y + 0.5 }, nourri) * bonus;
    for (const r of cles(def.production ?? {})) {
      const quantite = (def.production![r] ?? 0) * b.bonusVoisinage * facteurSaison(etat, contenu, r) * cadence;
      production[r] += quantite;
      estime[r] += quantite;
    }
    for (const r of cles(def.consommation ?? {})) estime[r] -= (def.consommation![r] ?? 0) * cadence;
  }
  return { direct, production, estime };
}

export function avancer(etat: Etat, contenu: Contenu): Evenement[] {
  const evenements: Evenement[] = [];
  const saisonAvant = calendrier(etat.pas, contenu).rang;
  etat.pas++;
  const saison = calendrier(etat.pas, contenu);
  if (saison.rang !== saisonAvant) evenements.push({ type: 'saisonChangee', saison: saison.saison });
  avancerHabitants(etat, contenu, evenements);
  majPalier(etat, contenu, evenements);
  etat.prestige.populationMax = Math.max(etat.prestige.populationMax, etat.habitants.length);
  repousser(etat, contenu);

  const max = plafonds(etat, contenu);
  const { direct, production } = fluxParMinute(etat, contenu);
  ranger(etat, production);
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

/**
 * Les livraisons entrent dans les stocks au rythme de la production (6/min : une unité toutes les 10 s),
 * plutôt que par charges entières ; un retard sur la production se résorbe en `MINUTES_POUR_RANGER`.
 */
function ranger(etat: Etat, production: Flux): void {
  for (const r of RESSOURCES) {
    const enAttente = etat.arrivages[r];
    if (enAttente <= 0) continue;
    // Au moins une unité par minute, pour que la file se vide même sans production.
    const parMinute = Math.max(production[r], enAttente / MINUTES_POUR_RANGER, 1);
    const range = Math.min(enAttente, parMinute / PAS_PAR_MINUTE);
    etat.stocks[r] += range;
    etat.arrivages[r] = enAttente - range < 1e-9 ? 0 : enAttente - range;
  }
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
      if (!payer(etat, coutBatiment(contenu, etat.prestige.bonus, commande.batiment))) return refus('ressourcesInsuffisantes');
      etat.batiments.push({
        id: etat.prochainId++,
        type: commande.batiment,
        case: { ...commande.case },
        orientation: commande.orientation,
        niveau: 1,
        chantier: def.constructionSecondes > 0 ? 0 : null,
        agrandissement: null,
        bonusVoisinage: 1,
        besoins: {},
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
      const soucheQuiPart = !etat.ile.soucheEnPlace || etat.retraitSouche !== null;
      if (soucheQuiPart && estDepot(contenu, etat.batiments[i]!) && !etat.batiments.some((b, j) => j !== i && estDepot(contenu, b))) {
        return refus('depotRequis');
      }
      const [b] = etat.batiments.splice(i, 1);
      const cout = coutTotal(contenu, b!, etat.prestige.bonus);
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
      // Le stock s'affiche arrondi à l'unité inférieure : une fraction de place libre se remplit aussi.
      const gain = Math.min(Math.round(quantite * bonusProduction(etat, contenu)), place);
      if (gain <= 0) return refus('stockPlein');
      etat.stocks[ressource] += gain;
      etat.pousses[commande.element] = 0;
      return [{ type: 'recolte', element: commande.element, ressource, quantite: gain }];
    }
    case 'retirerSouche': {
      if (!etat.ile.soucheEnPlace || etat.retraitSouche !== null) return refus('indisponible');
      if (!etat.batiments.some((b) => estDepot(contenu, b))) return refus('depotRequis');
      if (!payer(etat, contenu.souche.coutRetrait)) return refus('ressourcesInsuffisantes');
      etat.retraitSouche = 0;
      appelerArracheurs(etat, contenu);
      return [];
    }
    case 'defricher': {
      const raison = demanderDefrichage(etat, contenu, commande.case);
      if (raison) return refus(raison);
      appelerArracheurs(etat, contenu);
      return [];
    }
    case 'annulerArrachage': {
      if (commande.case === null) {
        if (etat.retraitSouche === null) return refus('introuvable');
        etat.retraitSouche = null;
        rembourser(etat, contenu.souche.coutRetrait);
        return [];
      }
      const i = etat.defrichages.findIndex((d) => memeCase(d.case, commande.case!));
      if (i < 0) return refus('introuvable');
      const [d] = etat.defrichages.splice(i, 1);
      rembourser(etat, contenu.defrichage[d!.nature].cout);
      return [];
    }
    case 'renaitre': {
      if (!peutRenaitre(etat)) return refus(etat.batimentsDebloques.includes('sanctuaire') ? 'indisponible' : 'nonDebloque');
      return [{ type: 'renaissance', graines: renaitre(etat, contenu) }];
    }
    case 'recommencer':
      recommencer(etat, contenu, Math.max(1, Math.floor(Math.abs(commande.graine))));
      return [{ type: 'partieRecommencee' }];
    case 'acheterBonus': {
      if (!BONUS_PRESTIGE.includes(commande.bonus)) return refus('introuvable');
      const niveau = etat.prestige.bonus[commande.bonus];
      const prix = coutBonus(contenu, commande.bonus, niveau);
      if (prix === null) return refus('indisponible');
      if (etat.prestige.graines < prix) return refus('ressourcesInsuffisantes');
      etat.prestige.graines -= prix;
      etat.prestige.bonus[commande.bonus] = niveau + 1;
      // Les bagages servent aussi tout de suite : on les achète juste après avoir renaît.
      if (commande.bonus === 'depart') return donnerBagages(etat, contenu);
      return [];
    }
    case 'modifierReglage': {
      (etat.reglages as unknown as Record<string, unknown>)[commande.cle] = commande.valeur;
      return [];
    }
    case 'ameliorer': {
      if ('batiment' in commande.cible) {
        const { batiment } = commande.cible;
        const b = etat.batiments.find((x) => x.id === batiment);
        if (!b) return refus('introuvable');
        const raison = monterLogement(etat, contenu, b);
        if (raison) return refus(raison);
        // Sans travaux (rang sans durée), la montée est faite tout de suite.
        return b.agrandissement === null ? [{ type: 'logementAmeliore', id: b.id, niveau: b.niveau }] : [];
      }
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

/** Un niveau de bagages : ses ressources (jusqu'au plafond) et ses habitants, dans la partie en cours. */
function donnerBagages(etat: Etat, contenu: Contenu): Evenement[] {
  const { stocksDeDepart, habitantsDeDepart } = contenu.prestige.effets;
  const max = plafonds(etat, contenu);
  for (const r of RESSOURCES) {
    etat.stocks[r] = Math.max(etat.stocks[r], Math.min(max[r], etat.stocks[r] + (stocksDeDepart[r] ?? 0)));
  }
  const evenements: Evenement[] = [];
  for (let i = 0; i < habitantsDeDepart; i++) evenements.push({ type: 'habitantArrive', id: ajouterHabitant(etat).id });
  return evenements;
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
      nuit: estLaNuit(etat, contenu),
      meteo: meteoAu(etat.pas, etat.graine, contenu),
      enPause,
    },
    stocks,
    batiments: etat.batiments.map(({ reserve: _reserve, ...b }) => ({ ...b, case: { ...b.case }, besoins: { ...b.besoins } })),
    habitants: etat.habitants.map(({ mission, charge: _c, pasDepuisChoix: _p, ...h }) => ({
      ...h,
      position: { ...h.position },
      lieu: mission && 'batiment' in mission && mission.tache !== 'stocker' ? mission.batiment : null,
    })),
    pousses: [...etat.pousses],
    batimentsDebloques: [...etat.batimentsDebloques],
    retraitSouche: etat.retraitSouche,
    defrichages: etat.defrichages.map((d) => ({ ...d, case: { ...d.case } })),
    palier: etat.palier,
    faim: etat.faim ?? false,
    ameliorations: { ...etat.ameliorations },
    prestige: { ...etat.prestige, bonus: { ...etat.prestige.bonus } },
    reglages: { ...etat.reglages },
  };
}

/** Bâtiment de stockage achevé : les porteurs peuvent y déposer. */
function estDepot(contenu: Contenu, b: BatimentEtat): boolean {
  return b.chantier === null && !!contenu.batiments[b.type].stockage;
}

function cles(quantites: Quantites): Ressource[] {
  return RESSOURCES.filter((r) => quantites[r] !== undefined);
}
