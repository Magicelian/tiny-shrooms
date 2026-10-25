// La cité (150 habitants) débloque le kiosque à lanternes : tenu par un musicien, il apporte la fête aux logements
// alentour, dernier besoin de la tour-chapeau, le rang qui suit le manoir.
import { describe, expect, it } from 'vitest';
import {
  creerPartie,
  disponibleSur,
  Moteur,
  PAS_PAR_MINUTE,
  placesLogement,
  RESSOURCES,
  refusMontee,
  type Case,
  type Commande,
  type Etat,
  type Evenement,
  type TypeBatiment,
} from '@tiny-shrooms/engine';
import { contenu } from './index';

const CITE = contenu.paliers.findIndex((p) => p.nom === 'cite');
const TOUR = contenu.logement.rangs.length;

describe('Cité', () => {
  it('la cité arrive à 150 habitants et débloque le kiosque, source de la fête', () => {
    expect(contenu.paliers[CITE]).toMatchObject({ population: 150, debloque: ['kiosque'] });
    expect(contenu.logement.sources.fete).toBe('kiosque');
    expect(contenu.batiments.kiosque.portee).toBeGreaterThan(0);
    // La tour-chapeau est le rang de la cité, au-dessus du manoir : plus de places, la fête en plus.
    const [manoir, tour] = contenu.logement.rangs.slice(-2);
    expect(tour).toMatchObject({ palier: CITE, places: 12 });
    expect(tour!.besoins).toEqual([...manoir!.besoins, 'fete']);
  });

  it('un manoir près d’un kiosque tenu devient tour-chapeau, une fois la cité atteinte', () => {
    const moteur = new Moteur(contenu, 0, creerPartie(contenu, 1));
    const etat = moteur.etatCourant as Etat;
    const evenements = (commande: Commande): Evenement[] => {
      // Stock garni juste avant la commande : les plafonds d'une île neuve sont bien en dessous des prix de la cité.
      for (const r of RESSOURCES) etat.partie.stocks[r] = 10_000;
      return moteur.recevoir({ type: 'commande', commande }, 0).flatMap((m) => (m.type === 'instantane' ? m.evenements : []));
    };
    // Village déjà au bourg, tout débloqué jusque-là.
    etat.palier = CITE - 1;
    etat.batimentsDebloques = contenu.paliers.slice(0, CITE).flatMap((p) => p.debloque).filter((type) => disponibleSur(contenu, type, etat.ile.biome));

    const [centre] = moteur.casesLibres();
    const pres = (c: Case) => moteur.casesLibres().find((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) <= 2)!;
    const poser = (batiment: TypeBatiment, c: Case) => evenements({ type: 'poserBatiment', batiment, case: c, orientation: 0 });
    poser('hutte', centre!);
    for (const type of ['puits', 'feuDeCamp', 'marche'] as const) poser(type, pres(centre!));
    expect(poser('kiosque', pres(centre!))[0]).toMatchObject({ raison: 'nonDebloque' });

    etat.palier = CITE;
    etat.batimentsDebloques.push('kiosque');
    poser('kiosque', pres(centre!));
    for (const b of etat.batiments) b.chantier = null;
    const manoir = etat.batiments.find((b) => b.type === 'hutte')!;
    manoir.niveau = TOUR - 1;
    expect(refusMontee(contenu, manoir, CITE - 1)).toBe('nonDebloque');

    // Personne pour tenir le kiosque : pas de fête.
    moteur.simuler(1);
    expect(manoir.besoins.fete).toBe(false);
    moteur.simuler(15 * PAS_PAR_MINUTE);
    expect(manoir.besoins).toMatchObject({ commerce: true, fete: true });

    expect(evenements({ type: 'ameliorer', cible: { batiment: manoir.id } })).toEqual([]);
    const fini = moteur.simuler(10 * PAS_PAR_MINUTE);
    expect(fini).toContainEqual({ type: 'logementAmeliore', id: manoir.id, niveau: TOUR });
    expect(placesLogement(contenu, manoir)).toBe(12);
  });
});
