// Logements : places, besoins par rang, montée en gamme et paliers de population.
// Les fonctions pures ne lisent que des types du contrat : le frontend s'en sert pour les bulles et l'aperçu.
import type { Batiment, Besoin, Case, Evenement, Ile, Quantites, RaisonRefus, Ressource } from './contrat';
import { RESSOURCES } from './contrat';
import type { Contenu, DefinitionRang } from './contenu';
import type { BatimentEtat, Etat } from './etat';
import { payer } from './ameliorations';
import { terrainEn } from './ile';
import { PAS_PAR_MINUTE } from './temps';

type Emprise = Pick<Batiment, 'type' | 'case' | 'chantier'>;

/** Rang d'un logement, ou `null` pour un autre bâtiment. */
export function rangLogement(contenu: Contenu, b: Pick<Batiment, 'type' | 'niveau'>): DefinitionRang | null {
  if (!contenu.batiments[b.type].logement) return null;
  return contenu.logement.rangs[Math.min(b.niveau, contenu.logement.rangs.length) - 1] ?? null;
}

/** Places offertes par un bâtiment achevé. */
export function placesLogement(contenu: Contenu, b: Pick<Batiment, 'type' | 'niveau' | 'chantier'>): number {
  return b.chantier === null ? (rangLogement(contenu, b)?.places ?? 0) : 0;
}

/** Places de toute la ville, souche-dépôt comprise. */
export function capaciteLogement(contenu: Contenu, batiments: readonly Batiment[]): number {
  return batiments.reduce((n, b) => n + placesLogement(contenu, b), contenu.habitants.logementDeBase);
}

/** Vrai si la case `c` est à portée d'un bâtiment de ce type posé sur `source`. */
export function aPortee(contenu: Contenu, source: Emprise, c: Case): boolean {
  const portee = contenu.batiments[source.type].portee ?? 0;
  return Math.max(Math.abs(source.case.x - c.x), Math.abs(source.case.y - c.y)) <= portee;
}

/** Cases de l'île couvertes par un bâtiment de ce type posé sur `c` (vide s'il n'a pas de portée). */
export function casesCouvertes(ile: Ile, contenu: Contenu, source: Pick<Batiment, 'type' | 'case'>): Case[] {
  const portee = contenu.batiments[source.type].portee ?? 0;
  const cases: Case[] = [];
  if (portee <= 0) return cases;
  for (let y = source.case.y - portee; y <= source.case.y + portee; y++) {
    for (let x = source.case.x - portee; x <= source.case.x + portee; x++) {
      if ((x !== source.case.x || y !== source.case.y) && terrainEn(ile, x, y) !== 'vide') cases.push({ x, y });
    }
  }
  return cases;
}

/** Besoins d'un rang et du suivant, sans doublon, dans l'ordre du rang. */
export function besoinsSuivis(contenu: Contenu, niveau: number): Besoin[] {
  const { rangs } = contenu.logement;
  const suivis = [...(rangs[niveau - 1]?.besoins ?? []), ...(rangs[niveau]?.besoins ?? [])];
  return suivis.filter((besoin, i) => suivis.indexOf(besoin) === i);
}

/** Besoins manquants d'un rang, d'après l'état publié du logement. */
export function besoinsManquants(contenu: Contenu, b: Pick<Batiment, 'besoins'>, niveau: number): Besoin[] {
  return (contenu.logement.rangs[niveau - 1]?.besoins ?? []).filter((besoin) => !b.besoins[besoin]);
}

/**
 * Évalue les besoins de chaque logement pour ce pas et prélève leurs consommations.
 * `nourri` : le village a mangé à sa faim. `occupes` : bâtiments dont au moins un emploi est pourvu.
 */
