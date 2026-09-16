// Faux moteur de l'étape 3 : parle le protocole du contrat avec des données inventées,
// le temps que le vrai moteur (étapes 1 et 2) arrive.
import {
  PAS_DE_SIMULATION_MS,
  RESSOURCES,
  type Activite,
  type Batiment,
  type Habitant,
  type Ile,
  type Instantane,
  type MessageDepuisMoteur,
  type MessageVersMoteur,
  type Position,
  type Ressource,
  type Stock,
  type Terrain,
} from '@tiny-shrooms/engine';

const portee = globalThis as unknown as {
  postMessage(message: MessageDepuisMoteur): void;
  onmessage: ((message: MessageEvent<MessageVersMoteur>) => void) | null;
};

let graine = 7;
function hasard(): number {
  graine = (graine + 0x6d2b79f5) | 0;
  let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ─── Île ronde de 12 cases, bordée de forêt, avec une mare ───────────────────
const TAILLE = 12;
const terrain: Terrain[] = [];
for (let y = 0; y < TAILLE; y++) {
  for (let x = 0; x < TAILLE; x++) {
    const d = Math.hypot(x + 0.5 - TAILLE / 2, y + 0.5 - TAILLE / 2);
    const r = hasard();
    let t: Terrain = 'herbe';
    if (d > 5.6 + r * 0.5) t = 'vide';
    else if (d > 4.3 + r * 0.8) t = r < 0.8 ? 'foret' : 'buisson';
    else if (Math.hypot(x - 3, y - 7.5) < 1.3) t = 'eau';
    else if (r < 0.05) t = 'rocher';
    else if (r < 0.1) t = 'buisson';
    terrain.push(t);
  }
}
const ile: Ile = { biome: 'foret', largeur: TAILLE, profondeur: TAILLE, terrain, arbreMere: { x: 5, y: 5 }, tailleArbreMere: 2 };
const occupees = new Set(['5,5', '6,5', '5,6', '6,6']);

const batiments: Batiment[] = [];
function poser(type: Batiment['type'], x: number, y: number, chantier: number | null = null): Batiment {
  terrain[y * TAILLE + x] = 'herbe';
  occupees.add(`${x},${y}`);
  const b: Batiment = { id: batiments.length + 1, type, case: { x, y }, orientation: 0, niveau: 1, chantier, bonusVoisinage: 1 };
  batiments.push(b);
  return b;
}
poser('hutte', 3, 4);
poser('hutte', 7, 3);
poser('feuDeCamp', 5, 8);
poser('cueillette', 8, 7);
poser('remise', 8, 5);
poser('tapisDeMousse', 4, 6);
const chantier = poser('atelier', 7, 8, 0);

const libres: Position[] = [];
terrain.forEach((t, i) => {
  const x = i % TAILLE;
  const y = Math.floor(i / TAILLE);
  if (t === 'herbe' && !occupees.has(`${x},${y}`)) libres.push({ x: x + 0.5, y: y + 0.5 });
});

// ─── Habitants qui se promènent ──────────────────────────────────────────────
interface Promeneur {
  habitant: Habitant;
  but: Position;
  pause: number;
}
const VITESSE = 1.2 * (PAS_DE_SIMULATION_MS / 1000);
const promeneurs: Promeneur[] = Array.from({ length: 5 }, (_, i) => {
  const depart = libres[Math.floor(hasard() * libres.length)]!;
  return {
    habitant: {
      id: i + 1,
      position: { ...depart },
      direction: 0,
      activite: 'attend',
      tache: 'recolter',
      epingle: null,
      bienEtre: 0.7,
      chapeau: i,
    },
    but: depart,
    pause: 0,
  };
});

function avancerPromeneur(p: Promeneur): void {
  const h = p.habitant;
  if (p.pause > 0) {
    p.pause--;
    if (p.pause === 0) p.but = libres[Math.floor(hasard() * libres.length)]!;
    return;
  }
  const dx = p.but.x - h.position.x;
  const dy = p.but.y - h.position.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= VITESSE) {
    h.position = { ...p.but };
    const activites: Activite[] = ['recolte', 'construit', 'attend'];
    h.activite = activites[Math.floor(hasard() * activites.length)]!;
    p.pause = 8 + Math.floor(hasard() * 16);
    return;
  }
  h.activite = hasard() < 0.3 ? 'porte' : 'marche';
  h.direction = Math.atan2(dy, dx);
  h.position = { x: h.position.x + (dx / distance) * VITESSE, y: h.position.y + (dy / distance) * VITESSE };
}

// ─── Instantanés ─────────────────────────────────────────────────────────────
let pas = 0;
const PAS_PAR_JOUR = 480;
const PAS_PAR_SAISON = (30 * 60 * 1000) / PAS_DE_SIMULATION_MS;

function instantane(): Instantane {
  const stocks = Object.fromEntries(
    RESSOURCES.map((r) => [r, { quantite: (pas * 0.3) % 100, plafond: 100, productionParMinute: 72 }]),
  ) as Record<Ressource, Stock>;
  return {
    temps: {
      pas,
      annee: 1,
      saison: 'printemps',
      avancementSaison: (pas % PAS_PAR_SAISON) / PAS_PAR_SAISON,
      heure: (pas % PAS_PAR_JOUR) / PAS_PAR_JOUR,
      meteo: 'soleil',
      enPause: false,
    },
    stocks,
    batiments: batiments.map((b) => ({ ...b })),
    habitants: promeneurs.map((p) => ({ ...p.habitant })),
    priorites: { recolter: 0.5, construire: 0.5, stocker: 0.5, soignerArbre: 0.5 },
    arbreMere: { stade: 'arbuste', avancement: 0.4, mycelium: 0.3, floraisonPossible: false },
    visiteurs: [],
    bonus: [],
    batimentsDebloques: ['hutte', 'cueillette', 'tasDeBois', 'tapisDeMousse'],
    ameliorations: { vitesse: 0, outils: 0 },
    reglages: { langue: 'fr', sonActive: false, volume: 0.5, opacite: 1, toujoursAuDessus: true, lancementAuDemarrage: false },
  };
}

function avancer(): void {
  pas++;
  promeneurs.forEach(avancerPromeneur);
  // Le chantier monte en 20 s, puis recommence.
  chantier.chantier = (pas % 80) / 80;
  portee.postMessage({ type: 'instantane', instantane: instantane(), evenements: [] });
}

portee.onmessage = ({ data }) => {
  if (data.type === 'demarrer') {
    portee.postMessage({ type: 'ile', ile });
    portee.postMessage({ type: 'instantane', instantane: instantane(), evenements: [] });
    setInterval(avancer, PAS_DE_SIMULATION_MS);
  }
};
