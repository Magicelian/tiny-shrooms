import { describe, expect, it } from 'vitest';
import type { Contenu, ContenuHabitants, DefinitionBatiment } from './contenu';
import type { Case, Commande, Evenement, MessageDepuisMoteur, Priorites, TypeBatiment } from './contrat';
import { RESSOURCES, TYPES_BATIMENT } from './contrat';
import { Horloge } from './horloge';
import { terrainEn } from './ile';
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
    batimentsDeDepart: [...TYPES_BATIMENT],
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
      seuilBonheur: 2,
      sporesParHabitantHeureux: 0,
      sporesParSoigneur: 0,
      reevaluationSecondes: 30,
      nuit: { debut: 0, fin: 0 },
      travailAffame: 1,
      valeurBaieSechee: 1,
      bienEtre: { base: 0.4, loge: 0.2, nourri: 0.2, affame: -0.4, feuDeCamp: 0.1, minutesPourSeStabiliser: 1 },
      ...habitants,
    },
    arbreMere: {
      sporesParMinute: { pousse: 0, arbuste: 0, arbre: 0, floraison: 0 },
      sporesParStade: { pousse: 10, arbuste: 20, arbre: 30 },
      deblocages: {},
    },
    ameliorations: {
      vitesse: { cout: { boisMort: 10 }, hausseCout: 2, effet: 0.5, niveauMax: 2 },
      outils: { cout: { boisMort: 10 }, hausseCout: 2, effet: 0.5, niveauMax: 2 },
    },
    remboursementDemolition: 0.5,
    temps: { minutesParSaison: 30, minutesParJour: 10, heureDeDepart: 0 },
    saisons: { production: { printemps: {}, ete: {}, automne: {}, hiver: {} }, travailAuFroid: 1, rayonChaleur: 2 },
    meteo: {
      minutesParPeriode: 5,
      probabilites: { printemps: { soleil: 1 }, ete: { soleil: 1 }, automne: { soleil: 1 }, hiver: { soleil: 1 } },
      production: { soleil: {}, pluie: {}, vent: {}, neige: {} },
    },
    visiteurs: {
      capaciteParRelais: 2,
      minutesEntreArrivees: { min: 1, max: 1 },
      poids: { herisson: 1, escargot: 1, luciole: 1 },
      herisson: { ressources: ['baies', 'boisMort'], lot: 10, taux: { min: 1, max: 2 } },
      escargot: { ressources: ['boisMort'], quantite: { min: 20, max: 20 }, sporesParUnite: 0.5, chancePlan: 0, plans: [] },
      luciole: { multiplicateur: { min: 2, max: 2 }, minutes: { min: 1, max: 1 } },
    },
    ...autres,
  };
}

const PRIORITES_NULLES: Priorites = { recolter: 0, construire: 0, stocker: 0, soignerArbre: 0 };

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

