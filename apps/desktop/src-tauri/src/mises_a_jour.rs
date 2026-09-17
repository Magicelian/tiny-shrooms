//! Mises à jour automatiques : cherchées au lancement puis toutes les 30 min et téléchargées en silence.
//! Une ligne du menu de l'icône montre où on en est ; une fois la version prête, elle propose de redémarrer.
//! La partie est écrite avant l'installation.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::reglages::EtatReglages;

const INTERVALLE: Duration = Duration::from_secs(30 * 60);

#[derive(Clone, Default)]
enum Statut {
    #[default]
    Recherche,
    AJour,
    Telechargement(String),
    Prete(String),
    Echec,
    Developpement,
}

#[derive(Default)]
pub struct EtatMiseAJour {
    statut: Mutex<Statut>,
    prete: Mutex<Option<(Update, Vec<u8>)>>,
    /// Vrai une fois l'entrée du menu choisie : la sortie installe au lieu de quitter.
    installer: AtomicBool,
}

fn texte(statut: &Statut, langue: &str, version: &str) -> String {
    let fr = langue == "fr";
    match statut {
        Statut::Recherche if fr => "Recherche de mise à jour…".into(),
        Statut::Recherche => "Checking for updates…".into(),
        Statut::AJour if fr => format!("Version {version} : à jour"),
        Statut::AJour => format!("Version {version}: up to date"),
        Statut::Telechargement(v) if fr => format!("Téléchargement de la version {v}…"),
        Statut::Telechargement(v) => format!("Downloading version {v}…"),
        Statut::Prete(v) if fr => format!("Redémarrer pour passer à la version {v}"),
        Statut::Prete(v) => format!("Restart to update to version {v}"),
        Statut::Echec if fr => "Mise à jour impossible, nouvel essai dans 30 min".into(),
        Statut::Echec => "Update failed, retrying in 30 min".into(),
        Statut::Developpement if fr => format!("Version {version} (développement)"),
        Statut::Developpement => format!("Version {version} (development)"),
    }
}

/// Met la ligne du menu à jour, dans la langue du jeu ; appelée aussi quand la langue change.
pub fn afficher(app: &AppHandle) {
    let statut = app.state::<EtatMiseAJour>().statut.lock().unwrap().clone();
    let reglages = app.state::<EtatReglages>();
    let langue = reglages.reglages.lock().unwrap().langue_effective();
    let version = app.package_info().version.to_string();
    let entree = &reglages.menu.mettre_a_jour;
    let _ = entree.set_text(texte(&statut, &langue, &version));
    let _ = entree.set_enabled(matches!(statut, Statut::Prete(_)));
}

fn changer(app: &AppHandle, statut: Statut) {
    *app.state::<EtatMiseAJour>().statut.lock().unwrap() = statut;
    afficher(app);
}

pub fn surveiller(app: AppHandle) {
    // En développement, aucune version publiée ne correspond.
    if cfg!(debug_assertions) {
        return changer(&app, Statut::Developpement);
    }
    afficher(&app);
    std::thread::spawn(move || loop {
        changer(&app, Statut::Recherche);
        match tauri::async_runtime::block_on(telecharger(&app)) {
            Ok(true) => return,
            Ok(false) => changer(&app, Statut::AJour),
            Err(erreur) => {
                eprintln!("mise à jour : {erreur}");
                changer(&app, Statut::Echec);
            }
        }
        std::thread::sleep(INTERVALLE);
    });
}

async fn telecharger(app: &AppHandle) -> tauri_plugin_updater::Result<bool> {
    let Some(update) = app.updater()?.check().await? else {
        return Ok(false);
    };
    let version = update.version.clone();
    changer(app, Statut::Telechargement(version.clone()));
    let octets = update.download(|_, _| {}, || {}).await?;
    *app.state::<EtatMiseAJour>().prete.lock().unwrap() = Some((update, octets));
    changer(app, Statut::Prete(version));
    Ok(true)
}

/// Entrée du menu choisie : la prochaine sortie installera la mise à jour.
pub fn demander(app: &AppHandle) {
    app.state::<EtatMiseAJour>().installer.store(true, Ordering::SeqCst);
}

/// Installe la mise à jour demandée puis relance l'application ; ne revient pas si elle a été installée.
pub fn installer_si_demande(app: &AppHandle) {
    let etat = app.state::<EtatMiseAJour>();
    if !etat.installer.load(Ordering::SeqCst) {
        return;
    }
    let Some((update, octets)) = etat.prete.lock().unwrap().take() else {
        return;
    };
    match update.install(octets) {
        Ok(()) => app.restart(),
        Err(erreur) => eprintln!("installation de la mise à jour : {erreur}"),
    }
}
