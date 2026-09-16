//! Pouls fenêtre cachée : macOS gèle la vue web cachée ; le pouls lui demande régulièrement
//! de rattraper le temps écoulé, pour que la simulation ne prenne pas de retard.

use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

const INTERVALLE_POULS: Duration = Duration::from_secs(20);

pub fn battre_le_pouls(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(INTERVALLE_POULS);
        let Some(fenetre) = app.get_webview_window("main") else {
            continue;
        };
        if fenetre.is_visible().unwrap_or(true) {
            continue;
        }
        let _ = fenetre.emit("pouls", ());
    });
}
