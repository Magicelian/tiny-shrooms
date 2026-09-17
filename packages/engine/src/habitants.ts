// Vie des habitants : choix de tâche automatique, déplacement, travail, bien-être, arrivées.
import type { Case, Evenement, Position, Ressource, Tache } from './contrat';
import { RESSOURCES } from './contrat';
import type { Contenu } from './contenu';
import { ajouterHabitant, plafonds, type BatimentEtat, type Etat, type HabitantEtat, type Mission } from './etat';
import { majBonusVoisinage } from './grille';
import { centreSouche } from './ile';
import { cadenceTravail, estLHiver, facteurSaison, feuLePlusProche } from './saisons';
import { bonusProduction, effetAmelioration } from './ameliorations';
import { etapeVers, preparerGrille } from './chemins';
import { avancerDefrichage, memeCase } from './defrichage';
import { besoinsManquants, evaluerBesoins, placesLogement, placesSouche, rangLogement } from './logements';
import { effetsPrestige } from './prestige';
import { heureDuJour, PAS_DE_SIMULATION_MS, PAS_PAR_MINUTE } from './temps';

/** Distance à laquelle un habitant est arrivé devant un bâtiment. */
const RAYON_BATIMENT = 0.6;
/** Poids d'une case de trajet dans le choix d'une mission. */
const COUT_DISTANCE = 0.01;
// Poids commun à toutes les tâches (ancien réglage des priorités, laissé à mi-course).
const POIDS_TACHE = 0.5;
/** Un habitant sans rien à faire ne cherche de nouveau qu'après ce délai (en pas), pour ménager le processeur. */
const PAS_ENTRE_RECHERCHES = 4;

export function estLaNuit(etat: Etat, contenu: Contenu): boolean {
  const heure = heureDuJour(etat.pas, contenu.temps);
  const { debut, fin } = contenu.habitants.nuit;
  if (debut === fin) return false;
  return debut < fin ? heure >= debut && heure < fin : heure >= debut || heure < fin;
}

export function avancerHabitants(etat: Etat, contenu: Contenu, evenements: Evenement[]): void {
  const nourri = nourrir(etat, contenu);
  preparerGrille(etat);
  evaluerBesoins(etat, contenu, nourri, emploisTenus(etat));
  const { loges, capacite } = logements(etat, contenu);
  const nuit = estLaNuit(etat, contenu);
  const bonusBienEtre = effetsPrestige(contenu, etat.prestige.bonus).bienEtre;

  for (const h of etat.habitants) {
    majBienEtre(h, contenu, loges.get(h.id), nourri, bonusBienEtre);
    if (nuit) {
      dormir(etat, contenu, h, loges.get(h.id));
      continue;
    }
    h.pasDepuisChoix++;
    // `tache` nulle sans mission : la dernière recherche n’a rien trouvé.
    const oisif = !h.mission && !h.charge && h.tache === null && h.pasDepuisChoix < PAS_ENTRE_RECHERCHES;
    if (!oisif && !missionValide(etat, contenu, h)) choisirMission(etat, contenu, h);
    executer(etat, contenu, h, nourri, evenements);
  }
  // Village encore vide : les chantiers avancent seuls, au rythme d'un bâtisseur.
  if (etat.habitants.length === 0) {
    for (const b of etat.batiments) if (b.chantier !== null) avancerChantier(etat, contenu, b, cadenceTravail(etat, contenu, centreCase(b), nourri), evenements);
    if (etat.retraitSouche !== null) avancerRetrait(etat, contenu, cadenceTravail(etat, contenu, centreSouche(etat.ile), nourri), evenements);
    for (const d of [...etat.defrichages]) avancerDefrichage(etat, contenu, d.case, cadenceTravail(etat, contenu, centre(d.case), nourri), evenements);
  }
  arrivees(etat, contenu, capacite, evenements);
}

