//! Réglages gardés à part de la partie : verrouillage, dernière position, son et langue.
//! Tous se changent depuis le menu de l'icône ; le verrouillage aussi depuis l'interface, les deux restent d'accord.

use std::fs;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{CheckMenuItem, MenuItem, Submenu},
    AppHandle, Emitter, Manager, PhysicalPosition, Wry,
};

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Reglages {
    pub verrouillee: bool,
    /// Coin haut-gauche de la fenêtre, en pixels physiques.
    pub position: Option<(i32, i32)>,
    /// Son coupé tant qu'on ne l'a pas allumé : faux au premier lancement.
    pub son: bool,
    /// `fr` ou `en` ; absente, on suit la langue du système.
    pub langue: Option<String>,
}

/// Langue du système si le jeu la parle, l'anglais sinon.
pub fn langue_systeme() -> String {
    let code = sys_locale::get_locale().unwrap_or_default().to_lowercase();
    if code.starts_with("fr") { "fr" } else { "en" }.to_string()
}

impl Reglages {
    pub fn langue_effective(&self) -> String {
        self.langue.clone().unwrap_or_else(langue_systeme)
    }
}

/// Libellés du menu de l'icône, dans la langue du jeu.
pub fn libelle(langue: &str, cle: &str) -> &'static str {
    match (langue, cle) {
        ("fr", "basculer") => "Afficher / cacher",
        ("fr", "verrouiller") => "Verrouiller la position",
        ("fr", "son") => "Son",
        ("fr", "langue") => "Langue",
        ("fr", "quitter") => "Quitter",
        (_, "basculer") => "Show / hide",
        (_, "verrouiller") => "Lock position",
        (_, "son") => "Sound",
        (_, "langue") => "Language",
        (_, "quitter") => "Quit",
        _ => "",
    }
}

/// Entrées du menu de l'icône qui reflètent les réglages ou changent de libellé avec la langue.
pub struct MenuReglages {
    pub basculer: MenuItem<Wry>,
    pub verrouiller: CheckMenuItem<Wry>,
    pub son: CheckMenuItem<Wry>,
    pub langue: Submenu<Wry>,
    pub francais: CheckMenuItem<Wry>,
    pub anglais: CheckMenuItem<Wry>,
    pub quitter: MenuItem<Wry>,
}

impl MenuReglages {
    fn traduire(&self, langue: &str) {
        let _ = self.basculer.set_text(libelle(langue, "basculer"));
        let _ = self.verrouiller.set_text(libelle(langue, "verrouiller"));
        let _ = self.son.set_text(libelle(langue, "son"));
        let _ = self.langue.set_text(libelle(langue, "langue"));
        let _ = self.quitter.set_text(libelle(langue, "quitter"));
        let _ = self.francais.set_checked(langue == "fr");
        let _ = self.anglais.set_checked(langue == "en");
    }
}

/// État partagé : les réglages et le menu de l'icône qui les reflète.
pub struct EtatReglages {
    pub reglages: Mutex<Reglages>,
    pub menu: MenuReglages,
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
    let _ = etat.menu.verrouiller.set_checked(verrouillee);
    etat.reglages.lock().unwrap().verrouillee = verrouillee;
    enregistrer(app);
    let _ = app.emit("verrouillage", verrouillee);
}

/// Son allumé ou coupé depuis le menu.
pub fn appliquer_son(app: &AppHandle, son: bool) {
    let etat = app.state::<EtatReglages>();
    let _ = etat.menu.son.set_checked(son);
    etat.reglages.lock().unwrap().son = son;
    enregistrer(app);
    let _ = app.emit("son", son);
}

/// Langue choisie dans le menu : le menu se traduit, le frontend aussi.
pub fn appliquer_langue(app: &AppHandle, langue: &str) {
    let etat = app.state::<EtatReglages>();
    etat.menu.traduire(langue);
    etat.reglages.lock().unwrap().langue = Some(langue.to_string());
    enregistrer(app);
    let _ = app.emit("langue", langue);
}

/// Réglages vus du frontend : la langue y est toujours renseignée.
#[tauri::command]
pub fn lire_reglages(app: AppHandle) -> Reglages {
    let mut reglages = app.state::<EtatReglages>().reglages.lock().unwrap().clone();
    reglages.langue = Some(reglages.langue_effective());
    reglages
}

/// Prépare le menu dans la langue des réglages.
pub fn preparer_menu(menu: &MenuReglages, reglages: &Reglages) {
    let _ = menu.verrouiller.set_checked(reglages.verrouillee);
    let _ = menu.son.set_checked(reglages.son);
    menu.traduire(&reglages.langue_effective());
}
