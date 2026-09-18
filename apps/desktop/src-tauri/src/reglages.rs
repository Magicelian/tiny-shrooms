//! Réglages gardés à part de la partie : verrouillage, dernière position, taille, son et langue.
//! Tous se changent depuis le menu de l'icône ; le verrouillage aussi depuis l'interface, les deux restent d'accord.

use std::fs;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{CheckMenuItem, MenuItem, Submenu},
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, Wry,
};

/// Côtés proposés pour la fenêtre, en pixels logiques. Le jeu est dessiné pour 320 : les autres
/// tailles ne montrent pas plus d'île, elles grossissent ses pixels. `ECRAN` (la géante) prend
/// le plus grand carré que laisse l'écran. La même liste vit dans `packages/ui/src/index.tsx`.
pub const TAILLES: [u32; 3] = [320, 640, ECRAN];
/// Taille « tout l'écran » : la fenêtre remplit la hauteur utile (barre des menus et Dock exclus).
pub const ECRAN: u32 = 0;

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
    /// Côté de la fenêtre, parmi `TAILLES` ; absent, la petite. 960 (l'ancienne géante) vaut `ECRAN`.
    pub taille: Option<u32>,
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

    /// Taille retenue, ramenée à la petite si le fichier en porte une qu'on ne propose plus.
    pub fn taille_effective(&self) -> u32 {
        match self.taille {
            Some(960) => ECRAN,
            Some(t) if TAILLES.contains(&t) => t,
            _ => TAILLES[0],
        }
    }
}

/// Libellés du menu de l'icône, dans la langue du jeu.
pub fn libelle(langue: &str, cle: &str) -> &'static str {
    match (langue, cle) {
        ("fr", "basculer") => "Afficher / cacher",
        ("fr", "verrouiller") => "Verrouiller la position",
        ("fr", "taille") => "Taille de la fenêtre",
        ("fr", "taille-0") => "Petite",
        ("fr", "taille-1") => "Grande",
        ("fr", "taille-2") => "Géante",
        ("fr", "son") => "Son",
        ("fr", "langue") => "Langue",
        ("fr", "quitter") => "Quitter",
        (_, "basculer") => "Show / hide",
        (_, "verrouiller") => "Lock position",
        (_, "taille") => "Window size",
        (_, "taille-0") => "Small",
        (_, "taille-1") => "Large",
        (_, "taille-2") => "Huge",
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
    pub taille: Submenu<Wry>,
    /// Une case par entrée de `TAILLES`, dans le même ordre.
    pub tailles: Vec<CheckMenuItem<Wry>>,
    pub son: CheckMenuItem<Wry>,
    pub langue: Submenu<Wry>,
    pub francais: CheckMenuItem<Wry>,
    pub anglais: CheckMenuItem<Wry>,
    pub quitter: MenuItem<Wry>,
    /// État des mises à jour ; cliquable seulement quand une version est prête (texte : `mises_a_jour`).
    pub mettre_a_jour: MenuItem<Wry>,
}

impl MenuReglages {
    fn traduire(&self, langue: &str) {
        let _ = self.basculer.set_text(libelle(langue, "basculer"));
        let _ = self.verrouiller.set_text(libelle(langue, "verrouiller"));
        let _ = self.taille.set_text(libelle(langue, "taille"));
        for (rang, case) in self.tailles.iter().enumerate() {
            let _ = case.set_text(libelle(langue, &format!("taille-{rang}")));
        }
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
        // Une grande fenêtre replacée près d'un bord déborderait : on la ramène.
        garder_visible(&fenetre);
    }
}

/// Ramène la fenêtre sur son écran quand elle vient de grandir au-delà du bord.
fn garder_visible(fenetre: &tauri::WebviewWindow) {
    let (Ok(coin), Ok(taille), Ok(Some(ecran))) = (fenetre.outer_position(), fenetre.outer_size(), fenetre.current_monitor())
    else {
        return;
    };
    let (p, t) = (ecran.position(), ecran.size());
    let x = coin.x.min(p.x + t.width as i32 - taille.width as i32).max(p.x);
    let y = coin.y.min(p.y + t.height as i32 - taille.height as i32).max(p.y);
    if (x, y) != (coin.x, coin.y) {
        let _ = fenetre.set_position(PhysicalPosition::new(x, y));
    }
}

/// Donne à la fenêtre le côté demandé (elle reste carrée), sans la laisser déborder de l'écran.
pub fn redimensionner(app: &AppHandle, taille: u32) {
    let Some(fenetre) = app.get_webview_window("main") else { return };
    if taille == ECRAN {
        remplir_ecran(&fenetre);
        return;
    }
    let _ = fenetre.set_size(LogicalSize::new(taille, taille));
    garder_visible(&fenetre);
}

/// Plus grand carré que laisse la zone utile de l'écran de la fenêtre, centré sur celle-ci.
fn remplir_ecran(fenetre: &tauri::WebviewWindow) {
    let Some(ecran) = fenetre.current_monitor().ok().flatten().or_else(|| fenetre.primary_monitor().ok().flatten())
    else {
        return;
    };
    let zone = ecran.work_area();
    let cote = zone.size.width.min(zone.size.height);
    let _ = fenetre.set_size(PhysicalSize::new(cote, cote));
    let _ = fenetre.set_position(PhysicalPosition::new(
        zone.position.x + (zone.size.width - cote) as i32 / 2,
        zone.position.y + (zone.size.height - cote) as i32 / 2,
    ));
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

/// Taille choisie dans le menu de l'icône ou dans les paramètres : la fenêtre grandit,
/// le frontend s'en aperçoit tout seul par l'événement `resize` de la vue web.
pub fn appliquer_taille(app: &AppHandle, taille: u32) {
    let etat = app.state::<EtatReglages>();
    for (case, cote) in etat.menu.tailles.iter().zip(TAILLES) {
        let _ = case.set_checked(cote == taille);
    }
    etat.reglages.lock().unwrap().taille = Some(taille);
    redimensionner(app, taille);
    enregistrer(app);
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
    crate::mises_a_jour::afficher(app);
    enregistrer(app);
    let _ = app.emit("langue", langue);
}

/// Son réglé depuis le menu de démarrage : même chemin que le menu de l'icône.
#[tauri::command]
pub fn regler_son(app: AppHandle, son: bool) {
    appliquer_son(&app, son);
}

/// Taille réglée depuis le menu de démarrage.
#[tauri::command]
pub fn regler_taille(app: AppHandle, taille: u32) {
    if TAILLES.contains(&taille) {
        appliquer_taille(&app, taille);
    }
}

/// Langue choisie depuis le menu de démarrage.
#[tauri::command]
pub fn regler_langue(app: AppHandle, langue: String) {
    appliquer_langue(&app, if langue == "fr" { "fr" } else { "en" });
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
    for (case, cote) in menu.tailles.iter().zip(TAILLES) {
        let _ = case.set_checked(cote == reglages.taille_effective());
    }
    let _ = menu.son.set_checked(reglages.son);
    menu.traduire(&reglages.langue_effective());
}