/** La nuit, chacun rentre dormir au pied de son logement ; un sans-logis dort où il se trouve. */
function dormir(etat: Etat, contenu: Contenu, h: HabitantEtat, logement: BatimentEtat | true | undefined): void {
  const arrive =
    logement === undefined ||
    (logement === true
      ? marcherVers(etat, h, centreSouche(etat.ile), rayonSouche(etat), contenu)
      : marcherVers(etat, h, centreCase(logement), RAYON_BATIMENT, contenu));
  if (arrive) h.activite = 'dort';
}

/** Fait avancer le retrait de la souche d'un pas ; une fois arrachée, ses cases se libèrent. */
function avancerRetrait(etat: Etat, contenu: Contenu, cadence: number, evenements: Evenement[]): void {
  const pasNecessaires = (contenu.souche.retraitSecondes * 1000) / PAS_DE_SIMULATION_MS;
  etat.retraitSouche = pasNecessaires > 0 ? etat.retraitSouche! + cadence / pasNecessaires : 1;
  if (etat.retraitSouche < 1 - 1e-9) return;
  etat.retraitSouche = null;
  etat.ile.soucheEnPlace = false;
  majBonusVoisinage(etat, contenu);
  evenements.push({ type: 'soucheRetiree' });
}

/** Fait avancer un chantier d'un pas ; renvoie vrai s'il vient de se terminer. */
function avancerChantier(etat: Etat, contenu: Contenu, b: BatimentEtat, cadence: number, evenements: Evenement[]): boolean {
  const vitesse = effetsPrestige(contenu, etat.prestige.bonus).chantier;
  const pasNecessaires = (contenu.batiments[b.type].constructionSecondes * 1000) / PAS_DE_SIMULATION_MS / vitesse;
  b.chantier = pasNecessaires > 0 ? b.chantier! + cadence / pasNecessaires : 1;
  if (b.chantier < 1 - 1e-9) return false;
  b.chantier = null;
  majBonusVoisinage(etat, contenu);
  evenements.push({ type: 'constructionTerminee', id: b.id });
  return true;
}

// ─── Besoins ─────────────────────────────────────────────────────────────────

/** Les habitants mangent des baies, puis des baies séchées ; renvoie faux si le compte n'y est pas. */
function nourrir(etat: Etat, contenu: Contenu): boolean {
  let besoin = (etat.habitants.length * contenu.habitants.baiesParMinute) / PAS_PAR_MINUTE;
  const valeurs = { baies: 1, baiesSechees: contenu.habitants.valeurBaieSechee } as const;
  for (const r of ['baies', 'baiesSechees'] as const) {
    const pris = Math.min(besoin / valeurs[r], etat.stocks[r]);
    etat.stocks[r] -= pris;
    besoin -= pris * valeurs[r];
  }
  return besoin <= 1e-9;
}

/** Bâtiments sans production dont au moins un emploi est pourvu (la nuit aussi : l'habitant garde son poste). */
function emploisTenus(etat: Etat): Set<number> {
  const tenus = new Set<number>();
  for (const h of etat.habitants) if (h.mission?.tache === 'tenir') tenus.add(h.mission.batiment);
  return tenus;
}

/** Logement de chaque habitant logé (`true` pour la souche-dépôt, sinon la hutte) et nombre total de places. */
export function logements(etat: Etat, contenu: Contenu): { loges: Map<number, BatimentEtat | true>; capacite: number } {
  const effets = effetsPrestige(contenu, etat.prestige.bonus);
  const souche = placesSouche(contenu, effets.habitantsDeDepart, etat.ile.soucheEnPlace);
  const places: (BatimentEtat | true)[] = Array.from({ length: souche }, () => true);
  for (const b of etat.batiments) {
    if (b.chantier !== null) continue;
    for (let i = 0; i < placesLogement(contenu, b, effets.places); i++) places.push(b);
  }
  const loges = new Map<number, BatimentEtat | true>();
  etat.habitants.forEach((h, i) => {
    const place = places[i];
    if (place) loges.set(h.id, place);
  });
  return { loges, capacite: places.length };
}

