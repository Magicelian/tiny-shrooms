/** Durée d'un pas de simulation, en millisecondes. */
export const PAS_DE_SIMULATION_MS = 250;

/** Nombre de pas entiers écoulés entre deux instants exprimés en millisecondes. */
export function pasEcoules(debutMs: number, maintenantMs: number, pasMs = PAS_DE_SIMULATION_MS): number {
  return Math.max(0, Math.floor((maintenantMs - debutMs) / pasMs));
}

export type * from './contrat';
export { AMELIORATIONS_VILLAGE, RESSOURCES, SAISONS, STADES_ARBRE, TACHES, TYPES_BATIMENT } from './contrat';
