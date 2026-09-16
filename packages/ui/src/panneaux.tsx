// Contenu des bulles ouvertes au clic.
import { useState } from 'preact/hooks';
import type { Batiment, Case, Ile, Instantane, TypeBatiment } from '@tiny-shrooms/engine';
import { elementEn } from '@tiny-shrooms/engine';
import { AMELIORATIONS_VILLAGE, besoinsSuivis, coutAmelioration, coutTotal, rangLogement, refusMontee } from '@tiny-shrooms/engine';
import { nombre, t } from '@tiny-shrooms/i18n';
import { abordable, effets, listeQuantites, nomBatiment, nomBesoin, nomPalier, nomRang, pourcent } from './format';
import { natureVisee, type ControleurInterface } from './index';
import { useMagasin, type Bulle } from './magasin';

interface Props {
  controleur: ControleurInterface;
  instantane: Instantane;
}

const hex = (couleur: number) => `#${couleur.toString(16).padStart(6, '0')}`;

export function BulleConstruire({ controleur, instantane, bulle }: Props & { bulle: Extract<Bulle, { type: 'construire' }> }) {
  const { contenu, couleurs } = controleur;
  const { bonusVise } = useMagasin(controleur.magasin);
  const { choix } = bulle;
  const payable = choix !== null && abordable(contenu.batiments[choix].cout, instantane.stocks);
  // Débloqués d'abord, puis les plans des paliers suivants, grisés avec le palier qui les donne.
  const verrouilles = contenu.paliers.flatMap((p, palier) =>
    p.debloque.filter((type) => !instantane.batimentsDebloques.includes(type)).map((type): [TypeBatiment, number] => [type, palier]),
  );
  return (
    <>
      <ul class="catalogue">
        {instantane.batimentsDebloques.map((type) => {
          const cout = contenu.batiments[type].cout;
          return (
            <li key={type}>
              <button
                class={`carte ${abordable(cout, instantane.stocks) ? '' : 'manque'} ${type === choix ? 'choisie' : ''}`}
                onClick={() => controleur.choisir(type)}
              >
                <span class="pastille" style={{ background: hex(couleurs.batiments[type]) }} />
                <span class="nom">{nomBatiment(type)}</span>
                <span class="cout">{listeQuantites(cout) || t('construction.gratuit')}</span>
              </button>
            </li>
          );
        })}
        {verrouilles.map(([type, palier]) => (
          <li key={type}>
            <button class="carte verrou" disabled>
              <span class="pastille" style={{ background: hex(couleurs.batiments[type]) }} />
              <span class="nom">{nomBatiment(type)}</span>
              <span class="cout">{t('logement.palierRequis', { palier: nomPalier(contenu, palier) })}</span>
            </button>
          </li>
        ))}
      </ul>
      <div class="detail">
        {choix ? (
          <>
            {effets(contenu, choix).map((ligne) => (
              <p key={ligne}>{ligne}</p>
            ))}
            {bonusVise !== null && bonusVise > 1 && (
              <p class="bonus">{t('construction.bonusIci', { pourcent: pourcent(bonusVise - 1) })}</p>
            )}
            <button class={`bouton large ${payable ? 'valider' : 'manque'}`} disabled={!payable} onClick={() => controleur.construire()}>
              {t('construction.poser')}
            </button>
          </>
        ) : (
          <p class="discret">{t('construction.choisir')}</p>
        )}
      </div>
    </>
  );
}

export function BulleBatiment({ controleur, batiment, instantane }: Props & { batiment: Batiment }) {
  const [confirmer, setConfirmer] = useState(false);
  const { contenu } = controleur;
  const def = contenu.batiments[batiment.type];
  const remboursement = listeQuantites(coutTotal(contenu, batiment), contenu.remboursementDemolition);
  const enChantier = batiment.chantier !== null;
  // Bâtisseurs pendant le chantier, récolteurs ensuite.
  const postes = enChantier ? contenu.habitants.ouvriersParChantier : def.production ? (def.postes ?? 1) : 0;
  const pourvus = instantane.habitants.filter(
    (h) => h.lieu === batiment.id && h.tache === (enChantier ? 'construire' : 'recolter'),
  ).length;
  return (
    <>
      {enChantier && (
        <>
          <p>{t('effet.chantier', { pourcent: pourcent(batiment.chantier!) })}</p>
          <Jauge valeur={batiment.chantier!} />
        </>
      )}
      {postes > 0 && <p><strong>{t(enChantier ? 'construction.batisseurs' : 'construction.emplois', { pourvus, postes })}</strong></p>}
      {!enChantier && def.logement && <Logement controleur={controleur} instantane={instantane} batiment={batiment} />}
      {!def.logement && effets(contenu, batiment.type).map((ligne) => (
        <p key={ligne}>{ligne}</p>
      ))}
      {batiment.bonusVoisinage > 1 && <p class="bonus">{t('effet.bonusActuel', { pourcent: pourcent(batiment.bonusVoisinage - 1) })}</p>}
      {batiment.type === 'atelier' && !enChantier && <Ameliorations controleur={controleur} instantane={instantane} />}
      <div class="actions">
        <button class="bouton" onClick={() => controleur.commencerDeplacement(batiment.id)}>
          {t('construction.deplacer')}
        </button>
        <button
          class={`bouton ${confirmer ? 'danger' : ''}`}
          onClick={() => {
            if (!confirmer) return setConfirmer(true);
            controleur.envoyer({ type: 'demolir', id: batiment.id });
            controleur.fermer();
          }}
        >
          {confirmer ? t('construction.confirmer', { liste: remboursement }) : t('construction.demolir')}
        </button>
      </div>
    </>
  );
}

