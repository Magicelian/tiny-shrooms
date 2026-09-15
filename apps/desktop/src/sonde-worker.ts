// Sonde de l'étape 0 : vérifie que les timers du Worker avancent quand la fenêtre est cachée.
import { PAS_DE_SIMULATION_MS, pasEcoules } from '@tiny-shrooms/engine';

export interface Bilan {
  dureeMs: number;
  ticks: number;
  attendus: number;
  pireEcartMs: number;
}

const portee = globalThis as unknown as {
  postMessage(bilan: Bilan): void;
  onmessage: ((message: MessageEvent<'marquer' | 'bilan'>) => void) | null;
};

let ticks = 0;
let dernierTick = Date.now();
let repere = { ticks: 0, instant: Date.now(), pireEcartMs: 0 };

setInterval(() => {
  const maintenant = Date.now();
  repere.pireEcartMs = Math.max(repere.pireEcartMs, maintenant - dernierTick);
  dernierTick = maintenant;
  ticks++;
}, PAS_DE_SIMULATION_MS);

portee.onmessage = (message) => {
  const maintenant = Date.now();
  if (message.data === 'marquer') {
    repere = { ticks, instant: maintenant, pireEcartMs: 0 };
    return;
  }
  portee.postMessage({
    dureeMs: maintenant - repere.instant,
    ticks: ticks - repere.ticks,
    attendus: pasEcoules(repere.instant, maintenant),
    pireEcartMs: repere.pireEcartMs,
  });
};
