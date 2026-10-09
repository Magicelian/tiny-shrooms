// Règles du jeu : un pas de simulation, les commandes et la vue publiée de l'état.
import type { Commande, Evenement, Instantane, Quantites, RaisonRefus, Ressource, Stock } from './contrat';
import { RESSOURCES } from './contrat';
import { bonusProduction, coutAmelioration, payer, rembourser } from './ameliorations';
import { BONUS_PRESTIGE } from './contrat';
import { coutBatiment, coutBonus, debloquerIle, offrande, offrandeRemplie, offrir, recommencer, sanctuaireAcheve } from './prestige';
import type { Contenu } from './contenu';
import { ajouterHabitant, plafonds, type Etat, type Partie } from './etat';
import { problemesDe } from './problemes';
import { dejaConstruit, majBonusVoisinage, verifierEmplacement } from './grille';
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
  const direct = fluxNul();
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

  const production = fluxNul();
  const estime = { ...direct };
  // Les consommations des logements sont déjà prélevées pas à pas ; on les montre dans la tendance.
  for (const b of etat.batiments) {
    const consommation = b.chantier === null ? rangLogement(contenu, b)?.consommation : undefined;
    for (const r of cles(consommation ?? {})) estime[r] -= consommation![r] ?? 0;
  }
  estime.baies -= etat.habitants.length * h.baiesParMinute;
  // Estimation : on considère le village nourri tant qu'il reste de quoi manger.
  const nourri = etat.partie.stocks.baies + etat.partie.stocks.baiesSechees > 0;
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

/** Un pas de simulation pour toutes les îles ; seuls les événements de l'île affichée sont rendus. */
export function avancer(partie: Partie, contenu: Contenu): Evenement[] {
  const evenements: Evenement[] = [];
  const saisonAvant = calendrier(partie.pas, contenu).rang;
  partie.pas++;
  const saison = calendrier(partie.pas, contenu);
  if (saison.rang !== saisonAvant) evenements.push({ type: 'saisonChangee', saison: saison.saison });
  partie.iles.forEach((etat, i) => {
    const siens: Evenement[] = [];
    avancerHabitants(etat, contenu, siens);
    majPalier(etat, contenu, siens);
    etat.populationMax = Math.max(etat.populationMax, etat.habitants.length);
    repousser(etat, contenu);
    if (i === partie.vue) evenements.push(...siens);
  });

  const max = plafonds(partie, contenu);
  const flux = fluxDeLArchipel(partie, contenu);
  const { direct } = flux;
  for (const r of RESSOURCES) {
    const avant = partie.stocks[r];
    const apres = avant + direct[r] / PAS_PAR_MINUTE;
    // Un plafond abaissé (démolition) ne retire rien : il bloque seulement les gains.
    partie.stocks[r] = direct[r] >= 0 ? Math.min(apres, Math.max(max[r], avant)) : Math.max(0, apres);
  }
  // Rangé après la consommation : sinon un stock qu'on mange reste toujours un cheveu sous le plafond.
  ranger(partie, flux, max);
  for (const r of RESSOURCES) {
    // Les additions flottantes s'arrêtent parfois à 179,99999999999991 : affiché 179/180 et plus rien à porter.
    if (partie.stocks[r] < max[r] && partie.stocks[r] > max[r] - 1e-6) partie.stocks[r] = max[r];
  }
  return evenements;
}

/** Flux de toutes les îles additionnés : le stock est commun. */
function fluxDeLArchipel(partie: Partie, contenu: Contenu): { direct: Flux; production: Flux; estime: Flux } {
  const total = { direct: fluxNul(), production: fluxNul(), estime: fluxNul() };
  for (const etat of partie.iles) {
    const flux = fluxParMinute(etat, contenu);
    for (const r of RESSOURCES) {
      total.direct[r] += flux.direct[r];
      total.production[r] += flux.production[r];
      total.estime[r] += flux.estime[r];
    }
  }
  return total;
}

function fluxNul(): Flux {
  return { baies: 0, baiesSechees: 0, boisMort: 0, mousse: 0, spores: 0 };
}

/**
 * Les livraisons entrent dans les stocks au rythme de la production (6/min : une unité toutes les 10 s),
 * plutôt que par charges entières ; un retard sur la production se résorbe en `MINUTES_POUR_RANGER`.
 */
