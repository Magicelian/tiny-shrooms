import { describe, expect, it } from 'vitest';
import { pasEcoules } from './index';

describe('pasEcoules', () => {
  it('compte les pas entiers écoulés', () => {
    expect(pasEcoules(0, 0)).toBe(0);
    expect(pasEcoules(0, 249)).toBe(0);
    expect(pasEcoules(0, 1000)).toBe(4);
  });

  it('ne recule jamais si l’horloge revient en arrière', () => {
    expect(pasEcoules(1000, 500)).toBe(0);
  });

  it('accepte un pas personnalisé', () => {
    expect(pasEcoules(0, 1000, 100)).toBe(10);
  });
});
