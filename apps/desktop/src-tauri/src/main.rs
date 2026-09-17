#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod mises_a_jour;
mod pouls;
mod reglages;
mod sauvegarde;
mod veille;

use std::time::Duration;

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

/// Cache ou affiche la fenêtre, et prévient le frontend pour qu'il coupe ou reprenne le rendu.
fn basculer_fenetre(app: &AppHandle) {
    let Some(fenetre) = app.get_webview_window("main") else {
        return;
    };
    if fenetre.is_visible().unwrap_or(false) {
        let _ = fenetre.emit("fenetre-cachee", ());
        let _ = fenetre.hide();
    } else {
        let _ = fenetre.show();
        let _ = fenetre.set_focus();
        let _ = fenetre.emit("fenetre-affichee", ());
    }
}

/// Une fenêtre sans le focus ne reçoit pas les mouvements de souris sous macOS :
/// on surveille donc le curseur ici et on signale au frontend quand il entre ou sort.
fn surveiller_survol(app: AppHandle) {
    std::thread::spawn(move || {
        let mut dedans = false;
        loop {
            std::thread::sleep(Duration::from_millis(100));
            let Some(fenetre) = app.get_webview_window("main") else {
                continue;
            };
            let maintenant = fenetre.is_visible().unwrap_or(false) && curseur_dans(&app, &fenetre);
            if maintenant != dedans {
                dedans = maintenant;
                let _ = fenetre.emit("survol", dedans);
            }
        }
    });
}

fn curseur_dans(app: &AppHandle, fenetre: &tauri::WebviewWindow) -> bool {
    let (Ok(curseur), Ok(position), Ok(taille)) = (app.cursor_position(), fenetre.outer_position(), fenetre.outer_size())
    else {
        return false;
    };
    let (x, y) = (curseur.x - position.x as f64, curseur.y - position.y as f64);
    x >= 0.0 && y >= 0.0 && x < taille.width as f64 && y < taille.height as f64
}

/// Demande au frontend d'écrire la partie avant de quitter ; il rappelle `quitter` une fois fait.
/// Filet de sécurité : on quitte de toute façon au bout de quelques secondes.
fn demander_fermeture(app: &AppHandle) {
    match app.get_webview_window("main") {
        Some(fenetre) if fenetre.emit("fermeture-demandee", ()).is_ok() => {
            let app = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(3));
                sortir(&app);
            });
        }
        _ => sortir(app),
    }
}

/// Dernière étape : réglages écrits, puis mise à jour installée si elle a été demandée.
fn sortir(app: &AppHandle) {
    reglages::enregistrer(app);
    mises_a_jour::installer_si_demande(app);
    app.exit(0);
}

#[tauri::command]
fn quitter(app: AppHandle) {
    sortir(&app);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(mises_a_jour::EtatMiseAJour::default())
        .setup(|app| {
            // Pas d'icône dans le Dock : l'application vit dans la barre des menus.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let lus = reglages::lire(app.handle());
            let entree = |id: &str| MenuItem::with_id(app, id, id, true, None::<&str>);
            let case = |id: &str, texte: &str| CheckMenuItem::with_id(app, id, texte, true, false, None::<&str>);
            let francais = case("langue-fr", "Français")?;
            let anglais = case("langue-en", "English")?;
            let tailles = reglages::TAILLES
                .iter()
                .map(|cote| case(&format!("taille-{cote}"), ""))
                .collect::<Result<Vec<_>, _>>()?;
            let entrees = reglages::MenuReglages {
                basculer: entree("basculer")?,
                verrouiller: case("verrouiller", "")?,
                taille: Submenu::with_id_and_items(
                    app,
                    "taille",
                    "",
                    true,
                    &tailles.iter().map(|c| c as &dyn tauri::menu::IsMenuItem<_>).collect::<Vec<_>>(),
                )?,
                tailles,
                son: case("son", "")?,
                langue: Submenu::with_id_and_items(app, "langue", "", true, &[&francais, &anglais])?,
                francais,
                anglais,
                quitter: entree("quitter")?,
                mettre_a_jour: entree("mettre-a-jour")?,
            };
            reglages::preparer_menu(&entrees, &lus);
            let separation = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(
                app,
                &[
                    &entrees.basculer,
                    &entrees.verrouiller,
                    &entrees.taille,
                    &separation,
                    &entrees.son,
                    &entrees.langue,
                    &PredefinedMenuItem::separator(app)?,
                    &entrees.mettre_a_jour,
                    &entrees.quitter,
                ],
            )?;
            reglages::redimensionner(app.handle(), lus.taille_effective());
            reglages::restaurer_position(app.handle(), &lus);
            app.manage(reglages::EtatReglages {
                reglages: std::sync::Mutex::new(lus),
                menu: entrees,
            });

            let icone = app
                .tray_by_id("main")
                .expect("l'icône de barre des menus doit être déclarée dans tauri.conf.json");
            icone.set_menu(Some(menu))?;
            icone.set_show_menu_on_left_click(false)?;
            icone.on_menu_event(|app, evenement| match evenement.id.as_ref() {
                "basculer" => basculer_fenetre(app),
                "verrouiller" => {
                    let coche = app.state::<reglages::EtatReglages>().menu.verrouiller.is_checked().unwrap_or(false);
                    reglages::appliquer_verrouillage(app, coche);
                }
                "son" => {
                    let coche = app.state::<reglages::EtatReglages>().menu.son.is_checked().unwrap_or(false);
                    reglages::appliquer_son(app, coche);
                }
                taille if taille.starts_with("taille-") => {
                    if let Ok(cote) = taille["taille-".len()..].parse() {
                        reglages::appliquer_taille(app, cote);
                    }
                }
                "langue-fr" => reglages::appliquer_langue(app, "fr"),
                "langue-en" => reglages::appliquer_langue(app, "en"),
                "quitter" => demander_fermeture(app),
                "mettre-a-jour" => {
                    mises_a_jour::demander(app);
                    demander_fermeture(app);
                }
                _ => {}
            });
            icone.on_tray_icon_event(|icone, evenement| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = evenement
                {
                    basculer_fenetre(icone.app_handle());
                }
            });
            mises_a_jour::surveiller(app.handle().clone());
            surveiller_survol(app.handle().clone());
            veille::surveiller(app.handle().clone());
            pouls::battre_le_pouls(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sauvegarde::lire_sauvegardes,
            sauvegarde::ecrire_sauvegarde,
            sauvegarde::archiver_sauvegardes,
            reglages::lire_reglages,
            reglages::regler_taille,
            reglages::regler_son,
            reglages::regler_langue,
            quitter
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Tiny Shrooms");
}