function majBienEtre(h: HabitantEtat, contenu: Contenu, logement: BatimentEtat | true | undefined, nourri: boolean, bonus: number): void {
  const c = contenu.habitants.bienEtre;
  let cible = c.base + bonus + (nourri ? 0 : c.affame);
  if (logement) cible += c.loge + c.besoins * partSatisfaite(contenu, logement, nourri);
  cible = Math.min(1, Math.max(0, cible));
  h.bienEtre += (cible - h.bienEtre) / (c.minutesPourSeStabiliser * PAS_PAR_MINUTE);
}

/** Part des besoins du rang satisfaits ; la souche-dépôt ne demande que la nourriture. */
function partSatisfaite(contenu: Contenu, logement: BatimentEtat | true, nourri: boolean): number {
  if (logement === true) return nourri ? 1 : 0;
  const besoins = rangLogement(contenu, logement)?.besoins ?? [];
  if (besoins.length === 0) return 1;
  return 1 - besoinsManquants(contenu, logement, logement.niveau).length / besoins.length;
}

function arrivees(etat: Etat, contenu: Contenu, capacite: number, evenements: Evenement[]): void {
  const n = etat.habitants.length;
  if (n >= capacite) return;
  const moyenne = n === 0 ? 1 : etat.habitants.reduce((s, h) => s + h.bienEtre, 0) / n;
  if (moyenne < contenu.habitants.seuilArrivee) return;
  etat.pasAvantArrivee--;
  if (etat.pasAvantArrivee > 0) return;
  const accueil = effetsPrestige(contenu, etat.prestige.bonus).arrivee;
  etat.pasAvantArrivee = (contenu.habitants.delaiArriveeSecondes * accueil * 1000) / PAS_DE_SIMULATION_MS;
  evenements.push({ type: 'habitantArrive', id: ajouterHabitant(etat).id });
}

// ─── Choix de la mission ─────────────────────────────────────────────────────

function missionValide(etat: Etat, contenu: Contenu, h: HabitantEtat): boolean {
  const m = h.mission;
  if (h.charge && (!m || m.tache !== 'stocker' || m.etape !== 'deposer')) return false;
  if (!m) return false;
  const reevaluer = h.pasDepuisChoix >= (contenu.habitants.reevaluationSecondes * 1000) / PAS_DE_SIMULATION_MS;
  switch (m.tache) {
    case 'recolter': {
      const b = trouver(etat, m.batiment);
      return !reevaluer && !!b && b.chantier === null && productif(etat, contenu, b);
    }
    case 'construire':
      return trouver(etat, m.batiment)?.chantier != null;
    case 'tenir':
      return !reevaluer && trouver(etat, m.batiment)?.chantier === null;
    case 'arracher':
      return m.case === null ? etat.retraitSouche !== null : etat.defrichages.some((d) => memeCase(d.case, m.case!));
    case 'stocker':
      // Dépôt à la souche entre-temps arrachée : on cherche un autre dépôt.
      if (m.etape === 'deposer') return etat.ile.soucheEnPlace || distance(m.destination, centreSouche(etat.ile)) > 1e-9;
      return transportable(etat, contenu, trouver(etat, m.batiment)) > 0;
  }
}

interface Candidat {
  mission: Mission;
  score: number;
}

