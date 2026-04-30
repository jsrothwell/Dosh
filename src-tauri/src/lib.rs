use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Post {
    pub id: Option<i64>,
    pub title: String,
    pub body: String,
    pub platform: String,
    pub status: String,     // "draft" | "queued" | "published"
    pub scheduled_at: Option<String>,
    pub created_at: Option<String>,
}

/// Persist a new post (or update if id is present) via the JS db layer.
/// The actual INSERT lives in src/lib/db.ts; this command exists so Rust
/// can orchestrate additional side-effects (e.g. scheduling) in the future.
#[tauri::command]
async fn save_post(post: Post) -> Result<Post, String> {
    // Validation
    if post.title.trim().is_empty() {
        return Err("Post title cannot be empty.".into());
    }
    if post.body.trim().is_empty() {
        return Err("Post body cannot be empty.".into());
    }
    // Return the post back to the frontend; the TS layer handles the actual DB write.
    Ok(post)
}

/// Return all posts from the DB. The heavy lifting is done in the TS/SQLite layer;
/// this command provides a Rust-side entry point for future server-side filtering.
#[tauri::command]
async fn get_posts() -> Result<Vec<Post>, String> {
    // Delegate to the frontend DB wrapper. Returning an empty vec here signals
    // to the frontend to use its own db.getPosts() instead.
    Ok(vec![])
}

/// Store an API key securely in the OS keychain.
/// service: e.g. "dosh.twitter", account: e.g. "api_key"
#[tauri::command]
async fn secure_store_key(service: String, account: String, secret: String) -> Result<(), String> {
    let entry = Entry::new(&service, &account).map_err(|e| e.to_string())?;
    entry.set_password(&secret).map_err(|e| e.to_string())?;
    Ok(())
}

/// Retrieve an API key from the OS keychain.
#[tauri::command]
async fn secure_get_key(service: String, account: String) -> Result<String, String> {
    let entry = Entry::new(&service, &account).map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

/// Delete an API key from the OS keychain.
#[tauri::command]
async fn secure_delete_key(service: String, account: String) -> Result<(), String> {
    let entry = Entry::new(&service, &account).map_err(|e| e.to_string())?;
    entry.delete_credential().map_err(|e| e.to_string())?;
    Ok(())
}

/// Read raw bytes of a local media file and return as a base64 data URI
/// so the frontend can render high-res previews without copying the file.
#[tauri::command]
async fn read_media_file(path: String) -> Result<String, String> {
    use std::path::Path;

    let p = Path::new(&path);

    // Restrict to common image/video extensions for safety
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let allowed = ["png", "jpg", "jpeg", "gif", "webp", "mp4", "mov", "heic"];
    if !allowed.contains(&ext.as_str()) {
        return Err(format!("File type '.{}' is not allowed.", ext));
    }

    let bytes = std::fs::read(p).map_err(|e| e.to_string())?;
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "heic" => "image/heic",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        _ => "application/octet-stream",
    };

    use std::io::Write;
    let mut enc = base64::write::EncoderStringWriter::new(&base64::engine::general_purpose::STANDARD);
    enc.write_all(&bytes).map_err(|e| e.to_string())?;
    let b64 = enc.into_inner();

    Ok(format!("data:{};base64,{}", mime, b64))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            save_post,
            get_posts,
            secure_store_key,
            secure_get_key,
            secure_delete_key,
            read_media_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dosh");
}
