// Tous les modèles du jeu, en voxels. Repère : 12 voxels par case, x et z centrés sur -0,5
// (indices -6 à 5 pour une case), façade vers +z pour les bâtiments, regard vers +x pour les habitants.
import type { TypeBatiment } from '@tiny-shrooms/engine';
import { CHAPEAUX, COULEURS, COULEURS_BATIMENT } from './palette';
import { Voxels, type Modele } from './voxels';

const C = -0.5;

const TEINTES = {
  bois: 0x9c6b3f,
  boisClair: 0xc49262,
  boisFonce: 0x5e3b22,
  planche: 0xb07d4c,
  pierre: 0x9a9ea8,
  pierreFonce: 0x72767f,
  pied: 0xf2e6cf,
  lamelles: 0xd9c4a0,
  porte: 0x4e3020,
  fenetre: 0xffd36b,
  blanc: 0xfff8ea,
  baie: 0xd8335a,
  baieFoncee: 0x9c2244,
  orange: 0xf29a3a,
  jaune: 0xffd84a,
  rouille: 0x6b3a2a,
  metal: 0x4a4f5c,
  lilas: 0xe6d4ff,
  toile: 0xf5ecd6,
  mousseClaire: 0x6fc27a,
  fleur: 0xffe06b,
  suie: 0x3a302c,
} as const;

// ─── Morceaux réutilisés ───────────────────────────────────────────────────────

/** Taches claires sur un chapeau : on repeint les voxels de la couleur `fond` proches de points semés sur le dôme. */
function taches(v: Voxels, cx: number, cz: number, y0: number, rayon: number, hauteur: number, fond: number, couleur: number, nombre = 6, decalage = 0): void {
  const centres: [number, number, number][] = [];
  for (let i = 0; i < nombre; i++) {
    const a = decalage + i * 2.39996;
    const e = 0.25 + ((i * 0.37) % 0.55);
    centres.push([cx + rayon * Math.cos(e) * Math.cos(a), y0 + hauteur * Math.sin(e) * 1.05, cz + rayon * Math.cos(e) * Math.sin(a)]);
  }
  const taille = Math.max(0.9, rayon / 5);
  v.peindre((x, y, z, c) => c === fond && centres.some(([px, py, pz]) => (x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2 < taille * taille * 1.3), couleur);
}

/** Chapeau de champignon : dôme, lamelles dessous, taches. */
function chapeau(v: Voxels, cx: number, cz: number, y0: number, rayon: number, hauteur: number, couleur: number, tache: number | null, nombre = 6): void {
  v.dome(cx, cz, y0, rayon, hauteur, couleur);
  v.disque(cx, y0, cz, rayon - 1.2, TEINTES.lamelles);
  if (tache !== null) taches(v, cx, cz, y0, rayon, hauteur, couleur, tache, nombre);
}

/** Pied de champignon habitable, avec une porte en façade (+z) et des fenêtres. */
function pied(v: Voxels, cx: number, cz: number, y0: number, y1: number, rayon: number, fenetres: number[] = []): void {
  v.cylindre(cx, cz, y0, y1, rayon + 0.4, TEINTES.pied, rayon);
  // Base ombrée.
  v.peindre((_, y, __, c) => c === TEINTES.pied && y === y0, TEINTES.lamelles);
  const avant = Math.round(cz + rayon);
  const gauche = Math.floor(cx);
  v.boite(gauche, y0, avant - 1, gauche + 1, y0 + 2, avant + 1, null);
  v.boite(gauche, y0, avant - 1, gauche + 1, y0 + 2, avant - 1, TEINTES.porte);
  v.poser(gauche + 1, y0 + 1, avant - 1, TEINTES.fenetre);
  for (const y of fenetres) {
    v.poser(Math.round(cx + rayon), y, Math.floor(cz), TEINTES.fenetre);
    v.poser(Math.floor(cx - rayon), y, Math.floor(cz), TEINTES.fenetre);
  }
}

/** Bûche couchée le long de x, extrémités claires. */
function buche(v: Voxels, x0: number, x1: number, y: number, z: number, r: number, couleur: number = TEINTES.bois): void {
  for (let x = x0; x <= x1; x++) {
    const bout = x === x0 || x === x1;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
      for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) {
        if (dy * dy + dz * dz > r * r + 0.3) continue;
        v.poser(x, Math.round(y + dy), Math.round(z + dz), bout ? TEINTES.boisClair : couleur);
      }
  }
}

