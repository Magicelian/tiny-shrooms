import { it } from 'vitest';
import { DUREE_MAX_MS, ilesTroisACinq } from './iles-3-a-5';

it('graine 3 : la prairie, riche en baies, la grotte, riche en spores, puis la futaie, riche en bois', () => ilesTroisACinq(3), DUREE_MAX_MS);
