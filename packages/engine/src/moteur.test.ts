import { describe, expect, it } from 'vitest';
import type { Contenu, ContenuHabitants, DefinitionBatiment } from './contenu';
import type { Case, Commande, Evenement, MessageDepuisMoteur, TypeBatiment } from './contrat';
import { RESSOURCES, TYPES_BATIMENT } from './contrat';
import { Horloge } from './horloge';
import { genererIle, terrainEn } from './ile';
import { creerEtat } from './etat';
import { Moteur } from './moteur';
import { meteoAu } from './saisons';
import { charger, serialiser, VERSION_SAUVEGARDE } from './sauvegarde';
import type { Etat } from './etat';
import { PAS_PAR_MINUTE } from './temps';

const MINUTE_MS = 60_000;

function contenuDeTest(
  batiments: Partial<Record<TypeBatiment, Partial<DefinitionBatiment>>> = {},
  habitants: Partial<ContenuHabitants> = {},
  autres: Partial<Contenu> = {},
): Contenu {
  const defs = {} as Record<TypeBatiment, DefinitionBatiment>;
  for (const t of TYPES_BATIMENT) defs[t] = { cout: {}, constructionSecondes: 0, ...batiments[t] };
  return {
    ile: { taille: 12 },
    stocksDeDepart: { baies: 100, baiesSechees: 0, boisMort: 100, mousse: 0, spores: 0 },
    plafondsDeBase: { baies: 1000, baiesSechees: 1000, boisMort: 1000, mousse: 1000, spores: 1000 },
    batiments: defs,
    logement: {
      rangs: [
        { places: 2, besoins: ['nourriture'], palier: 0, sporesParMinute: 0 },
        { places: 4, besoins: ['nourriture', 'eau'], cout: { boisMort: 10 }, palier: 1, sporesParMinute: 0 },
      ],
      sources: { eau: 'puits' },
    },
    souche: { coutRetrait: { spores: 0 }, retraitSecondes: 10 },
    defrichage: {
      arbre: { cout: { boisMort: 5 }, secondes: 10, gain: { baies: 3 } },
      buisson: { cout: {}, secondes: 10 },
      plante: { cout: {}, secondes: 5 },
    },
    paliers: [
      { nom: 'hameau', population: 0, debloque: [...TYPES_BATIMENT] },
      { nom: 'village', population: 4, debloque: [] },
    ],
    recolte: {
      buisson: { ressource: 'baies', quantite: 3, repousseSecondes: 10 },
      boisMort: { ressource: 'boisMort', quantite: 2, repousseSecondes: 10 },
      mousse: { ressource: 'mousse', quantite: 2, repousseSecondes: 10 },
    },
    habitants: {
      auDepart: 2,
      logementDeBase: 2,
      vitesseCasesParSeconde: 2,
      capaciteTransport: 5,
      reserveMax: 10,
      baiesParMinute: 0,
      ouvriersParChantier: 2,
      delaiArriveeSecondes: 10,
      seuilArrivee: 0.5,
      seuilBonheur: 0.99,
      reevaluationSecondes: 30,
      nuit: { debut: 0, fin: 0 },
      travailAffame: 1,
      valeurBaieSechee: 1,
      bienEtre: { base: 0.4, loge: 0.2, besoins: 0.2, affame: -0.4, minutesPourSeStabiliser: 1 },
      ...habitants,
    },
    ameliorations: {
      vitesse: { cout: { boisMort: 10 }, hausseCout: 2, effet: 0.5, niveauMax: 2 },
      outils: { cout: { boisMort: 10 }, hausseCout: 2, effet: 0.5, niveauMax: 2 },
    },
    prestige: {
      gain: { diviseur: 1, puissance: 1 },
      bonus: {
        production: { cout: 1, hausseCout: 2, niveauMax: 3 },
        depart: { cout: 1, hausseCout: 2, niveauMax: 3 },
        construction: { cout: 1, hausseCout: 2, niveauMax: 3 },
        logement: { cout: 1, hausseCout: 2, niveauMax: 3 },
      },
      effets: {
        production: 0.5,
        stocksDeDepart: { mousse: 10 },
        habitantsDeDepart: 1,
        reductionCout: 0.5,
        vitesseChantier: 1,
        bienEtre: 0.1,
        places: 1,
        accueil: 0,
      },
    },
    remboursementDemolition: 0.5,
    temps: { minutesParSaison: 30, minutesParJour: 10, heureDeDepart: 0 },
    saisons: { production: { printemps: {}, ete: {}, automne: {}, hiver: {} }, travailAuFroid: 1 },
    meteo: {
      minutesParPeriode: 5,
      probabilites: { printemps: { soleil: 1 }, ete: { soleil: 1 }, automne: { soleil: 1 }, hiver: { soleil: 1 } },
      production: { soleil: {}, pluie: {}, vent: {}, neige: {} },
    },
    ...autres,
  };
}

function poser(batiment: TypeBatiment, c: Case): Commande {
  return { type: 'poserBatiment', batiment, case: c, orientation: 0 };
}

function commander(moteur: Moteur, commande: Commande): Evenement[] {
  const [message] = moteur.recevoir({ type: 'commande', commande }, 0);
  return message?.type === 'instantane' ? message.evenements : [];
}

function instantaneDe(messages: MessageDepuisMoteur[]) {
  const m = messages.find((x) => x.type === 'instantane');
  if (m?.type !== 'instantane') throw new Error('instantané attendu');
  return m.instantane;
}

/** Première case libre dont un voisin a ce terrain, ou la plus proche de la souche. */
function caseLibre(moteur: Moteur, voisin?: string): Case {
  const ile = moteur.etatCourant.ile;
  const cases = moteur.casesLibres();
  const trouvee = voisin
    ? cases.find((c) => [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => terrainEn(ile, c.x + dx, c.y + dy) === voisin)))
    : cases[0];
  if (!trouvee) throw new Error(`aucune case libre près de ${voisin}`);
  return trouvee;
}

describe('Horloge', () => {
  it('rattrape tout un gel de 20 minutes', () => {
    expect(new Horloge(0).pasARattraper(20 * MINUTE_MS)).toBe(20 * PAS_PAR_MINUTE);
  });

  it('garde le reste de l’écart pour le battement suivant', () => {
    const h = new Horloge(0);
    expect(h.pasARattraper(300)).toBe(1);
    expect(h.pasARattraper(500)).toBe(1);
  });

  it('ne rattrape jamais le temps passé en veille', () => {
    const h = new Horloge(0);
    expect(h.veille(MINUTE_MS)).toBe(PAS_PAR_MINUTE);
    expect(h.pasARattraper(10 * MINUTE_MS)).toBe(0);
    h.reveil(60 * MINUTE_MS);
    expect(h.pasARattraper(60 * MINUTE_MS + 1000)).toBe(4);
  });

  it('repart proprement si l’horloge recule', () => {
    const h = new Horloge(10_000);
    expect(h.pasARattraper(5_000)).toBe(0);
    expect(h.pasARattraper(6_000)).toBe(4);
  });
});

