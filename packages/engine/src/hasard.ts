/** Générateur pseudo-aléatoire déterministe (mulberry32), valeurs dans [0, 1). */
export function creerHasard(graine: number): () => number {
  let etat = graine | 0;
  return () => {
    etat = (etat + 0x6d2b79f5) | 0;
    let t = Math.imul(etat ^ (etat >>> 15), 1 | etat);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
