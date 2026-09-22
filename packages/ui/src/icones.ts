// Petites icônes pixel (9 × 9) dessinées depuis des motifs texte, converties une fois en images.
import type { Ressource } from '@tiny-shrooms/engine';

export type Icone = Ressource | 'graine' | 'cadenas' | 'habitant' | 'coche' | 'croix' | 'amelioration' | 'contents' | 'mitiges' | 'tristes' | 'faim';

/** `.` transparent, `#` encre ; les autres lettres renvoient à la palette de l'icône. */
const MOTIFS: Record<Icone, { motif: string[]; palette: Record<string, string> }> = {
  baies: {
    motif: [
      '....##...',
      '...#g#...',
      '.###g###.',
      '#rr##rr#.',
      '#rwr#rwr#',
      '#rrr#rrr#',
      '.###.###.',
      '..#rr#...',
      '...##....',
    ],
    palette: { r: '#d8335a', w: '#ffd6e0', g: '#5fae6e' },
  },
  baiesSechees: {
    motif: [
      '.........',
      '..##.##..',
      '.#rr#rr#.',
      '#rwrrrwr#',
      '#rrr#rrr#',
      '.#rr#rr#.',
      '..##.##..',
      '.........',
      '.........',
    ],
    palette: { r: '#8e3a5c', w: '#c47a98' },
  },
  boisMort: {
    motif: [
      '.........',
      '.#######.',
      '#bbbbbbc#',
      '#dbbdbbc#',
      '.#######.',
      '#bbbbbbc#',
      '#bdbbbdc#',
      '.#######.',
      '.........',
    ],
    palette: { b: '#9c6b3f', d: '#6b4226', c: '#e0b27a' },
  },
  mousse: {
    motif: [
      '.........',
      '...###...',
      '..#lvl#..',
      '.#vvvlv#.',
      '#vlvvvvv#',
      '#vvvlvlv#',
      '#########',
      '.........',
      '.........',
    ],
    palette: { v: '#5fae6e', l: '#9ee08a' },
  },
  spores: {
    motif: [
      '....#....',
      '...#j#...',
      '.#.#j#.#.',
      '#j#.#.#j#',
      '.#..#..#.',
      '...#j#...',
      '.#.#j#.#.',
      '#j#.#.#j#',
      '.#.....#.',
    ],
    palette: { j: '#e8d56a' },
  },
  graine: {
    motif: [
      '....#....',
      '...#v#...',
      '..#bvb#..',
      '.#bbbbb#.',
      '.#bbwbb#.',
      '.#bbbbb#.',
      '..#bbb#..',
      '...###...',
      '.........',
    ],
    palette: { b: '#b58fd6', w: '#efe4ff', v: '#6fc25a' },
  },
  // Humeur moyenne des habitants : visage vert, jaune ou rouge.
  contents: {
    motif: ['..#####..', '.#vvvvv#.', '#vv#v#vv#', '#vvvvvvv#', '#v#vvv#v#', '#vv###vv#', '.#vvvvv#.', '..#####..', '.........'],
    palette: { v: '#6fc25a' },
  },
  mitiges: {
    motif: ['..#####..', '.#jjjjj#.', '#jj#j#jj#', '#jjjjjjj#', '#jjjjjjj#', '#jj###jj#', '.#jjjjj#.', '..#####..', '.........'],
    palette: { j: '#f2b53a' },
  },
  tristes: {
    motif: ['..#####..', '.#rrrrr#.', '#rr#r#rr#', '#rrrrrrr#', '#rr###rr#', '#r#rrr#r#', '.#rrrrr#.', '..#####..', '.........'],
    palette: { r: '#e0503f' },
  },
  // Bol vide : plus rien à manger.
  faim: {
    motif: ['.........', '.........', '.........', '#########', '#bbbbbbb#', '.#bbbbb#.', '..#bbb#..', '...###...', '.........'],
    palette: { b: '#c98a4a' },
  },
  cadenas: {
    motif: [
      '...###...',
      '..#...#..',
      '..#...#..',
      '.#######.',
      '.#jjjjj#.',
      '.#jj#jj#.',
      '.#jj#jj#.',
      '.#######.',
      '.........',
    ],
    palette: { j: '#c9a24a' },
  },
  habitant: {
    motif: [
      '..#####..',
      '.#rrwrr#.',
      '#rwrrrwr#',
      '#########',
      '..#ppp#..',
      '..#p#p#..',
      '..#ppp#..',
      '...###...',
      '.........',
    ],
    palette: { r: '#d8423a', w: '#fff8ea', p: '#f2e6cf' },
  },
  coche: {
    motif: [
      '.........',
      '.......#.',
      '......#v#',
      '.#...#v#.',
      '#v#.#v#..',
      '.#v#v#...',
      '..#v#....',
      '...#.....',
      '.........',
    ],
    palette: { v: '#6fc25a' },
  },
  // Flèche dorée au-dessus des bâtiments qu'on peut améliorer (9 × 10).
  amelioration: {
    motif: [
      '....#....',
      '...#w#...',
      '..#wyy#..',
      '.#wyyyo#.',
      '#wyyyyyo#',
      '###wyo###',
      '..#wyo#..',
      '..#wyo#..',
      '..#yoo#..',
      '..#####..',
    ],
    palette: { w: '#ffe9a8', y: '#f2b53a', o: '#c9822a' },
  },
  croix: {
    motif: [
      '.........',
      '.#.....#.',
      '#r#...#r#',
      '.#r#.#r#.',
      '..#r#r#..',
      '.#r#.#r#.',
      '#r#...#r#',
      '.#.....#.',
      '.........',
    ],
    palette: { r: '#e0503f' },
  },
};

const cache = new Map<Icone, string>();

export function icone(nom: Icone): string {
  const deja = cache.get(nom);
  if (deja !== undefined) return deja;
  const { motif, palette } = MOTIFS[nom];
  const toile = document.createElement('canvas');
  toile.width = motif[0]!.length;
  toile.height = motif.length;
  const ctx = toile.getContext('2d');
  if (!ctx) return '';
  motif.forEach((ligne, y) =>
    [...ligne].forEach((p, x) => {
      if (p === '.') return;
      ctx.fillStyle = p === '#' ? '#1b1320' : (palette[p] ?? '#ff00ff');
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  const url = toile.toDataURL();
  cache.set(nom, url);
  return url;
}