describe('Grille', () => {
  it('génère la même île pour la même graine', () => {
    const a = new Moteur(contenuDeTest(), 0).etatCourant.ile;
    const b = new Moteur(contenuDeTest(), 0).etatCourant.ile;
    expect(a).toEqual(b);
    expect(a.terrain).toContain('foret');
    expect(a.terrain).toContain('eau');
  });

  it('refuse les emplacements hors île, occupés ou sur la souche-dépôt', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    const { ile } = moteur.etatCourant;
    const libre = caseLibre(moteur);
    const foret = ile.terrain.indexOf('foret');
    const raison = (c: Case) => commander(moteur, poser('hutte', c))[0];
    expect(raison({ x: -1, y: 0 })).toMatchObject({ raison: 'horsIle' });
    expect(raison({ x: foret % ile.largeur, y: Math.floor(foret / ile.largeur) })).toMatchObject({ raison: 'emplacementOccupe' });
    expect(raison(ile.souche)).toMatchObject({ raison: 'emplacementOccupe' });
    expect(raison(libre)).toBeUndefined();
    expect(raison(libre)).toMatchObject({ raison: 'emplacementOccupe' });
  });

  it('déplace un bâtiment seulement vers une case libre', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    const [a, b] = moteur.casesLibres();
    commander(moteur, poser('hutte', a!));
    commander(moteur, poser('hutte', b!));
    expect(commander(moteur, { type: 'deplacerBatiment', id: 1, case: b!, orientation: 1 })[0]).toMatchObject({ raison: 'emplacementOccupe' });
    const [, , c] = moteur.casesLibres();
    expect(commander(moteur, { type: 'deplacerBatiment', id: 1, case: c!, orientation: 1 })).toEqual([]);
    expect(moteur.etatCourant.batiments[0]).toMatchObject({ case: c, orientation: 1 });
  });

  it('applique le bonus de voisinage', () => {
    const moteur = new Moteur(contenuDeTest({ cueillette: { voisinage: [{ voisin: 'buisson', bonus: 0.25 }] } }), 0);
    commander(moteur, poser('cueillette', caseLibre(moteur, 'buisson')));
    expect(moteur.etatCourant.batiments[0]!.bonusVoisinage).toBe(1.25);
  });
});

describe('Habitants', () => {
  it('construisent à deux, deux fois plus vite', () => {
    const moteur = new Moteur(contenuDeTest({ hutte: { constructionSecondes: 60 } }), 0);
    commander(moteur, poser('hutte', caseLibre(moteur)));
    const evenements = moteur.simuler(PAS_PAR_MINUTE);
    expect(evenements).toContainEqual({ type: 'constructionTerminee', id: 1 });
  });

  it('récoltent puis portent la récolte jusqu’au dépôt', () => {
    const moteur = new Moteur(contenuDeTest({ cueillette: { production: { baies: 12 } } }), 0);
    commander(moteur, poser('cueillette', caseLibre(moteur)));
    moteur.simuler(5 * PAS_PAR_MINUTE);
    const { stocks, habitants } = moteur.etatCourant;
    expect(stocks.baies).toBeGreaterThan(110);
    expect(habitants.map((h) => h.tache)).toContain('recolter');
  });

  it('ne ramassent que ce qui tient dans le stock, sans rien perdre', () => {
    const contenu = contenuDeTest({ cueillette: { production: { baies: 60 } } });
    contenu.plafondsDeBase.baies = 102;
    const moteur = new Moteur(contenu, 0);
    commander(moteur, poser('cueillette', caseLibre(moteur)));
    moteur.simuler(3 * PAS_PAR_MINUTE);
    const { stocks, habitants, batiments } = moteur.etatCourant;
    expect(stocks.baies).toBeCloseTo(102);
    expect(habitants.every((h) => h.charge === null)).toBe(true);
    expect(batiments[0]!.reserve.baies).toBeGreaterThan(0);
  });

  it('arrivent quand il y a de la place et du bien-être', () => {
    const moteur = new Moteur(contenuDeTest({ hutte: { logement: true, constructionSecondes: 10 } }), 0);
    moteur.simuler(2 * PAS_PAR_MINUTE);
    expect(moteur.etatCourant.habitants).toHaveLength(2);
    commander(moteur, poser('hutte', caseLibre(moteur)));
    const evenements = moteur.simuler(2 * PAS_PAR_MINUTE);
    expect(moteur.etatCourant.habitants).toHaveLength(4);
    expect(evenements.filter((e) => e.type === 'habitantArrive')).toHaveLength(2);
  });

  it('perdent du bien-être sans nourriture, mais restent', () => {
    const contenu = contenuDeTest({}, { baiesParMinute: 1 });
    contenu.stocksDeDepart.baies = 0;
    const moteur = new Moteur(contenu, 0);
    moteur.simuler(5 * PAS_PAR_MINUTE);
    expect(moteur.etatCourant.habitants).toHaveLength(2);
    expect(moteur.etatCourant.habitants[0]!.bienEtre).toBeLessThan(0.3);
  });

  it('dorment la nuit', () => {
    const moteur = new Moteur(contenuDeTest({}, { nuit: { debut: 0.5, fin: 0 } }), 0);
    moteur.simuler(6 * PAS_PAR_MINUTE);
    expect(moteur.etatCourant.habitants.every((h) => h.activite === 'dort')).toBe(true);
  });
});

describe('Commandes', () => {
  it('fait payer la construction et refuse sans les moyens', () => {
    const moteur = new Moteur(contenuDeTest({ hutte: { cout: { boisMort: 60 } } }), 0);
    const [a, b] = moteur.casesLibres();
    expect(commander(moteur, poser('hutte', a!))).toEqual([]);
    expect(moteur.etatCourant.stocks.boisMort).toBe(40);
    expect(commander(moteur, poser('hutte', b!))[0]).toMatchObject({ raison: 'ressourcesInsuffisantes' });
  });

  it('refuse un bâtiment non débloqué', () => {
    const contenu = contenuDeTest();
    contenu.paliers = [{ nom: 'hameau', population: 0, debloque: ['hutte'] }];
    const moteur = new Moteur(contenu, 0);
    expect(commander(moteur, poser('atelier', caseLibre(moteur)))[0]).toMatchObject({ raison: 'nonDebloque' });
  });

  it('rembourse une partie du coût et la réserve à la démolition', () => {
    const moteur = new Moteur(contenuDeTest({ hutte: { cout: { boisMort: 60 } } }), 0);
    commander(moteur, poser('hutte', caseLibre(moteur)));
    (moteur.etatCourant.batiments[0]!.reserve as { baies?: number }).baies = 4;
    commander(moteur, { type: 'demolir', id: 1 });
    expect(moteur.etatCourant.stocks).toMatchObject({ boisMort: 70, baies: 104 });
    expect(moteur.etatCourant.batiments).toEqual([]);
  });
});

