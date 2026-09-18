// Valeurs d’équilibrage de la V1, réglées à l’étape 16 (`courbe.test.ts`).
import type { Contenu } from '@tiny-shrooms/engine';

export const contenu: Contenu = {
  ile: { taille: 12 },
  // Partie neuve : rien en stock, tout commence par la récolte à la main.
  stocksDeDepart: { baies: 0, baiesSechees: 0, boisMort: 0, mousse: 0, spores: 0 },
  plafondsDeBase: { baies: 50, baiesSechees: 20, boisMort: 80, mousse: 30, spores: 40 },
  batiments: {
    hutte: { cout: { boisMort: 20 }, constructionSecondes: 30, logement: true },
    cueillette: { cout: { boisMort: 15 }, constructionSecondes: 20, production: { baies: 6 }, voisinage: [{ voisin: 'buisson', bonus: 0.25 }] },
    tasDeBois: { cout: { baies: 10 }, constructionSecondes: 20, production: { boisMort: 5 }, voisinage: [{ voisin: 'foret', bonus: 0.25 }] },
    tapisDeMousse: {
      cout: { boisMort: 10, baies: 5 },
      constructionSecondes: 30,
      production: { mousse: 3 },
      voisinage: [
        { voisin: 'eau', bonus: 0.25 },
        { voisin: 'foret', bonus: 0.25 },
      ],
    },
    gardeManger: { cout: { boisMort: 25 }, constructionSecondes: 40, stockage: { baies: 100, baiesSechees: 50 } },
    remise: { cout: { boisMort: 30 }, constructionSecondes: 40, stockage: { boisMort: 100, mousse: 50 } },
    sechoir: {
      cout: { boisMort: 20, mousse: 10 },
      constructionSecondes: 45,
      production: { baiesSechees: 1 },
      consommation: { baies: 2 },
      voisinage: [{ voisin: 'gardeManger', bonus: 0.25 }],
    },
    feuDeCamp: { cout: { boisMort: 15 }, constructionSecondes: 20, portee: 2 },
    atelier: { cout: { boisMort: 40, mousse: 20 }, constructionSecondes: 60, stockage: { spores: 60 }, unique: true },
    puits: { cout: { boisMort: 30, mousse: 10 }, constructionSecondes: 30, portee: 3 },
    marche: { cout: { boisMort: 60, mousse: 30 }, constructionSecondes: 60, postes: 2, portee: 4 },
    sanctuaire: { cout: { boisMort: 80, mousse: 40, spores: 20 }, constructionSecondes: 90, unique: true },
  },
  logement: {
    rangs: [
      { places: 2, besoins: ['nourriture'], palier: 0, sporesParMinute: 0.2 },
      { places: 4, besoins: ['nourriture', 'chaleur', 'eau'], cout: { boisMort: 40, mousse: 20 }, palier: 1, sporesParMinute: 0.3, agrandissementSecondes: 45 },
      {
        places: 8,
        besoins: ['nourriture', 'chaleur', 'eau', 'mousse', 'commerce'],
        cout: { boisMort: 80, mousse: 40, spores: 30 },
        palier: 2,
        sporesParMinute: 0.5,
        agrandissementSecondes: 90,
        consommation: { mousse: 0.5 },
      },
    ],
    sources: { chaleur: 'feuDeCamp', eau: 'puits', commerce: 'marche' },
  },
  souche: { coutRetrait: { spores: 20 }, retraitSecondes: 45 },
  defrichage: {
    arbre: { cout: { spores: 2 }, secondes: 20, gain: { boisMort: 4 } },
    buisson: { cout: { spores: 1 }, secondes: 10 },
    plante: { cout: { spores: 1 }, secondes: 6 },
  },
  paliers: [
    { nom: 'hameau', population: 0, debloque: ['hutte', 'cueillette', 'tasDeBois', 'tapisDeMousse', 'gardeManger', 'remise', 'feuDeCamp'] },
    { nom: 'village', population: 15, debloque: ['sechoir', 'puits', 'atelier'] },
    { nom: 'bourg', population: 50, debloque: ['marche', 'sanctuaire'] },
    { nom: 'cite', population: 150, debloque: [] },
  ],
  recolte: {
    buisson: { ressource: 'baies', quantite: 3, repousseSecondes: 45 },
    boisMort: { ressource: 'boisMort', quantite: 2, repousseSecondes: 45 },
    mousse: { ressource: 'mousse', quantite: 2, repousseSecondes: 60 },
  },
  // Aucun habitant au départ ; la souche en loge un, qui arrive vite : on n'attend jamais sans rien pouvoir faire.
  habitants: {
    auDepart: 0,
    logementDeBase: 1,
    premiereArriveeSecondes: 15,
    vitesseCasesParSeconde: 1.2,
    capaciteTransport: 5,
    reserveMax: 10,
    baiesParMinute: 0.5,
    ouvriersParChantier: 2,
    delaiArriveeSecondes: 120,
    // 1 place libre : 3 min ; 2 : 2 min ; 5 : 1 min ; 11 et plus : 30 s.
    arriveeSelonPlaces: { placesDeReference: 2, delaiMinimal: 0.25 },
    // Faim ou besoins négligés : un départ toutes les 2 min tant que le bonheur moyen reste sous 50 %
    // (le joueur distrait en voit quelques-uns sans retard sur le bourg, voir courbe.test.ts).
    depart: { seuil: 0.5, delaiSecondes: 120, minimum: 1 },
    seuilArrivee: 0.5,
    seuilBonheur: 0.5,
    reevaluationSecondes: 30,
    nuit: { debut: 0.85, fin: 0.05 },
    travailAffame: 0.5,
    valeurBaieSechee: 3,
    bienEtre: { base: 0.3, loge: 0.2, besoins: 0.5, affame: -0.2, minutesPourSeStabiliser: 3 },
  },
  ameliorations: {
    vitesse: { cout: { spores: 25 }, hausseCout: 1.6, effet: 0.15, niveauMax: 3, travauxSecondes: 45 },
    outils: { cout: { spores: 35 }, hausseCout: 1.6, effet: 0.15, niveauMax: 3, travauxSecondes: 60 },
  },
  // Bourg (50 habitants) → 6 graines, 100 → 15, 150 → 25 : attendre rapporte de plus en plus.
  prestige: {
    gain: { diviseur: 10, puissance: 1.2 },
    bonus: {
      production: { cout: 2, hausseCout: 1.5, niveauMax: 10 },
      depart: { cout: 3, hausseCout: 1.6, niveauMax: 5 },
      construction: { cout: 2, hausseCout: 1.5, niveauMax: 5 },
      logement: { cout: 4, hausseCout: 1.8, niveauMax: 3 },
    },
    effets: {
      production: 0.1,
      stocksDeDepart: { baies: 15, boisMort: 20, mousse: 10 },
      habitantsDeDepart: 1,
      reductionCout: 0.08,
      vitesseChantier: 0.15,
      bienEtre: 0.03,
      places: 1,
      accueil: 0.15,
    },
  },
  remboursementDemolition: 0.5,
  temps: { minutesParSaison: 30, minutesParJour: 10, heureDeDepart: 0.25 },
  saisons: {
    production: {
      printemps: { mousse: 1.1 },
      ete: { baies: 1.25, mousse: 0.7 },
      automne: { baies: 0.8, boisMort: 1.25 },
      hiver: { baies: 0, boisMort: 0.8, mousse: 0.5 },
    },
    travailAuFroid: 0.6,
  },
  meteo: {
    minutesParPeriode: 4,
    probabilites: {
      printemps: { soleil: 5, pluie: 3, vent: 2 },
      ete: { soleil: 7, pluie: 1, vent: 2 },
      automne: { soleil: 3, pluie: 3, vent: 4 },
      hiver: { soleil: 3, vent: 2, neige: 5 },
    },
    production: {
      soleil: { baies: 1.1 },
      pluie: { mousse: 1.25, boisMort: 0.9 },
      vent: { boisMort: 1.2 },
      neige: { mousse: 0.8 },
    },
  },
};
