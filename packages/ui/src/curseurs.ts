// Curseurs pixel cerclés de noir, dessinés au démarrage et exposés en variables CSS (`--curseur-…`).
// Le navigateur ne les applique que dans la fenêtre : dehors, le curseur du système reprend la main.

export type Curseur = 'fleche' | 'main' | 'marteau' | 'poing';

/** Un pixel du dessin vaut deux pixels CSS, comme le rendu de l'îlot. */
const ECHELLE = 2;

const TEINTES: Record<string, string> = { '#': '#1b1320', o: '#fff8e8', g: '#9aa3b5', b: '#9c6b3f' };

const DESSINS: Record<Curseur, { lignes: string[]; pointe: [number, number] }> = {
  fleche: {
    pointe: [0, 0],
    lignes: [
      '#........',
      '##.......',
      '#o#......',
      '#oo#.....',
      '#ooo#....',
      '#oooo#...',
      '#ooooo#..',
      '#oooooo#.',
      '#ooooooo#',
      '#ooo#####',
      '#oo#.....',
      '#o#......',
      '##.......',
    ],
  },
  main: {
    pointe: [2, 0],
    lignes: [
      '..##.......',
      '.#oo#......',
      '.#oo#......',
      '.#oo###....',
      '.#oo#oo###.',
      '##oo#oo#oo#',
      '#o#ooooooo#',
      '#ooooooooo#',
      '.#ooooooo#.',
      '..#oooooo#.',
      '...######..',
    ],
  },
  poing: {
    pointe: [6, 4],
    lignes: [
      '...##.##.##.',
      '..#oo#oo#oo#',
      '.##oo#oo#oo#',
      '#o#oooooooo#',
      '#oooooooooo#',
      '.#ooooooooo#',
      '..#oooooooo#',
      '...#oooooo#.',
      '....######..',
    ],
  },
  marteau: {
    pointe: [3, 3],
    lignes: [
      '...##........',
      '..#gg#.......',
      '.#gggg#......',
      '#gggg#.......',
      '#gggbb#......',
      '.#g##bb#.....',
      '..#..#bb#....',
      '......#bb#...',
      '.......#bb#..',
      '........#bb#.',
      '.........#bb#',
      '..........##.',
    ],
  },
};

/** Dessine les curseurs et les déclare sur `racine` ; `nettete` = pixels physiques par pixel CSS. */
export function installerCurseurs(racine: HTMLElement, nettete = window.devicePixelRatio): void {
  const densite = Math.max(1, Math.round(nettete));
  // `image-set` garde les pixels nets sur un écran Retina ; sinon, image à la taille CSS.
  const imageSet = densite > 1 && CSS.supports('cursor', `image-set(url("x.png") ${densite}x) 0 0, auto`);
  for (const [nom, { lignes, pointe }] of Object.entries(DESSINS)) {
    const facteur = ECHELLE * (imageSet ? densite : 1);
    const toile = document.createElement('canvas');
    toile.width = lignes[0]!.length * facteur;
    toile.height = lignes.length * facteur;
    const ctx = toile.getContext('2d')!;
    lignes.forEach((ligne, y) =>
      [...ligne].forEach((p, x) => {
        if (!TEINTES[p]) return;
        ctx.fillStyle = TEINTES[p];
        ctx.fillRect(x * facteur, y * facteur, facteur, facteur);
      }),
    );
    const url = `url("${toile.toDataURL('image/png')}")`;
    const image = imageSet ? `image-set(${url} ${densite}x)` : url;
    const [px, py] = [pointe[0] * ECHELLE, pointe[1] * ECHELLE];
    racine.style.setProperty(`--curseur-${nom}`, `${image} ${px} ${py}, ${nom === 'poing' ? 'grabbing' : 'default'}`);
  }
}