describe('Moteur', () => {
  it('envoie l’île puis un instantané au démarrage', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    const messages = moteur.recevoir({ type: 'demarrer', sauvegardes: [] }, 0);
    expect(messages.map((m) => m.type)).toEqual(['ile', 'partieChargee', 'instantane']);
    expect(messages[1]).toEqual({ type: 'partieChargee', origine: 'nouvelle' });
    expect(instantaneDe(messages).habitants[0]).not.toHaveProperty('mission');
  });

  it('rattrape le temps réel et publie les événements une seule fois', () => {
    const moteur = new Moteur(contenuDeTest({ hutte: { constructionSecondes: 1 } }), 0);
    moteur.recevoir({ type: 'commande', commande: poser('hutte', caseLibre(moteur)) }, 0);
    expect(moteur.battre(10 * MINUTE_MS)[0]).toMatchObject({ evenements: [{ type: 'constructionTerminee', id: 1 }] });
    expect(instantaneDe(moteur.battre(10 * MINUTE_MS)).temps.pas).toBe(10 * PAS_PAR_MINUTE);
    expect(moteur.battre(10 * MINUTE_MS)[0]).toMatchObject({ evenements: [] });
  });

  it('se met en pause pendant la veille', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    expect(instantaneDe(moteur.recevoir({ type: 'veille', momentMs: MINUTE_MS }, MINUTE_MS)).temps).toMatchObject({ enPause: true, pas: PAS_PAR_MINUTE });
    expect(instantaneDe(moteur.battre(30 * MINUTE_MS)).temps.pas).toBe(PAS_PAR_MINUTE);
    moteur.recevoir({ type: 'reveil' }, 30 * MINUTE_MS);
    expect(instantaneDe(moteur.battre(31 * MINUTE_MS)).temps).toMatchObject({ enPause: false, pas: 2 * PAS_PAR_MINUTE });
  });

  it('s’arrête à l’instant de la veille même si le message arrive après le réveil', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    expect(instantaneDe(moteur.recevoir({ type: 'veille', momentMs: MINUTE_MS }, 60 * MINUTE_MS)).temps.pas).toBe(PAS_PAR_MINUTE);
    moteur.recevoir({ type: 'reveil' }, 60 * MINUTE_MS);
    expect(instantaneDe(moteur.battre(61 * MINUTE_MS)).temps.pas).toBe(2 * PAS_PAR_MINUTE);
  });

  it('reprend une sauvegarde à l’identique', () => {
    const contenu = contenuDeTest({ cueillette: { production: { baies: 6 } } });
    const moteur = new Moteur(contenu, 0);
    commander(moteur, poser('cueillette', caseLibre(moteur)));
    moteur.simuler(1000);
    const reprise = new Moteur(contenu, 0);
    const messages = reprise.recevoir({ type: 'demarrer', sauvegardes: [sauvegarder(moteur)] }, 0);
    expect(messages[1]).toEqual({ type: 'partieChargee', origine: 'sauvegarde' });
    expect(reprise.etatCourant).toEqual(moteur.etatCourant);
    reprise.simuler(500);
    moteur.simuler(500);
    expect(reprise.etatCourant).toEqual(moteur.etatCourant);
  });

  it('ne rapporte rien pendant une heure jeu fermé', () => {
    const contenu = contenuDeTest({ cueillette: { production: { baies: 6 } } });
    const moteur = new Moteur(contenu, 0);
    commander(moteur, poser('cueillette', caseLibre(moteur)));
    moteur.simuler(1000);
    const reprise = new Moteur(contenu, 60 * MINUTE_MS);
    reprise.recevoir({ type: 'demarrer', sauvegardes: [sauvegarder(moteur)] }, 60 * MINUTE_MS);
    expect(reprise.battre(60 * MINUTE_MS + 100)).toMatchObject([{ instantane: { temps: { pas: 1000 } } }]);
    expect(reprise.etatCourant).toEqual(moteur.etatCourant);
  });

  it('reprend sur la copie de secours la plus récente quand le fichier principal est abîmé', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    moteur.simuler(40);
    const ancienne = sauvegarder(moteur);
    moteur.simuler(40);
    const recente = sauvegarder(moteur);
    const abime = recente.slice(0, recente.length / 2);
    const reprise = new Moteur(contenu, 0);
    const messages = reprise.recevoir({ type: 'demarrer', sauvegardes: [abime, '{"version":1,"etat":{}}', recente, ancienne] }, 0);
    expect(messages[1]).toEqual({ type: 'partieChargee', origine: 'secours' });
    expect(reprise.etatCourant.pas).toBe(80);
  });

  it('commence une nouvelle partie si aucun fichier n’est lisible', () => {
    const reprise = new Moteur(contenuDeTest(), 0);
    const messages = reprise.recevoir({ type: 'demarrer', sauvegardes: ['', '{"version":99,"etat":{}}'] }, 0);
    expect(messages[1]).toEqual({ type: 'partieChargee', origine: 'illisible' });
    expect(reprise.etatCourant.pas).toBe(0);
  });

  it('repart de zéro devant une sauvegarde d’avant la réorientation', () => {
    const reprise = new Moteur(contenuDeTest(), 0);
    const ancienne = JSON.stringify({ version: 3, etat: { pas: 500 } });
    const messages = reprise.recevoir({ type: 'demarrer', sauvegardes: [ancienne, ''] }, 0);
    expect(messages[1]).toEqual({ type: 'partieChargee', origine: 'ancienne' });
    expect(reprise.etatCourant.pas).toBe(0);
  });
});

describe('charger', () => {
  it('écrit la version courante et refuse un fichier sans version', () => {
    const etat = new Moteur(contenuDeTest(), 0).etatCourant;
    expect(JSON.parse(serialiser(etat))).toMatchObject({ version: VERSION_SAUVEGARDE });
    expect(charger(serialiser(etat))).toEqual(etat);
    expect(() => charger(JSON.stringify(etat))).toThrow();
  });
});

function sauvegarder(moteur: Moteur): string {
  const [message] = moteur.recevoir({ type: 'sauvegarder' }, 0);
  if (message?.type !== 'sauvegarde') throw new Error('sauvegarde attendue');
  return message.contenu;
}

