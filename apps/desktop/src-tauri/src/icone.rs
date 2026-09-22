//! Clics sur l'icône de la barre des menus : le clic gauche montre ou cache la fenêtre, le clic droit
//! (ou à deux doigts, ou Ctrl + clic) ouvre le menu.
//!
//! Sur les macOS récents, une icône à laquelle un menu est attaché l'ouvre à tout clic, sans que
//! l'application ne voie l'événement (`set_show_menu_on_left_click(false)` n'y change rien). Le menu
//! n'est donc attaché que le temps de l'ouvrir, au clic droit ; les clics passent par un moniteur local.

use tauri::{menu::Menu, AppHandle, Wry};

#[cfg(target_os = "macos")]
pub fn surveiller(app: AppHandle, menu: Menu<Wry>, basculer: fn(&AppHandle)) {
    use std::ptr::NonNull;

    use block2::RcBlock;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSEvent, NSEventMask, NSEventModifierFlags, NSEventType};

    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let bloc = RcBlock::new(move |evenement: NonNull<NSEvent>| -> *mut NSEvent {
        let evenement_ref = unsafe { evenement.as_ref() };
        // La seule fenêtre de barre d'état de l'application est celle de l'icône.
        let sur_icone = evenement_ref
            .window(mtm)
            .is_some_and(|fenetre| fenetre.class().name().to_bytes() == b"NSStatusBarWindow");
        if !sur_icone {
            return evenement.as_ptr();
        }
        let droit = evenement_ref.r#type() == NSEventType::RightMouseDown
            || evenement_ref.modifierFlags().contains(NSEventModifierFlags::Control);
        if droit {
            ouvrir_menu(&app, &menu);
        } else {
            basculer(&app);
        }
        // Avalé : `tray-icon` ne le reçoit pas.
        std::ptr::null_mut()
    });
    let masque = NSEventMask::LeftMouseDown | NSEventMask::RightMouseDown;
    let moniteur = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(masque, &bloc) };
    // Le moniteur vit aussi longtemps que l'application.
    std::mem::forget(moniteur);
}

/// Attache le menu, le fait ouvrir par l'icône puis le détache : `performClick` rend la main à sa fermeture.
#[cfg(target_os = "macos")]
fn ouvrir_menu(app: &AppHandle, menu: &Menu<Wry>) {
    let Some(icone) = app.tray_by_id("main") else {
        return;
    };
    let _ = icone.set_menu(Some(menu.clone()));
    let _ = icone.with_inner_tray_icon(|icone| {
        let (Some(mtm), Some(element)) = (objc2::MainThreadMarker::new(), icone.ns_status_item()) else {
            return;
        };
        if let Some(bouton) = element.button(mtm) {
            unsafe { bouton.performClick(None) };
        }
    });
    let _ = icone.set_menu(None::<Menu<Wry>>);
}

#[cfg(not(target_os = "macos"))]
pub fn surveiller(_app: AppHandle, _menu: Menu<Wry>, _basculer: fn(&AppHandle)) {}
