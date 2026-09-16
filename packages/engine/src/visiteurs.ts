// Visiteurs du relais : arrivées tirées au sort, attente sans limite, réponses du joueur.
import type { BonusActif, Evenement, IdVisiteur, Quantites, RaisonRefus, Ressource, Visiteur } from './contrat';
import type { Contenu, Fourchette } from './contenu';
import type { Etat } from './etat';
import { creerHasard } from './hasard';
import { PAS_PAR_MINUTE } from './temps';

/** Places d'accueil offertes par les relais construits. */
export function capaciteAccueil(etat: Etat, contenu: Contenu): number {
  const relais = etat.batiments.filter((b) => b.type === 'relais' && b.chantier === null).length;
  return relais * contenu.visiteurs.capaciteParRelais;
}

/** Un pas : les bonus s'écoulent, et un visiteur arrive quand l'attente est finie et qu'il reste de la place. */
export function avancerVisiteurs(etat: Etat, contenu: Contenu, evenements: Evenement[]): void {
  for (const b of etat.bonus) b.pasRestants--;
  etat.bonus = etat.bonus.filter((b) => b.pasRestants > 0);

  if (etat.visiteurs.length >= capaciteAccueil(etat, contenu)) return;
  if (etat.pasAvantVisiteur > 0) {
    etat.pasAvantVisiteur--;
    return;
  }
  // Chaque visiteur a son propre tirage : la même graine donne les mêmes visiteurs, sans état à sauvegarder.
  const id = etat.prochainIdVisiteur++;
  const hasard = creerHasard(etat.graine ^ Math.imul(id, 0x85ebca6b));
  const visiteur = tirerVisiteur(etat, contenu, id, hasard);
  etat.visiteurs.push(visiteur);
  etat.pasAvantVisiteur = Math.round(entre(contenu.visiteurs.minutesEntreArrivees, hasard) * PAS_PAR_MINUTE);
  evenements.push({ type: 'visiteurArrive', visiteur: structuredClone(visiteur) });
}

function tirerVisiteur(etat: Etat, contenu: Contenu, id: IdVisiteur, hasard: () => number): Visiteur {
  const v = contenu.visiteurs;
  const base = { id, arriveAuPas: etat.pas };
  switch (choisirPondere(v.poids, hasard)) {
    case 'herisson': {
      const donnee = choisir(v.herisson.ressources, hasard);
      const demandee = choisir(v.herisson.ressources.filter((r) => r !== donnee), hasard);
      const prix = Math.max(1, Math.round(v.herisson.lot * entre(v.herisson.taux, hasard)));
      return { ...base, type: 'herisson', donne: { [donnee]: v.herisson.lot }, demande: { [demandee]: prix } };
    }
    case 'escargot': {
      const ressource = choisir(v.escargot.ressources, hasard);
      const quantite = Math.round(entre(v.escargot.quantite, hasard));
      const plans = v.escargot.plans.filter((p) => !etat.batimentsDebloques.includes(p));
      const plan = hasard() < v.escargot.chancePlan && plans.length > 0 ? choisir(plans, hasard) : null;
      const recompense = plan ? { plan } : { spores: Math.round(quantite * v.escargot.sporesParUnite) };
      return { ...base, type: 'escargot', demande: { [ressource]: quantite }, recompense };
    }
    case 'luciole': {
      const multiplicateur = Math.round(entre(v.luciole.multiplicateur, hasard) * 100) / 100;
      const dureePas = Math.round(entre(v.luciole.minutes, hasard) * PAS_PAR_MINUTE);
      return { ...base, type: 'luciole', multiplicateur, dureePas };
    }
  }
}

/** Accepter paie la demande et donne la récompense ; refuser renvoie le visiteur, sans rien coûter. */
export function repondreVisiteur(etat: Etat, id: IdVisiteur, accepte: boolean): RaisonRefus | null {
  const i = etat.visiteurs.findIndex((v) => v.id === id);
  if (i < 0) return 'introuvable';
  const visiteur = etat.visiteurs[i]!;
  if (accepte) {
    switch (visiteur.type) {
      case 'herisson':
        if (!payer(etat, visiteur.demande)) return 'ressourcesInsuffisantes';
        recevoir(etat, visiteur.donne);
        break;
      case 'escargot':
        if (!payer(etat, visiteur.demande)) return 'ressourcesInsuffisantes';
        if ('plan' in visiteur.recompense) {
          const { plan } = visiteur.recompense;
          if (!etat.batimentsDebloques.includes(plan)) etat.batimentsDebloques.push(plan);
        } else recevoir(etat, visiteur.recompense);
        break;
      case 'luciole':
        etat.bonus.push({ source: 'luciole', multiplicateur: visiteur.multiplicateur, pasRestants: visiteur.dureePas });
        break;
    }
  }
  etat.visiteurs.splice(i, 1);
  return null;
}

/** Multiplicateur de production dû aux bonus en cours ; ils se cumulent. */
export function multiplicateurBonus(bonus: readonly BonusActif[]): number {
  return bonus.reduce((m, b) => m * b.multiplicateur, 1);
}

/** Prélève un coût s'il est entièrement disponible. */
export function payer(etat: Etat, cout: Quantites): boolean {
  const ressources = cles(cout);
  if (ressources.some((r) => etat.stocks[r] < (cout[r] ?? 0))) return false;
  for (const r of ressources) etat.stocks[r] -= cout[r] ?? 0;
  return true;
}

/** Un cadeau n'est jamais perdu : il peut dépasser le plafond, qui bloque seulement la production. */
function recevoir(etat: Etat, quantites: Quantites): void {
  for (const r of cles(quantites)) etat.stocks[r] += quantites[r] ?? 0;
}

function cles(quantites: Quantites): Ressource[] {
  return (Object.keys(quantites) as Ressource[]).filter((r) => quantites[r] !== undefined);
}

function entre({ min, max }: Fourchette, hasard: () => number): number {
  return min + (max - min) * hasard();
}

function choisir<T>(liste: readonly T[], hasard: () => number): T {
  return liste[Math.floor(hasard() * liste.length)]!;
}

function choisirPondere<T extends string>(poids: Record<T, number>, hasard: () => number): T {
  const options = Object.keys(poids) as T[];
  let tirage = hasard() * options.reduce((s, o) => s + poids[o], 0);
  for (const o of options) {
    tirage -= poids[o];
    if (tirage < 0) return o;
  }
  return options[0]!;
}