function poteau(v: Voxels, x: number, z: number, y0: number, y1: number, couleur: number = TEINTES.boisFonce): void {
  v.boite(x, y0, z, x, y1, z, couleur);
}

// ─── Bâtiments ─────────────────────────────────────────────────────────────────

function hutte(niveau: number): Voxels {
  const v = new Voxels();
  const rouge = COULEURS_BATIMENT.hutte;
  if (niveau <= 1) {
    pied(v, C, C, 0, 5, 2.8, [3]);
    chapeau(v, C, C, 6, 5.3, 4, rouge, TEINTES.blanc, 6);
  } else if (niveau === 2) {
    pied(v, C, C, 0, 8, 3.2, [3, 6]);
    chapeau(v, C, C, 9, 5.6, 4, rouge, TEINTES.blanc, 8);
    // Cheminée qui perce le chapeau.
    v.boite(2, 10, -3, 3, 14, -2, TEINTES.pierreFonce);
    v.boite(2, 15, -3, 3, 15, -2, TEINTES.suie);
    // Perron.
    v.boite(-3, 0, 3, 1, 0, 5, TEINTES.planche);
  } else {
    // Manoir : un grand pied et une tourelle accolée, reliés par un balcon.
    pied(v, -1.5, -1.5, 0, 10, 3.2, [3, 6, 9]);
    chapeau(v, -1.5, -1.5, 11, 4.9, 4, rouge, TEINTES.blanc, 7);
    pied(v, 2.5, 2.5, 0, 6, 1.8, [4]);
    chapeau(v, 2.5, 2.5, 7, 3, 3, rouge, TEINTES.blanc, 4);
    v.boite(0, 5, 0, 3, 5, 1, TEINTES.planche);
    v.boite(-6, 0, 4, -3, 0, 5, TEINTES.fenetre);
    v.boite(-6, 1, 4, -3, 1, 5, COULEURS.herbe);
  }
  return v;
}

function cueillette(): Voxels {
  const v = new Voxels();
  const rose = COULEURS_BATIMENT.cueillette;
  v.boite(-5, 0, -5, 4, 0, 4, TEINTES.planche);
  poteau(v, 0, 0, 1, 6);
  chapeau(v, C, C, 7, 4.2, 2, rose, TEINTES.blanc, 5);
  // Trois paniers de baies.
  for (const [x, z] of [[-3, 2], [2, 2], [-3, -3]] as const) {
    v.cylindre(x + 0.5, z + 0.5, 1, 2, 1.6, TEINTES.boisClair);
    v.disque(x + 0.5, 3, z + 0.5, 1.2, TEINTES.baie);
    v.poser(x, 3, z, TEINTES.baieFoncee);
    v.poser(x + 1, 4, z + 1, TEINTES.baie);
  }
  return v;
}

function tasDeBois(): Voxels {
  const v = new Voxels();
  v.boite(-5, 0, -4, 4, 0, 3, TEINTES.boisFonce);
  for (const [y, zs] of [[2, [-3, 0, 3]], [4.5, [-1.5, 1.5]], [7, [0]]] as const) {
    for (const z of zs) buche(v, -5, 4, y, z - 0.5, 1.4);
  }
  // Une hache plantée.
  poteau(v, 4, 4, 1, 4, TEINTES.boisClair);
  v.boite(4, 4, 3, 4, 5, 4, TEINTES.metal);
  return v;
}

function tapisDeMousse(): Voxels {
  const v = new Voxels();
  v.boite(-5, 0, -5, 4, 1, 4, TEINTES.boisFonce);
  v.boite(-4, 1, -4, 3, 1, 3, COULEURS_BATIMENT.tapisDeMousse);
  const touffes: [number, number][] = [[-3, -2], [0, 1], [2, -3], [-2, 2], [1, -1]];
  for (const [x, z] of touffes) {
    v.poser(x, 2, z, TEINTES.mousseClaire).poser(x + 1, 2, z, COULEURS_BATIMENT.tapisDeMousse);
  }
  v.poser(-1, 2, -3, TEINTES.fleur).poser(2, 2, 2, TEINTES.fleur);
  return v;
}

