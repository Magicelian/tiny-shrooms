// Composants de l'interface : écriteaux (saison, habitants), rangée de planches (ressources), bulles et messages.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Instantane, Meteo, Ressource } from '@tiny-shrooms/engine';
import { capaciteLogement, elementEn } from '@tiny-shrooms/engine';
import { nombre, t } from '@tiny-shrooms/i18n';
import { nomPalier, nomPose, nomRessource, pourcent } from './format';
import { Icone } from './composants';
import { natureVisee, type ControleurInterface } from './index';
import { useMagasin, type Bulle } from './magasin';
import { BulleBatiment, BulleConstruire, BulleNature, titreNature } from './panneaux';
import { Accueil } from './accueil';

export interface Props {
  controleur: ControleurInterface;
}

const ICONES_METEO: Record<Meteo, string> = { soleil: '☀', pluie: '☂', vent: '≋', neige: '❄' };

export function Interface({ controleur }: Props) {
  const etat = useMagasin(controleur.magasin);
  const { instantane, bulle, deplacement } = etat;
  if (!instantane) return null;
  if (etat.menu !== null) return <Accueil controleur={controleur} />;

  return (
    <div class={`interface ${etat.focus ? 'active' : ''}`}>
      <Ecriteau instantane={instantane} />
      <Population controleur={controleur} instantane={instantane} />
      <Rangee instantane={instantane} />

      {deplacement !== null && <BandeauDeplacement controleur={controleur} bonus={etat.bonusVise} />}
      {etat.astuceSouche && !bulle && <AstuceSouche controleur={controleur} />}
      {bulle && <ContenuBulle controleur={controleur} bulle={bulle} instantane={instantane} />}

      {etat.envols.map((e) => (
        <span key={e.id} class="envol" style={{ left: `${e.x}px`, top: `${e.y}px` }}>
          <Icone nom={e.ressource} />+{nombre(e.quantite)}
        </span>
      ))}

      <div class="messages">
        {etat.messages.map((m) => (
          <div key={m.id} class="message">
            {m.texte}
          </div>
        ))}
      </div>
    </div>
  );
}

function ContenuBulle({ controleur, bulle, instantane }: Props & { bulle: Bulle; instantane: Instantane }) {
  const fermer = () => controleur.fermer();
  if (bulle.type === 'construire')
    return (
      <Cadre titre={t('construction.titre')} fermer={fermer} position={bulle.haut ? 'haut' : 'bas'}>
        <BulleConstruire controleur={controleur} instantane={instantane} bulle={bulle} />
      </Cadre>
    );
  if (bulle.type === 'nature') {
    const { ile } = controleur.magasin.valeur;
    if (!ile) return null;
    return (
      <Cadre
        titre={titreNature(ile, instantane, bulle.case)}
        vignette={vignetteNature(controleur, bulle.case)}
        fermer={fermer}
        position={bulle.haut ? 'haut' : 'bas'}
      >
        <BulleNature controleur={controleur} instantane={instantane} ile={ile} case={bulle.case} />
      </Cadre>
    );
  }
  const batiment = controleur.batiment(bulle.id);
  if (!batiment) return null;
  return (
    <Cadre
      titre={nomPose(controleur.contenu, batiment)}
      vignette={controleur.vignettes?.batiment(batiment.type, batiment.niveau)}
      fermer={fermer}
      position={bulle.haut ? 'haut' : 'bas'}
    >
      <BulleBatiment key={batiment.id} controleur={controleur} instantane={instantane} batiment={batiment} />
    </Cadre>
  );
}

