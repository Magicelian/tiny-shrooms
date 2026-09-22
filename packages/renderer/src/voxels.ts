// Modèles en voxels décrits en code : on remplit une grille avec des primitives (boîtes, cylindres,
// dômes), puis on en tire un maillage dont seules les faces visibles restent.
// Un groupe par couleur, chacun avec le matériau partagé de sa couleur : l'ambiance teinte ainsi
// feuillage et herbe comme le reste du décor. L'attribut `color` ne sert qu'à nuancer (multiplicateur).
import * as THREE from 'three';
import { materiau } from './palette';

/** Voxels par unité de case, pour les bâtiments et le décor. */
export const RESOLUTION = 12;

type Couleur = number;

/** Grille creuse : clé `x,y,z` → couleur. Les coordonnées sont en voxels, y vers le haut, centrées en x et z. */
export class Voxels {
  private readonly cases = new Map<string, Couleur>();

  constructor(readonly resolution = RESOLUTION) {}

  poser(x: number, y: number, z: number, couleur: Couleur): this {
    this.cases.set(`${x},${y},${z}`, couleur);
    return this;
  }

  retirer(x: number, y: number, z: number): this {
    this.cases.delete(`${x},${y},${z}`);
    return this;
  }

  lire(x: number, y: number, z: number): Couleur | undefined {
    return this.cases.get(`${x},${y},${z}`);
  }

  /** Boîte pleine, bornes incluses. `couleur` null creuse. */
  boite(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, couleur: Couleur | null): this {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
          if (couleur === null) this.retirer(x, y, z);
          else this.poser(x, y, z, couleur);
        }
    return this;
  }

  /** Cylindre vertical centré en (cx, cz), rayon qui passe de `r0` en bas à `r1` en haut. */
  cylindre(cx: number, cz: number, y0: number, y1: number, r0: number, couleur: Couleur | null, r1 = r0): this {
    for (let y = y0; y <= y1; y++) {
      const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      this.disque(cx, y, cz, r0 + (r1 - r0) * t, couleur);
    }
    return this;
  }

  /** Disque horizontal ; les centres demi-entiers donnent des formes paires. */
  disque(cx: number, y: number, cz: number, r: number, couleur: Couleur | null): this {
    const borne = Math.ceil(r + 1);
    for (let x = Math.floor(cx - borne); x <= Math.ceil(cx + borne); x++)
      for (let z = Math.floor(cz - borne); z <= Math.ceil(cz + borne); z++) {
        const dx = x - cx;
        const dz = z - cz;
        if (dx * dx + dz * dz > r * r + 0.3) continue;
        if (couleur === null) this.retirer(x, y, z);
        else this.poser(x, y, z, couleur);
      }
    return this;
  }

  /** Demi-ellipsoïde posée sur `y0` : chapeau de champignon, buisson, feuillage. */
  dome(cx: number, cz: number, y0: number, rayon: number, hauteur: number, couleur: Couleur): this {
    for (let y = 0; y <= hauteur; y++) {
      const h = (y + 0.5) / (hauteur + 1);
      this.disque(cx, y0 + y, cz, rayon * Math.sqrt(Math.max(0, 1 - h * h)), couleur);
    }
    return this;
  }

  /** Ellipsoïde complète. */
  boule(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, couleur: Couleur): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
          if (d <= 1.05) this.poser(x, y, z, couleur);
        }
    return this;
  }

  /** Recolore les voxels existants qui passent le filtre (taches, rayures…). */
  peindre(filtre: (x: number, y: number, z: number, couleur: Couleur) => boolean, couleur: Couleur): this {
    for (const [cle, c] of this.cases) {
      const [x, y, z] = cle.split(',').map(Number) as [number, number, number];
      if (filtre(x, y, z, c)) this.cases.set(cle, couleur);
    }
    return this;
  }

  /** Recopie une autre grille décalée. */
  fusionner(autre: Voxels, dx = 0, dy = 0, dz = 0): this {
    for (const [cle, c] of autre.cases) {
      const [x, y, z] = cle.split(',').map(Number) as [number, number, number];
      this.poser(x + dx, y + dy, z + dz, c);
    }
    return this;
  }

  get hauteur(): number {
    let max = -Infinity;
    for (const cle of this.cases.keys()) max = Math.max(max, Number(cle.split(',')[1]) + 1);
    return max === -Infinity ? 0 : max / this.resolution;
  }

  /** `neige` : faux pour ce qui ne doit jamais blanchir l'hiver (habitants, flammes). */
  modele(neige = true): Modele {
    return construireModele(this, neige);
  }

  /** Parcours brut, pour la construction du maillage. */
  *entrees(): Generator<[number, number, number, Couleur]> {
    for (const [cle, c] of this.cases) {
      const [x, y, z] = cle.split(',').map(Number) as [number, number, number];
      yield [x, y, z, c];
    }
  }
}

