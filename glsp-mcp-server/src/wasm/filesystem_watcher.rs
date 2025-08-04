// Copyright (c) 2024 GLSP-Rust Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

use notify::{Event, EventKind, RecursiveMode, Result as NotifyResult, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tracing::{error, info};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WasmComponentChange {
    pub event_type: WasmChangeType,
    pub path: String,
    pub component_name: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum WasmChangeType {
    Added,
    Modified,
    Removed,
}

pub struct FileSystemWatcher {
    watch_path: PathBuf,
    watcher: Option<notify::RecommendedWatcher>,
    changes_tx: mpsc::UnboundedSender<WasmComponentChange>,
    changes_rx: Arc<RwLock<mpsc::UnboundedReceiver<WasmComponentChange>>>,
    known_files: Arc<RwLock<HashMap<PathBuf, i64>>>, // Path -> last modified time
}

impl FileSystemWatcher {
    pub fn new(watch_path: PathBuf) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();

        Self {
            watch_path,
            watcher: None,
            changes_tx: tx,
            changes_rx: Arc::new(RwLock::new(rx)),
            known_files: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn start_watching(&mut self) -> NotifyResult<()> {
        info!("Starting filesystem watcher on: {:?}", self.watch_path);

        // Initial scan of existing files
        self.scan_initial_files().await?;

        let tx = self.changes_tx.clone();
        let known_files = self.known_files.clone();
        let watch_path = self.watch_path.clone();

        // Create watcher
        let mut watcher = notify::recommended_watcher(move |res: NotifyResult<Event>| {
            match res {
                Ok(event) => {
                    // Handle file events in blocking context
                    let tx_clone = tx.clone();
                    let known_files_clone = known_files.clone();
                    let watch_path_clone = watch_path.clone();

                    // Use std::thread for the callback context
                    std::thread::spawn(move || {
                        // Create a new runtime for this thread
                        let rt = tokio::runtime::Runtime::new().unwrap();
                        rt.block_on(Self::handle_event(
                            event,
                            tx_clone,
                            known_files_clone,
                            watch_path_clone,
                        ));
                    });
                }
                Err(e) => {
                    error!("Watch error: {e:?}");
                }
            }
        })?;

        // Start watching
        watcher.watch(&self.watch_path, RecursiveMode::Recursive)?;
        self.watcher = Some(watcher);

        info!("Filesystem watcher started successfully");
        Ok(())
    }

    async fn scan_initial_files(&self) -> NotifyResult<()> {
        info!("Scanning initial WASM files in: {:?}", self.watch_path);

        let mut count = 0;
        let mut wasm_files = Vec::new();
        self.scan_directory_recursive(&self.watch_path, &mut wasm_files)
            .await?;

        for path in wasm_files {
            if let Ok(metadata) = tokio::fs::metadata(&path).await {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                        let timestamp = duration.as_secs() as i64;
                        self.known_files
                            .write()
                            .await
                            .insert(path.clone(), timestamp);
                        count += 1;

                        // Don't send initial files as "added" - they're already there
                        // Only new files after startup should trigger events
                    }
                }
            }
        }

        info!("Found {} initial WASM files", count);
        Ok(())
    }

    async fn scan_directory_recursive(
        &self,
        dir: &PathBuf,
        wasm_files: &mut Vec<PathBuf>,
    ) -> NotifyResult<()> {
        if let Ok(mut entries) = tokio::fs::read_dir(dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let path = entry.path();
                if path.is_dir() {
                    Box::pin(self.scan_directory_recursive(&path, wasm_files)).await?;
                } else if path.extension().and_then(|s| s.to_str()) == Some("wasm") {
                    wasm_files.push(path);
                }
            }
        }
        Ok(())
    }

    async fn handle_event(
        event: Event,
        tx: mpsc::UnboundedSender<WasmComponentChange>,
        known_files: Arc<RwLock<HashMap<PathBuf, i64>>>,
        _watch_path: PathBuf,
    ) {
        match event.kind {
            EventKind::Create(_) => {
                for path in event.paths {
                    if path.extension().and_then(|s| s.to_str()) == Some("wasm") {
                        info!("WASM file created: {:?}", path);

                        let component_name = if let Some(parent) = path.parent() {
                            if let Some(dir_name) = parent.file_name().and_then(|s| s.to_str()) {
                                dir_name.to_string()
                            } else {
                                path.file_stem()
                                    .and_then(|s| s.to_str())
                                    .unwrap_or("unknown")
                                    .to_string()
                            }
                        } else {
                            path.file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("unknown")
                                .to_string()
                        };

                        let change = WasmComponentChange {
                            event_type: WasmChangeType::Added,
                            path: path.to_string_lossy().to_string(),
                            component_name,
                            timestamp: chrono::Utc::now().timestamp(),
                        };

                        // Update known files
                        known_files.write().await.insert(path, change.timestamp);

                        if let Err(e) = tx.send(change) {
                            error!("Failed to send change notification: {}", e);
                        }
                    }
                }
            }
            EventKind::Modify(_) => {
                for path in event.paths {
                    if path.extension().and_then(|s| s.to_str()) == Some("wasm") {
                        info!("WASM file modified: {:?}", path);

                        let component_name = if let Some(parent) = path.parent() {
                            if let Some(dir_name) = parent.file_name().and_then(|s| s.to_str()) {
                                dir_name.to_string()
                            } else {
                                path.file_stem()
                                    .and_then(|s| s.to_str())
                                    .unwrap_or("unknown")
                                    .to_string()
                            }
                        } else {
                            path.file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("unknown")
                                .to_string()
                        };

                        let change = WasmComponentChange {
                            event_type: WasmChangeType::Modified,
                            path: path.to_string_lossy().to_string(),
                            component_name,
                            timestamp: chrono::Utc::now().timestamp(),
                        };

                        // Update known files
                        known_files.write().await.insert(path, change.timestamp);

                        if let Err(e) = tx.send(change) {
                            error!("Failed to send change notification: {}", e);
                        }
                    }
                }
            }
            EventKind::Remove(_) => {
                for path in event.paths {
                    if path.extension().and_then(|s| s.to_str()) == Some("wasm") {
                        info!("WASM file removed: {:?}", path);

                        let component_name = if let Some(parent) = path.parent() {
                            if let Some(dir_name) = parent.file_name().and_then(|s| s.to_str()) {
                                dir_name.to_string()
                            } else {
                                path.file_stem()
                                    .and_then(|s| s.to_str())
                                    .unwrap_or("unknown")
                                    .to_string()
                            }
                        } else {
                            path.file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("unknown")
                                .to_string()
                        };

                        let change = WasmComponentChange {
                            event_type: WasmChangeType::Removed,
                            path: path.to_string_lossy().to_string(),
                            component_name,
                            timestamp: chrono::Utc::now().timestamp(),
                        };

                        // Remove from known files
                        known_files.write().await.remove(&path);

                        if let Err(e) = tx.send(change) {
                            error!("Failed to send change notification: {}", e);
                        }
                    }
                }
            }
            _ => {}
        }
    }

    pub fn get_changes_receiver(
        &self,
    ) -> Arc<RwLock<mpsc::UnboundedReceiver<WasmComponentChange>>> {
        self.changes_rx.clone()
    }

    pub async fn get_known_files(&self) -> Vec<PathBuf> {
        self.known_files.read().await.keys().cloned().collect()
    }

    /// Change the watched path and restart the watcher
    pub async fn change_watch_path(
        &mut self,
        new_path: PathBuf,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        info!(
            "Changing filesystem watcher path from {:?} to {:?}",
            self.watch_path, new_path
        );

        // Stop existing watcher if it exists
        if let Some(_watcher) = self.watcher.take() {
            info!("Stopping existing filesystem watcher");
            // Watcher will be dropped and stop watching
        }

        // Clear known files
        self.known_files.write().await.clear();

        // Update path
        self.watch_path = new_path;

        // Restart watching with new path
        self.start_watching()
            .await
            .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> { Box::new(e) })?;

        info!("Filesystem watcher successfully changed to new path");
        Ok(())
    }
}
