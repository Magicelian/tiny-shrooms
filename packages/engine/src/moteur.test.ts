import { describe, expect, it } from 'vitest';
import type { Contenu, DefinitionBatiment } from './contenu';
import type { Commande, Evenement, MessageDepuisMoteur, TypeBatiment } from './contrat';
import { TYPES_BATIMENT } from './contrat';
import { Horloge } from './horloge';
import { Moteur } from './moteur';
import { PAS_PAR_MINUTE } from './temps';

const HEURE = 60 * PAS_PAR_MINUTE;
const MINUTE_MS = 60_000;

/** Contenu fictif aux chiffres ronds : seuls les bâtiments cités ont un effet. */
function contenuDeTest(batiments: Partial<Record<TypeBatiment, Partial<DefinitionBatiment>>> = {}): Contenu {
  const defs = {} as Record<TypeBatiment, DefinitionBatiment>;
  for (const t of TYPES_BATIMENT) defs[t] = { cout: {}, constructionSecondes: 0, ...batiments[t] };
  return {
    stocksDeDepart: { baies: 0, baiesSechees: 0, boisMort: 100, mousse: 0, spores: 0 },
    plafondsDeBase: { baies: 1000, baiesSechees: 1000, boisMort: 1000, mousse: 1000, spores: 1000 },
    batiments: defs,
    batimentsDeDepart: [...TYPES_BATIMENT],
    arbreMere: { sporesParMinute: 0 },
    remboursementDemolition: 0.5,
    temps: { minutesParSaison: 30, minutesParJour: 10 },
  };
}

const poser = (batiment: TypeBatiment): Commande => ({ type: 'poserBatiment', batiment, case: { x: 0, y: 0 }, orientation: 0 });

function commander(moteur: Moteur, commande: Commande): Evenement[] {
  const [message] = moteur.recevoir({ type: 'commande', commande }, 0);
  return message?.type === 'instantane' ? message.evenements : [];
}

function instantaneDe(messages: MessageDepuisMoteur[]) {
  const m = messages[0];
  if (m?.type !== 'instantane') throw new Error('instantané attendu');
  return m.instantane;
}