function gardeManger(): Voxels {
  const v = new Voxels();
  const jaune = COULEURS_BATIMENT.gardeManger;
  v.cylindre(C, C, 0, 6, 4, TEINTES.planche, 3.6);
  v.peindre((x, _, z, c) => c === TEINTES.planche && (x + z) % 3 === 0, TEINTES.bois);
  v.boite(-1, 0, 3, 0, 3, 3, TEINTES.porte);
  v.dome(C, C, 7, 5.3, 3, jaune);
  v.poser(-1, 11, -1, TEINTES.boisFonce);
  // Tonneau et sac devant.
  v.cylindre(3.5, 3.5, 0, 2, 1.2, TEINTES.bois);
  v.disque(3.5, 2, 3.5, 0.6, TEINTES.boisFonce);
  v.boule(-4, 1, 4, 1.4, 1.2, 1, TEINTES.toile);
  return v;
}

function remise(): Voxels {
  const v = new Voxels();
  const mur = COULEURS_BATIMENT.remise;
  v.boite(-5, 0, -4, 4, 6, 3, mur);
  v.peindre((x, _, z, c) => c === mur && (x % 2 === 0) && (z === 3 || z === -4), TEINTES.bois);
  // Toit à deux pans le long de x.
  for (let k = 0; k <= 4; k++) v.boite(-6, 7 + k, -5 + k, 5, 7 + k, 4 - k, k % 2 ? TEINTES.boisFonce : TEINTES.rouille);
  // Grande porte à croisillon.
  v.boite(-2, 0, 3, 1, 4, 3, TEINTES.porte);
  for (let i = 0; i < 4; i++) v.poser(-2 + i, i + 1, 3, TEINTES.boisClair);
  v.boite(4, 0, 4, 4, 1, 5, TEINTES.boisClair);
  return v;
}

function sechoir(): Voxels {
  const v = new Voxels();
  v.boite(-5, 0, -2, 4, 0, 1, TEINTES.toile);
  for (const x of [-5, 4]) {
    for (let y = 0; y <= 8; y++) {
      const e = y < 4 ? 1 : 0;
      v.poser(x, y, -1 - e, TEINTES.boisFonce).poser(x, y, 0 + e, TEINTES.boisFonce);
    }
  }
  v.boite(-5, 9, -1, 4, 9, 0, TEINTES.bois);
  // Guirlandes de baies qui sèchent.
  for (let x = -3; x <= 2; x += 2) {
    for (let y = 5; y <= 8; y++) v.poser(x, y, 0, y % 2 ? COULEURS_BATIMENT.sechoir : TEINTES.orange);
    v.poser(x, 4, 0, TEINTES.rouille);
  }
  // Cagette au sol.
  v.boite(-2, 1, -3, 1, 1, -2, TEINTES.boisClair);
  return v;
}

function feuDeCamp(): Voxels {
  const v = new Voxels();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = Math.round(C + Math.cos(a) * 3.8);
    const z = Math.round(C + Math.sin(a) * 3.8);
    v.boite(x, 0, z, x, i % 3 ? 0 : 1, z, i % 2 ? TEINTES.pierre : TEINTES.pierreFonce);
  }
  v.disque(C, 0, C, 2.5, TEINTES.suie);
  buche(v, -3, 2, 1, -1, 0.8);
  for (let i = -2; i <= 2; i++) v.poser(i, 2, i, TEINTES.boisFonce).poser(-i - 1, 2, i, TEINTES.bois);
  v.disque(C, 1, C, 1.2, TEINTES.orange);
  // Deux bûches pour s'asseoir.
  buche(v, -5, -2, 1, 5, 0.8);
  return v;
}

/** Flammes du feu de camp, animées à part. */
function flamme(): Voxels {
  const v = new Voxels();
  v.cylindre(C, C, 0, 1, 1.6, TEINTES.orange, 1.4);
  v.cylindre(C, C, 2, 4, 1.1, COULEURS_BATIMENT.feuDeCamp, 0.3);
  v.cylindre(C, C, 1, 3, 0.7, TEINTES.jaune, 0.2);
  v.poser(0, 5, -1, TEINTES.orange);
  return v;
}