function choisirMission(etat: Etat, contenu: Contenu, h: HabitantEtat): void {
  h.pasDepuisChoix = 0;
  if (h.charge) {
    h.mission = versDepot(etat, contenu, h.position);
    h.tache = 'stocker';
    return;
  }
  let meilleur = null as Candidat | null;
  const place = placeLibre(etat, contenu);
  const proposer = (mission: Mission, besoin: number, cible: Position) => {
    const score = POIDS_TACHE * besoin - distance(h.position, cible) * COUT_DISTANCE;
    if (!meilleur || score > meilleur.score) meilleur = { mission, score };
  };

  if (etat.retraitSouche !== null && arracheurs(etat, h, null) < contenu.habitants.ouvriersParChantier) {
    proposer({ tache: 'arracher', case: null }, 1, centreSouche(etat.ile));
  }
  for (const d of etat.defrichages) {
    if (arracheurs(etat, h, d.case) < contenu.habitants.ouvriersParChantier) proposer({ tache: 'arracher', case: d.case }, 1, centre(d.case));
  }
  for (const b of etat.batiments) {
    const def = contenu.batiments[b.type];
    const cible = centreCase(b);
    if (b.chantier !== null) {
      const batisseurs = occupants(etat, h, 'construire', b.id);
      // Un chantier sans personne passe avant un emploi : sinon un habitant seul et employé ne le finirait jamais.
      if (batisseurs < contenu.habitants.ouvriersParChantier) proposer({ tache: 'construire', batiment: b.id }, batisseurs === 0 ? 1.5 : 1, cible);
      continue;
    }
    if (
      def.production &&
      productif(etat, contenu, b) &&
      occupants(etat, h, 'recolter', b.id) < (def.postes ?? 1) &&
      !reservePleine(b, def.production, contenu)
    ) {
      proposer({ tache: 'recolter', batiment: b.id }, 1, cible);
    }
    if (def.postes && !def.production && occupants(etat, h, 'tenir', b.id) < def.postes) {
      proposer({ tache: 'tenir', batiment: b.id }, 1, cible);
    }
    const reserve = cles(b.reserve).reduce((total, r) => total + (b.reserve[r] ?? 0), 0);
    if (reserve > 0 && transportable(etat, contenu, b, place) > 0 && occupants(etat, h, 'stocker', b.id) === 0) {
      proposer({ tache: 'stocker', etape: 'prendre', batiment: b.id }, Math.min(1, reserve / contenu.habitants.capaciteTransport), cible);
    }
  }

  h.mission = meilleur?.mission ?? null;
  h.tache = h.mission?.tache ?? null;
}

function arracheurs(etat: Etat, moi: HabitantEtat, c: Case | null): number {
  return etat.habitants.filter((h) => {
    const m = h.mission;
    if (h === moi || m?.tache !== 'arracher') return false;
    return m.case === null || c === null ? m.case === c : memeCase(m.case, c);
  }).length;
}

function occupants(etat: Etat, moi: HabitantEtat, tache: Tache, batiment: number): number {
  return etat.habitants.filter((h) => {
    const m = h.mission;
    return h !== moi && m?.tache === tache && 'batiment' in m && m.batiment === batiment;
  }).length;
}

/** Faux quand la saison et la météo réduisent toute la production du bâtiment à rien (baies en hiver). */
function productif(etat: Etat, contenu: Contenu, b: BatimentEtat): boolean {
  return cles(contenu.batiments[b.type].production ?? {}).some((r) => facteurSaison(etat, contenu, r) > 0);
}

function reservePleine(b: BatimentEtat, production: Partial<Record<Ressource, number>>, contenu: Contenu): boolean {
  return cles(production).every((r) => (b.reserve[r] ?? 0) >= contenu.habitants.reserveMax);
}

// ─── Exécution ───────────────────────────────────────────────────────────────

function executer(etat: Etat, contenu: Contenu, h: HabitantEtat, nourri: boolean, evenements: Evenement[]): void {
  const m = h.mission;
  if (!m) {
    // Sans rien à faire en hiver, on va se réchauffer au feu de camp.
    const feu = estLHiver(etat, contenu) ? feuLePlusProche(etat, h.position) : null;
    if (!feu) h.activite = 'attend';
    else if (marcherVers(etat, h, feu, 0.8 + (h.id % 3) * 0.15, contenu)) h.activite = 'seRechauffe';
    return;
  }
  const [cible, rayon] = destination(etat, m);
  if (!marcherVers(etat, h, cible, rayon, contenu)) return;

  switch (m.tache) {
    case 'recolter':
      recolter(etat, contenu, h, trouver(etat, m.batiment)!, nourri);
      return;
    case 'construire': {
      const b = trouver(etat, m.batiment)!;
      h.activite = 'construit';
      if (avancerChantier(etat, contenu, b, cadenceTravail(etat, contenu, centreCase(b), nourri), evenements)) h.mission = null;
      return;
    }
    case 'tenir':
      h.activite = 'tient';
      return;
    case 'arracher':
      h.activite = 'construit';
      if (m.case === null) avancerRetrait(etat, contenu, cadenceTravail(etat, contenu, centreSouche(etat.ile), nourri), evenements);
      else avancerDefrichage(etat, contenu, m.case, cadenceTravail(etat, contenu, centre(m.case), nourri), evenements);
      return;
    case 'stocker':
      if (m.etape === 'prendre') prendre(etat, contenu, h, trouver(etat, m.batiment)!);
      else deposer(etat, contenu, h);
      return;
  }
}