export function evaluerBesoins(etat: Etat, contenu: Contenu, nourri: boolean, occupes: ReadonlySet<number>): void {
  for (const b of etat.batiments) {
    const rang = b.chantier === null ? rangLogement(contenu, b) : null;
    if (!rang) {
      b.besoins = {};
      continue;
    }
    const servis = consommer(etat, rang.consommation ?? {});
    const besoins: Partial<Record<Besoin, boolean>> = {};
    for (const besoin of besoinsSuivis(contenu, b.niveau)) {
      if (besoin === 'nourriture') besoins[besoin] = nourri;
      else if (estRessource(besoin)) {
        // Rang actuel : la consommation de ce pas ; rang suivant : il suffit qu'il en reste en stock.
        besoins[besoin] = rang.consommation?.[besoin] !== undefined ? servis : etat.stocks[besoin] > 0;
      } else besoins[besoin] = sourceAPortee(etat, contenu, besoin, b, occupes);
    }
    b.besoins = besoins;
  }
}

/** Prélève une consommation par minute, au prorata d'un pas ; renvoie vrai si tout était disponible. */
function consommer(etat: Etat, consommation: Quantites): boolean {
  const ressources = RESSOURCES.filter((r) => consommation[r] !== undefined);
  let servi = true;
  for (const r of ressources) {
    const voulu = (consommation[r] ?? 0) / PAS_PAR_MINUTE;
    const pris = Math.min(voulu, etat.stocks[r]);
    etat.stocks[r] -= pris;
    if (pris < voulu - 1e-9) servi = false;
  }
  return servi;
}

function sourceAPortee(etat: Etat, contenu: Contenu, besoin: Besoin, logement: BatimentEtat, occupes: ReadonlySet<number>): boolean {
  const type = contenu.logement.sources[besoin];
  if (!type) return false;
  // Un bâtiment qui a des emplois (marché) ne rend service que s'il est tenu.
  const tenu = (b: BatimentEtat) => !contenu.batiments[b.type].postes || occupes.has(b.id);
  return etat.batiments.some((b) => b.type === type && b.chantier === null && aPortee(contenu, b, logement.case) && tenu(b));
}

function estRessource(besoin: Besoin): besoin is Besoin & Ressource {
  return (RESSOURCES as readonly string[]).includes(besoin);
}

/** Raison qui empêche un logement de monter au rang suivant, ou `null` s'il le peut (coût mis à part). */
export function refusMontee(contenu: Contenu, b: Pick<Batiment, 'type' | 'niveau' | 'chantier' | 'besoins'>, palier: number): RaisonRefus | null {
  const suivant = contenu.logement.rangs[b.niveau];
  if (!contenu.batiments[b.type].logement || b.chantier !== null || !suivant) return 'indisponible';
  if (suivant.palier > palier) return 'nonDebloque';
  if (besoinsManquants(contenu, b, b.niveau + 1).length > 0) return 'besoinsManquants';
  return null;
}

export function monterLogement(etat: Etat, contenu: Contenu, b: BatimentEtat): RaisonRefus | null {
  const refus = refusMontee(contenu, b, etat.palier);
  if (refus) return refus;
  if (!payer(etat, contenu.logement.rangs[b.niveau]!.cout ?? {})) return 'ressourcesInsuffisantes';
  b.niveau++;
  return null;
}

/** Tout ce qu'a coûté un bâtiment : sa construction et, pour un logement, ses montées en gamme. */
export function coutTotal(contenu: Contenu, b: Pick<Batiment, 'type' | 'niveau'>): Quantites {
  const total: Quantites = { ...contenu.batiments[b.type].cout };
  if (!contenu.batiments[b.type].logement) return total;
  for (const rang of contenu.logement.rangs.slice(1, b.niveau)) {
    for (const r of RESSOURCES) if (rang.cout?.[r]) total[r] = (total[r] ?? 0) + rang.cout[r];
  }
  return total;
}

/** Franchit les paliers de population atteints et débloque leurs bâtiments. */
export function majPalier(etat: Etat, contenu: Contenu, evenements: Evenement[]): void {
  for (let suivant = contenu.paliers[etat.palier + 1]; suivant && etat.habitants.length >= suivant.population; suivant = contenu.paliers[etat.palier + 1]) {
    etat.palier++;
    const debloques = suivant.debloque.filter((type) => !etat.batimentsDebloques.includes(type));
    etat.batimentsDebloques.push(...debloques);
    evenements.push({ type: 'palierAtteint', palier: etat.palier, debloques });
  }
}