/** Habitants, besoins du rang et montée au rang suivant. */
function Logement({ controleur, instantane, batiment }: Props & { batiment: Batiment }) {
  const { contenu } = controleur;
  const rang = rangLogement(contenu, batiment);
  const suivant = contenu.logement.rangs[batiment.niveau];
  // Les places vont aux habitants dans l'ordre des bâtiments, la souche-dépôt d'abord.
  let avant = controleur.magasin.valeur.ile?.soucheEnPlace === false ? 0 : contenu.habitants.logementDeBase;
  for (const b of instantane.batiments) {
    if (b.id === batiment.id) break;
    avant += b.chantier === null ? (rangLogement(contenu, b)?.places ?? 0) : 0;
  }
  const places = rang?.places ?? 0;
  const loges = Math.min(places, Math.max(0, instantane.habitants.length - avant));
  const refus = refusMontee(contenu, batiment, instantane.palier);
  const cout = suivant?.cout ?? {};
  const suivis = besoinsSuivis(contenu, batiment.niveau);
  const Besoins = ({ liste }: { liste: readonly string[] }) => (
    <ul class="besoins">
      {suivis
        .filter((b) => liste.includes(b))
        .map((b) => (
          <li key={b} class={batiment.besoins[b] ? 'bonus' : 'manque'}>
            {batiment.besoins[b] ? '✓' : '✗'} {nomBesoin(b)}
          </li>
        ))}
    </ul>
  );
  return (
    <>
      <p><strong>{t('logement.habitants', { nombre: loges, places })}</strong></p>
      <p class="discret">{t('logement.besoins')}</p>
      <Besoins liste={rang?.besoins ?? []} />
      {suivant ? (
        <>
          <p class="discret">{t('logement.pourMonter', { rang: nomRang(batiment.niveau + 1) })}</p>
          {refus === 'nonDebloque' ? (
            <p class="manque">{t('logement.palierRequis', { palier: nomPalier(contenu, suivant.palier) })}</p>
          ) : (
            <Besoins liste={suivant.besoins.filter((b) => !rang?.besoins.includes(b))} />
          )}
          <button
            class={`bouton large ${refus === null && abordable(cout, instantane.stocks) ? 'valider' : 'manque'}`}
            disabled={refus !== null}
            onClick={() => controleur.envoyer({ type: 'ameliorer', cible: { batiment: batiment.id } })}
          >
            {t('logement.monter', { liste: listeQuantites(cout) })}
          </button>
        </>
      ) : (
        <p class="bonus">{t('logement.rangMax')}</p>
      )}
    </>
  );
}

export function titreNature(ile: Ile, instantane: Instantane, c: Case): string {
  const nature = natureVisee(ile, c);
  if (nature === 'souche') return t('nature.souche');
  const element = elementEn(ile, c.x, c.y);
  if (nature === 'plante' && element >= 0) return t(`element.${ile.elements[element]!.type}`);
  return nature ? t(`nature.${nature}`) : '';
}

/** Souche-dépôt, arbre, buisson ou plante : repousse, puis arrachage payant et son avancement. */
export function BulleNature({ controleur, instantane, ile, case: c }: Props & { ile: Ile; case: Case }) {
  const { contenu } = controleur;
  const nature = natureVisee(ile, c);
  if (!nature) return null;
  const element = elementEn(ile, c.x, c.y);
  const pousse = element >= 0 ? (instantane.pousses[element] ?? 1) : 1;
  const souche = nature === 'souche';
  const avancement = souche ? instantane.retraitSouche : (instantane.defrichages.find((d) => d.case.x === c.x && d.case.y === c.y)?.avancement ?? null);
  const def = souche ? { cout: contenu.souche.coutRetrait, gain: undefined } : contenu.defrichage[nature];
  const depot = instantane.batiments.some((b) => b.chantier === null && contenu.batiments[b.type].stockage);
  const possible = !souche || depot;
  const payable = abordable(def.cout, instantane.stocks);
  return (
    <>
      {souche && <p>{t('nature.soucheDetail')}</p>}
      {pousse < 1 && (
        <>
          <p>{t('nature.repousse', { pourcent: pourcent(pousse) })}</p>
          <Jauge valeur={pousse} />
        </>
      )}
      {avancement !== null ? (
        <>
          <p>{t('nature.arrachage', { pourcent: pourcent(avancement) })}</p>
          <Jauge valeur={avancement} />
        </>
      ) : (
        <>
          {def.gain && <p class="bonus">{t('nature.gain', { liste: listeQuantites(def.gain) })}</p>}
          {!possible && <p class="manque">{t('refus.depotRequis')}</p>}
          <button
            class={`bouton large ${possible && payable ? 'valider' : 'manque'}`}
            disabled={!possible}
            onClick={() => controleur.envoyer(souche ? { type: 'retirerSouche' } : { type: 'defricher', case: c })}
          >
            {t(souche ? 'nature.retirer' : 'nature.arracher', { liste: listeQuantites(def.cout) || t('construction.gratuit') })}
          </button>
        </>
      )}
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

function Jauge({ valeur }: { valeur: number }) {
  return (
    <div class="jauge">
      <div style={{ width: `${Math.round(valeur * 100)}%` }} />
    </div>
  );
}