describe('Saisons et météo', () => {
  const MIN = PAS_PAR_MINUTE;
  const AUTOMNE = 60 * MIN;
  const HIVER = 90 * MIN;
  const saisonsNeutres = { production: { printemps: {}, ete: {}, automne: {}, hiver: {} }, travailAuFroid: 1 };

  /** Moteur dont la partie commence au pas donné. */
  function moteurAu(contenu: Contenu, pas: number): Moteur {
    const etat = creerEtat(contenu);
    etat.pas = pas;
    return new Moteur(contenu, 0, etat);
  }

  it('enchaîne une année complète', () => {
    const contenu = contenuDeTest({}, {}, { temps: { minutesParSaison: 1, minutesParJour: 10, heureDeDepart: 0 } });
    const moteur = new Moteur(contenu, 0);
    const saisons = moteur.simuler(4 * MIN).flatMap((e) => (e.type === 'saisonChangee' ? [e.saison] : []));
    expect(saisons).toEqual(['ete', 'automne', 'hiver', 'printemps']);
    expect(instantaneDe(moteur.battre(0)).temps).toMatchObject({ annee: 2, saison: 'printemps' });
  });

  it('tire la météo selon la saison, toujours la même pour une graine', () => {
    const contenu = contenuDeTest();
    contenu.meteo.probabilites = { printemps: { soleil: 1, pluie: 1 }, ete: {}, automne: {}, hiver: { neige: 1 } };
    const printemps = Array.from({ length: 6 }, (_, k) => meteoAu(k * 5 * MIN, 1, contenu));
    expect(new Set(printemps)).toEqual(new Set(['soleil', 'pluie']));
    expect(Array.from({ length: 6 }, (_, k) => meteoAu(k * 5 * MIN, 1, contenu))).toEqual(printemps);
    for (let k = 0; k < 6; k++) expect(meteoAu(HIVER + k * 5 * MIN, 1, contenu)).toBe('neige');
  });

  it('ne fait pousser aucune baie en hiver, sans rien faire perdre', () => {
    const contenu = contenuDeTest(
      { cueillette: { production: { baies: 6 } } },
      { baiesParMinute: 5 },
      { saisons: { ...saisonsNeutres, production: { ...saisonsNeutres.production, hiver: { baies: 0 } } } },
    );
    const moteur = moteurAu(contenu, HIVER);
    commander(moteur, poser('cueillette', caseLibre(moteur)));
    moteur.simuler(5 * MIN);
    expect(moteur.etatCourant.stocks.baies).toBeCloseTo(50);
    moteur.simuler(10 * MIN);
    const { stocks, habitants, batiments } = moteur.etatCourant;
    expect(batiments[0]!.reserve).toEqual({});
    expect(habitants.map((h) => h.tache)).not.toContain('recolter');
    expect(habitants).toHaveLength(2);
    for (const r of RESSOURCES) expect(stocks[r]).toBeGreaterThanOrEqual(0);
  });

  it('ralentit le travail au froid, sauf près d’un feu de camp', () => {
    const contenu = contenuDeTest({ tasDeBois: { production: { boisMort: 6 } }, feuDeCamp: { portee: 2 } }, { reserveMax: 1000 }, {
      saisons: { ...saisonsNeutres, travailAuFroid: 0.5 },
    });
    const recolte = (pas: number, feu: boolean) => {
      const moteur = moteurAu(contenu, pas);
      const tas = caseLibre(moteur);
      commander(moteur, poser('tasDeBois', tas));
      if (feu) {
        const proche = moteur.casesLibres().find((c) => Math.max(Math.abs(c.x - tas.x), Math.abs(c.y - tas.y)) <= 2);
        commander(moteur, poser('feuDeCamp', proche!));
      }
      const avant = moteur.etatCourant.stocks.boisMort;
      moteur.simuler(2 * MIN);
      // Les porteurs déplacent la récolte : on compte le stock, la réserve et ce qui est en chemin.
      const { stocks, batiments, habitants } = moteur.etatCourant;
      const enChemin = habitants.reduce((s, h) => s + (h.charge?.quantite ?? 0), 0);
      return stocks.boisMort - avant + (batiments[0]!.reserve.boisMort ?? 0) + enChemin;
    };
    const automne = recolte(AUTOMNE, false);
    expect(automne).toBeGreaterThan(5);
    // À 1 % près : les habitants sans travail ne cherchent qu'à intervalles, les trajets décalent la récolte de quelques pas.
    expect(recolte(HIVER, false) / automne).toBeCloseTo(0.5, 1);
    expect(recolte(HIVER, true) / automne).toBeCloseTo(1, 1);
  });

  it('va se réchauffer au feu quand il n’a rien à faire en hiver', () => {
    const moteur = moteurAu(contenuDeTest(), HIVER);
    commander(moteur, poser('feuDeCamp', caseLibre(moteur)));
    moteur.simuler(MIN);
    expect(moteur.etatCourant.habitants.map((h) => h.activite)).toEqual(['seRechauffe', 'seRechauffe']);
  });

  it('compte une baie séchée pour plusieurs baies fraîches', () => {
    const contenu = contenuDeTest({}, { baiesParMinute: 3, valeurBaieSechee: 3 });
    contenu.stocksDeDepart = { ...contenu.stocksDeDepart, baies: 0, baiesSechees: 10 };
    const moteur = new Moteur(contenu, 0);
    moteur.simuler(MIN);
    expect(moteur.etatCourant.stocks.baiesSechees).toBeCloseTo(8);
  });
});

describe('Améliorations', () => {
  it('se paient à un atelier achevé, de plus en plus cher, jusqu’au niveau maximal', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    const ameliorer: Commande = { type: 'ameliorer', cible: { village: 'outils' } };
    expect(commander(moteur, ameliorer)).toMatchObject([{ raison: 'indisponible' }]);
    commander(moteur, poser('atelier', caseLibre(moteur)));
    // Sans durée de travaux, l'amélioration prend tout de suite.
    expect(commander(moteur, ameliorer)).toEqual([{ type: 'villageAmeliore', amelioration: 'outils', niveau: 1 }]);
    expect(commander(moteur, ameliorer)).toEqual([{ type: 'villageAmeliore', amelioration: 'outils', niveau: 2 }]);
    expect(moteur.etatCourant.stocks.boisMort).toBe(70);
    expect(commander(moteur, ameliorer)).toMatchObject([{ raison: 'indisponible' }]);
    expect(instantaneDe(moteur.recevoir({ type: 'battre' }, 0)).ameliorations).toEqual({ vitesse: 0, outils: 2 });
  });

  it('avec une durée de travaux, l’amélioration attend les bâtisseurs', () => {
    const contenu = contenuDeTest();
    contenu.ameliorations.outils.travauxSecondes = 20;
    const moteur = new Moteur(contenu, 0);
    const ameliorer: Commande = { type: 'ameliorer', cible: { village: 'outils' } };
    commander(moteur, poser('atelier', caseLibre(moteur)));
    expect(commander(moteur, ameliorer)).toEqual([]);
    const atelier = moteur.etatCourant.batiments[0]!;
    expect(atelier.amelioration).toMatchObject({ village: 'outils', avancement: 0 });
    expect(moteur.etatCourant.ameliorations.outils).toBe(0);
    // Une seconde fois : les travaux en cours occupent l'atelier.
    expect(commander(moteur, ameliorer)[0]).toMatchObject({ raison: 'indisponible' });
    const evenements = moteur.simuler(PAS_PAR_MINUTE);
    expect(evenements).toContainEqual({ type: 'villageAmeliore', amelioration: 'outils', niveau: 1 });
    expect(atelier.amelioration).toBeNull();
    expect(moteur.etatCourant.ameliorations.outils).toBe(1);
  });

  it('les outils accélèrent la récolte', () => {
    const recolte = (niveau: number) => {
      const moteur = new Moteur(contenuDeTest({ cueillette: { production: { baies: 6 } } }), 0);
      commander(moteur, poser('atelier', caseLibre(moteur)));
      for (let i = 0; i < niveau; i++) commander(moteur, { type: 'ameliorer', cible: { village: 'outils' } });
      commander(moteur, poser('cueillette', caseLibre(moteur)));
      moteur.simuler(PAS_PAR_MINUTE / 2);
      return moteur.etatCourant.batiments[1]!.reserve.baies ?? 0;
    };
    expect(recolte(1)).toBeGreaterThan(recolte(0) * 1.4);
  });
});

