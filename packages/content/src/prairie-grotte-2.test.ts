import { it } from 'vitest';
import { DUREE_MAX_MS, prairiePuisGrotte } from './prairie-grotte';

it('graine 2 : la prairie, riche en baies, puis la grotte, riche en spores', () => prairiePuisGrotte(2), DUREE_MAX_MS);