function recolter(etat: Etat, contenu: Contenu, h: HabitantEtat, b: BatimentEtat, nourri: boolean): void {
  const def = contenu.batiments[b.type];
  const cadence =
    cadenceTravail(etat, contenu, centreCase(b), nourri) * bonusProduction(etat, contenu);
  // Quantités de ce pas, à plein régime ; `part` les réduit si la réserve déborde ou si le stock manque.
  const produit: Partial<Record<Ressource, number>> = {};
  for (const r of cles(def.production ?? {})) {
    produit[r] = (def.production![r]! * b.bonusVoisinage * facteurSaison(etat, contenu, r) * cadence) / PAS_PAR_MINUTE;
  }
  const consomme: Partial<Record<Ressource, number>> = {};
  for (const r of cles(def.consommation ?? {})) consomme[r] = (def.consommation![r]! * cadence) / PAS_PAR_MINUTE;

  let part = 1;
  for (const r of cles(produit)) {
    if (produit[r]! > 0) part = Math.min(part, Math.max(0, contenu.habitants.reserveMax - (b.reserve[r] ?? 0)) / produit[r]!);
  }
  for (const r of cles(consomme)) part = Math.min(part, etat.stocks[r] / consomme[r]!);
  if (!(part > 0)) {
    h.activite = 'attend';
    h.mission = null;
    return;
  }
  for (const r of cles(consomme)) etat.stocks[r] -= consomme[r]! * part;
  for (const r of cles(produit)) b.reserve[r] = (b.reserve[r] ?? 0) + produit[r]! * part;
  h.activite = 'recolte';
}

function prendre(etat: Etat, contenu: Contenu, h: HabitantEtat, b: BatimentEtat): void {
  const place = placeLibre(etat, contenu);
  const aPorter = (r: Ressource) => Math.min(b.reserve[r] ?? 0, place[r]);
  const ressource = cles(b.reserve)
    .filter((r) => aPorter(r) > 1e-9)
    .sort((x, y) => aPorter(y) - aPorter(x))[0];
  if (!ressource) {
    h.mission = null;
    return;
  }
  const quantite = Math.min(aPorter(ressource), contenu.habitants.capaciteTransport);
  b.reserve[ressource] = (b.reserve[ressource] ?? 0) - quantite;
  if (b.reserve[ressource]! <= 1e-9) delete b.reserve[ressource];
  h.charge = { ressource, quantite };
  h.mission = versDepot(etat, contenu, h.position);
  h.activite = 'porte';
}

function deposer(etat: Etat, contenu: Contenu, h: HabitantEtat): void {
  const charge = h.charge;
  if (!charge) {
    h.mission = null;
    return;
  }
  // Toujours déposé en entier : la place a été retenue au ramassage, et un stock rempli entre-temps
  // déborde à peine plutôt que de bloquer le porteur. La charge rejoint les arrivages, rangés peu à peu.
  etat.arrivages[charge.ressource] += charge.quantite;
  h.charge = null;
  h.mission = null;
  h.activite = 'attend';
}

