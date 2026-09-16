// Vie des habitants : choix de tâche par priorités, déplacement, travail, bien-être, arrivées.
import type { Evenement, Position, Ressource, Tache } from './contrat';
import { RESSOURCES } from './contrat';
import type { Contenu } from './contenu';
import { ajouterHabitant, plafonds, type BatimentEtat, type Etat, type HabitantEtat, type Mission } from './etat';
import { majBonusVoisinage } from './grille';
import { centreArbre } from './ile';
import { heureDuJour, PAS_DE_SIMULATION_MS, PAS_PAR_MINUTE } from './temps';

/** Distance à laquelle un habitant est arrivé devant un bâtiment. */
const RAYON_BATIMENT = 0.6;
/** Poids d'une case de trajet dans le choix d'une mission. */
const COUT_DISTANCE = 0.01;

export function estLaNuit(etat: Etat, contenu: Contenu): boolean {
  const heure = heureDuJour(etat.pas, contenu.temps);
  const { debut, fin } = contenu.habitants.nuit;
  if (debut === fin) return false;
  return debut < fin ? heure >= debut && heure < fin : heure >= debut || heure < fin;
}

export function avancerHabitants(etat: Etat, contenu: Contenu, evenements: Evenement[]): void {
  const nourri = nourrir(etat, contenu);
  const { loges, capacite } = logements(etat, contenu);
  const feuConstruit = etat.batiments.some((b) => b.type === 'feuDeCamp' && b.chantier === null);
  const nuit = estLaNuit(etat, contenu);

  for (const h of etat.habitants) {
    majBienEtre(h, contenu, loges.get(h.id), nourri, feuConstruit);
    if (nuit) {
      h.activite = 'dort';
      continue;
    }
    h.pasDepuisChoix++;
    if (!missionValide(etat, contenu, h)) choisirMission(etat, contenu, h);
    executer(etat, contenu, h, evenements);
  }
  arrivees(etat, contenu, capacite, evenements);
}

// ─── Besoins ─────────────────────────────────────────────────────────────────

/** Les habitants mangent des baies, puis des baies séchées ; renvoie faux si le compte n'y est pas. */
function nourrir(etat: Etat, contenu: Contenu): boolean {
  let besoin = (etat.habitants.length * contenu.habitants.baiesParMinute) / PAS_PAR_MINUTE;
  for (const r of ['baies', 'baiesSechees'] as const) {
    const pris = Math.min(besoin, etat.stocks[r]);
    etat.stocks[r] -= pris;
    besoin -= pris;
  }
  return besoin <= 1e-9;
}

/** Logement de chaque habitant logé (`true` pour l'arbre-mère, sinon la hutte) et nombre total de places. */
function logements(etat: Etat, contenu: Contenu): { loges: Map<number, BatimentEtat | true>; capacite: number } {
  const places: (BatimentEtat | true)[] = Array.from({ length: contenu.habitants.logementDeBase }, () => true);
  for (const b of etat.batiments) {
    if (b.chantier !== null) continue;
    for (let i = 0; i < (contenu.batiments[b.type].logement ?? 0); i++) places.push(b);
  }
  const loges = new Map<number, BatimentEtat | true>();
  etat.habitants.forEach((h, i) => {
    const place = places[i];
    if (place) loges.set(h.id, place);
  });
  return { loges, capacite: places.length };
}

function majBienEtre(h: HabitantEtat, contenu: Contenu, logement: BatimentEtat | true | undefined, nourri: boolean, feu: boolean): void {
  const c = contenu.habitants.bienEtre;
  let cible = c.base + (nourri ? c.nourri : c.affame);
  if (logement) cible += c.loge;
  if (feu) cible += c.feuDeCamp;
  if (logement !== undefined && logement !== true && logement.bonusVoisinage > 1) cible += c.feuDeCamp;
  cible = Math.min(1, Math.max(0, cible));
  h.bienEtre += (cible - h.bienEtre) / (c.minutesPourSeStabiliser * PAS_PAR_MINUTE);
}

function arrivees(etat: Etat, contenu: Contenu, capacite: number, evenements: Evenement[]): void {
  const n = etat.habitants.length;
  if (n >= capacite) return;
  const moyenne = n === 0 ? 1 : etat.habitants.reduce((s, h) => s + h.bienEtre, 0) / n;
  if (moyenne < contenu.habitants.seuilArrivee) return;
  etat.pasAvantArrivee--;
  if (etat.pasAvantArrivee > 0) return;
  etat.pasAvantArrivee = (contenu.habitants.delaiArriveeSecondes * 1000) / PAS_DE_SIMULATION_MS;
  evenements.push({ type: 'habitantArrive', id: ajouterHabitant(etat).id });
}