function atelier(): Voxels {
  const v = new Voxels();
  const bleu = COULEURS_BATIMENT.atelier;
  pied(v, C, -1, 0, 8, 3.6, [3, 6]);
  chapeau(v, C, -1, 9, 5.8, 4, bleu, TEINTES.blanc, 6);
  // Engrenage sur le chapeau.
  v.disque(C, 14, -1, 1.6, TEINTES.metal);
  v.poser(-1, 15, -2, TEINTES.metal).poser(0, 15, -1, TEINTES.metal);
  // Établi et enclume devant.
  v.boite(-5, 0, 4, -3, 2, 5, TEINTES.boisClair);
  v.boite(2, 0, 4, 3, 1, 5, TEINTES.suie);
  v.boite(1, 2, 4, 4, 2, 5, TEINTES.metal);
  return v;
}

function puits(): Voxels {
  const v = new Voxels();
  v.cylindre(C, C, 0, 3, 3.6, TEINTES.pierre);
  v.peindre((x, y, z, c) => c === TEINTES.pierre && (x + y * 2 + z) % 4 === 0, TEINTES.pierreFonce);
  v.cylindre(C, C, 1, 3, 2.3, null);
  v.disque(C, 1, C, 2.3, COULEURS.eau);
  for (const x of [-5, 4]) poteau(v, x, -1, 0, 8);
  v.boite(-5, 7, -1, 4, 7, -1, TEINTES.bois);
  for (let k = 0; k <= 2; k++) v.boite(-6, 9 + k, -3 + k, 5, 9 + k, 1 - k, COULEURS_BATIMENT.puits);
  // Seau suspendu.
  v.poser(-1, 6, -1, TEINTES.boisFonce);
  v.boite(-1, 4, -1, 0, 5, 0, TEINTES.boisClair);
  return v;
}

function marche(): Voxels {
  const v = new Voxels();
  const jaune = COULEURS_BATIMENT.marche;
  v.boite(-6, 0, -5, 5, 0, 4, TEINTES.planche);
  for (const [x, z] of [[-5, -4], [4, -4], [-5, 3], [4, 3]] as const) poteau(v, x, z, 1, 7);
  // Auvent rayé en pente vers l'avant.
  for (let z = -5; z <= 4; z++) {
    const y = 9 - Math.floor((z + 5) / 4);
    v.boite(-6, y, z, 5, y, z, jaune);
  }
  v.peindre((x, y, _, c) => c === jaune && y >= 7 && (x + 6) % 4 < 2, TEINTES.blanc);
  // Comptoir garni.
  v.boite(-4, 1, 1, 3, 3, 2, TEINTES.bois);
  for (let x = -4; x <= 3; x++) v.poser(x, 4, 1, [TEINTES.baie, TEINTES.orange, TEINTES.mousseClaire, TEINTES.fleur][(x + 4) % 4]!);
  v.boite(-4, 1, -3, -2, 2, -1, TEINTES.boisClair);
  v.boite(1, 1, -3, 3, 3, -2, TEINTES.boisClair);
  return v;
}

function sanctuaire(): Voxels {
  const v = new Voxels();
  const lilas = COULEURS_BATIMENT.sanctuaire;
  v.boite(-6, 0, -6, 5, 0, 5, TEINTES.pierreFonce);
  v.boite(-5, 1, -5, 4, 1, 4, TEINTES.pierre);
  for (const [x, z] of [[-5, -5], [4, -5], [-5, 4], [4, 4]] as const) {
    v.boite(x, 2, z, x, 6, z, TEINTES.pierre);
    v.poser(x, 7, z, TEINTES.lilas);
  }
  v.cylindre(C, C, 2, 10, 2.4, TEINTES.pied, 1.8);
  chapeau(v, C, C, 11, 5.2, 5, lilas, TEINTES.lilas, 9);
  // Spores qui flottent.
  v.poser(-3, 17, 1, TEINTES.lilas).poser(2, 18, -2, TEINTES.lilas).poser(0, 18, 3, TEINTES.lilas);
  return v;
}

