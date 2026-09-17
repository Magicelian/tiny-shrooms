// Contenu des bulles ouvertes au clic.
import { useState } from 'preact/hooks';
import type { Batiment, Case, Ile, Instantane, TypeBatiment } from '@tiny-shrooms/engine';
import { elementEn } from '@tiny-shrooms/engine';
import {
  AMELIORATIONS_VILLAGE,
  besoinsSuivis,
  BONUS_PRESTIGE,
  coutAmelioration,
  coutBatiment,
  coutBonus,
  coutTotal,
  dejaConstruit,
  effetsPrestige,
  gainRenaissance,
  placesLogement,
  placesSouche,
  rangLogement,
  refusMontee,
} from '@tiny-shrooms/engine';
import { nombre, t } from '@tiny-shrooms/i18n';
import { abordable, effets, listeQuantites, nomBatiment, nomBesoin, nomPalier, nomRang, pourcent } from './format';
import { Cout, Icone, Phrase } from './composants';
import { natureVisee, type ControleurInterface } from './index';
import { useMagasin, type Bulle } from './magasin';

interface Props {
  controleur: ControleurInterface;
  instantane: Instantane;
}

export function BulleConstruire({ controleur, instantane, bulle }: Props & { bulle: Extract<Bulle, { type: 'construire' }> }) {
  const { contenu } = controleur;
  const { bonusVise } = useMagasin(controleur.magasin);
  const { choix } = bulle;
  const payable = choix !== null && abordable(coutBatiment(contenu, instantane.prestige.bonus, choix), instantane.stocks);
  // Un bâtiment en un seul exemplaire disparaît du catalogue tant qu'il est là.
  const batissables = instantane.batimentsDebloques.filter((type) => !dejaConstruit(contenu, instantane.batiments, type));
  // Débloqués d'abord, puis les plans des paliers suivants, grisés avec le palier qui les donne.
  const verrouilles = contenu.paliers.flatMap((p, palier) =>
    p.debloque.filter((type) => !instantane.batimentsDebloques.includes(type)).map((type): [TypeBatiment, number] => [type, palier]),
  );
  return (
    <>
      <ul class="catalogue">
        {batissables.map((type) => {
          const cout = coutBatiment(contenu, instantane.prestige.bonus, type);
          return (
            <li key={type}>
              <button
                class={`carte ${abordable(cout, instantane.stocks) ? '' : 'manque'} ${type === choix ? 'choisie' : ''}`}
                onClick={() => controleur.choisir(type)}
              >
                <Vignette controleur={controleur} type={type} />
                <span class="nom">{nomBatiment(type)}</span>
                <Cout quantites={cout} stocks={instantane.stocks} />
              </button>
            </li>
          );
        })}
        {verrouilles.map(([type, palier]) => (
          <li key={type}>
            <button class="carte verrou" disabled>
              <Vignette controleur={controleur} type={type} />
              <span class="nom">{nomBatiment(type)}</span>
              <span class="cout">
                <Icone nom="cadenas" />
                {nomPalier(contenu, palier)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {choix && (
        <div class="detail">
          <button class="bouton fermer fermer-detail" title={t('panneau.fermer')} onClick={() => controleur.choisir(null)}>
            ✕
          </button>
          {effets(contenu, choix).map((ligne) => (
            <p key={ligne}>{ligne}</p>
          ))}
          {bonusVise !== null && bonusVise > 1 && (
            <p class="bonus">{t('construction.bonusIci', { pourcent: pourcent(bonusVise - 1) })}</p>
          )}
          <button class={`bouton large ${payable ? 'valider' : 'manque'}`} disabled={!payable} onClick={() => controleur.construire()}>
            {t('construction.poser')}
          </button>
        </div>
      )}
    </>
  );
}

export function BulleBatiment({ controleur, batiment, instantane }: Props & { batiment: Batiment }) {
  const [confirmer, setConfirmer] = useState(false);
  const { contenu } = controleur;
  const def = contenu.batiments[batiment.type];
  const remboursement = coutTotal(contenu, batiment, instantane.prestige.bonus);
  const enChantier = batiment.chantier !== null;
  // Construction, agrandissement ou amélioration : il faut des bâtisseurs.
  const enTravaux = enChantier || batiment.agrandissement !== null || batiment.amelioration !== null;
  // Bâtisseurs pendant les travaux, récolteurs ensuite.
  const postes = enTravaux ? contenu.habitants.ouvriersParChantier : def.production ? (def.postes ?? 1) : 0;
  const pourvus = instantane.habitants.filter(
    (h) => h.lieu === batiment.id && h.tache === (enTravaux ? 'construire' : 'recolter'),
  ).length;
  return (
    <>
      {enChantier && (
        <>
          <p>{t('effet.chantier', { pourcent: pourcent(batiment.chantier!) })}</p>
          <Jauge valeur={batiment.chantier!} />
        </>
      )}
      {batiment.agrandissement !== null && (
        <>
          <p>{t('logement.agrandissement', { rang: nomRang(batiment.niveau + 1), pourcent: pourcent(batiment.agrandissement) })}</p>
          <Jauge valeur={batiment.agrandissement} />
        </>
      )}
      {postes > 0 && <p><strong>{t(enTravaux ? 'construction.batisseurs' : 'construction.emplois', { pourvus, postes })}</strong></p>}
      {!enChantier && def.logement && <Logement controleur={controleur} instantane={instantane} batiment={batiment} />}
      {!def.logement && effets(contenu, batiment.type).map((ligne) => (
        <p key={ligne}>{ligne}</p>
      ))}
      {batiment.bonusVoisinage > 1 && <p class="bonus">{t('effet.bonusActuel', { pourcent: pourcent(batiment.bonusVoisinage - 1) })}</p>}
      {batiment.type === 'atelier' && !enChantier && <Ameliorations controleur={controleur} instantane={instantane} />}
      {batiment.type === 'sanctuaire' && !enChantier && <Sanctuaire controleur={controleur} instantane={instantane} />}
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
          {confirmer ? (
            <Phrase texte={(liste) => t('construction.confirmer', { liste })}>
              <Cout quantites={remboursement} facteur={contenu.remboursementDemolition} />
            </Phrase>
          ) : (
            t('construction.demolir')
          )}
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
  const effets = effetsPrestige(contenu, instantane.prestige.bonus);
  let avant = placesSouche(contenu, effets.habitantsDeDepart, controleur.magasin.valeur.ile?.soucheEnPlace !== false);
  for (const b of instantane.batiments) {
    if (b.id === batiment.id) break;
    avant += placesLogement(contenu, b, effets.places);
  }
  const places = placesLogement(contenu, batiment, effets.places);
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
            <Icone nom={batiment.besoins[b] ? 'coche' : 'croix'} /> {nomBesoin(b)}
          </li>
        ))}
    </ul>
  );
  return (
    <>
      <p class="titre-ligne">
        <Icone nom="habitant" />
        <strong>{t('logement.habitants', { nombre: loges, places })}</strong>
      </p>
      <p class="discret">{t('logement.besoins')}</p>
      <Besoins liste={rang?.besoins ?? []} />
      {batiment.agrandissement !== null ? null : suivant ? (
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
            onClick={() => {
              controleur.envoyer({ type: 'ameliorer', cible: { batiment: batiment.id } });
              // Payable : l'agrandissement part, la bulle se referme. Sinon elle reste, avec le refus annoncé.
              if (abordable(cout, instantane.stocks)) controleur.fermer();
            }}
          >
            <Phrase texte={(liste) => t('logement.monter', { liste })}>
              <Cout quantites={cout} stocks={instantane.stocks} />
            </Phrase>
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
  // Les pouvoirs n'apparaissent qu'une fois le prestige entamé.
  const { prestige } = instantane;
  const pouvoirs = souche && (prestige.graines > 0 || Object.values(prestige.bonus).some((n) => n > 0));
  return (
    <>
      {pouvoirs && (
        <>
          <h3>{t('prestige.pouvoirs')}</h3>
          <ArbreBonus controleur={controleur} instantane={instantane} />
          <h3>{t('nature.retrait')}</h3>
        </>
      )}
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
          <button
            class="bouton large"
            onClick={() => {
              controleur.envoyer({ type: 'annulerArrachage', case: souche ? null : c });
              controleur.fermer();
            }}
          >
            {listeQuantites(def.cout) ? (
              <Phrase texte={(liste) => t('nature.annulerRembourse', { liste })}>
                <Cout quantites={def.cout} />
              </Phrase>
            ) : (
              t('nature.annuler')
            )}
          </button>
        </>
      ) : (
        <>
          {def.gain && (
            <p class="bonus">
              <Phrase texte={(liste) => t('nature.gain', { liste })}>
                <Cout quantites={def.gain} signe="+" />
              </Phrase>
            </p>
          )}
          {!possible && <p class="manque">{t('refus.depotRequis')}</p>}
          <button
            class={`bouton large ${possible && payable ? 'valider' : 'manque'}`}
            disabled={!possible}
            onClick={() => {
              controleur.envoyer(souche ? { type: 'retirerSouche' } : { type: 'defricher', case: c });
              if (payable) controleur.fermer();
            }}
          >
            <Phrase texte={(liste) => t(souche ? 'nature.retirer' : 'nature.arracher', { liste })}>
              <Cout quantites={def.cout} stocks={instantane.stocks} />
            </Phrase>
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
        // Travaux en cours : la jauge remplace le bouton, ici comme sur un agrandissement.
        const enCours = instantane.batiments.find((b) => b.amelioration?.village === a);
        return (
          <li key={a}>
            <p>
              <strong>{t(`amelioration.${a}`)}</strong> · {t('amelioration.niveau', { niveau, max: def.niveauMax })}
            </p>
            <p class="discret">{t(`amelioration.effet.${a}`, { pourcent: pourcent(def.effet * niveau) })}</p>
            {enCours ? (
              <>
                <p>{t('amelioration.travaux', { pourcent: pourcent(enCours.amelioration!.avancement) })}</p>
                <Jauge valeur={enCours.amelioration!.avancement} />
              </>
            ) : cout ? (
              <button
                class={`bouton large ${abordable(cout, instantane.stocks) ? '' : 'manque'}`}
                onClick={() => {
                  controleur.envoyer({ type: 'ameliorer', cible: { village: a } });
                  // Comme pour les logements : payable, la bulle se referme.
                  if (abordable(cout, instantane.stocks)) controleur.fermer();
                }}
              >
                <Phrase texte={(liste) => t('amelioration.acheter', { liste })}>
                  <Cout quantites={cout} stocks={instantane.stocks} />
                </Phrase>
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

/** Renaissance : gain annoncé, puis confirmation. Les bonus s'achètent à la souche. */
function Sanctuaire({ controleur, instantane }: Props) {
  const [confirmer, setConfirmer] = useState(false);
  const { prestige } = instantane;
  const gain = gainRenaissance(controleur.contenu, prestige.populationMax);
  return (
    <>
      <p>{t('prestige.gain', { gain, population: prestige.populationMax })}</p>
      <p class="discret">{t('prestige.efface')}</p>
      <button
        class={`bouton large ${confirmer ? 'danger' : 'valider'}`}
        onClick={() => (confirmer ? controleur.envoyer({ type: 'renaitre' }) : setConfirmer(true))}
      >
        {confirmer ? t('prestige.confirmer') : t('prestige.renaitre', { gain })}
      </button>
    </>
  );
}

/** Bonus permanents achetés en graines de prestige. */
function ArbreBonus({ controleur, instantane }: Props) {
  const { contenu } = controleur;
  const { prestige } = instantane;
  return (
    <>
      <p class="titre-ligne">
        <Icone nom="graine" />
        <strong>{t('prestige.graines', { graines: prestige.graines })}</strong>
      </p>
      <ul class="ameliorations">
        {BONUS_PRESTIGE.map((b) => {
          const niveau = prestige.bonus[b];
          const prix = coutBonus(contenu, b, niveau);
          const effets = effetsPrestige(contenu, { ...prestige.bonus, [b]: niveau + (prix === null ? 0 : 1) });
          return (
            <li key={b}>
              <p>
                <strong>{t(`bonus.${b}`)}</strong> · {t('amelioration.niveau', { niveau, max: contenu.prestige.bonus[b].niveauMax })}
              </p>
              <p class="discret">{prix === null ? descriptionBonus(b, effets) : t('bonus.suivant', { effet: descriptionBonus(b, effets) })}</p>
              {prix === null ? (
                <p class="bonus">{t('amelioration.max')}</p>
              ) : (
                <button
                  class={`bouton large ${prestige.graines >= prix ? '' : 'manque'}`}
                  onClick={() => controleur.envoyer({ type: 'acheterBonus', bonus: b })}
                >
                  <Icone nom="graine" /> {t('prestige.acheter', { prix })}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Effet du bonus au niveau suivant (ou actuel au maximum). */
function descriptionBonus(b: (typeof BONUS_PRESTIGE)[number], e: ReturnType<typeof effetsPrestige>): string {
  switch (b) {
    case 'production':
      return t('bonus.effet.production', { pourcent: pourcent(e.production - 1) });
    case 'depart':
      return t('bonus.effet.depart', { liste: listeQuantites(e.stocksDeDepart), nombre: e.habitantsDeDepart });
    case 'construction':
      return t('bonus.effet.construction', { cout: pourcent(1 - e.cout), vitesse: pourcent(e.chantier - 1) });
    case 'logement':
      return t('bonus.effet.logement', { pourcent: pourcent(e.bienEtre), places: e.places, accueil: pourcent(1 - e.arrivee) });
  }
}

/** Vignette du modèle en voxels, rendue par la scène. */
function Vignette({ controleur, type }: { controleur: ControleurInterface; type: TypeBatiment }) {
  const url = controleur.vignettes?.batiment(type, 1);
  return url ? <img class="vignette" src={url} alt="" /> : <span class="vignette" />;
}

function Jauge({ valeur }: { valeur: number }) {
  return (
    <div class="jauge">
      <div style={{ width: `${Math.round(valeur * 100)}%` }} />
    </div>
  );
}
