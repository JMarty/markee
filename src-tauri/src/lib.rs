use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager, State};

/// Fájlfigyelő: a szülőmappákat figyeljük (nem rekurzívan), mert sok szerkesztő
/// átnevezéssel ment, és ilyenkor a fájlra tett figyelő elveszne.
struct WatchState {
    watcher: Option<RecommendedWatcher>,
    /// figyelt fájl (kisbetűs, normalizált) -> hány tab használja
    files: HashMap<String, usize>,
    /// figyelt mappa -> hány fájl tartozik hozzá
    dirs: HashMap<PathBuf, usize>,
}

struct Watch(Mutex<WatchState>);

/// Az indításkor parancssorban kapott fájlok.
struct LaunchFiles(Mutex<Vec<String>>);

fn key(p: &Path) -> String {
    p.to_string_lossy().replace('/', "\\").to_lowercase()
}

fn md_args(args: &[String], cwd: &Path) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(|a| {
            let p = PathBuf::from(a);
            if p.is_absolute() { p } else { cwd.join(p) }
        })
        .filter(|p| p.is_file())
        .map(|p| dunce(p).to_string_lossy().into_owned())
        .collect()
}

/// `canonicalize` Windowson `\\?\` előtagot ad – ezt levágjuk.
fn dunce(p: PathBuf) -> PathBuf {
    let c = p.canonicalize().unwrap_or(p);
    let s = c.to_string_lossy();
    match s.strip_prefix(r"\\?\") {
        Some(rest) if !rest.starts_with("UNC\\") => PathBuf::from(rest),
        _ => c,
    }
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&bytes);
    Ok(text.strip_prefix('\u{feff}').unwrap_or(&text).to_string())
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    Path::new(&path).is_file()
}

#[derive(serde::Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
}

const MD_EXTS: [&str; 6] = ["md", "markdown", "mdown", "mkd", "mdx", "txt"];
const SKIP_DIRS: [&str; 6] = ["node_modules", "target", "dist", "build", "__pycache__", "venv"];

/// Egy mappa tartalma a mappanézethez: almappák és markdown fájlok, rendezve.
#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut out: Vec<DirEntry> = std::fs::read_dir(&path)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                return None;
            }
            let is_dir = e.file_type().ok()?.is_dir();
            let keep = if is_dir {
                !SKIP_DIRS.contains(&name.to_lowercase().as_str())
            } else {
                Path::new(&name)
                    .extension()
                    .and_then(|x| x.to_str())
                    .is_some_and(|x| MD_EXTS.contains(&x.to_lowercase().as_str()))
            };
            keep.then(|| DirEntry { path: e.path().to_string_lossy().into_owned(), name, is_dir })
        })
        .collect();
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

#[tauri::command]
fn take_launch_files(state: State<LaunchFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

#[tauri::command]
fn watch_file(path: String, state: State<Watch>) -> Result<(), String> {
    let mut st = state.0.lock().unwrap();
    let p = PathBuf::from(&path);
    let k = key(&p);
    let count = st.files.entry(k).or_insert(0);
    *count += 1;
    if *count > 1 {
        return Ok(());
    }
    let Some(dir) = p.parent().map(Path::to_path_buf) else { return Ok(()) };
    let n = st.dirs.entry(dir.clone()).or_insert(0);
    *n += 1;
    if *n == 1 {
        if let Some(w) = st.watcher.as_mut() {
            w.watch(&dir, RecursiveMode::NonRecursive).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn unwatch_file(path: String, state: State<Watch>) {
    let mut st = state.0.lock().unwrap();
    let p = PathBuf::from(&path);
    let k = key(&p);
    match st.files.get_mut(&k) {
        Some(c) if *c > 1 => {
            *c -= 1;
            return;
        }
        Some(_) => {
            st.files.remove(&k);
        }
        None => return,
    }
    let Some(dir) = p.parent().map(Path::to_path_buf) else { return };
    let remove = match st.dirs.get_mut(&dir) {
        Some(n) if *n > 1 => {
            *n -= 1;
            false
        }
        Some(_) => true,
        None => false,
    };
    if remove {
        st.dirs.remove(&dir);
        if let Some(w) = st.watcher.as_mut() {
            let _ = w.unwatch(&dir);
        }
    }
}

fn make_watcher(app: AppHandle) -> Option<RecommendedWatcher> {
    notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(ev) = res else { return };
        if ev.kind.is_access() {
            return;
        }
        let watch = app.state::<Watch>();
        let changed: Vec<String> = {
            let st = watch.0.lock().unwrap();
            ev.paths
                .iter()
                .filter(|p| st.files.contains_key(&key(p)))
                .map(|p| p.to_string_lossy().into_owned())
                .collect()
        };
        for p in changed {
            let _ = app.emit("file-changed", p);
        }
    })
    .ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let cwd = std::env::current_dir().unwrap_or_default();
    let launch = md_args(&args, &cwd);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let files = md_args(&args, Path::new(&cwd));
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
            let _ = app.emit("open-files", files);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(LaunchFiles(Mutex::new(launch)))
        .manage(Watch(Mutex::new(WatchState {
            watcher: None,
            files: HashMap::new(),
            dirs: HashMap::new(),
        })))
        .setup(|app| {
            let w = make_watcher(app.handle().clone());
            app.state::<Watch>().0.lock().unwrap().watcher = w;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_file,
            file_exists,
            list_dir,
            take_launch_files,
            watch_file,
            unwatch_file
        ])
        .run(tauri::generate_context!())
        .expect("hiba az alkalmazás indításakor");
}