// ─── Choix de la mission ─────────────────────────────────────────────────────

function missionValide(etat: Etat, contenu: Contenu, h: HabitantEtat): boolean {
  const m = h.mission;
  if (h.charge && (!m || m.tache !== 'stocker' || m.etape !== 'deposer')) return false;
  if (!m) return false;
  if (h.epingle && m.tache !== h.epingle && !h.charge) return false;
  const reevaluer = h.pasDepuisChoix >= (contenu.habitants.reevaluationSecondes * 1000) / PAS_DE_SIMULATION_MS;
  switch (m.tache) {
    case 'recolter': {
      const b = trouver(etat, m.batiment);
      return !reevaluer && !!b && b.chantier === null;
    }
    case 'construire':
      return trouver(etat, m.batiment)?.chantier != null;
    case 'stocker':
      if (m.etape === 'deposer') return true;
      return totalReserve(trouver(etat, m.batiment)) > 0;
    case 'soignerArbre':
      return !reevaluer;
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
  const proposer = (mission: Mission, besoin: number, cible: Position) => {
    const poids = h.epingle ? (h.epingle === mission.tache ? 1 : 0) : etat.priorites[mission.tache];
    if (poids <= 0) return;
    const score = poids * besoin - distance(h.position, cible) * COUT_DISTANCE;
    if (!meilleur || score > meilleur.score) meilleur = { mission, score };
  };

  for (const b of etat.batiments) {
    const def = contenu.batiments[b.type];
    const cible = centreCase(b);
    if (b.chantier !== null) {
      if (occupants(etat, h, 'construire', b.id) < contenu.habitants.ouvriersParChantier) {
        proposer({ tache: 'construire', batiment: b.id }, 1, cible);
      }
      continue;
    }
    if (def.production && occupants(etat, h, 'recolter', b.id) < (def.postes ?? 1) && !reservePleine(b, def.production, contenu)) {
      proposer({ tache: 'recolter', batiment: b.id }, 1, cible);
    }
    const reserve = totalReserve(b);
    if (reserve > 0 && occupants(etat, h, 'stocker', b.id) === 0) {
      proposer({ tache: 'stocker', etape: 'prendre', batiment: b.id }, Math.min(1, reserve / contenu.habitants.capaciteTransport), cible);
    }
  }
  // Soigner l'arbre reste un recours quand rien d'autre ne presse.
  proposer({ tache: 'soignerArbre' }, 0.5, centreArbre(etat.ile));

  h.mission = meilleur?.mission ?? null;
  h.tache = h.mission?.tache ?? null;
}

function occupants(etat: Etat, moi: HabitantEtat, tache: Tache, batiment: number): number {
  return etat.habitants.filter((h) => {
    const m = h.mission;
    return h !== moi && m?.tache === tache && 'batiment' in m && m.batiment === batiment;
  }).length;
}

function reservePleine(b: BatimentEtat, production: Partial<Record<Ressource, number>>, contenu: Contenu): boolean {
  return cles(production).every((r) => (b.reserve[r] ?? 0) >= contenu.habitants.reserveMax);
}

// ─── Exécution ───────────────────────────────────────────────────────────────

function executer(etat: Etat, contenu: Contenu, h: HabitantEtat, evenements: Evenement[]): void {
  const m = h.mission;
  if (!m) {
    h.activite = 'attend';
    return;
  }
  const [cible, rayon] = destination(etat, m);
  if (!marcherVers(h, cible, rayon, contenu)) return;

  switch (m.tache) {
    case 'recolter':
      recolter(etat, contenu, h, trouver(etat, m.batiment)!);
      return;
    case 'construire': {
      const b = trouver(etat, m.batiment)!;
      const pasNecessaires = (contenu.batiments[b.type].constructionSecondes * 1000) / PAS_DE_SIMULATION_MS;
      b.chantier = pasNecessaires > 0 ? b.chantier! + 1 / pasNecessaires : 1;
      h.activite = 'construit';
      if (b.chantier >= 1 - 1e-9) {
        b.chantier = null;
        majBonusVoisinage(etat, contenu);
        evenements.push({ type: 'constructionTerminee', id: b.id });
        h.mission = null;
      }
      return;
    }
    case 'stocker':
      if (m.etape === 'prendre') prendre(etat, contenu, h, trouver(etat, m.batiment)!);
      else deposer(etat, contenu, h);
      return;
    case 'soignerArbre':
      h.activite = 'recolte';
      return;
  }
}

function recolter(etat: Etat, contenu: Contenu, h: HabitantEtat, b: BatimentEtat): void {
  const def = contenu.batiments[b.type];
  const production = def.production ?? {};
  const consommation = def.consommation ?? {};
  let part = 1;
  for (const r of cles(production)) {
    part = Math.min(part, Math.max(0, contenu.habitants.reserveMax - (b.reserve[r] ?? 0)) / (((production[r] ?? 0) * b.bonusVoisinage) / PAS_PAR_MINUTE));
  }
  for (const r of cles(consommation)) {
    part = Math.min(part, etat.stocks[r] / ((consommation[r] ?? 0) / PAS_PAR_MINUTE));
  }
  if (!(part > 0)) {
    h.activite = 'attend';
    h.mission = null;
    return;
  }
  for (const r of cles(consommation)) etat.stocks[r] -= ((consommation[r] ?? 0) / PAS_PAR_MINUTE) * part;
  for (const r of cles(production)) {
    b.reserve[r] = (b.reserve[r] ?? 0) + (((production[r] ?? 0) * b.bonusVoisinage) / PAS_PAR_MINUTE) * part;
  }
  h.activite = 'recolte';
}

function prendre(etat: Etat, contenu: Contenu, h: HabitantEtat, b: BatimentEtat): void {
  const ressource = cles(b.reserve).sort((x, y) => (b.reserve[y] ?? 0) - (b.reserve[x] ?? 0))[0];
  if (!ressource) {
    h.mission = null;
    return;
  }
  const quantite = Math.min(b.reserve[ressource] ?? 0, contenu.habitants.capaciteTransport);
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
  const place = Math.max(0, plafonds(etat, contenu)[charge.ressource] - etat.stocks[charge.ressource]);
  const pose = Math.min(place, charge.quantite);
  etat.stocks[charge.ressource] += pose;
  charge.quantite -= pose;
  if (charge.quantite <= 1e-9) {
    h.charge = null;
    h.mission = null;
    h.activite = 'attend';
  } else {
    // Stock plein : l'habitant garde sa charge et patiente, rien ne se perd.
    h.activite = 'attend';
  }
}

/** Dépôt le plus proche : l'arbre-mère ou un bâtiment de stockage achevé. */
function versDepot(etat: Etat, contenu: Contenu, depuis: Position): Mission {
  let meilleur: Mission = { tache: 'stocker', etape: 'deposer', destination: centreArbre(etat.ile), rayon: rayonArbre(etat) };
  let d = distance(depuis, meilleur.destination) - meilleur.rayon;
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
  if (m.tache === 'soignerArbre') return [centreArbre(etat.ile), rayonArbre(etat)];
  if (m.tache === 'stocker' && m.etape === 'deposer') return [m.destination, m.rayon];
  return [centreCase(trouver(etat, m.batiment)!), RAYON_BATIMENT];
}

/** Rapproche l'habitant de sa cible ; renvoie vrai une fois arrivé. */
function marcherVers(h: HabitantEtat, cible: Position, rayon: number, contenu: Contenu): boolean {
  const dx = cible.x - h.position.x;
  const dy = cible.y - h.position.y;
  const reste = Math.hypot(dx, dy) - rayon;
  if (reste <= 1e-6) return true;
  const pas = Math.min(reste, (contenu.habitants.vitesseCasesParSeconde * PAS_DE_SIMULATION_MS) / 1000);
  const d = Math.hypot(dx, dy);
  h.position = { x: h.position.x + (dx / d) * pas, y: h.position.y + (dy / d) * pas };
  h.direction = Math.atan2(dy, dx);
  h.activite = h.charge ? 'porte' : 'marche';
  return false;
}

// ─── Outils ──────────────────────────────────────────────────────────────────

function trouver(etat: Etat, id: number): BatimentEtat | undefined {
  return etat.batiments.find((b) => b.id === id);
}

function totalReserve(b: BatimentEtat | undefined): number {
  return b ? cles(b.reserve).reduce((s, r) => s + (b.reserve[r] ?? 0), 0) : 0;
}

function centreCase(b: BatimentEtat): Position {
  return { x: b.case.x + 0.5, y: b.case.y + 0.5 };
}

function rayonArbre(etat: Etat): number {
  return etat.ile.tailleArbreMere / 2 + 0.3;
}

function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cles(q: Partial<Record<Ressource, number>>): Ressource[] {
  return RESSOURCES.filter((r) => q[r] !== undefined);
}