const CONSTRUCTEURS: Record<Exclude<TypeBatiment, 'hutte'>, () => Voxels> = {
  cueillette,
  tasDeBois,
  tapisDeMousse,
  gardeManger,
  remise,
  sechoir,
  feuDeCamp,
  atelier,
  puits,
  marche,
  sanctuaire,
};

const cacheBatiments = new Map<string, Modele>();

/** Modèle d'un bâtiment ; les logements changent de forme à chaque rang. */
export function modeleBatiment(type: TypeBatiment, niveau = 1): Modele {
  const cle = type === 'hutte' ? `hutte${niveau}` : type;
  let m = cacheBatiments.get(cle);
  if (!m) {
    m = (type === 'hutte' ? hutte(niveau) : CONSTRUCTEURS[type]()).modele();
    cacheBatiments.set(cle, m);
  }
  return m;
}

let cacheFlamme: Modele | null = null;
export function modeleFlamme(): Modele {
  return (cacheFlamme ??= flamme().modele());
}

// ─── Souche-dépôt ──────────────────────────────────────────────────────────────

/** Souche à la taille de son emprise (en cases), centrée. */
export function modeleSouche(tailleCases: number): Modele {
  const v = new Voxels();
  const r = tailleCases * 12 * 0.34;
  v.cylindre(C, C, 0, 8, r + 1.2, COULEURS.tronc, r);
  v.peindre((x, y, z, c) => c === COULEURS.tronc && (Math.round(Math.atan2(z - C, x - C) * 5) + y) % 5 === 0, TEINTES.boisFonce);
  v.disque(C, 8, C, r - 0.8, COULEURS.cerne);
  for (const rayon of [r * 0.3, r * 0.62]) {
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      v.poser(Math.round(C + Math.cos(t) * rayon), 8, Math.round(C + Math.sin(t) * rayon), TEINTES.bois);
    }
  }
  // Racines.
  for (let i = 0; i < 5; i++) {
    const t = i * 1.33 + 0.4;
    for (let d = r; d < r + 4; d++) {
      const h = Math.max(0, Math.round((r + 3 - d) * 0.8));
      const x = Math.round(C + Math.cos(t) * d);
      const z = Math.round(C + Math.sin(t) * d);
      v.boite(x, 0, z, x, h, z, COULEURS.tronc);
    }
  }
  // Deux champignons sur le flanc, pour signaler le dépôt.
  const a = 0.8;
  const x0 = C + Math.cos(a) * (r + 1.5);
  const z0 = C + Math.sin(a) * (r + 1.5);
  v.cylindre(x0, z0, 0, 2, 0.7, TEINTES.pied);
  chapeau(v, x0, z0, 3, 1.8, 1, CHAPEAUX[0], TEINTES.blanc, 3);
  v.cylindre(x0 + 2.5, z0 - 1.5, 0, 1, 0.5, TEINTES.pied);
  v.dome(x0 + 2.5, z0 - 1.5, 2, 1.3, 1, CHAPEAUX[1]);
  return v.modele();
}

// ─── Décor et éléments ─────────────────────────────────────────────────────────

let cacheDecor: Record<'arbre' | 'buisson' | 'caillou', Modele> | null = null;

/** Arbre, buisson sauvage et rocher, posés en instances sur le terrain. */
export function modelesDecor(): Record<'arbre' | 'buisson' | 'caillou', Modele> {
  if (cacheDecor) return cacheDecor;
  const arbre = new Voxels();
  arbre.boite(-1, 0, -1, 0, 4, 0, COULEURS.tronc);
  for (const [y0, r0] of [[3, 5.2], [7, 4], [10, 2.8]] as const) {
    arbre.cylindre(C, C, y0, y0 + 4, r0, COULEURS.feuillage, 0.8);
  }
  arbre.poser(-1, 15, -1, COULEURS.feuillage);
  const buisson = new Voxels();
  buisson.boule(C, 2.5, C, 4.5, 3.2, 4.2, COULEURS.buisson);
  buisson.boule(2, 3.5, 1, 2.5, 2.2, 2.5, COULEURS.buisson);
  buisson.boite(-6, 0, -6, 5, -1, 5, null);
  const caillou = new Voxels();
  caillou.boule(C, 1.5, C, 4.5, 3.5, 4, COULEURS.caillou);
  caillou.boule(2.5, 1, 2, 2.5, 2, 2.5, COULEURS.caillou);
  caillou.peindre((x, y, z) => y <= 0 || (x * 3 + z * 5 + y) % 7 === 0, COULEURS.roche);
  caillou.boite(-7, -1, -7, 6, -1, 6, null);
  cacheDecor = { arbre: arbre.modele(), buisson: buisson.modele(), caillou: caillou.modele() };
  return cacheDecor;
}