/** Place restante dans les stocks, charges déjà en route comprises. */
function placeLibre(etat: Etat, contenu: Contenu): Record<Ressource, number> {
  const max = plafonds(etat, contenu);
  const place = {} as Record<Ressource, number>;
  for (const r of RESSOURCES) place[r] = max[r] - etat.stocks[r] - etat.arrivages[r];
  for (const h of etat.habitants) if (h.charge) place[h.charge.ressource] -= h.charge.quantite;
  for (const r of RESSOURCES) place[r] = Math.max(0, place[r]);
  return place;
}

/** Part de la réserve d'un bâtiment qui trouverait place dans les stocks. */
function transportable(etat: Etat, contenu: Contenu, b: BatimentEtat | undefined, place?: Record<Ressource, number>): number {
  if (!b || cles(b.reserve).length === 0) return 0;
  place ??= placeLibre(etat, contenu);
  return cles(b.reserve).reduce((s, r) => s + Math.min(b.reserve[r] ?? 0, place[r]), 0);
}

/** Dépôt le plus proche : la souche ou un bâtiment de stockage achevé. */
function versDepot(etat: Etat, contenu: Contenu, depuis: Position): Mission {
  let meilleur: Mission = { tache: 'stocker', etape: 'deposer', destination: centreSouche(etat.ile), rayon: rayonSouche(etat) };
  // Sans la souche, le premier dépôt venu l'emporte ; la simulation en garde toujours un.
  let d = etat.ile.soucheEnPlace ? distance(depuis, meilleur.destination) - meilleur.rayon : Infinity;
  for (const b of etat.batiments) {
    if (b.chantier !== null || !contenu.batiments[b.type].stockage) continue;
    const c = centreCase(b);
    if (distance(depuis, c) - RAYON_BATIMENT < d) {
      d = distance(depuis, c) - RAYON_BATIMENT;
      meilleur = { tache: 'stocker', etape: 'deposer', destination: c, rayon: RAYON_BATIMENT };
    }
  }
  return meilleur;
}

function destination(etat: Etat, m: Mission): [Position, number] {
  if (m.tache === 'stocker' && m.etape === 'deposer') return [m.destination, m.rayon];
  if (m.tache === 'arracher') return m.case === null ? [centreSouche(etat.ile), rayonSouche(etat)] : [centre(m.case), RAYON_BATIMENT];
  return [centreCase(trouver(etat, m.batiment)!), RAYON_BATIMENT];
}

/** Rapproche l'habitant de sa cible en contournant les obstacles ; renvoie vrai une fois arrivé. */
function marcherVers(etat: Etat, h: HabitantEtat, cible: Position, rayon: number, contenu: Contenu): boolean {
  if (distance(h.position, cible) - rayon <= 1e-6) return true;
  const etape = etapeVers(etat, h, cible, rayon);
  // Point de passage : on le rejoint exactement ; cible : on s'arrête à `rayon`.
  const marge = etape === cible ? rayon : 0;
  const dx = etape.x - h.position.x;
  const dy = etape.y - h.position.y;
  const d = Math.hypot(dx, dy);
  const reste = d - marge;
  const vitesse = contenu.habitants.vitesseCasesParSeconde * effetAmelioration(etat, contenu, 'vitesse');
  const pas = Math.min(reste, (vitesse * PAS_DE_SIMULATION_MS) / 1000);
  h.position = { x: h.position.x + (dx / d) * pas, y: h.position.y + (dy / d) * pas };
  h.direction = Math.atan2(dy, dx);
  h.activite = h.charge ? 'porte' : 'marche';
  return false;
}

// ─── Outils ──────────────────────────────────────────────────────────────────

function trouver(etat: Etat, id: number): BatimentEtat | undefined {
  return etat.batiments.find((b) => b.id === id);
}

function centreCase(b: BatimentEtat): Position {
  return centre(b.case);
}

function centre(c: Case): Position {
  return { x: c.x + 0.5, y: c.y + 0.5 };
}

function rayonSouche(etat: Etat): number {
  return etat.ile.tailleSouche / 2 + 0.3;
}

function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cles(q: Partial<Record<Ressource, number>>): Ressource[] {
  return RESSOURCES.filter((r) => q[r] !== undefined);
}