describe('Récolte à la main', () => {
  const premier = (moteur: Moteur, type: string) => moteur.etatCourant.ile.elements.findIndex((e) => e.type === type);

  it('sème buissons, bois mort et mousse hors des cases à bâtir', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    const { ile } = moteur.etatCourant;
    for (const type of ['buisson', 'boisMort', 'mousse']) expect(premier(moteur, type)).toBeGreaterThanOrEqual(0);
    const element = ile.elements[premier(moteur, 'boisMort')]!;
    expect(commander(moteur, poser('hutte', element.case))).toMatchObject([{ raison: 'emplacementOccupe' }]);
  });

  it('donne un peu de ressource, épuise l’élément, puis le laisse repousser', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    const element = premier(moteur, 'boisMort');
    const recolter: Commande = { type: 'recolter', element };
    expect(commander(moteur, recolter)).toEqual([{ type: 'recolte', element, ressource: 'boisMort', quantite: 2 }]);
    expect(moteur.etatCourant.stocks.boisMort).toBe(102);
    expect(commander(moteur, recolter)).toMatchObject([{ raison: 'pasPret' }]);
    moteur.simuler(PAS_PAR_MINUTE / 6);
    expect(commander(moteur, recolter)).toMatchObject([{ type: 'recolte' }]);
  });

  it('ne donne que ce qui tient dans le stock', () => {
    const moteur = new Moteur(contenuDeTest({}, {}, { plafondsDeBase: { baies: 1000, baiesSechees: 1000, boisMort: 101, mousse: 1000, spores: 1000 } }), 0);
    const element = premier(moteur, 'boisMort');
    expect(commander(moteur, { type: 'recolter', element })).toMatchObject([{ quantite: 1 }]);
    moteur.simuler(PAS_PAR_MINUTE / 6);
    expect(commander(moteur, { type: 'recolter', element })).toMatchObject([{ raison: 'stockPlein' }]);
  });

  it('ne fait pas repousser les buissons en hiver', () => {
    const hiver = { printemps: { baies: 0 }, ete: {}, automne: {}, hiver: {} };
    const moteur = new Moteur(contenuDeTest({}, {}, { saisons: { production: hiver, travailAuFroid: 1 } }), 0);
    const element = premier(moteur, 'buisson');
    commander(moteur, { type: 'recolter', element });
    moteur.simuler(PAS_PAR_MINUTE);
    expect(commander(moteur, { type: 'recolter', element })).toMatchObject([{ raison: 'pasPret' }]);
  });

  it('sans habitants, un chantier avance seul', () => {
    const moteur = new Moteur(contenuDeTest({ hutte: { constructionSecondes: 30 } }, { auDepart: 0, logementDeBase: 0 }), 0);
    commander(moteur, poser('hutte', caseLibre(moteur)));
    moteur.simuler(PAS_PAR_MINUTE / 2 + 1);
    expect(moteur.etatCourant.batiments[0]!.chantier).toBeNull();
  });

  it('migre une sauvegarde de version 4 sans semer sur les bâtiments', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    commander(moteur, poser('hutte', caseLibre(moteur)));
    const { ile, pousses: _p, ...reste } = moteur.etatCourant;
    const { elements: _e, ...ileV4 } = ile;
    const etat = charger(JSON.stringify({ version: 4, etat: { ...reste, ile: ileV4 } }));
    expect(etat.pousses).toHaveLength(etat.ile.elements.length);
    const hutte = etat.batiments[0]!.case;
    expect(etat.ile.elements.some((e) => e.case.x === hutte.x && e.case.y === hutte.y)).toBe(false);
  });
});

describe('Arrivages', () => {
  it('une livraison entre dans les stocks peu à peu, sans à-coup', () => {
    const moteur = new Moteur(contenuDeTest({}, { auDepart: 0 }), 0);
    const etat = moteur.etatCourant as Etat;
    etat.arrivages.baies = 6;
    moteur.simuler(PAS_PAR_MINUTE / 6);
    const apres10s = etat.stocks.baies - 100;
    expect(apres10s).toBeGreaterThan(0.5);
    expect(apres10s).toBeLessThan(1.5);
    moteur.simuler(10 * PAS_PAR_MINUTE);
    expect(etat.stocks.baies).toBeCloseTo(106);
    expect(etat.arrivages.baies).toBe(0);
  });
});

describe('Logements et paliers', () => {
  const contenuVillage = () => contenuDeTest({ hutte: { logement: true }, puits: { portee: 2 } });
  const hutteEt = (moteur: Moteur) => moteur.etatCourant.batiments.find((b) => b.type === 'hutte')!;
  const monter = (moteur: Moteur, id: number) => commander(moteur, { type: 'ameliorer', cible: { batiment: id } });

  it('suit les besoins du rang actuel et du suivant', () => {
    const moteur = new Moteur(contenuVillage(), 0);
    commander(moteur, poser('hutte', caseLibre(moteur)));
    moteur.simuler(1);
    expect(hutteEt(moteur).besoins).toEqual({ nourriture: true, eau: false });
  });

  it('franchit un palier avec la population, puis monte en gamme une fois le puits à portée', () => {
    const moteur = new Moteur(contenuVillage(), 0);
    const c = caseLibre(moteur);
    commander(moteur, poser('hutte', c));
    const hutte = hutteEt(moteur);
    expect(monter(moteur, hutte.id)[0]).toMatchObject({ raison: 'nonDebloque' });

    const evenements = moteur.simuler(2 * PAS_PAR_MINUTE);
    expect(moteur.etatCourant.habitants).toHaveLength(4);
    expect(evenements).toContainEqual({ type: 'palierAtteint', palier: 1, debloques: [] });
    expect(moteur.etatCourant.palier).toBe(1);
    expect(monter(moteur, hutte.id)[0]).toMatchObject({ raison: 'besoinsManquants' });

    const puits = moteur.casesLibres().find((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) <= 2)!;
    commander(moteur, poser('puits', puits));
    moteur.simuler(1);
    const bois = moteur.etatCourant.stocks.boisMort;
    expect(monter(moteur, hutte.id)).toEqual([{ type: 'logementAmeliore', id: hutte.id, niveau: 2 }]);
    expect(moteur.etatCourant.stocks.boisMort).toBe(bois - 10);
    moteur.simuler(2 * PAS_PAR_MINUTE);
    expect(moteur.etatCourant.habitants).toHaveLength(6);
    expect(monter(moteur, hutte.id)[0]).toMatchObject({ raison: 'indisponible' });
  });

  it('avec une durée de travaux, l’agrandissement attend les bâtisseurs', () => {
    const contenu = contenuVillage();
    contenu.logement.rangs[1]!.agrandissementSecondes = 20;
    const moteur = new Moteur(contenu, 0);
    const c = caseLibre(moteur);
    commander(moteur, poser('hutte', c));
    moteur.simuler(2 * PAS_PAR_MINUTE);
    const puits = moteur.casesLibres().find((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) <= 2)!;
    commander(moteur, poser('puits', puits));
    moteur.simuler(1);
    const hutte = hutteEt(moteur);
    expect(monter(moteur, hutte.id)).toEqual([]);
    expect(hutte.niveau).toBe(1);
    expect(hutte.agrandissement).toBe(0);
    expect(monter(moteur, hutte.id)[0]).toMatchObject({ raison: 'indisponible' });
    const evenements = moteur.simuler(PAS_PAR_MINUTE);
    expect(evenements).toContainEqual({ type: 'logementAmeliore', id: hutte.id, niveau: 2 });
    expect(hutte.agrandissement).toBeNull();
  });

  it('un besoin manquant baisse le bien-être sans faire partir personne ni redescendre', () => {
    const moteur = new Moteur(contenuVillage(), 0);
    const c = caseLibre(moteur);
    commander(moteur, poser('hutte', c));
    moteur.simuler(2 * PAS_PAR_MINUTE);
    const puits = moteur.casesLibres().find((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) <= 2)!;
    commander(moteur, poser('puits', puits));
    moteur.simuler(1);
    monter(moteur, hutteEt(moteur).id);
    moteur.simuler(3 * PAS_PAR_MINUTE);
    const avant = moteur.etatCourant.habitants.length;
    commander(moteur, { type: 'demolir', id: moteur.etatCourant.batiments.find((b) => b.type === 'puits')!.id });
    moteur.simuler(5 * PAS_PAR_MINUTE);
    const { habitants } = moteur.etatCourant;
    expect(habitants.length).toBeGreaterThanOrEqual(avant);
    expect(hutteEt(moteur).niveau).toBe(2);
    expect(hutteEt(moteur).besoins.eau).toBe(false);
    // Hutte au rang 2 sans eau : la moitié des besoins, soit 0,4 + 0,2 + 0,2 × ½.
    expect(habitants.slice(2).every((h) => h.bienEtre < 0.75)).toBe(true);
  });

  it('rembourse aussi la montée en gamme à la démolition', () => {
    const moteur = new Moteur(contenuVillage(), 0);
    commander(moteur, poser('hutte', caseLibre(moteur)));
    const hutte = hutteEt(moteur);
    hutte.niveau = 2;
    const bois = moteur.etatCourant.stocks.boisMort;
    commander(moteur, { type: 'demolir', id: hutte.id });
    expect(moteur.etatCourant.stocks.boisMort).toBe(bois + 5);
  });

  it('un logement consomme sa ressource et signale le manque', () => {
    const contenu = contenuVillage();
    contenu.logement.rangs[0] = { places: 2, besoins: ['nourriture', 'mousse'], palier: 0, sporesParMinute: 0, consommation: { mousse: 6 } };
    contenu.stocksDeDepart.mousse = 1;
    const moteur = new Moteur(contenu, 0);
    commander(moteur, poser('hutte', caseLibre(moteur)));
    moteur.simuler(PAS_PAR_MINUTE / 12);
    expect(moteur.etatCourant.stocks.mousse).toBeCloseTo(0.5);
    expect(hutteEt(moteur).besoins.mousse).toBe(true);
    moteur.simuler(PAS_PAR_MINUTE / 6);
    expect(moteur.etatCourant.stocks.mousse).toBe(0);
    expect(hutteEt(moteur).besoins.mousse).toBe(false);
  });

  it('un emploi sans production est tenu par un habitant', () => {
    const moteur = new Moteur(contenuDeTest({ marche: { postes: 1 } }), 0);
    commander(moteur, poser('marche', caseLibre(moteur)));
    moteur.simuler(PAS_PAR_MINUTE);
    const [message] = moteur.recevoir({ type: 'commande', commande: { type: 'demolir', id: 999 } }, 0);
    const instantane = message?.type === 'instantane' ? message.instantane : null;
    const marche = moteur.etatCourant.batiments[0]!;
    expect(instantane?.habitants.filter((h) => h.lieu === marche.id && h.tache === 'tenir')).toHaveLength(1);
    expect(instantane?.habitants.some((h) => h.activite === 'tient')).toBe(true);
  });

  it('migre une sauvegarde de version 5 en rebloquant les bâtiments de palier', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    commander(moteur, poser('hutte', caseLibre(moteur)));
    const { palier: _p, batiments, ...reste } = moteur.etatCourant;
    const v5 = { ...reste, batimentsDebloques: ['hutte', 'sechoir', 'atelier'], batiments: batiments.map(({ besoins: _b, ...b }) => b) };
    const etat = charger(JSON.stringify({ version: 5, etat: v5 }));
    expect(etat.palier).toBe(0);
    expect(etat.batimentsDebloques).toEqual(['hutte']);
    expect(etat.batiments[0]!.besoins).toEqual({});
  });
});

