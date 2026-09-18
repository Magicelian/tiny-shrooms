//! Pastille sur l'icône de la barre des menus tant qu'un problème dure au village (faim, froid…).
//!
//! L'icône est un modèle monochrome que macOS teinte selon la barre des menus : la pastille l'est
//! donc aussi, pleine et détourée d'un anneau vide pour se détacher du champignon.

use tauri::{image::Image, AppHandle};

const ICONE: &[u8] = include_bytes!("../icons/barre-menus.png");
/// Côté d'un pixel du dessin, en pixels de l'image (dessinée à 18 px, fournie ×2).
const PIXEL: u32 = 2;

/// Le frontend signale qu'un problème dure (ou plus aucun) ; il fournit l'infobulle traduite.
#[tauri::command]
pub fn signaler_problemes(app: AppHandle, actif: bool, infobulle: String) -> Result<(), String> {
    let icone = app.tray_by_id("main").ok_or("icône de barre des menus absente")?;
    let image = Image::from_bytes(ICONE).map_err(|e| e.to_string())?;
    let image = if actif { avec_pastille(image) } else { image };
    icone.set_icon(Some(image)).map_err(|e| e.to_string())?;
    icone.set_icon_as_template(true).map_err(|e| e.to_string())?;
    icone.set_tooltip(Some(infobulle)).map_err(|e| e.to_string())?;
    Ok(())
}

/// Pastille ronde en pixels dans le coin haut droit, entourée d'un anneau transparent.
fn avec_pastille(image: Image<'_>) -> Image<'static> {
    let (largeur, hauteur) = (image.width(), image.height());
    let mut pixels = image.rgba().to_vec();
    let colonnes = largeur / PIXEL;
    let (cx, cy) = (colonnes as i32 - 3, 2);
    for y in 0..hauteur {
        for x in 0..largeur {
            let (dx, dy) = ((x / PIXEL) as i32 - cx, (y / PIXEL) as i32 - cy);
            let couleur = match dx * dx + dy * dy {
                0..=5 => [0, 0, 0, 0xff],
                6..=10 => [0, 0, 0, 0],
                _ => continue,
            };
            let i = ((y * largeur + x) * 4) as usize;
            pixels[i..i + 4].copy_from_slice(&couleur);
        }
    }
    Image::new_owned(pixels, largeur, hauteur)
}
