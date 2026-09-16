import { describe, expect, it } from 'vitest';
import type { Contenu, ContenuHabitants, DefinitionBatiment } from './contenu';
import type { Case, Commande, Evenement, MessageDepuisMoteur, Priorites, TypeBatiment } from './contrat';
import { TYPES_BATIMENT } from './contrat';
import { Horloge } from './horloge';
import { terrainEn } from './ile';
import { Moteur } from './moteur';
import { PAS_PAR_MINUTE } from './temps';

const MINUTE_MS = 60_000;

function contenuDeTest(
  batiments: Partial<Record<TypeBatiment, Partial<DefinitionBatiment>>> = {},
  habitants: Partial<ContenuHabitants> = {},
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
      bienEtre: { base: 0.4, loge: 0.2, nourri: 0.2, affame: -0.4, feuDeCamp: 0.1, minutesPourSeStabiliser: 1 },
      ...habitants,
    },
    arbreMere: { sporesParMinute: 0 },
    remboursementDemolition: 0.5,
    temps: { minutesParSaison: 30, minutesParJour: 10, heureDeDepart: 0 },
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

  it('gardent leur charge quand le stock est plein, sans rien perdre', () => {
    const contenu = contenuDeTest({ cueillette: { production: { baies: 60 } } });
    contenu.plafondsDeBase.baies = 102;
    const moteur = new Moteur(contenu, 0);
    commander(moteur, poser('cueillette', caseLibre(moteur)));
    moteur.simuler(3 * PAS_PAR_MINUTE);
    const { stocks, habitants, batiments } = moteur.etatCourant;
    const enMain = habitants.reduce((s, h) => s + (h.charge?.quantite ?? 0), 0);
    expect(stocks.baies).toBe(102);
    expect(enMain + (batiments[0]!.reserve.baies ?? 0)).toBeGreaterThan(0);
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
    const messages = moteur.recevoir({ type: 'demarrer', sauvegarde: null }, 0);
    expect(messages.map((m) => m.type)).toEqual(['ile', 'instantane']);
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
    expect(instantaneDe(moteur.recevoir({ type: 'veille' }, MINUTE_MS)).temps).toMatchObject({ enPause: true, pas: PAS_PAR_MINUTE });
    expect(instantaneDe(moteur.battre(30 * MINUTE_MS)).temps.pas).toBe(PAS_PAR_MINUTE);
    moteur.recevoir({ type: 'reveil' }, 30 * MINUTE_MS);
    expect(instantaneDe(moteur.battre(31 * MINUTE_MS)).temps).toMatchObject({ enPause: false, pas: 2 * PAS_PAR_MINUTE });
  });

  it('reprend une sauvegarde à l’identique', () => {
    const contenu = contenuDeTest({ cueillette: { production: { baies: 6 } } });
    const moteur = new Moteur(contenu, 0);
    commander(moteur, poser('cueillette', caseLibre(moteur)));
    moteur.simuler(1000);
    const [sauvegarde] = moteur.recevoir({ type: 'sauvegarder' }, 0);
    if (sauvegarde?.type !== 'sauvegarde') throw new Error('sauvegarde attendue');
    const reprise = new Moteur(contenu, 0);
    reprise.recevoir({ type: 'demarrer', sauvegarde: sauvegarde.contenu }, 0);
    expect(reprise.etatCourant).toEqual(moteur.etatCourant);
    reprise.simuler(500);
    moteur.simuler(500);
    expect(reprise.etatCourant).toEqual(moteur.etatCourant);
  });
});