describe('Nuit', () => {
  it('chacun rentre dormir au pied de son logement', () => {
    const contenu = contenuDeTest({ hutte: { logement: true } }, { auDepart: 0, logementDeBase: 0 });
    contenu.habitants.nuit = { debut: 0.5, fin: 0.9 };
    const moteur = new Moteur(contenu, 0);
    commander(moteur, poser('hutte', caseLibre(moteur)));
    moteur.simuler(2 * PAS_PAR_MINUTE);
    expect(moteur.etatCourant.habitants).toHaveLength(2);
    // Jour de 10 min qui commence à minuit : la nuit débute à 5 min.
    moteur.simuler(4 * PAS_PAR_MINUTE);
    const [message] = moteur.recevoir({ type: 'commande', commande: { type: 'demolir', id: -1 } }, 0);
    const instantane = message?.type === 'instantane' ? message.instantane : null;
    expect(instantane?.temps.nuit).toBe(true);
    const hutte = moteur.etatCourant.batiments[0]!.case;
    for (const h of moteur.etatCourant.habitants) {
      expect(h.activite).toBe('dort');
      expect(Math.hypot(h.position.x - hutte.x - 0.5, h.position.y - hutte.y - 0.5)).toBeLessThan(0.7);
    }
  });
});

describe('Chemins', () => {
  it('les habitants contournent les bâtiments qui ne sont pas leur destination', () => {
    const contenu = contenuDeTest({ cueillette: { production: { baies: 6 }, postes: 2 } }, { auDepart: 4, logementDeBase: 4 });
    const moteur = new Moteur(contenu, 0);
    const libres = moteur.casesLibres();
    const etat = moteur.etatCourant;
    // Un mur de huttes à l'est de la souche, percé d'une seule ouverture ; la cueillette derrière.
    const mur = etat.ile.souche.x + etat.ile.tailleSouche + 1;
    const colonne = libres.filter((c) => c.x === mur).sort((p, q) => p.y - q.y);
    for (const c of colonne.slice(0, -1)) commander(moteur, poser('hutte', c));
    const derriere = libres.filter((c) => c.x > mur + 1 && c.y === etat.ile.souche.y);
    commander(moteur, poser('cueillette', derriere[0]!));
    const caseDe = (p: { x: number; y: number }) => `${Math.floor(p.x)},${Math.floor(p.y)}`;
    const huttes = new Set(etat.batiments.filter((b) => b.type === 'hutte').map((b) => caseDe(b.case)));
    const precedente = new Map(etat.habitants.map((h) => [h.id, caseDe(h.position)]));
    let entrees = 0;
    for (let pas = 0; pas < 5 * PAS_PAR_MINUTE; pas++) {
      moteur.simuler(1);
      for (const h of etat.habitants) {
        const ici = caseDe(h.position);
        // Aucune hutte n'est une destination : y entrer depuis une autre case est une traversée.
        if (ici !== precedente.get(h.id) && huttes.has(ici)) entrees++;
        precedente.set(h.id, ici);
      }
    }
    expect(etat.stocks.baies).toBeGreaterThan(100);
    expect(entrees).toBe(0);
  });
});

