// Horloge réelle : chaque battement rattrape tous les pas écoulés, quel que soit l'écart
// (macOS gèle le Worker fenêtre cachée). Seule une veille signalée met le temps en pause, ou,
// faute de signal (Windows), un écart supérieur à `ecartMaxMs`.
import { PAS_DE_SIMULATION_MS, pasEcoules } from './temps';

export class Horloge {
  private repere: number;
  private enVeille = false;
  ecartMaxMs: number | undefined;

  constructor(maintenantMs: number) {
    this.repere = maintenantMs;
  }

  get enPause(): boolean {
    return this.enVeille;
  }

  /** Nombre de pas à simuler maintenant ; le reste de l'écart est conservé pour le suivant. */
  pasARattraper(maintenantMs: number): number {
    if (this.enVeille) return 0;
    if (this.ecartMaxMs !== undefined && maintenantMs - this.repere > this.ecartMaxMs) this.repere = maintenantMs;
    const pas = pasEcoules(this.repere, maintenantMs);
    this.repere += pas * PAS_DE_SIMULATION_MS;
    // Horloge revenue en arrière : on repart d'ici plutôt que d'attendre qu'elle revienne.
    if (maintenantMs < this.repere - PAS_DE_SIMULATION_MS) this.repere = maintenantMs;
    return pas;
  }

  veille(maintenantMs: number): number {
    const pas = this.pasARattraper(maintenantMs);
    this.enVeille = true;
    return pas;
  }

  /** Le temps passé en veille n'est jamais rattrapé. */
  reveil(maintenantMs: number): void {
    this.enVeille = false;
    this.repere = maintenantMs;
  }
}
