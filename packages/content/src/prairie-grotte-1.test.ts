import { it } from 'vitest';
import { DUREE_MAX_MS, prairiePuisGrotte } from './prairie-grotte';

it('graine 1 : la prairie, riche en baies, puis la grotte, riche en spores', () => prairiePuisGrotte(1), DUREE_MAX_MS);