function ranger(partie: Partie, flux: { direct: Flux; production: Flux; estime: Flux }, max: Record<Ressource, number>): void {
  for (const r of RESSOURCES) {
    const enAttente = partie.arrivages[r];
    if (enAttente <= 0) continue;
    // Ce que le village mange ou use par minute : les livraisons entrent au moins aussi vite, sinon le stock
    // fond sous le plafond pendant que la file attend.
    const consommation = Math.max(0, flux.direct[r] + flux.production[r] - flux.estime[r]);
    // Au moins une unité par minute, pour que la file se vide même sans production.
    const parMinute = Math.max(flux.production[r] + consommation, enAttente / MINUTES_POUR_RANGER, 1);
    // Jusqu'au plafond exactement ; le surplus attend au dépôt qu'une place se libère.
    const range = Math.min(enAttente, parMinute / PAS_PAR_MINUTE, Math.max(0, max[r] - partie.stocks[r]));
    if (range <= 0) continue;
    partie.stocks[r] += range;
    partie.arrivages[r] = enAttente - range < 1e-9 ? 0 : enAttente - range;
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

/** Applique une commande à l'île affichée. */
export function appliquerCommande(partie: Partie, contenu: Contenu, commande: Commande): Evenement[] {
  const refus = (raison: RaisonRefus): Evenement[] => [{ type: 'commandeRefusee', commande, raison }];
  const etat = partie.iles[partie.vue]!;

  switch (commande.type) {
    case 'poserBatiment': {
      if (!etat.batimentsDebloques.includes(commande.batiment)) return refus('nonDebloque');
      if (dejaConstruit(contenu, etat.batiments, commande.batiment)) return refus('dejaConstruit');
      const emplacement = verifierEmplacement(etat, commande.case, undefined, commande.batiment, contenu);
      if (emplacement) return refus(emplacement);
      const def = contenu.batiments[commande.batiment];
      if (!payer(etat, coutBatiment(contenu, etat.partie.prestige.bonus, commande.batiment, etat.batiments))) return refus('ressourcesInsuffisantes');
      etat.batiments.push({
        id: etat.prochainId++,
        type: commande.batiment,
        case: { ...commande.case },
        orientation: commande.orientation,
        niveau: 1,
        chantier: def.constructionSecondes > 0 ? 0 : null,
        agrandissement: null,
        amelioration: null,
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
      const emplacement = verifierEmplacement(etat, commande.case, b.id, b.type, contenu);
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
      const cout = coutTotal(contenu, b!, etat.partie.prestige.bonus, etat.batiments);
      for (const r of cles(cout)) etat.partie.stocks[r] += (cout[r] ?? 0) * contenu.remboursementDemolition;
      // La récolte en attente n'est pas perdue.
      for (const r of cles(b!.reserve)) etat.partie.stocks[r] += b!.reserve[r] ?? 0;
      majBonusVoisinage(etat, contenu);
      return [];
    }
    case 'recolter': {
      const element = etat.ile.elements[commande.element];
      if (!element) return refus('introuvable');
      if ((etat.pousses[commande.element] ?? 1) < 1) return refus('pasPret');
      const { ressource, quantite } = contenu.recolte[element.type];
      const place = plafonds(etat.partie, contenu)[ressource] - etat.partie.stocks[ressource];
      // Le stock s'affiche arrondi à l'unité inférieure : une fraction de place libre se remplit aussi.
      const gain = Math.min(Math.round(quantite * bonusProduction(etat, contenu)), place);
      if (gain <= 0) return refus('stockPlein');
      etat.partie.stocks[ressource] += gain;
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
    case 'voirIle': {
      if (!Number.isInteger(commande.ile) || !partie.iles[commande.ile]) return refus('introuvable');
      partie.vue = commande.ile;
      return [];
    }
    case 'offrir': {
      if (!sanctuaireAcheve(etat)) return refus(etat.batimentsDebloques.includes('sanctuaire') ? 'indisponible' : 'nonDebloque');
      if (!offrande(etat, contenu)) return refus('indisponible');
      if (Object.keys(offrir(etat, contenu)).length === 0 && !offrandeRemplie(etat, contenu)) return refus('ressourcesInsuffisantes');
      if (!offrandeRemplie(etat, contenu)) return [];
      return [{ type: 'ileDebloquee', ile: partie.iles.length, graines: debloquerIle(etat, contenu) }];
    }
    case 'recommencer':
      recommencer(partie, contenu, Math.max(1, Math.floor(Math.abs(commande.graine))));
      return [{ type: 'partieRecommencee' }];
    case 'acheterBonus': {
      if (!BONUS_PRESTIGE.includes(commande.bonus)) return refus('introuvable');
      const niveau = etat.partie.prestige.bonus[commande.bonus];
      const prix = coutBonus(contenu, commande.bonus, niveau);
      if (prix === null) return refus('indisponible');
      if (etat.partie.prestige.graines < prix) return refus('ressourcesInsuffisantes');
      etat.partie.prestige.graines -= prix;
      etat.partie.prestige.bonus[commande.bonus] = niveau + 1;
      // Les bagages servent aussi tout de suite, sur l'île affichée.
      if (commande.bonus === 'depart') return donnerBagages(etat, contenu);
      return [];
    }
    case 'modifierReglage': {
      (etat.partie.reglages as unknown as Record<string, unknown>)[commande.cle] = commande.valeur;
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
      const ateliers = etat.batiments.filter((b) => b.type === 'atelier' && b.chantier === null);
      if (ateliers.length === 0) {
        return refus(etat.batimentsDebloques.includes('atelier') ? 'indisponible' : 'nonDebloque');
      }
      const amelioration = commande.cible.village;
      const cout = coutAmelioration(contenu, amelioration, etat.ameliorations[amelioration]);
      if (!cout) return refus('indisponible');
      // Un atelier ne mène qu'une amélioration à la fois, et jamais deux fois la même.
      const atelier = ateliers.find((b) => b.amelioration === null);
      if (!atelier || ateliers.some((b) => b.amelioration?.village === amelioration)) return refus('indisponible');
      if (!payer(etat, cout)) return refus('ressourcesInsuffisantes');
      // Les habitants font les travaux ; sans durée, l'amélioration prend tout de suite.
      const secondes = contenu.ameliorations[amelioration].travauxSecondes ?? 0;
      if (secondes > 0) atelier.amelioration = { village: amelioration, avancement: 0 };
      else etat.ameliorations[amelioration]++;
      return secondes > 0 ? [] : [{ type: 'villageAmeliore', amelioration, niveau: etat.ameliorations[amelioration] }];
    }
  }
}

/** Un niveau de bagages : ses ressources (jusqu'au plafond) et ses habitants, dans la partie en cours. */
function donnerBagages(etat: Etat, contenu: Contenu): Evenement[] {
  const { stocksDeDepart, habitantsDeDepart } = contenu.prestige.effets;
  const max = plafonds(etat.partie, contenu);
  for (const r of RESSOURCES) {
    etat.partie.stocks[r] = Math.max(etat.partie.stocks[r], Math.min(max[r], etat.partie.stocks[r] + (stocksDeDepart[r] ?? 0)));
  }
  const evenements: Evenement[] = [];
  for (let i = 0; i < habitantsDeDepart; i++) evenements.push({ type: 'habitantArrive', id: ajouterHabitant(etat).id });
  return evenements;
}

/** Vue publiée : le temps et le stock communs, l'île affichée en détail, les autres en résumé. */
export function instantane(partie: Partie, contenu: Contenu, enPause: boolean): Instantane {
  const etat = partie.iles[partie.vue]!;
  const max = plafonds(partie, contenu);
  const { estime } = fluxDeLArchipel(partie, contenu);
  const stocks = {} as Record<Ressource, Stock>;
  for (const r of RESSOURCES) {
    stocks[r] = { quantite: partie.stocks[r], plafond: max[r], productionParMinute: estime[r] };
  }
  const { saison, annee, avancement } = calendrier(partie.pas, contenu);
  return {
    temps: {
      pas: partie.pas,
      annee,
      saison,
      avancementSaison: avancement,
      heure: heureDuJour(partie.pas, contenu.temps),
      nuit: estLaNuit(etat, contenu),
      meteo: meteoAu(partie.pas, partie.graine, contenu),
      enPause,
    },
    ile: partie.vue,
    iles: partie.iles.map((e) => ({ palier: e.palier, habitants: e.habitants.length, problemes: problemesDe(e, saison, contenu) })),
    offrande: offrande(etat, contenu),
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
    prestige: { ...partie.prestige, bonus: { ...partie.prestige.bonus } },
    reglages: { ...partie.reglages },
  };
}

/** Bâtiment de stockage achevé : les porteurs peuvent y déposer. */
function estDepot(contenu: Contenu, b: BatimentEtat): boolean {
  return b.chantier === null && !!contenu.batiments[b.type].stockage;
}

function cles(quantites: Quantites): Ressource[] {
  return RESSOURCES.filter((r) => quantites[r] !== undefined);
}
