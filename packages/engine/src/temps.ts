/** Durée d'un pas de simulation, en millisecondes. */
export const PAS_DE_SIMULATION_MS = 250;

/** Nombre de pas de simulation par minute de jeu. */
export const PAS_PAR_MINUTE = 60_000 / PAS_DE_SIMULATION_MS;

/** Heure du jour entre 0 et 1 (0 = minuit) au pas donné. */
export function heureDuJour(pas: number, temps: { minutesParJour: number; heureDeDepart: number }): number {
  return (pas / PAS_PAR_MINUTE / temps.minutesParJour + temps.heureDeDepart) % 1;
}

/** Nombre de pas entiers écoulés entre deux instants exprimés en millisecondes. */
export function pasEcoules(debutMs: number, maintenantMs: number, pasMs = PAS_DE_SIMULATION_MS): number {
  return Math.max(0, Math.floor((maintenantMs - debutMs) / pasMs));
}