describe('Retrait de la souche', () => {
  const contenuRetrait = () => {
    const contenu = contenuDeTest({ remise: { stockage: { boisMort: 50 } } });
    contenu.souche = { coutRetrait: { spores: 20 }, retraitSecondes: 30 };
    contenu.stocksDeDepart.spores = 30;
    return contenu;
  };

  it('exige un autre dépôt, se paie, puis les habitants arrachent la souche', () => {
    const moteur = new Moteur(contenuRetrait(), 0);
    const retirer = () => commander(moteur, { type: 'retirerSouche' });
    expect(retirer()[0]).toMatchObject({ raison: 'depotRequis' });
    commander(moteur, poser('remise', caseLibre(moteur)));
    const etat = moteur.etatCourant;
    const souche = etat.ile.souche;
    expect(retirer()).toEqual([]);
    expect(etat.stocks.spores).toBe(10);
    expect(retirer()[0]).toMatchObject({ raison: 'indisponible' });
    // La remise est désormais le seul dépôt : on ne peut plus la démolir.
    expect(commander(moteur, { type: 'demolir', id: etat.batiments[0]!.id })[0]).toMatchObject({ raison: 'depotRequis' });

    moteur.simuler(PAS_PAR_MINUTE / 6);
    expect(etat.retraitSouche).toBeGreaterThan(0);
    expect(etat.habitants.some((h) => h.mission?.tache === 'arracher')).toBe(true);
    const messages: MessageDepuisMoteur[] = [];
    // Le temps passe par l'horloge, comme dans le jeu : l'île changée part avec l'instantané.
    for (let seconde = 1; seconde <= 60 && etat.ile.soucheEnPlace; seconde++) {
      messages.push(...moteur.recevoir({ type: 'battre' }, seconde * 1000));
    }
    expect(etat.ile.soucheEnPlace).toBe(false);
    expect(etat.retraitSouche).toBeNull();
    // Deux ouvriers : environ deux fois plus vite que les 30 s d'un seul.
    expect(etat.pas).toBeLessThan((PAS_PAR_MINUTE / 60) * 25 + PAS_PAR_MINUTE / 6);
    expect(messages.some((m) => m.type === 'ile' && !m.ile.soucheEnPlace)).toBe(true);
    expect(commander(moteur, poser('hutte', souche))).toEqual([]);
  });

  it('les récoltes vont au dépôt restant, et les places de la souche disparaissent', () => {
    const contenu = contenuRetrait();
    contenu.batiments.cueillette = { ...contenu.batiments.cueillette, production: { baies: 6 } };
    const moteur = new Moteur(contenu, 0);
    commander(moteur, poser('remise', caseLibre(moteur)));
    commander(moteur, poser('cueillette', moteur.casesLibres()[5]!));
    commander(moteur, { type: 'retirerSouche' });
    moteur.simuler(PAS_PAR_MINUTE);
    const etat = moteur.etatCourant;
    expect(etat.ile.soucheEnPlace).toBe(false);
    const baies = etat.stocks.baies + etat.arrivages.baies;
    moteur.simuler(3 * PAS_PAR_MINUTE);
    expect(etat.stocks.baies + etat.arrivages.baies).toBeGreaterThan(baies + 5);
    // Les deux habitants restent, sans logement.
    expect(etat.habitants).toHaveLength(2);
  });

  it('un retrait annulé rend les spores et libère les habitants', () => {
    const moteur = new Moteur(contenuRetrait(), 0);
    const annuler = () => commander(moteur, { type: 'annulerArrachage', case: null });
    expect(annuler()[0]).toMatchObject({ raison: 'introuvable' });
    commander(moteur, poser('remise', caseLibre(moteur)));
    commander(moteur, { type: 'retirerSouche' });
    moteur.simuler(PAS_PAR_MINUTE / 6);
    const etat = moteur.etatCourant;
    expect(etat.habitants.some((h) => h.mission?.tache === 'arracher')).toBe(true);
    expect(annuler()).toEqual([]);
    expect(etat.retraitSouche).toBeNull();
    expect(etat.stocks.spores).toBe(30);
    moteur.simuler(1);
    expect(etat.habitants.some((h) => h.mission?.tache === 'arracher')).toBe(false);
    expect(etat.ile.soucheEnPlace).toBe(true);
  });

  it('migre une sauvegarde de version 7 avec la souche en place', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    const { retraitSouche: _r, defrichages: _d, ile, ...reste } = moteur.etatCourant;
    const { soucheEnPlace: _s, ...ileV7 } = ile;
    const etat = charger(JSON.stringify({ version: 7, etat: { ...reste, ile: ileV7 } }));
    expect(etat.ile.soucheEnPlace).toBe(true);
    expect(etat.retraitSouche).toBeNull();
  });
});

describe('Défrichage', () => {
  it('un arbre se paie, s’abat, rapporte, et laisse une case constructible', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    const etat = moteur.etatCourant;
    const { ile } = etat;
    const arbre = ile.terrain.findIndex((t, i) => t === 'foret' && terrainEn(ile, (i % ile.largeur) + 1, Math.floor(i / ile.largeur)) === 'herbe');
    const c = { x: arbre % ile.largeur, y: Math.floor(arbre / ile.largeur) };
    expect(commander(moteur, poser('hutte', c))[0]).toMatchObject({ raison: 'emplacementOccupe' });
    expect(commander(moteur, { type: 'defricher', case: c })).toEqual([]);
    expect(etat.stocks.boisMort).toBe(95);
    expect(commander(moteur, { type: 'defricher', case: c })[0]).toMatchObject({ raison: 'indisponible' });
    const messages: MessageDepuisMoteur[] = [];
    for (let seconde = 1; seconde <= 40 && etat.defrichages.length > 0; seconde++) {
      messages.push(...moteur.recevoir({ type: 'battre' }, seconde * 1000));
    }
    expect(etat.defrichages).toHaveLength(0);
    expect(terrainEn(ile, c.x, c.y)).toBe('herbe');
    expect(etat.stocks.baies).toBe(103);
    expect(messages.some((m) => m.type === 'ile')).toBe(true);
    expect(commander(moteur, poser('hutte', c))).toEqual([]);
  });

  it('un arrachage annulé est remboursé et laisse l’arbre en place', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    const etat = moteur.etatCourant;
    const { ile } = etat;
    const arbre = ile.terrain.indexOf('foret');
    const c = { x: arbre % ile.largeur, y: Math.floor(arbre / ile.largeur) };
    commander(moteur, { type: 'defricher', case: c });
    expect(etat.stocks.boisMort).toBe(95);
    expect(commander(moteur, { type: 'annulerArrachage', case: { x: c.x + 1, y: c.y } })[0]).toMatchObject({ raison: 'introuvable' });
    expect(commander(moteur, { type: 'annulerArrachage', case: c })).toEqual([]);
    expect(etat.stocks.boisMort).toBe(100);
    expect(etat.defrichages).toHaveLength(0);
    moteur.simuler(PAS_PAR_MINUTE);
    expect(terrainEn(ile, c.x, c.y)).toBe('foret');
  });

  it('une plante disparaît avec sa repousse', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    const etat = moteur.etatCourant;
    const i = etat.ile.elements.findIndex((e) => e.type !== 'buisson');
    const { case: c } = etat.ile.elements[i]!;
    const nombre = etat.ile.elements.length;
    commander(moteur, { type: 'defricher', case: c });
    moteur.simuler(PAS_PAR_MINUTE / 2);
    expect(etat.ile.elements).toHaveLength(nombre - 1);
    expect(etat.pousses).toHaveLength(nombre - 1);
    expect(commander(moteur, { type: 'defricher', case: c })[0]).toMatchObject({ raison: 'introuvable' });
  });
});

