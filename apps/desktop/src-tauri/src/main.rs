#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
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

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Pas d'icône dans le Dock : l'application vit dans la barre des menus.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let basculer = MenuItem::with_id(app, "basculer", "Afficher / cacher", true, None::<&str>)?;
            let quitter = MenuItem::with_id(app, "quitter", "Quitter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&basculer, &quitter])?;

            let icone = app
                .tray_by_id("main")
                .expect("l'icône de barre des menus doit être déclarée dans tauri.conf.json");
            icone.set_menu(Some(menu))?;
            icone.set_show_menu_on_left_click(false)?;
            icone.on_menu_event(|app, evenement| match evenement.id.as_ref() {
                "basculer" => basculer_fenetre(app),
                "quitter" => app.exit(0),
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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Tiny Shrooms");
}
