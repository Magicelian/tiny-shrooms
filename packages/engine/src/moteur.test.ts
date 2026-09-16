import { describe, expect, it } from 'vitest';
import type { Contenu, ContenuHabitants, DefinitionBatiment } from './contenu';
import type { Case, Commande, Evenement, MessageDepuisMoteur, TypeBatiment } from './contrat';
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
      seuilBonheur: 2,
      sporesParHabitantHeureux: 0,
      reevaluationSecondes: 30,
      nuit: { debut: 0, fin: 0 },
      travailAffame: 1,
      valeurBaieSechee: 1,
      bienEtre: { base: 0.4, loge: 0.2, nourri: 0.2, affame: -0.4, feuDeCamp: 0.1, minutesPourSeStabiliser: 1 },
      ...habitants,
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
    const moteur = new Moteur(contenuDeTest(), 0);
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
    expect(recolte(HIVER, false)).toBeCloseTo(automne / 2);
    expect(recolte(HIVER, true)).toBeCloseTo(automne);
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
    const moteur = new Moteur(contenuDeTest(), 0);
    const { ile } = moteur.etatCourant;
    for (const type of ['buisson', 'boisMort', 'mousse']) expect(premier(moteur, type)).toBeGreaterThanOrEqual(0);
    const element = ile.elements[premier(moteur, 'boisMort')]!;
    expect(commander(moteur, poser('hutte', element.case))).toMatchObject([{ raison: 'emplacementOccupe' }]);
  });

  it('donne un peu de ressource, épuise l’élément, puis le laisse repousser', () => {
    const moteur = new Moteur(contenuDeTest(), 0);
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
    const moteur = new Moteur(contenuDeTest({}, {}, { saisons: { production: hiver, travailAuFroid: 1, rayonChaleur: 2 } }), 0);
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
    const moteur = new Moteur(contenuDeTest(), 0);
    commander(moteur, poser('hutte', caseLibre(moteur)));
    const { ile, pousses: _p, ...reste } = moteur.etatCourant;
    const { elements: _e, ...ileV4 } = ile;
    const etat = charger(JSON.stringify({ version: 4, etat: { ...reste, ile: ileV4 } }));
    expect(etat.pousses).toHaveLength(etat.ile.elements.length);
    const hutte = etat.batiments[0]!.case;
    expect(etat.ile.elements.some((e) => e.case.x === hutte.x && e.case.y === hutte.y)).toBe(false);
  });
});
