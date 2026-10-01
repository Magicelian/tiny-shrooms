//! Fichiers de sauvegarde : un principal et trois copies de secours en rotation.
//! Le contenu n'est pas interprété ici ; c'est le moteur qui juge s'il est lisible.

use std::fs;
use std::io::{self, ErrorKind, Write};
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

const COPIES_DE_SECOURS: usize = 3;

/// Les copies ne tournent qu'à cet intervalle : à chaque écriture (toutes les 30 s), elles ne
/// remontaient qu'à une minute et demie, trop peu pour rattraper une partie perdue.
const ECART_DES_COPIES: Duration = Duration::from_secs(10 * 60);

/// Sous Windows, un antivirus ou l'indexation tient parfois un fichier ouvert un court instant :
/// on réessaie avant d'abandonner. Un fichier absent n'est pas réessayé.
fn reessayer<T>(mut operation: impl FnMut() -> io::Result<T>) -> io::Result<T> {
    for essai in 1..=4 {
        match operation() {
            Err(e) if e.kind() != ErrorKind::NotFound => thread::sleep(Duration::from_millis(50 * essai)),
            resultat => return resultat,
        }
    }
    operation()
}

fn dossier(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

/// `partie.json` pour le rang 0, puis `partie.1.json` à `partie.3.json`.
fn fichier(dossier: &PathBuf, rang: usize) -> PathBuf {
    match rang {
        0 => dossier.join("partie.json"),
        n => dossier.join(format!("partie.{n}.json")),
    }
}

/// Tous les fichiers présents, du plus récent au plus ancien.
#[tauri::command]
pub fn lire_sauvegardes(app: AppHandle) -> Result<Vec<String>, String> {
    let dossier = dossier(&app)?;
    Ok((0..=COPIES_DE_SECOURS)
        .filter_map(|rang| reessayer(|| fs::read(fichier(&dossier, rang))).ok())
        .map(|octets| String::from_utf8_lossy(&octets).into_owned())
        .collect())
}

/// Écrit d'abord un fichier temporaire, puis décale les copies si la plus récente date de plus de
/// dix minutes : une coupure en cours d'écriture laisse toujours au moins une sauvegarde entière.
#[tauri::command]
pub fn ecrire_sauvegarde(app: AppHandle, contenu: String) -> Result<(), String> {
    let dossier = dossier(&app)?;
    fs::create_dir_all(&dossier).map_err(|e| e.to_string())?;
    let temporaire = dossier.join("partie.tmp");
    reessayer(|| {
        let mut f = fs::File::create(&temporaire)?;
        f.write_all(contenu.as_bytes())?;
        f.sync_all()
    })
    .map_err(|e| e.to_string())?;
    let copie_recente = fs::metadata(fichier(&dossier, 1))
        .and_then(|m| m.modified())
        .ok()
        .and_then(|date| date.elapsed().ok())
        .is_some_and(|age| age < ECART_DES_COPIES);
    if !copie_recente {
        for rang in (0..COPIES_DE_SECOURS).rev() {
            let source = fichier(&dossier, rang);
            if source.exists() {
                reessayer(|| fs::rename(&source, fichier(&dossier, rang + 1))).map_err(|e| e.to_string())?;
            }
        }
    }
    reessayer(|| fs::rename(&temporaire, fichier(&dossier, 0))).map_err(|e| e.to_string())
}

/// Met de côté les fichiers d'une partie d'avant la réorientation (`partie.v3.json`, `partie.v3.1.json`…),
/// pour que la nouvelle partie ne les écrase pas. Rien n'est supprimé : une archive déjà présente
/// fait prendre au fichier un nom horodaté.
#[tauri::command]
pub fn archiver_sauvegardes(app: AppHandle) -> Result<(), String> {
    let dossier = dossier(&app)?;
    for rang in 0..=COPIES_DE_SECOURS {
        let source = fichier(&dossier, rang);
        if !source.exists() {
            continue;
        }
        let nom = match rang {
            0 => "partie.v3".to_string(),
            n => format!("partie.v3.{n}"),
        };
        let mut archive = dossier.join(format!("{nom}.json"));
        if archive.exists() {
            let secondes = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
            archive = dossier.join(format!("{nom}.{secondes}.json"));
        }
        fs::rename(&source, &archive).map_err(|e| e.to_string())?;
    }
    Ok(())
}
