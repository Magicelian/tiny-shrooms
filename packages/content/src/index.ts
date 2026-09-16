// Valeurs d'équilibrage de la V1 : premier jet, à régler à l'étape 10.
import type { Contenu } from '@tiny-shrooms/engine';

export const contenu: Contenu = {
  stocksDeDepart: { baies: 20, baiesSechees: 0, boisMort: 60, mousse: 10, spores: 0 },
  plafondsDeBase: { baies: 50, baiesSechees: 20, boisMort: 80, mousse: 30, spores: 20 },
  batiments: {
    hutte: { cout: { boisMort: 20 }, constructionSecondes: 30, logement: 2 },
    cueillette: { cout: { boisMort: 15 }, constructionSecondes: 20, production: { baies: 6 } },
    tasDeBois: { cout: { baies: 10 }, constructionSecondes: 20, production: { boisMort: 5 } },
    tapisDeMousse: { cout: { boisMort: 10, baies: 5 }, constructionSecondes: 30, production: { mousse: 3 } },
    gardeManger: { cout: { boisMort: 25 }, constructionSecondes: 40, stockage: { baies: 100, baiesSechees: 50 } },
    remise: { cout: { boisMort: 30 }, constructionSecondes: 40, stockage: { boisMort: 100, mousse: 50 } },
    sechoir: {
      cout: { boisMort: 20, mousse: 10 },
      constructionSecondes: 45,
      production: { baiesSechees: 1 },
      consommation: { baies: 2 },
    },
    feuDeCamp: { cout: { boisMort: 15 }, constructionSecondes: 20 },
    atelier: { cout: { boisMort: 40, mousse: 20 }, constructionSecondes: 60 },
    relais: { cout: { boisMort: 30, mousse: 15 }, constructionSecondes: 60 },
  },
  batimentsDeDepart: ['hutte', 'cueillette', 'tasDeBois', 'tapisDeMousse', 'gardeManger', 'remise', 'feuDeCamp'],
  arbreMere: { sporesParMinute: 1 },
  remboursementDemolition: 0.5,
  temps: { minutesParSaison: 30, minutesParJour: 10 },
};
