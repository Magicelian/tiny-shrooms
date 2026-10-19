import { it } from 'vitest';
import { DUREE_MAX_MS, prairiePuisGrotte } from './prairie-grotte';

it('graine 3 : la prairie, riche en baies, puis la grotte, riche en spores', () => prairiePuisGrotte(3), DUREE_MAX_MS);