describe('Renaissance', () => {
  it('exige un sanctuaire achevé', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    expect(commander(moteur, { type: 'renaitre' })[0]).toMatchObject({ raison: 'indisponible' });
  });

  it('efface la partie, change d’île et garde le prestige enrichi', () => {
    const moteur = new Moteur(contenuDeTest({ hutte: { logement: true } }), 0);
    const etat = moteur.etatCourant;
    const ileAvant = etat.ile;
    commander(moteur, poser('sanctuaire', caseLibre(moteur)));
    commander(moteur, poser('hutte', caseLibre(moteur)));
    moteur.simuler(2 * PAS_PAR_MINUTE);
    expect(etat.prestige.populationMax).toBe(4);
    etat.reglages.volume = 0.2;
    const messages = moteur.recevoir({ type: 'commande', commande: { type: 'renaitre' } }, 0);
    expect(instantaneDe(messages).prestige).toMatchObject({ graines: 4, renaissances: 1 });
    expect(messages[0]).toMatchObject({ type: 'ile' });
    expect(etat.ile).not.toEqual(ileAvant);
    expect(etat.batiments).toEqual([]);
    expect(etat.pas).toBe(0);
    expect(etat.habitants).toHaveLength(2);
    expect(etat.prestige.populationMax).toBe(2);
    expect(etat.reglages.volume).toBe(0.2);
  });

  it('des bonus achetés en graines accélèrent la partie suivante', () => {
    const moteur = new Moteur(contenuDeTest({ hutte: { cout: { boisMort: 10 }, constructionSecondes: 10, logement: true } }), 0);
    const etat = moteur.etatCourant;
    etat.prestige.graines = 4;
    expect(commander(moteur, { type: 'acheterBonus', bonus: 'depart' }).every((e) => e.type === 'habitantArrive')).toBe(true);
    expect(commander(moteur, { type: 'acheterBonus', bonus: 'construction' })).toEqual([]);
    expect(commander(moteur, { type: 'acheterBonus', bonus: 'logement' })).toEqual([]);
    expect(commander(moteur, { type: 'acheterBonus', bonus: 'logement' })[0]).toMatchObject({ raison: 'ressourcesInsuffisantes' });
    expect(etat.prestige).toMatchObject({ graines: 1, bonus: { depart: 1, construction: 1, logement: 1 } });
    commander(moteur, poser('sanctuaire', caseLibre(moteur)));
    commander(moteur, { type: 'renaitre' });
    // Départ : un habitant et de la mousse en plus, logés dans la souche.
    expect(etat.habitants).toHaveLength(3);
    expect(etat.stocks.mousse).toBe(10);
    // Construction : moitié prix, chantier deux fois plus rapide.
    commander(moteur, poser('hutte', caseLibre(moteur)));
    expect(etat.stocks.boisMort).toBe(95);
    moteur.simuler(PAS_PAR_MINUTE / 12);
    expect(etat.batiments[0]!.chantier).toBeNull();
    // Logement : une place de plus par hutte (2 + 1) en plus des 3 de la souche.
    moteur.simuler(PAS_PAR_MINUTE * 3);
    expect(etat.habitants).toHaveLength(6);
  });

  it('se sauvegarde et se recharge à l’identique, et migre une sauvegarde de version 9', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    const etat = moteur.etatCourant as Etat;
    etat.prestige = { graines: 3, renaissances: 2, bonus: { production: 1, depart: 0, construction: 2, logement: 0 }, populationMax: 7 };
    expect(charger(serialiser(etat))).toEqual(etat);
    const { prestige: _p, ...ancien } = etat;
    const migre = charger(JSON.stringify({ version: 9, etat: { ...ancien, palier: 2 } }));
    expect(migre.prestige).toMatchObject({ graines: 0, renaissances: 0, populationMax: 2 });
    expect(migre.batimentsDebloques).toContain('sanctuaire');
  });
});

describe('Nouvelle partie', () => {
  it('efface tout, prestige compris, et renvoie la nouvelle île', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    moteur.recevoir({ type: 'demarrer', sauvegardes: [] }, 0);
    const etat = moteur.etatCourant as Etat;
    etat.prestige.graines = 12;
    etat.stocks.boisMort = 3;
    const messages = moteur.recevoir({ type: 'commande', commande: { type: 'recommencer', graine: 7 } }, 0);
    expect(messages[0]?.type).toBe('ile');
    expect(etat.graine).toBe(7);
    expect(etat.prestige.graines).toBe(0);
    expect(etat.stocks.boisMort).toBe(contenu.stocksDeDepart.boisMort);
  });
});

describe('Récolte presque au plafond', () => {
  it('remplit la fraction de place qui reste au lieu de refuser', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    moteur.recevoir({ type: 'demarrer', sauvegardes: [] }, 0);
    const etat = moteur.etatCourant as Etat;
    const element = etat.ile.elements.findIndex((e) => e.type === 'buisson');
    const ressource = contenu.recolte.buisson.ressource;
    etat.pousses[element] = 1;
    etat.stocks[ressource] = contenu.plafondsDeBase[ressource] - 0.2;
    const [message] = moteur.recevoir({ type: 'commande', commande: { type: 'recolter', element } }, 0);
    expect(message?.type === 'instantane' && message.evenements.some((e) => e.type === 'commandeRefusee')).toBe(false);
    expect(etat.stocks[ressource]).toBeCloseTo(contenu.plafondsDeBase[ressource]);
  });
});

describe('Bagages', () => {
  it('un niveau acheté donne tout de suite ses ressources et ses habitants', () => {
    const contenu = contenuDeTest();
    const moteur = new Moteur(contenu, 0);
    moteur.recevoir({ type: 'demarrer', sauvegardes: [] }, 0);
    const etat = moteur.etatCourant as Etat;
    etat.prestige.graines = 100;
    const { stocksDeDepart, habitantsDeDepart } = contenu.prestige.effets;
    const r = RESSOURCES.find((x) => (stocksDeDepart[x] ?? 0) > 0)!;
    etat.stocks[r] = 0;
    const habitants = etat.habitants.length;
    moteur.recevoir({ type: 'commande', commande: { type: 'acheterBonus', bonus: 'depart' } }, 0);
    expect(etat.prestige.bonus.depart).toBe(1);
    expect(etat.stocks[r]).toBe(Math.min(stocksDeDepart[r]!, contenu.plafondsDeBase[r]));
    expect(etat.habitants.length).toBe(habitants + habitantsDeDepart);
  });
});

describe('Rythme des arrivées', () => {
  const arrivesEn = (places: number, secondes: number) => {
    const contenu = contenuDeTest({}, {
      auDepart: 0,
      logementDeBase: places,
      delaiArriveeSecondes: 120,
      premiereArriveeSecondes: undefined,
      arriveeSelonPlaces: { placesDeReference: 2, delaiMinimal: 0.25 },
    });
    const moteur = new Moteur(contenu, 0);
    moteur.simuler((secondes * PAS_PAR_MINUTE) / 60);
    return moteur.etatCourant.habitants.length;
  };

  it('beaucoup de places libres : arrivées rapprochées ; une seule : plus espacées', () => {
    expect(arrivesEn(20, 35)).toBe(1); // 30 s au plus court
    expect(arrivesEn(2, 125)).toBe(1); // 2 min pour la référence
    expect(arrivesEn(1, 125)).toBe(0); // 3 min pour une seule place
    expect(arrivesEn(1, 185)).toBe(1);
  });
});

describe('Priorité des arrachages', () => {
  it('des habitants employés quittent leur poste dès qu’un arbre est à abattre', () => {
    const contenu = contenuDeTest({ cueillette: { production: { baies: 6 }, postes: 2 } }, { auDepart: 2, logementDeBase: 2 });
    const moteur = new Moteur(contenu, 0);
    const etat = moteur.etatCourant as Etat;
    const { ile } = etat;
    const libre = moteur.casesLibres()[0]!;
    commander(moteur, poser('cueillette', libre));
    moteur.simuler(2 * PAS_PAR_MINUTE);
    expect(etat.habitants.some((h) => h.mission?.tache === 'recolter')).toBe(true);
    for (const h of etat.habitants) h.pasDepuisChoix = 0;
    const arbre = ile.terrain.indexOf('foret');
    commander(moteur, { type: 'defricher', case: { x: arbre % ile.largeur, y: Math.floor(arbre / ile.largeur) } });
    moteur.simuler(PAS_PAR_MINUTE / 60);
    expect(etat.habitants.filter((h) => h.mission?.tache === 'arracher').length).toBeGreaterThan(0);
  });
});

describe('Îles des renaissances', () => {
  it('chaque renaissance donne une île moins riche en ressources naturelles', () => {
    const compter = (renaissances: number) => {
      const ile = genererIle(12, 5, renaissances);
      return { elements: ile.elements.length, buissons: ile.terrain.filter((t) => t === 'buisson').length };
    };
    const [a, b, c] = [compter(0), compter(2), compter(6)];
    expect(b.elements).toBeLessThan(a.elements);
    expect(c.elements).toBeLessThan(b.elements);
    expect(c.buissons).toBeLessThan(a.buissons);
    // Plafonnée : il reste toujours de quoi démarrer.
    expect(compter(20)).toEqual(c);
    expect(c.elements).toBeGreaterThan(0);
  });
});
