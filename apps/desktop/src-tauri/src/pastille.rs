//! Marques sur l'icône de la barre des menus : pastille ronde en haut à droite tant qu'un problème dure au
//! village (faim, froid…), flèche vers le haut en haut à gauche quand une mise à jour est prête.
//!
//! L'icône est un modèle monochrome que macOS teinte selon la barre des menus : les marques le sont donc
//! aussi, pleines et détourées d'un anneau vide pour se détacher du champignon.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{image::Image, AppHandle, Manager};

const ICONE: &[u8] = include_bytes!("../icons/barre-menus.png");
/// Côté d'un pixel du dessin, en pixels de l'image (dessinée à 18 px, fournie ×2).
const PIXEL: u32 = 2;

#[derive(Default)]
pub struct EtatPastille {
    probleme: AtomicBool,
    mise_a_jour: AtomicBool,
}

/// Le frontend signale qu'un problème dure (ou plus aucun) ; il fournit l'infobulle traduite.
#[tauri::command]
pub fn signaler_problemes(app: AppHandle, actif: bool, infobulle: String) -> Result<(), String> {
    app.state::<EtatPastille>().probleme.store(actif, Ordering::SeqCst);
    redessiner(&app)?;
    let icone = app.tray_by_id("main").ok_or("icône de barre des menus absente")?;
    icone.set_tooltip(Some(infobulle)).map_err(|e| e.to_string())
}

/// Une mise à jour est téléchargée : flèche jusqu'au redémarrage.
pub fn signaler_mise_a_jour(app: &AppHandle) {
    app.state::<EtatPastille>().mise_a_jour.store(true, Ordering::SeqCst);
    if let Err(erreur) = redessiner(app) {
        eprintln!("pastille : {erreur}");
    }
}

/// Redessine l'icône à partir du modèle, avec la pastille et la flèche qui s'appliquent.
fn redessiner(app: &AppHandle) -> Result<(), String> {
    let etat = app.state::<EtatPastille>();
    let icone = app.tray_by_id("main").ok_or("icône de barre des menus absente")?;
    let mut image = Image::from_bytes(ICONE).map_err(|e| e.to_string())?.to_owned();
    if etat.probleme.load(Ordering::SeqCst) {
        image = dessiner(image, est_pastille);
    }
    if etat.mise_a_jour.load(Ordering::SeqCst) {
        image = dessiner(image, est_fleche);
    }
    icone.set_icon(Some(image)).map_err(|e| e.to_string())?;
    icone.set_icon_as_template(true).map_err(|e| e.to_string())
}

/// Pastille ronde dans le coin haut droit (`colonnes` : largeur du dessin, en pixels du dessin).
fn est_pastille(x: i32, y: i32, colonnes: i32) -> bool {
    let (dx, dy) = (x - (colonnes - 3), y - 2);
    dx * dx + dy * dy <= 5
}

/// Flèche vers le haut dans le coin haut gauche, comme celles des bâtiments améliorables dans le jeu.
fn est_fleche(x: i32, y: i32, _colonnes: i32) -> bool {
    match y {
        0 => x == 2,
        1 => (1..=3).contains(&x),
        2 => (0..=4).contains(&x),
        3 | 4 => x == 2,
        _ => false,
    }
}

/// Peint la forme en plein et vide un anneau d'un pixel autour, pour la détacher du champignon.
fn dessiner(image: Image<'_>, forme: fn(i32, i32, i32) -> bool) -> Image<'static> {
    let (largeur, hauteur) = (image.width(), image.height());
    let mut pixels = image.rgba().to_vec();
    let colonnes = (largeur / PIXEL) as i32;
    for y in 0..hauteur {
        for x in 0..largeur {
            let (px, py) = ((x / PIXEL) as i32, (y / PIXEL) as i32);
            let couleur = if forme(px, py, colonnes) {
                [0, 0, 0, 0xff]
            } else if (-1..=1).any(|dy| (-1..=1).any(|dx| forme(px + dx, py + dy, colonnes))) {
                [0, 0, 0, 0]
            } else {
                continue;
            };
            let i = ((y * largeur + x) * 4) as usize;
            pixels[i..i + 4].copy_from_slice(&couleur);
        }
    }
    Image::new_owned(pixels, largeur, hauteur)
}