let cacheElements: Record<'baies' | 'bois' | 'mousse', Modele> | null = null;

/** Éléments récoltables : grappe de baies (posée sur le buisson), bois mort, mousse. */
export function modelesElements(): Record<'baies' | 'bois' | 'mousse', Modele> {
  if (cacheElements) return cacheElements;
  const baies = new Voxels();
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26;
    const x = Math.round(C + Math.cos(a) * 3.6);
    const z = Math.round(C + Math.sin(a) * 3.4);
    const y = 3 + (i % 2) * 2;
    baies.boite(x, y, z, x + 1, y + 1, z, TEINTES.baie);
    baies.poser(x, y + 1, z, TEINTES.blanc);
  }
  const bois = new Voxels();
  buche(bois, -4, 3, 1, -1, 1, TEINTES.boisFonce);
  buche(bois, -2, 4, 2.6, 1, 0.9, 0x8a6440);
  bois.poser(0, 4, 1, TEINTES.boisFonce).poser(0, 5, 1, COULEURS.herbe);
  const mousse = new Voxels();
  mousse.disque(C, 0, C, 4.2, 0x3e9a5e);
  mousse.dome(1, -1, 1, 1.8, 1, TEINTES.mousseClaire);
  mousse.dome(-2, 1, 1, 1.5, 1, 0x3e9a5e);
  mousse.poser(-3, 1, -2, TEINTES.fleur);
  cacheElements = { baies: baies.modele(), bois: bois.modele(), mousse: mousse.modele() };
  return cacheElements;
}

// ─── Habitants ─────────────────────────────────────────────────────────────────

/** Voxels par unité pour les habitants, plus fins que les bâtiments. */
const RESOLUTION_HABITANT = 24;

export interface ModelesHabitant {
  corps: Modele;
  pied: Modele;
  chapeaux: Modele[];
  /** Petit ballot tenu au-dessus de la tête pendant un transport. */
  ballot: Modele;
}

let cacheHabitant: ModelesHabitant | null = null;

/** Pied à yeux (regard vers +x), pieds séparés pour la marche, chapeau par couleur. */
export function modelesHabitant(): ModelesHabitant {
  if (cacheHabitant) return cacheHabitant;
  const corps = new Voxels(RESOLUTION_HABITANT);
  corps.cylindre(0, 0, 1, 6, 2.3, TEINTES.pied, 2);
  corps.poser(2, 4, -1, TEINTES.suie).poser(2, 4, 1, TEINTES.suie);
  corps.poser(2, 3, -2, 0xf2a0a0).poser(2, 3, 2, 0xf2a0a0);
  const piedV = new Voxels(RESOLUTION_HABITANT);
  piedV.boite(-1, 0, 0, 1, 0, 0, TEINTES.lamelles);
  const chapeaux = CHAPEAUX.map((couleur) => {
    const v = new Voxels(RESOLUTION_HABITANT);
    const tache = couleur === CHAPEAUX[4] ? CHAPEAUX[0] : TEINTES.blanc;
    chapeau(v, 0, 0, 7, 4.3, 3, couleur, tache, 3);
    return v.modele();
  });
  const ballot = new Voxels(RESOLUTION_HABITANT);
  ballot.boule(0, 13, 0, 2.2, 1.6, 2.2, TEINTES.toile);
  ballot.poser(0, 15, 0, TEINTES.rouille);
  cacheHabitant = { corps: corps.modele(), pied: piedV.modele(), chapeaux, ballot: ballot.modele() };
  return cacheHabitant;
}
