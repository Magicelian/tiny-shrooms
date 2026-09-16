// Contenu des panneaux superposés à l'îlot.
import { useState } from 'preact/hooks';
import type { Batiment, Instantane, Priorites, Tache, TypeBatiment, TypeVisiteur, Visiteur } from '@tiny-shrooms/engine';
import { AMELIORATIONS_VILLAGE, coutAmelioration, PAS_PAR_MINUTE, STADES_ARBRE, TACHES } from '@tiny-shrooms/engine';
import { nombre, t } from '@tiny-shrooms/i18n';
import { abordable, effets, listeQuantites, nomBatiment, pourcent } from './format';
import type { ControleurInterface } from './index';

interface Props {
  controleur: ControleurInterface;
  instantane: Instantane;
}

const hex = (couleur: number) => `#${couleur.toString(16).padStart(6, '0')}`;

export function PanneauConstruire({ controleur, instantane }: Props) {
  const [survole, setSurvole] = useState<TypeBatiment | null>(null);
  const { contenu, couleurs } = controleur;
  return (
    <>
      <ul class="catalogue">
        {instantane.batimentsDebloques.map((type) => {
          const cout = contenu.batiments[type].cout;
          const payable = abordable(cout, instantane.stocks);
          return (
            <li key={type}>
              <button
                class={`carte ${payable ? '' : 'manque'}`}
                onMouseEnter={() => setSurvole(type)}
                onFocus={() => setSurvole(type)}
                onClick={() => controleur.commencerPlacement(type)}
              >
                <span class="pastille" style={{ background: hex(couleurs.batiments[type]) }} />
                <span class="nom">{nomBatiment(type)}</span>
                <span class="cout">{listeQuantites(cout) || t('construction.gratuit')}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div class="detail">
        {survole
          ? effets(contenu, survole).map((ligne) => <p key={ligne}>{ligne}</p>)
          : <p class="discret">{t('construction.aide')}</p>}
      </div>
    </>
  );
}

export function PanneauBatiment({ controleur, batiment, instantane }: Props & { batiment: Batiment }) {
  const [confirmer, setConfirmer] = useState(false);
  const { contenu } = controleur;
  const remboursement = listeQuantites(contenu.batiments[batiment.type].cout, contenu.remboursementDemolition);
  return (
    <>
      {batiment.chantier !== null && (
        <>
          <p>{t('effet.chantier', { pourcent: pourcent(batiment.chantier) })}</p>
          <Jauge valeur={batiment.chantier} />
        </>
      )}
      {effets(contenu, batiment.type).map((ligne) => (
        <p key={ligne}>{ligne}</p>
      ))}
      {batiment.bonusVoisinage > 1 && <p class="bonus">{t('effet.bonusActuel', { pourcent: pourcent(batiment.bonusVoisinage - 1) })}</p>}
      {batiment.type === 'relais' && batiment.chantier === null && <PanneauVisiteurs controleur={controleur} instantane={instantane} />}
      {batiment.type === 'atelier' && batiment.chantier === null && <Ameliorations controleur={controleur} instantane={instantane} />}
      <button
        class={`bouton large ${confirmer ? 'danger' : ''}`}
        onClick={() => {
          if (!confirmer) return setConfirmer(true);
          controleur.envoyer({ type: 'demolir', id: batiment.id });
          controleur.magasin.modifier({ panneau: null });
        }}
      >
        {confirmer ? t('construction.confirmer', { liste: remboursement }) : t('construction.demolir')}
      </button>
    </>
  );
}

export function PanneauHabitants({ controleur, instantane }: Props) {
  // Valeurs locales pendant le glissé, pour ne pas attendre l'instantané suivant.
  const [priorites, setPriorites] = useState<Priorites>(instantane.priorites);
  const regler = (tache: Tache, valeur: number) => {
    const suivantes = { ...priorites, [tache]: valeur };
    setPriorites(suivantes);
    controleur.envoyer({ type: 'reglerPriorites', priorites: suivantes });
  };
  const { chapeaux } = controleur.couleurs;
  return (
    <>
      <h3>{t('habitants.priorites')}</h3>
      {TACHES.map((tache) => (
        <label key={tache} class="curseur">
          <span>{t(`tache.${tache}`)}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(priorites[tache] * 100)}
            onInput={(e) => regler(tache, Number(e.currentTarget.value) / 100)}
          />
        </label>
      ))}
      <h3>{t('habitants.liste', { nombre: instantane.habitants.length })}</h3>
      <ul class="habitants">
        {instantane.habitants.map((h) => (
          <li key={h.id}>
            <span class="pastille ronde" style={{ background: hex(chapeaux[h.chapeau % chapeaux.length]!) }} />
            <span class="nom">
              {t('habitants.nom', { numero: h.id })}
              <small>
                {t(`activite.${h.activite}`)} · {t('habitants.bienEtre', { pourcent: pourcent(h.bienEtre) })}
              </small>
            </span>
            <select
              value={h.epingle ?? ''}
              title={h.tache ? t(`tache.${h.tache}`) : t('habitants.libre')}
              onChange={(e) => {
                const valeur = e.currentTarget.value;
                controleur.envoyer({ type: 'epinglerHabitant', id: h.id, tache: valeur === '' ? null : (valeur as Tache) });
              }}
            >
              <option value="">{t('habitants.libre')}</option>
              {TACHES.map((tache) => (
                <option key={tache} value={tache}>
                  📌 {t(`tache.${tache}`)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </>
  );
}

function Ameliorations({ controleur, instantane }: Props) {
  return (
    <ul class="ameliorations">
      {AMELIORATIONS_VILLAGE.map((a) => {
        const def = controleur.contenu.ameliorations[a];
        const niveau = instantane.ameliorations[a];
        const cout = coutAmelioration(controleur.contenu, a, niveau);
        return (
          <li key={a}>
            <p>
              <strong>{t(`amelioration.${a}`)}</strong> · {t('amelioration.niveau', { niveau, max: def.niveauMax })}
            </p>
            <p class="discret">{t(`amelioration.effet.${a}`, { pourcent: pourcent(def.effet * niveau) })}</p>
            {cout ? (
              <button
                class={`bouton large ${abordable(cout, instantane.stocks) ? '' : 'manque'}`}
                onClick={() => controleur.envoyer({ type: 'ameliorer', cible: { village: a } })}
              >
                {t('amelioration.acheter', { liste: listeQuantites(cout) })}
              </button>
            ) : (
              <p class="bonus">{t('amelioration.max')}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function PanneauArbre({ controleur, instantane }: Props) {
  const { arbreMere, stocks } = instantane;
  const suivant = STADES_ARBRE[STADES_ARBRE.indexOf(arbreMere.stade) + 1];
  const deblocages = suivant ? (controleur.contenu.arbreMere.deblocages[suivant] ?? []) : [];
  const spores = Math.floor(stocks.spores.quantite);
  return (
    <>
      <p>{t('arbre.stade', { stade: t(`stade.${arbreMere.stade}`) })}</p>
      {suivant && (
        <>
          <p>{t('arbre.avancement', { spores: nombre(arbreMere.sporesRestantes), stade: t(`stade.${suivant}`) })}</p>
          <Jauge valeur={arbreMere.avancement} />
          {arbreMere.sporesParMinute > 0 && <p class="discret">{t('arbre.apport', { nombre: nombre(arbreMere.sporesParMinute, 1) })}</p>}
          {deblocages.length > 0 && (
            <p class="discret">{t('arbre.deblocages', { stade: t(`stade.${suivant}`), liste: deblocages.map(nomBatiment).join(', ') })}</p>
          )}
          <button
            class={`bouton large ${spores > 0 ? '' : 'manque'}`}
            onClick={() => controleur.envoyer({ type: 'nourrirArbre', spores })}
          >
            {spores > 0 ? t('arbre.nourrir', { nombre: nombre(spores) }) : t('arbre.sansSpores')}
          </button>
        </>
      )}
      <p class="discret">{t('arbre.mycelium', { pourcent: pourcent(arbreMere.mycelium) })}</p>
      {arbreMere.floraisonPossible && (
        <>
          <p class="bonus">{t('arbre.pret')}</p>
          <button class="bouton large actif" onClick={() => controleur.envoyer({ type: 'fleurir' })}>
            {t('arbre.fleurir')}
          </button>
        </>
      )}
      {arbreMere.floraisons > 0 && (
        <>
          <p>{t('arbre.fleuri')}</p>
          <button class="bouton large" onClick={() => controleur.lancerFloraison()}>
            {t('arbre.revoir')}
          </button>
        </>
      )}
    </>
  );
}

export const ICONES_VISITEUR: Record<TypeVisiteur, string> = { herisson: '🦔', escargot: '🐌', luciole: '✨' };

export function PanneauVisiteurs({ controleur, instantane }: Props) {
  const { visiteurs, batiments } = instantane;
  if (visiteurs.length === 0) {
    const relais = batiments.some((b) => b.type === 'relais' && b.chantier === null);
    return <p class="discret">{t(relais ? 'visiteur.aucun' : 'visiteur.sansRelais')}</p>;
  }
  return (
    <>
      <ul class="visiteurs">
        {visiteurs.map((v) => (
          <CarteVisiteur key={v.id} controleur={controleur} instantane={instantane} visiteur={v} />
        ))}
      </ul>
      <p class="discret">{t('visiteur.attente')}</p>
    </>
  );
}

function CarteVisiteur({ controleur, instantane, visiteur }: Props & { visiteur: Visiteur }) {
  const repondre = (accepte: boolean) => controleur.envoyer({ type: 'repondreVisiteur', id: visiteur.id, accepte });
  let lignes: string[];
  let action: string;
  let payable = true;
  switch (visiteur.type) {
    case 'herisson':
      lignes = [t('visiteur.echange', { donne: listeQuantites(visiteur.donne), demande: listeQuantites(visiteur.demande) })];
      action = t('visiteur.echanger');
      payable = abordable(visiteur.demande, instantane.stocks);
      break;
    case 'escargot': {
      const r = visiteur.recompense;
      const recompense = 'plan' in r ? t('visiteur.plan', { batiment: nomBatiment(r.plan) }) : listeQuantites(r);
      lignes = [t('visiteur.quete', { demande: listeQuantites(visiteur.demande) }), t('visiteur.recompense', { recompense })];
      action = t('visiteur.donner');
      payable = abordable(visiteur.demande, instantane.stocks);
      break;
    }
    case 'luciole':
      lignes = [t('visiteur.bonus', { multiplicateur: nombre(visiteur.multiplicateur, 2), minutes: nombre(visiteur.dureePas / PAS_PAR_MINUTE, 1) })];
      action = t('visiteur.accepter');
      break;
  }
  return (
    <li class="visiteur">
      <span class="icone">{ICONES_VISITEUR[visiteur.type]}</span>
      <div class="texte">
        <strong>{t(`visiteur.${visiteur.type}`)}</strong>
        {lignes.map((l) => (
          <small key={l} class={payable ? '' : 'manque'}>{l}</small>
        ))}
      </div>
      <div class="actions">
        <button class={`bouton ${payable ? '' : 'manque'}`} onClick={() => repondre(true)}>
          {action}
        </button>
        <button class="bouton discret" onClick={() => repondre(false)}>
          {t('visiteur.renvoyer')}
        </button>
      </div>
    </li>
  );
}

export function PanneauReglages() {
  return (
    <>
      <p>{t('reglages.camera')}</p>
      <p class="discret">{t('reglages.aVenir')}</p>
    </>
  );
}

function Jauge({ valeur }: { valeur: number }) {
  return (
    <div class="jauge">
      <div style={{ width: `${Math.round(valeur * 100)}%` }} />
    </div>
  );
}