/** Première case libre dont un voisin a ce terrain, ou la plus proche de l'arbre. */
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

  it('refuse les emplacements hors île, occupés ou sur l’arbre-mère', () => {
    const moteur = new Moteur(contenuDeTest(), 0);
    const { ile } = moteur.etatCourant;
    const libre = caseLibre(moteur);
    const foret = ile.terrain.indexOf('foret');
    const raison = (c: Case) => commander(moteur, poser('hutte', c))[0];
    expect(raison({ x: -1, y: 0 })).toMatchObject({ raison: 'horsIle' });
    expect(raison({ x: foret % ile.largeur, y: Math.floor(foret / ile.largeur) })).toMatchObject({ raison: 'emplacementOccupe' });
    expect(raison(ile.arbreMere)).toMatchObject({ raison: 'emplacementOccupe' });
    expect(raison(libre)).toBeUndefined();
    expect(raison(libre)).toMatchObject({ raison: 'emplacementOccupe' });
  });

  it('déplace un bâtiment seulement vers une case libre', () => {
    const moteur = new Moteur(contenuDeTest(), 0);
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
  it('n’avancent aucun chantier si personne ne veut construire', () => {
    const moteur = new Moteur(contenuDeTest({ hutte: { constructionSecondes: 10 } }), 0);
    commander(moteur, { type: 'reglerPriorites', priorites: PRIORITES_NULLES });
    commander(moteur, poser('hutte', caseLibre(moteur)));
    moteur.simuler(PAS_PAR_MINUTE);
    expect(moteur.etatCourant.batiments[0]!.chantier).toBe(0);
    expect(moteur.etatCourant.habitants.every((h) => h.activite === 'attend')).toBe(true);
  });

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

  it('laissent la récolte en réserve si personne ne la porte', () => {
    const moteur = new Moteur(contenuDeTest({ cueillette: { production: { baies: 12 } } }), 0);
    commander(moteur, { type: 'reglerPriorites', priorites: { ...PRIORITES_NULLES, recolter: 1 } });
    commander(moteur, poser('cueillette', caseLibre(moteur)));
    moteur.simuler(5 * PAS_PAR_MINUTE);
    expect(moteur.etatCourant.stocks.baies).toBe(100);
    expect(moteur.etatCourant.batiments[0]!.reserve.baies).toBeCloseTo(10, 6);
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

  it('suivent l’épinglage plutôt que les priorités', () => {
    const moteur = new Moteur(contenuDeTest({ hutte: { constructionSecondes: 600 } }), 0);
    commander(moteur, poser('hutte', caseLibre(moteur)));
    commander(moteur, { type: 'epinglerHabitant', id: 1, tache: 'soignerArbre' });
    moteur.simuler(PAS_PAR_MINUTE);
    const [un, deux] = moteur.etatCourant.habitants;
    expect(un).toMatchObject({ tache: 'soignerArbre', epingle: 'soignerArbre' });
    expect(deux).toMatchObject({ tache: 'construire' });
  });

  it('arrivent quand il y a de la place et du bien-être', () => {
    const moteur = new Moteur(contenuDeTest({ hutte: { logement: 2, constructionSecondes: 10 } }), 0);
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
    contenu.batimentsDeDepart = ['hutte'];
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

  it('borne les priorités entre 0 et 1', () => {
    const moteur = new Moteur(contenuDeTest(), 0);
    commander(moteur, { type: 'reglerPriorites', priorites: { recolter: 2, construire: -1, stocker: 0.3, soignerArbre: 1 } });
    expect(moteur.etatCourant.priorites).toEqual({ recolter: 1, construire: 0, stocker: 0.3, soignerArbre: 1 });
  });
});

describe('Moteur', () => {
  it('envoie l’île puis un instantané au démarrage', () => {
    const moteur = new Moteur(contenuDeTest(), 0);
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
    const moteur = new Moteur(contenuDeTest(), 0);
    expect(instantaneDe(moteur.recevoir({ type: 'veille', momentMs: MINUTE_MS }, MINUTE_MS)).temps).toMatchObject({ enPause: true, pas: PAS_PAR_MINUTE });
    expect(instantaneDe(moteur.battre(30 * MINUTE_MS)).temps.pas).toBe(PAS_PAR_MINUTE);
    moteur.recevoir({ type: 'reveil' }, 30 * MINUTE_MS);
    expect(instantaneDe(moteur.battre(31 * MINUTE_MS)).temps).toMatchObject({ enPause: false, pas: 2 * PAS_PAR_MINUTE });
  });

  it('s’arrête à l’instant de la veille même si le message arrive après le réveil', () => {
    const moteur = new Moteur(contenuDeTest(), 0);
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
  const saisonsNeutres = { production: { printemps: {}, ete: {}, automne: {}, hiver: {} }, travailAuFroid: 1, rayonChaleur: 2 };

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
    const contenu = contenuDeTest({ tasDeBois: { production: { boisMort: 6 } } }, { reserveMax: 1000 }, {
      saisons: { ...saisonsNeutres, travailAuFroid: 0.5 },
    });
    const recolte = (pas: number, feu: boolean) => {
      const moteur = moteurAu(contenu, pas);
      commander(moteur, { type: 'reglerPriorites', priorites: { ...PRIORITES_NULLES, recolter: 1 } });
      const tas = caseLibre(moteur);
      commander(moteur, poser('tasDeBois', tas));
      if (feu) {
        const proche = moteur.casesLibres().find((c) => Math.max(Math.abs(c.x - tas.x), Math.abs(c.y - tas.y)) <= 2);
        commander(moteur, poser('feuDeCamp', proche!));
      }
      moteur.simuler(2 * MIN);
      return moteur.etatCourant.batiments[0]!.reserve.boisMort ?? 0;
    };
    const automne = recolte(AUTOMNE, false);
    expect(automne).toBeGreaterThan(5);
    expect(recolte(HIVER, false)).toBeCloseTo(automne / 2);
    expect(recolte(HIVER, true)).toBeCloseTo(automne);
  });

  it('va se réchauffer au feu quand il n’a rien à faire en hiver', () => {
    const moteur = moteurAu(contenuDeTest(), HIVER);
    commander(moteur, { type: 'reglerPriorites', priorites: PRIORITES_NULLES });
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

describe('Visiteurs', () => {
  const MIN = PAS_PAR_MINUTE;

  function contenuVisiteur(type: 'herisson' | 'escargot' | 'luciole', autres: Partial<Contenu> = {}): Contenu {
    const contenu = contenuDeTest({}, {}, autres);
    contenu.visiteurs.poids = { herisson: 0, escargot: 0, luciole: 0, [type]: 1 };
    return contenu;
  }

  /** Moteur avec un relais construit et, après un pas, son premier visiteur. */
  function avecVisiteur(contenu: Contenu): Moteur {
    const moteur = new Moteur(contenu, 0);
    commander(moteur, poser('relais', caseLibre(moteur)));
    moteur.simuler(1);
    return moteur;
  }

  it('n’arrive qu’une fois un relais construit, puis attend indéfiniment', () => {
    const contenu = contenuDeTest({ relais: { constructionSecondes: 10 } });
    const moteur = new Moteur(contenu, 0);
    expect(moteur.simuler(5 * MIN).some((e) => e.type === 'visiteurArrive')).toBe(false);
    commander(moteur, poser('relais', caseLibre(moteur)));
    const evenements = moteur.simuler(MIN);
    expect(evenements.filter((e) => e.type === 'visiteurArrive')).toHaveLength(1);
    expect(moteur.etatCourant.visiteurs).toHaveLength(1);
    // Trois heures plus tard : deux visiteurs (la capacité du relais), toujours là.
    moteur.simuler(180 * MIN);
    expect(moteur.etatCourant.visiteurs.map((v) => v.id)).toEqual([1, 2]);
  });

  it('arrive pendant un rattrapage, fenêtre cachée', () => {
    const moteur = new Moteur(contenuDeTest(), 0);
    commander(moteur, poser('relais', caseLibre(moteur)));
    const [message] = moteur.battre(20 * MINUTE_MS);
    expect(message?.type === 'instantane' && message.evenements.filter((e) => e.type === 'visiteurArrive')).toHaveLength(2);
  });

  it('tire les mêmes visiteurs pour la même graine', () => {
    const tirer = () => {
      const moteur = new Moteur(contenuDeTest(), 0);
      commander(moteur, poser('relais', caseLibre(moteur)));
      moteur.simuler(3 * MIN);
      return moteur.etatCourant.visiteurs;
    };
    expect(tirer()).toEqual(tirer());
  });

  it('échange avec le hérisson, ou attend qu’on puisse payer', () => {
    const moteur = avecVisiteur(contenuVisiteur('herisson'));
    const visiteur = moteur.etatCourant.visiteurs[0]!;
    if (visiteur.type !== 'herisson') throw new Error('hérisson attendu');
    const [demandee, prix] = Object.entries(visiteur.demande)[0]! as ['baies' | 'boisMort', number];
    const [donnee, lot] = Object.entries(visiteur.donne)[0]! as ['baies' | 'boisMort', number];
    expect(donnee).not.toBe(demandee);
    expect(prix).toBeGreaterThanOrEqual(10);
    const stocks = moteur.etatCourant.stocks;
    const avant = { ...stocks };
    stocks[demandee] = prix - 1;
    const repondre: Commande = { type: 'repondreVisiteur', id: visiteur.id, accepte: true };
    expect(commander(moteur, repondre)[0]).toMatchObject({ raison: 'ressourcesInsuffisantes' });
    expect(moteur.etatCourant.visiteurs).toHaveLength(1);
    stocks[demandee] = prix;
    expect(commander(moteur, repondre)).toEqual([]);
    expect(stocks[demandee]).toBe(0);
    expect(stocks[donnee]).toBe(avant[donnee] + lot);
    expect(moteur.etatCourant.visiteurs).toEqual([]);
  });

  it('renvoie un visiteur refusé sans rien coûter', () => {
    const moteur = avecVisiteur(contenuVisiteur('herisson'));
    const stocks = { ...moteur.etatCourant.stocks };
    expect(commander(moteur, { type: 'repondreVisiteur', id: 1, accepte: false })).toEqual([]);
    expect(moteur.etatCourant.visiteurs).toEqual([]);
    expect(moteur.etatCourant.stocks).toEqual(stocks);
    expect(commander(moteur, { type: 'repondreVisiteur', id: 1, accepte: false })[0]).toMatchObject({ raison: 'introuvable' });
  });

  it('récompense l’escargot en spores, ou par un plan encore verrouillé', () => {
    const moteur = avecVisiteur(contenuVisiteur('escargot'));
    commander(moteur, { type: 'repondreVisiteur', id: 1, accepte: true });
    expect(moteur.etatCourant.stocks).toMatchObject({ boisMort: 80, spores: 10 });

    const contenu = contenuVisiteur('escargot');
    contenu.batimentsDeDepart = ['relais'];
    contenu.visiteurs.escargot = { ...contenu.visiteurs.escargot, chancePlan: 1, plans: ['atelier'] };
    const avecPlan = avecVisiteur(contenu);
    expect(avecPlan.etatCourant.visiteurs[0]).toMatchObject({ recompense: { plan: 'atelier' } });
    commander(avecPlan, { type: 'repondreVisiteur', id: 1, accepte: true });
    expect(avecPlan.etatCourant.batimentsDebloques).toEqual(['relais', 'atelier']);
    // Plus aucun plan à offrir : retour aux spores.
    avecPlan.simuler(MIN + 1);
    expect(avecPlan.etatCourant.visiteurs[0]).toMatchObject({ recompense: { spores: 10 } });
  });

  it('double la production le temps du bonus de la luciole', () => {
    const contenu = contenuVisiteur('luciole', {});
    contenu.batiments.tasDeBois.production = { boisMort: 6 };
    contenu.habitants.reserveMax = 1000;
    const recolte = (accepte: boolean) => {
      const moteur = avecVisiteur(contenu);
      commander(moteur, { type: 'reglerPriorites', priorites: { ...PRIORITES_NULLES, recolter: 1 } });
      commander(moteur, poser('tasDeBois', caseLibre(moteur)));
      commander(moteur, { type: 'repondreVisiteur', id: 1, accepte });
      moteur.simuler(2 * MIN);
      expect(moteur.etatCourant.bonus).toEqual([]);
      return moteur.etatCourant.batiments[1]!.reserve.boisMort ?? 0;
    };
    const sans = recolte(false);
    expect(sans).toBeGreaterThan(5);
    // Le bonus dure une minute sur les deux simulées : trois moitiés de plus, moins le trajet.
    expect(recolte(true)).toBeGreaterThan(sans * 1.3);
  });

  it('migre une sauvegarde de la version 1', () => {
    const etat = new Moteur(contenuDeTest(), 0).etatCourant as Partial<Etat>;
    const { visiteurs: _v, prochainIdVisiteur: _p, pasAvantVisiteur: _a, bonus: _b, ...v1 } = etat;
    const migre = charger(JSON.stringify({ version: 1, etat: { ...v1, batimentsDebloques: ['hutte'] } }));
    expect(migre).toMatchObject({ visiteurs: [], bonus: [], pasAvantVisiteur: 0, batimentsDebloques: ['hutte', 'relais'] });
  });
});

describe('Arbre-mère', () => {
  const avecSpores = (spores: number, autres: Partial<Contenu> = {}) =>
    contenuDeTest({}, {}, { stocksDeDepart: { baies: 100, baiesSechees: 0, boisMort: 100, mousse: 0, spores }, ...autres });

  it('franchit les stades en une fois et débloque leurs bâtiments', () => {
    const base = avecSpores(100);
    const contenu = { ...base, batimentsDeDepart: ['hutte'], arbreMere: { ...base.arbreMere, deblocages: { arbre: ['atelier'] } } } as Contenu;
    const moteur = new Moteur(contenu, 0);
    const evenements = commander(moteur, { type: 'nourrirArbre', spores: 35 });
    expect(evenements).toEqual([
      { type: 'stadeAtteint', stade: 'arbuste', debloques: [] },
      { type: 'stadeAtteint', stade: 'arbre', debloques: ['atelier'] },
    ]);
    const arbre = instantaneDe(moteur.recevoir({ type: 'battre' }, 0)).arbreMere;
    expect(arbre).toMatchObject({ stade: 'arbre', floraisonPossible: false, sporesRestantes: 25 });
    expect(arbre.avancement).toBeCloseTo(5 / 30);
    expect(arbre.mycelium).toBeCloseTo(35 / 60);
    expect(moteur.etatCourant.batimentsDebloques).toEqual(['hutte', 'atelier']);
    expect(moteur.etatCourant.stocks.spores).toBe(65);
  });

  it('ne prend que ce qu’il faut pour fleurir, puis fleurit une fois', () => {
    const moteur = new Moteur(avecSpores(100), 0);
    expect(commander(moteur, { type: 'fleurir' })).toMatchObject([{ raison: 'indisponible' }]);
    const evenements = commander(moteur, { type: 'nourrirArbre', spores: 1000 });
    expect(evenements.at(-1)).toEqual({ type: 'stadeAtteint', stade: 'floraison', debloques: [] });
    expect(moteur.etatCourant.stocks.spores).toBe(40);
    expect(moteur.etatCourant.arbreMere).toMatchObject({ floraisonPossible: true });
    expect(commander(moteur, { type: 'nourrirArbre', spores: 10 })).toMatchObject([{ raison: 'indisponible' }]);
    expect(commander(moteur, { type: 'fleurir' })).toEqual([{ type: 'floraison' }]);
    expect(moteur.etatCourant.arbreMere).toMatchObject({ floraisonPossible: false, floraisons: 1 });
    expect(commander(moteur, { type: 'fleurir' })).toMatchObject([{ raison: 'indisponible' }]);
  });

  it('refuse de nourrir sans spores', () => {
    const moteur = new Moteur(avecSpores(0), 0);
    expect(commander(moteur, { type: 'nourrirArbre', spores: 5 })).toMatchObject([{ raison: 'ressourcesInsuffisantes' }]);
  });

  it('grandit seul avec les soigneurs et le débordement du stock', () => {
    const base = avecSpores(0, { plafondsDeBase: { baies: 1000, baiesSechees: 1000, boisMort: 1000, mousse: 1000, spores: 5 } });
    const contenu: Contenu = {
      ...base,
      habitants: { ...base.habitants, sporesParSoigneur: 2 },
      arbreMere: { ...base.arbreMere, sporesParMinute: { pousse: 3, arbuste: 3, arbre: 3, floraison: 3 } },
    };
    const moteur = new Moteur(contenu, 0);
    commander(moteur, { type: 'reglerPriorites', priorites: { ...PRIORITES_NULLES, soignerArbre: 1 } });
    moteur.simuler(5 * PAS_PAR_MINUTE);
    // 3 spores par minute remplissent le stock en 2 min, puis débordent ; 2 soigneurs apportent 4 par minute.
    expect(moteur.etatCourant.stocks.spores).toBeCloseTo(5);
    const arbre = instantaneDe(moteur.recevoir({ type: 'battre' }, 0)).arbreMere;
    expect(arbre.stade).toBe('arbuste');
    expect(arbre.sporesParMinute).toBeCloseTo(7);
    expect(arbre.mycelium * 60).toBeGreaterThan(20);
  });

  it('migre une sauvegarde de la version 2', () => {
    const { ameliorations: _a, ...v2 } = new Moteur(contenuDeTest(), 0).etatCourant as Partial<Etat>;
    const arbreMere = { stade: 'pousse', avancement: 0.5, mycelium: 0.1, floraisonPossible: false };
    const migre = charger(JSON.stringify({ version: 2, etat: { ...v2, arbreMere } }));
    expect(migre.arbreMere).toEqual({ stade: 'pousse', avancement: 0.5, floraisonPossible: false, floraisons: 0 });
    expect(migre.ameliorations).toEqual({ vitesse: 0, outils: 0 });
  });
});

describe('Améliorations', () => {
  it('se paient à un atelier achevé, de plus en plus cher, jusqu’au niveau maximal', () => {
    const moteur = new Moteur(contenuDeTest(), 0);
    const ameliorer: Commande = { type: 'ameliorer', cible: { village: 'outils' } };
    expect(commander(moteur, ameliorer)).toMatchObject([{ raison: 'indisponible' }]);
    commander(moteur, poser('atelier', caseLibre(moteur)));
    expect(commander(moteur, ameliorer)).toEqual([]);
    expect(commander(moteur, ameliorer)).toEqual([]);
    expect(moteur.etatCourant.stocks.boisMort).toBe(70);
    expect(commander(moteur, ameliorer)).toMatchObject([{ raison: 'indisponible' }]);
    expect(instantaneDe(moteur.recevoir({ type: 'battre' }, 0)).ameliorations).toEqual({ vitesse: 0, outils: 2 });
  });

  it('les outils accélèrent la récolte', () => {
    const recolte = (niveau: number) => {
      const moteur = new Moteur(contenuDeTest({ cueillette: { production: { baies: 6 } } }), 0);
      commander(moteur, { type: 'reglerPriorites', priorites: { ...PRIORITES_NULLES, recolter: 1 } });
      commander(moteur, poser('atelier', caseLibre(moteur)));
      for (let i = 0; i < niveau; i++) commander(moteur, { type: 'ameliorer', cible: { village: 'outils' } });
      commander(moteur, poser('cueillette', caseLibre(moteur)));
      moteur.simuler(PAS_PAR_MINUTE / 2);
      return moteur.etatCourant.batiments[1]!.reserve.baies ?? 0;
    };
    expect(recolte(1)).toBeGreaterThan(recolte(0) * 1.4);
  });
});