describe('Horloge', () => {
  it('rattrape tout un gel de 20 minutes', () => {
    const h = new Horloge(0);
    expect(h.pasARattraper(20 * MINUTE_MS)).toBe(20 * PAS_PAR_MINUTE);
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

describe('Production', () => {
  it('produit le débit prévu sur une heure', () => {
    const moteur = new Moteur(contenuDeTest({ cueillette: { production: { baies: 6 } } }), 0);
    commander(moteur, poser('cueillette'));
    moteur.simuler(HEURE);
    expect(moteur.etatCourant.stocks.baies).toBeCloseTo(360, 6);
  });

  it('s’arrête au plafond et ne l’annonce qu’une fois', () => {
    const contenu = contenuDeTest({ cueillette: { production: { baies: 60 } } });
    contenu.plafondsDeBase.baies = 30;
    const moteur = new Moteur(contenu, 0);
    commander(moteur, poser('cueillette'));
    const evenements = moteur.simuler(HEURE);
    expect(moteur.etatCourant.stocks.baies).toBe(30);
    expect(evenements.filter((e) => e.type === 'stockPlein')).toEqual([{ type: 'stockPlein', ressource: 'baies' }]);
  });

  it('relève les plafonds une fois le stockage construit', () => {
    const contenu = contenuDeTest({ gardeManger: { stockage: { baies: 50 } } });
    const moteur = new Moteur(contenu, 0);
    commander(moteur, poser('gardeManger'));
    expect(instantaneDe(moteur.battre(0)).stocks.baies.plafond).toBe(1050);
  });

  it('convertit selon ce qui est disponible, sans rien perdre quand la sortie est pleine', () => {
    const contenu = contenuDeTest({ sechoir: { production: { baiesSechees: 1 }, consommation: { baies: 2 } } });
    contenu.stocksDeDepart.baies = 10;
    contenu.plafondsDeBase.baiesSechees = 3;
    const moteur = new Moteur(contenu, 0);
    commander(moteur, poser('sechoir'));
    moteur.simuler(HEURE);
    const { baies, baiesSechees } = moteur.etatCourant.stocks;
    expect(baiesSechees).toBeCloseTo(3, 6);
    expect(baies).toBeCloseTo(4, 6);
  });

  it('ne produit pas tant que le chantier n’est pas fini', () => {
    const contenu = contenuDeTest({ cueillette: { production: { baies: 60 }, constructionSecondes: 60 } });
    const moteur = new Moteur(contenu, 0);
    commander(moteur, poser('cueillette'));
    const evenements = moteur.simuler(PAS_PAR_MINUTE);
    expect(evenements).toContainEqual({ type: 'constructionTerminee', id: 1 });
    // Il produit dès le pas où il s'achève : un seul pas de production sur la première minute.
    expect(moteur.etatCourant.stocks.baies).toBeCloseTo(0.25, 6);
    moteur.simuler(PAS_PAR_MINUTE);
    expect(moteur.etatCourant.stocks.baies).toBeCloseTo(60.25, 6);
  });
});

describe('Commandes', () => {
  it('fait payer la construction et refuse sans les moyens', () => {
    const moteur = new Moteur(contenuDeTest({ hutte: { cout: { boisMort: 60 } } }), 0);
    expect(commander(moteur, poser('hutte'))).toEqual([]);
    expect(moteur.etatCourant.stocks.boisMort).toBe(40);
    expect(commander(moteur, poser('hutte'))).toEqual([
      { type: 'commandeRefusee', commande: poser('hutte'), raison: 'ressourcesInsuffisantes' },
    ]);
    expect(moteur.etatCourant.batiments).toHaveLength(1);
  });

  it('refuse un bâtiment non débloqué', () => {
    const contenu = contenuDeTest();
    contenu.batimentsDeDepart = ['hutte'];
    const moteur = new Moteur(contenu, 0);
    expect(commander(moteur, poser('atelier'))[0]).toMatchObject({ raison: 'nonDebloque' });
  });

  it('rembourse une partie du coût à la démolition', () => {
    const moteur = new Moteur(contenuDeTest({ hutte: { cout: { boisMort: 60 } } }), 0);
    commander(moteur, poser('hutte'));
    commander(moteur, { type: 'demolir', id: 1 });
    expect(moteur.etatCourant.stocks.boisMort).toBe(70);
    expect(moteur.etatCourant.batiments).toEqual([]);
  });

  it('borne les priorités entre 0 et 1', () => {
    const moteur = new Moteur(contenuDeTest(), 0);
    commander(moteur, { type: 'reglerPriorites', priorites: { recolter: 2, construire: -1, stocker: 0.3, soignerArbre: 1 } });
    expect(moteur.etatCourant.priorites).toEqual({ recolter: 1, construire: 0, stocker: 0.3, soignerArbre: 1 });
  });
});

describe('Moteur', () => {
  it('rattrape le temps réel et publie les événements une seule fois', () => {
    const contenu = contenuDeTest({ cueillette: { production: { baies: 6 }, constructionSecondes: 1 } });
    const moteur = new Moteur(contenu, 0);
    moteur.recevoir({ type: 'commande', commande: poser('cueillette') }, 0);
    const [message] = moteur.battre(10 * MINUTE_MS);
    expect(message).toMatchObject({ type: 'instantane', evenements: [{ type: 'constructionTerminee', id: 1 }] });
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
    const moteur = new Moteur(contenuDeTest({ cueillette: { production: { baies: 6 } } }), 0);
    commander(moteur, poser('cueillette'));
    moteur.simuler(1000);
    const [sauvegarde] = moteur.recevoir({ type: 'sauvegarder' }, 0);
    if (sauvegarde?.type !== 'sauvegarde') throw new Error('sauvegarde attendue');
    const reprise = new Moteur(contenuDeTest(), 0);
    reprise.recevoir({ type: 'demarrer', sauvegarde: sauvegarde.contenu }, 0);
    expect(reprise.etatCourant).toEqual(moteur.etatCourant);
  });
});
