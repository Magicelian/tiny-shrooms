//! Mise en veille et réveil du Mac, relayés au frontend : seule cause de pause du jeu.

use tauri::AppHandle;

#[cfg(target_os = "macos")]
pub fn surveiller(app: AppHandle) {
    use std::ptr::NonNull;
    use std::time::{SystemTime, UNIX_EPOCH};

    use block2::RcBlock;
    use objc2_app_kit::{NSWorkspace, NSWorkspaceDidWakeNotification, NSWorkspaceWillSleepNotification};
    use objc2_foundation::NSNotification;
    use tauri::{Emitter, Manager};

    let emettre = move |evenement: &str| {
        // L'instant accompagne l'événement : le Worker peut être gelé avant de le lire.
        let maintenant = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0.0, |d| d.as_millis() as f64);
        if let Some(fenetre) = app.get_webview_window("main") {
            let _ = fenetre.emit(evenement, maintenant);
        }
    };
    let centre = NSWorkspace::sharedWorkspace().notificationCenter();
    for (nom, evenement) in unsafe {
        [(NSWorkspaceWillSleepNotification, "veille"), (NSWorkspaceDidWakeNotification, "reveil")]
    } {
        let emettre = emettre.clone();
        let bloc = RcBlock::new(move |_: NonNull<NSNotification>| emettre(evenement));
        let jeton = unsafe { centre.addObserverForName_object_queue_usingBlock(Some(nom), None, None, &bloc) };
        // L'observateur vit aussi longtemps que l'application.
        std::mem::forget(jeton);
    }
}

#[cfg(not(target_os = "macos"))]
pub fn surveiller(_app: AppHandle) {}