/** Petite bulle qui suit la souche à l'écran (la caméra bouge) : c'est là que se dépensent les graines. */
function AstuceSouche({ controleur }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let image = 0;
    const suivre = () => {
      const point = controleur.pointSouche();
      const el = ref.current;
      if (el) {
        el.style.visibility = point ? 'visible' : 'hidden';
        if (point) el.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -100%)`;
      }
      image = requestAnimationFrame(suivre);
    };
    suivre();
    return () => cancelAnimationFrame(image);
  }, [controleur]);
  return (
    <div ref={ref} class="astuce">
      {t('prestige.astuce')}
    </div>
  );
}

/** Vignette de ce que montre une bulle nature : souche, arbre, buisson ou élément récoltable. */
function vignetteNature(controleur: ControleurInterface, c: { x: number; y: number }): string | undefined {
  const { vignettes } = controleur;
  const ile = controleur.magasin.valeur.ile;
  if (!vignettes || !ile) return undefined;
  const nature = natureVisee(ile, c);
  if (nature === 'souche' || nature === 'arbre' || nature === 'buisson') return vignettes.nature(nature);
  const element = elementEn(ile, c.x, c.y);
  const type = element >= 0 ? ile.elements[element]!.type : null;
  if (type === 'buisson') return vignettes.nature('baies');
  return type ? vignettes.nature(type) : undefined;
}

function Cadre(props: { titre: string; vignette?: string; fermer: () => void; position: 'haut' | 'bas'; children: ComponentChildren }) {
  return (
    <section class={`bulle commande ${props.position}`}>
      <header>
        {props.vignette && <img class="vignette" src={props.vignette} alt="" />}
        <h2>{props.titre}</h2>
        <button class="bouton fermer" title={t('panneau.fermer')} onClick={props.fermer}>
          ✕
        </button>
      </header>
      <div class="corps">{props.children}</div>
    </section>
  );
}

/** Saison et météo sur un petit écriteau suspendu, en haut à gauche. */
function Ecriteau({ instantane }: { instantane: Instantane }) {
  const { temps } = instantane;
  return (
    <Survol classe="ecriteau" detail={t(`meteo.${temps.meteo}`)}>
      <span class="meteo">{ICONES_METEO[temps.meteo]}</span>
      {t('temps.annee', { saison: t(`saison.${temps.saison}`), annee: temps.annee })}
    </Survol>
  );
}

/** Palier, habitants et places libres, sur une planche en haut à droite. */
function Population({ controleur, instantane }: Props & { instantane: Instantane }) {
  const { contenu } = controleur;
  const places = capaciteLogement(contenu, instantane.batiments, controleur.magasin.valeur.ile?.soucheEnPlace ?? true, instantane.prestige);
  const habitants = instantane.habitants.length;
  const suivant = contenu.paliers[instantane.palier + 1];
  const prochain = suivant
    ? t('palier.prochain', { palier: nomPalier(contenu, instantane.palier + 1), population: suivant.population })
    : t('palier.dernier');
  return (
    <Survol classe="ecriteau population" detail={`${t('habitants.detail', { nombre: habitants, places })} · ${prochain}`}>
      <span class="palier">{nomPalier(contenu, instantane.palier)}</span>
      <Icone nom="habitant" />
      <span>
        {nombre(habitants)}
        <span class="places">/{nombre(places)}</span>
      </span>
    </Survol>
  );
}

/** Ressources sur une rangée de petites planches en bas de la fenêtre. */
function Rangee({ instantane }: { instantane: Instantane }) {
  const { stocks } = instantane;
  const visibles: Ressource[] = ['baies', 'boisMort', 'mousse', 'spores'];
  if (stocks.baiesSechees.quantite > 0 || instantane.batimentsDebloques.includes('sechoir')) visibles.splice(1, 0, 'baiesSechees');
  return (
    <ul class="rangee">
      {visibles.map((r) => {
        const stock = stocks[r];
        const variation = stock.productionParMinute;
        return (
          <Planche
            key={r}
            icone={<Icone nom={r} />}
            quantite={Math.floor(stock.quantite)}
            plein={stock.quantite >= stock.plafond}
            detail={`${nomRessource(r)} ${nombre(Math.floor(stock.quantite))}/${nombre(stock.plafond)} · ${variation >= 0 ? '+' : ''}${t('ressource.parMinute', { valeur: nombre(variation, 1) })}`}
          />
        );
      })}
    </ul>
  );
}

/**
 * Écriteau avec une infobulle dessinée par l'interface : l'infobulle native (`title`) de la vue web
 * remplace le curseur pixel par celui du système et le fait clignoter.
 */
function Survol(props: { classe: string; detail: string; children: ComponentChildren }) {
  const [survol, setSurvol] = useState(false);
  return (
    <div class={`${props.classe} survolable`} onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)}>
      {props.children}
      {survol && <span class="infobulle">{props.detail}</span>}
    </div>
  );
}

/** `plein` : stock au plafond. */
function Planche(props: { icone: ComponentChildren; quantite: number; plein: boolean; detail: string }) {
  const [survol, setSurvol] = useState(false);
  return (
    <li class={`planche ${props.plein ? 'plein' : ''}`} onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)}>
      {props.icone}
      <span class="quantite">{nombre(props.quantite)}</span>
      {survol && <span class="infobulle">{props.detail}</span>}
    </li>
  );
}

function BandeauDeplacement({ controleur, bonus }: Props & { bonus: number | null }) {
  const { deplacement } = controleur.magasin.valeur;
  const batiment = deplacement === null ? undefined : controleur.batiment(deplacement);
  if (!batiment) return null;
  return (
    <div class="bandeau commande">
      <div class="ligne">
        <span>
          <strong>{nomPose(controleur.contenu, batiment)}</strong>
          {bonus !== null && bonus > 1 && <span class="bonus"> · {t('construction.bonusIci', { pourcent: pourcent(bonus - 1) })}</span>}
        </span>
        <button class="bouton fermer" title={t('panneau.fermer')} onClick={() => controleur.fermer()}>
          ✕
        </button>
      </div>
      <div class="ligne aide">{t('construction.aideDeplacer')}</div>
    </div>
  );
}
