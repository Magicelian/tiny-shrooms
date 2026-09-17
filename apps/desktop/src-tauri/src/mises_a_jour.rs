//! Mises à jour automatiques : cherchées au lancement puis toutes les 30 min et téléchargées en silence.
//! Une entrée du menu de l'icône propose alors de redémarrer ; la partie est écrite avant l'installation.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_updater::{Update, UpdaterExt};

const INTERVALLE: Duration = Duration::from_secs(30 * 60);

#[derive(Default)]
pub struct EtatMiseAJour {
    prete: Mutex<Option<(Update, Vec<u8>)>>,
    /// Vrai une fois l'entrée du menu choisie : la sortie installe au lieu de quitter.
    installer: AtomicBool,
}

pub fn surveiller(app: AppHandle, menu: Menu<Wry>, entree: MenuItem<Wry>) {
    // En développement, aucune version publiée ne correspond.
    if cfg!(debug_assertions) {
        return;
    }
    std::thread::spawn(move || loop {
        match tauri::async_runtime::block_on(telecharger(&app)) {
            Ok(true) => {
                let _ = menu.insert(&entree, 0);
                return;
            }
            Ok(false) => {}
            Err(erreur) => eprintln!("mise à jour : {erreur}"),
        }
        std::thread::sleep(INTERVALLE);
    });
}

async fn telecharger(app: &AppHandle) -> tauri_plugin_updater::Result<bool> {
    let Some(update) = app.updater()?.check().await? else {
        return Ok(false);
    };
    let octets = update.download(|_, _| {}, || {}).await?;
    *app.state::<EtatMiseAJour>().prete.lock().unwrap() = Some((update, octets));
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
