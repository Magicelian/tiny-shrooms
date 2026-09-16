//! Réglages de la fenêtre, gardés à part de la partie : verrouillage et dernière position.
//! Le verrouillage se change depuis le menu de l'icône comme depuis l'interface ; les deux restent d'accord.

use std::fs;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{menu::CheckMenuItem, AppHandle, Emitter, Manager, PhysicalPosition, Wry};

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Reglages {
    pub verrouillee: bool,
    /// Coin haut-gauche de la fenêtre, en pixels physiques.
    pub position: Option<(i32, i32)>,
}

/// État partagé : les réglages et la case du menu de l'icône qui les reflète.
pub struct EtatReglages {
    pub reglages: Mutex<Reglages>,
    pub case_menu: CheckMenuItem<Wry>,
}

fn fichier(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("reglages.json"))
}

pub fn lire(app: &AppHandle) -> Reglages {
    fichier(app)
        .and_then(|f| fs::read_to_string(f).ok())
        .and_then(|texte| serde_json::from_str(&texte).ok())
        .unwrap_or_default()
}

fn ecrire(app: &AppHandle, reglages: &Reglages) {
    let Some(fichier) = fichier(app) else { return };
    if let Some(dossier) = fichier.parent() {
        let _ = fs::create_dir_all(dossier);
    }
    if let Ok(texte) = serde_json::to_string_pretty(reglages) {
        let _ = fs::write(fichier, texte);
    }
}

/// Replace la fenêtre là où on l'avait laissée, si cet endroit est encore sur un écran.
pub fn restaurer_position(app: &AppHandle, reglages: &Reglages) {
    let (Some((x, y)), Some(fenetre)) = (reglages.position, app.get_webview_window("main")) else {
        return;
    };
    let visible = fenetre.available_monitors().unwrap_or_default().iter().any(|ecran| {
        let (p, t) = (ecran.position(), ecran.size());
        x >= p.x && y >= p.y && x < p.x + t.width as i32 && y < p.y + t.height as i32
    });
    if visible {
        let _ = fenetre.set_position(PhysicalPosition::new(x, y));
    }
}

/// Retient la position courante de la fenêtre et écrit les réglages (appelé avant de quitter).
pub fn enregistrer(app: &AppHandle) {
    let etat = app.state::<EtatReglages>();
    let mut reglages = etat.reglages.lock().unwrap();
    if let Some(p) = app.get_webview_window("main").and_then(|f| f.outer_position().ok()) {
        reglages.position = Some((p.x, p.y));
    }
    ecrire(app, &reglages);
}

/// Applique un verrouillage venu de l'interface ou du menu, puis prévient l'autre côté.
pub fn appliquer_verrouillage(app: &AppHandle, verrouillee: bool) {
    let etat = app.state::<EtatReglages>();
    let _ = etat.case_menu.set_checked(verrouillee);
    etat.reglages.lock().unwrap().verrouillee = verrouillee;
    enregistrer(app);
    let _ = app.emit("verrouillage", verrouillee);
}

#[tauri::command]
pub fn lire_reglages(app: AppHandle) -> Reglages {
    app.state::<EtatReglages>().reglages.lock().unwrap().clone()
}
