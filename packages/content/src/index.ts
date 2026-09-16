// Valeurs d'équilibrage de la V1 : premier jet, à régler à l'étape 16.
import type { Contenu } from '@tiny-shrooms/engine';

export const contenu: Contenu = {
  ile: { taille: 12 },
  // Partie neuve : rien en stock, tout commence par la récolte à la main.
  stocksDeDepart: { baies: 0, baiesSechees: 0, boisMort: 0, mousse: 0, spores: 0 },
  plafondsDeBase: { baies: 50, baiesSechees: 20, boisMort: 80, mousse: 30, spores: 20 },
  batiments: {
    hutte: { cout: { boisMort: 20 }, constructionSecondes: 30, logement: 2, voisinage: [{ voisin: 'feuDeCamp', bonus: 0.1 }] },
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
    feuDeCamp: { cout: { boisMort: 15 }, constructionSecondes: 20 },
    atelier: { cout: { boisMort: 40, mousse: 20 }, constructionSecondes: 60 },
  },
  // Tout est disponible d'emblée en attendant les paliers de population (étape 13).
  batimentsDeDepart: ['hutte', 'cueillette', 'tasDeBois', 'tapisDeMousse', 'gardeManger', 'remise', 'feuDeCamp', 'sechoir', 'atelier'],
  recolte: {
    buisson: { ressource: 'baies', quantite: 3, repousseSecondes: 45 },
    boisMort: { ressource: 'boisMort', quantite: 2, repousseSecondes: 45 },
    mousse: { ressource: 'mousse', quantite: 2, repousseSecondes: 60 },
  },
  // Aucun habitant ni logement au départ : ils arrivent avec la première hutte.
  habitants: {
    auDepart: 0,
    logementDeBase: 0,
    vitesseCasesParSeconde: 1.2,
    capaciteTransport: 5,
    reserveMax: 10,
    baiesParMinute: 0.5,
    ouvriersParChantier: 2,
    delaiArriveeSecondes: 60,
    seuilArrivee: 0.5,
    seuilBonheur: 0.7,
    sporesParHabitantHeureux: 0.2,
    reevaluationSecondes: 30,
    nuit: { debut: 0.85, fin: 0.05 },
    travailAffame: 0.5,
    valeurBaieSechee: 3,
    bienEtre: { base: 0.4, loge: 0.2, nourri: 0.2, affame: -0.2, feuDeCamp: 0.1, minutesPourSeStabiliser: 3 },
  },
  ameliorations: {
    vitesse: { cout: { boisMort: 50, mousse: 25 }, hausseCout: 1.6, effet: 0.15, niveauMax: 3 },
    outils: { cout: { boisMort: 70, mousse: 35 }, hausseCout: 1.6, effet: 0.15, niveauMax: 3 },
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
    rayonChaleur: 2,
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