/** Maillage prêt à poser, et de quoi le montrer couche par couche pendant un chantier. */
export interface Modele {
  geometrie: THREE.BufferGeometry;
  materiaux: THREE.Material[];
  /** Hauteur en unités de case. */
  hauteur: number;
  /** Pour chaque groupe : nombre d'indices à dessiner pour montrer les couches `0..k` (indice k). */
  couches: number[][];
}

const FACES: { normale: [number, number, number]; coins: [number, number, number][]; nuance: number }[] = [
  { normale: [1, 0, 0], coins: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], nuance: 0.9 },
  { normale: [-1, 0, 0], coins: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], nuance: 0.9 },
  { normale: [0, 1, 0], coins: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], nuance: 1 },
  { normale: [0, -1, 0], coins: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], nuance: 0.8 },
  { normale: [0, 0, 1], coins: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], nuance: 0.95 },
  { normale: [0, 0, -1], coins: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], nuance: 0.95 },
];

function construireModele(v: Voxels, neige: boolean): Modele {
  const taille = 1 / v.resolution;
  const positions: number[] = [];
  const normales: number[] = [];
  const nuances: number[] = [];
  const seuilsNeige: number[] = [];
  // Faces rangées par couleur puis par couche, pour les groupes et le chantier.
  const parCouleur = new Map<Couleur, { y: number; sommet: number }[]>();
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const [x, y, z, couleur] of v.entrees()) {
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
    // Léger grain par voxel, pour que les aplats ne soient pas plats.
    const grain = 0.94 + 0.06 * hachage(x, y, z);
    // Seuil de neige du voxel, entre 0,05 et 0,95 : la couche s'étend par taches, puis couvre tout.
    const seuil = neige ? 0.05 + 0.9 * hachage(z + 17, y * 3, x - 5) : 0;
    for (const face of FACES) {
      const [nx, ny, nz] = face.normale;
      if (v.lire(x + nx, y + ny, z + nz) !== undefined) continue;
      const sommet = positions.length / 3;
      for (const [cx, cy, cz] of face.coins) {
        positions.push((x + cx) * taille, (y + cy) * taille, (z + cz) * taille);
        normales.push(nx, ny, nz);
        const n = face.nuance * grain;
        nuances.push(n, n, n);
        seuilsNeige.push(ny === 1 ? seuil : 0);
      }
      let liste = parCouleur.get(couleur);
      if (!liste) parCouleur.set(couleur, (liste = []));
      liste.push({ y, sommet });
    }
  }
  const geometrie = new THREE.BufferGeometry();
  geometrie.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometrie.setAttribute('normal', new THREE.Float32BufferAttribute(normales, 3));
  geometrie.setAttribute('color', new THREE.Float32BufferAttribute(nuances, 3));
  geometrie.setAttribute('neige', new THREE.Float32BufferAttribute(seuilsNeige, 1));
  const indices: number[] = [];
  const materiaux: THREE.Material[] = [];
  const couches: number[][] = [];
  const nbCouches = yMax - yMin + 1;
  for (const [couleur, faces] of parCouleur) {
    faces.sort((a, b) => a.y - b.y);
    const debut = indices.length;
    const cumul = new Array<number>(nbCouches).fill(0);
    for (const { y, sommet: s } of faces) {
      indices.push(s, s + 1, s + 2, s, s + 2, s + 3);
      cumul[y - yMin] = indices.length - debut;
    }
    // Couches sans face de cette couleur : on reprend le total de la précédente.
    for (let k = 1; k < nbCouches; k++) cumul[k] = Math.max(cumul[k]!, cumul[k - 1]!);
    geometrie.addGroup(debut, indices.length - debut, materiaux.length);
    materiaux.push(materiau(couleur));
    couches.push(cumul);
  }
  geometrie.setIndex(indices);
  geometrie.computeBoundingBox();
  geometrie.computeBoundingSphere();
  return { geometrie, materiaux, hauteur: v.hauteur, couches };
}

/** Copie légère d'un modèle (attributs partagés) dont on peut régler les couches visibles. */
export function instancier(modele: Modele): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const source = modele.geometrie;
  for (const [nom, attribut] of Object.entries(source.attributes)) g.setAttribute(nom, attribut);
  g.setIndex(source.index);
  for (const groupe of source.groups) g.addGroup(groupe.start, groupe.count, groupe.materialIndex);
  g.boundingBox = source.boundingBox;
  g.boundingSphere = source.boundingSphere;
  return g;
}

/** Montre la part `avancement` (0 à 1) des couches, du sol vers le haut. */
export function montrerCouches(g: THREE.BufferGeometry, modele: Modele, avancement: number): void {
  modele.geometrie.groups.forEach((source, i) => {
    const cumul = modele.couches[i]!;
    const k = Math.min(cumul.length - 1, Math.floor(avancement * cumul.length));
    g.groups[i]!.count = avancement >= 1 ? source.count : cumul[k]!;
  });
}

/** Géométrie simple mise au format des matériaux partagés (nuance blanche). */
export function sansNuance<G extends THREE.BufferGeometry>(g: G): G {
  const n = g.attributes.position!.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
}

function hachage(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
