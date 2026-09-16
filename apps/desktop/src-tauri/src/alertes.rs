//! Alertes fenêtre cachée : point sur l'icône de la barre des menus, et pouls qui réveille le moteur.
//!
//! macOS gèle la vue web cachée ; le pouls lui demande régulièrement de rattraper le temps écoulé,
//! pour qu'un visiteur arrivé pendant ce temps soit signalé sans attendre le retour de la fenêtre.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{image::Image, AppHandle, Emitter, Manager};

const ICONE: &[u8] = include_bytes!("../icons/32x32.png");
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

/// Le frontend signale qu'un visiteur attend (ou plus personne) ; il fournit l'infobulle traduite.
#[tauri::command]
pub fn signaler_alerte(app: AppHandle, alerte: bool, infobulle: String) -> Result<(), String> {
    let icone = app.tray_by_id("main").ok_or("icône de barre des menus absente")?;
    let image = Image::from_bytes(ICONE).map_err(|e| e.to_string())?;
    let image = if alerte { avec_point(image) } else { image };
    icone.set_icon(Some(image)).map_err(|e| e.to_string())?;
    icone.set_tooltip(Some(infobulle)).map_err(|e| e.to_string())?;
    journal(format!("alerte {alerte}"));
    Ok(())
}

/// Trace de mise au point, horodatée, en développement seulement.
fn journal(message: String) {
    if cfg!(debug_assertions) {
        let secondes = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs()) % 86_400;
        println!("[{:02}:{:02}:{:02} UTC] {message}", secondes / 3600, secondes / 60 % 60, secondes % 60);
    }
}

/// Pastille rouge cerclée de blanc dans le coin haut droit.
fn avec_point(image: Image<'_>) -> Image<'static> {
    let (largeur, hauteur) = (image.width(), image.height());
    let mut pixels = image.rgba().to_vec();
    let rayon = largeur as f32 * 0.22;
    let (cx, cy) = (largeur as f32 - rayon - 0.5, rayon + 0.5);
    for y in 0..hauteur {
        for x in 0..largeur {
            let d = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
            let couleur = if d <= rayon - 1.5 {
                [0xe5, 0x3b, 0x2e, 0xff]
            } else if d <= rayon {
                [0xff, 0xff, 0xff, 0xff]
            } else {
                continue;
            };
            let i = ((y * largeur + x) * 4) as usize;
            pixels[i..i + 4].copy_from_slice(&couleur);
        }
    }
    Image::new_owned(pixels, largeur, hauteur)
}
