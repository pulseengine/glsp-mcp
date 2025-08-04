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

mod execution_engine;
mod filesystem_watcher;
mod graphics_renderer;
mod pipeline;
mod security_scanner;
mod sensor_bridge;
mod simulation;
mod wit_analyzer;

pub use execution_engine::{
    ExecutionContext, ExecutionProgress, ExecutionResult, ExecutionStage, GraphicsFormat,
    GraphicsOutput, VideoFormat, WasmExecutionEngine,
};
pub use filesystem_watcher::{FileSystemWatcher, WasmChangeType, WasmComponentChange};
pub use graphics_renderer::{CanvasCommand, GraphicsConfig, ImageFormat, WasmGraphicsRenderer};
pub use pipeline::{
    BackoffStrategy, ConnectionType as PipelineConnectionType, DataConnection, DataMapping,
    DataTransform, ExecutionMode, ExecutionStats, PersistenceSettings, PipelineConfig,
    PipelineExecution, PipelineSettings, PipelineStage, PipelineState, RetryConfig,
    StageExecutionSettings, StageResult, StageStats, WasmPipelineEngine,
};
pub use security_scanner::{
    SecurityAnalysis, SecurityIssue, SecurityIssueType, SecurityRiskLevel, WasmSecurityScanner,
};
pub use sensor_bridge::{
    BridgeStatus, BufferSettings, BufferStats, SensorBridgeConfig, SensorDataBridge, SensorFrame,
    SimulationTimeInfo, SyncMode as SensorSyncMode, TimingConfig, WasmSensorInterface,
};
pub use simulation::{
    DataSharingConfig, DependencyType, OutputConfig, OutputDestination, OutputFormat,
    PipelineDependency, RealTimeSyncSettings, ResourceLimits, ResourceUsage, ScenarioCondition,
    ScenarioExecutionMode, ScenarioSettings, ScenarioStats, ScenarioTrigger, SimulationConfig,
    SimulationExecution, SimulationExecutionMode, SimulationScenario, SimulationSettings,
    SimulationState, SimulationStats, SyncMode, TriggerCondition, TriggerType,
    WasmSimulationEngine,
};
pub use wit_analyzer::{
    ComponentWitAnalysis, WitAnalyzer, WitCompatibilityReport, WitDependency, WitFunction,
    WitInterface, WitInterfaceType, WitParam, WitType, WitTypeDefinition, WitValidationIssue,
    WitValidationIssueType, WitValidationSeverity,
};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tracing::{debug, info, warn};
use uuid::Uuid;

// Re-export component grouping types (defined in this module)
// Note: WasmComponent, WasmFileWatcher, WasmFunction, WasmInterface, WasmParam are already defined
// Adding new types: ComponentGroup, ComponentGroupInfo, ConnectionType, ExternalInterface, InterfaceConnection, ValidationStatus

/// WASM interface definition representing import or export interfaces
///
/// Describes a collection of functions that a WASM component either provides
/// (exports) or requires (imports) from the host environment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WasmInterface {
    pub name: String,
    pub interface_type: String, // 'import' or 'export'
    pub functions: Vec<WasmFunction>,
}

/// WASM function signature with parameters and return types
///
/// Represents a single function within a WASM interface, including
/// its parameter list and return values.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WasmFunction {
    pub name: String,
    pub params: Vec<WasmParam>,
    pub returns: Vec<WasmParam>,
}

/// Parameter or return value definition for WASM functions
///
/// Describes a single parameter or return value with its name and type.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WasmParam {
    pub name: String,
    pub param_type: String,
}

/// WASM component metadata and interface information
///
/// Contains comprehensive information about a WebAssembly component including
/// its file location, interfaces, security analysis, and runtime metadata.
/// This is the primary data structure for managing WASM components in the system.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WasmComponent {
    pub name: String,
    pub path: String,
    pub description: String,
    pub file_exists: bool,
    pub last_seen: Option<DateTime<Utc>>,
    pub removed_at: Option<DateTime<Utc>>,
    pub interfaces: Vec<WasmInterface>,
    pub metadata: HashMap<String, serde_json::Value>,
    pub wit_interfaces: Option<String>, // Raw WIT content
    pub dependencies: Vec<String>,
    pub security_analysis: Option<SecurityAnalysis>,
    pub last_security_scan: Option<DateTime<Utc>>,
}

/// Connection type for interface connections
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionType {
    /// Direct connection between components
    Direct,
    /// Connection through a shared interface
    Shared,
    /// Connection through an adapter
    Adapter,
}

/// Interface connection between components in a group
///
/// Represents a connection between two components' interfaces, specifying
/// how the output of one component connects to the input of another.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterfaceConnection {
    pub id: String,
    pub source_component: String,
    pub source_interface: String,
    pub source_function: Option<String>,
    pub target_component: String,
    pub target_interface: String,
    pub target_function: Option<String>,
    pub connection_type: ConnectionType,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// External interface exposed by a component group
///
/// Represents an interface that is exposed to the outside world
/// from a component group, aggregating internal component interfaces.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalInterface {
    pub id: String,
    pub name: String,
    pub interface_type: String, // 'import' or 'export'
    pub source_component: String,
    pub source_interface: String,
    pub functions: Vec<WasmFunction>,
    pub description: Option<String>,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Component group containing multiple WASM components
///
/// Represents a logical grouping of WASM components that work together
/// as a single unit, with defined internal connections and external interfaces.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentGroup {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub component_ids: Vec<String>,
    pub internal_connections: Vec<InterfaceConnection>,
    pub external_interfaces: Vec<ExternalInterface>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Information about a component group for MCP providers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentGroupInfo {
    pub group: ComponentGroup,
    pub components: Vec<WasmComponent>,
    pub bazel_config: Option<String>,
    pub wac_config: Option<String>,
    pub validation_status: Option<ValidationStatus>,
}

/// Validation status for component groups
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationStatus {
    pub is_valid: bool,
    pub issues: Vec<String>,
    pub interface_compatibility: bool,
    pub timing_constraints_met: bool,
    pub last_validated: DateTime<Utc>,
}

#[derive(Clone)]
pub struct WasmFileWatcher {
    watch_path: PathBuf,
    components: HashMap<String, WasmComponent>,
    last_scan: DateTime<Utc>,
    security_scanner: WasmSecurityScanner,
    execution_engine: Option<Arc<WasmExecutionEngine>>,
    recent_changes: Arc<tokio::sync::Mutex<Vec<WasmComponentChange>>>,
    filesystem_watcher: Option<Arc<tokio::sync::RwLock<FileSystemWatcher>>>,
}

impl WasmFileWatcher {
    pub fn new(watch_path: PathBuf) -> Self {
        Self {
            watch_path,
            components: HashMap::new(),
            last_scan: Utc::now(),
            security_scanner: WasmSecurityScanner::new(),
            execution_engine: None,
            recent_changes: Arc::new(tokio::sync::Mutex::new(Vec::new())),
            filesystem_watcher: None,
        }
    }

    /// List all executions (active and recent)
    pub fn list_executions(&self) -> Vec<ExecutionResult> {
        if let Some(engine) = &self.execution_engine {
            engine.list_executions()
        } else {
            vec![]
        }
    }

    /// Get execution progress by ID
    pub fn get_execution_progress(&self, execution_id: &str) -> Option<ExecutionProgress> {
        self.execution_engine
            .as_ref()?
            .get_execution_progress(execution_id)
    }

    /// Get execution result by ID
    pub fn get_execution_result(&self, execution_id: &str) -> Option<ExecutionResult> {
        self.execution_engine
            .as_ref()?
            .get_execution_result(execution_id)
    }

    /// Start filesystem watcher for real-time component monitoring
    pub async fn start_file_watching(&mut self) -> Result<(), anyhow::Error> {
        // Create and start the filesystem watcher
        let mut fs_watcher = FileSystemWatcher::new(self.watch_path.clone());
        fs_watcher.start_watching().await?;

        // Get the changes receiver before storing watcher
        let changes_rx = fs_watcher.get_changes_receiver();
        let recent_changes = self.recent_changes.clone();

        // Spawn a task to collect changes
        tokio::spawn(async move {
            let mut rx = changes_rx.write().await;
            while let Some(change) = rx.recv().await {
                info!("Component change detected: {:?}", change);

                // Add to recent changes
                let mut changes = recent_changes.lock().await;
                changes.push(change);

                // Keep only last 100 changes
                if changes.len() > 100 {
                    let drain_count = changes.len() - 100;
                    changes.drain(0..drain_count);
                }
            }
        });

        // Store the watcher
        self.filesystem_watcher = Some(Arc::new(tokio::sync::RwLock::new(fs_watcher)));

        info!("Filesystem watcher started for path: {:?}", self.watch_path);
        Ok(())
    }

    /// Get recent component changes
    pub async fn get_recent_changes(&self) -> Vec<WasmComponentChange> {
        self.recent_changes.lock().await.clone()
    }

    /// Initialize execution engine with given configuration
    pub fn with_execution_engine(mut self, max_concurrent: usize) -> Result<Self, anyhow::Error> {
        self.execution_engine = Some(Arc::new(WasmExecutionEngine::new(max_concurrent)?));
        Ok(self)
    }

    pub fn get_watch_path(&self) -> &PathBuf {
        &self.watch_path
    }

    pub fn get_last_scan_time(&self) -> DateTime<Utc> {
        self.last_scan
    }

    pub fn get_components(&self) -> Vec<&WasmComponent> {
        self.components.values().collect()
    }

    pub fn get_component(&self, name: &str) -> Option<&WasmComponent> {
        self.components.get(name)
    }

    pub fn get_component_by_path(&self, path: &str) -> Option<&WasmComponent> {
        self.components.values().find(|comp| comp.path == path)
    }

    /// Find a component by name, trying various naming conventions
    pub fn find_component_flexible(&self, component_name: &str) -> Option<&WasmComponent> {
        // Try exact match first
        if let Some(comp) = self.get_component(component_name) {
            return Some(comp);
        }

        // Try with underscores converted to hyphens
        let hyphen_name = component_name.replace('_', "-");
        if let Some(comp) = self.get_component(&hyphen_name) {
            return Some(comp);
        }

        // Try with hyphens converted to underscores
        let underscore_name = component_name.replace('-', "_");
        if let Some(comp) = self.get_component(&underscore_name) {
            return Some(comp);
        }

        // Try to find by matching any component where the name matches after normalization
        self.components.values().find(|comp| {
            let normalized_comp_name = comp.name.replace(['-', '_'], "");
            let normalized_search_name = component_name.replace(['-', '_'], "");
            normalized_comp_name.eq_ignore_ascii_case(&normalized_search_name)
        })
    }

    pub async fn scan_components(&mut self) -> anyhow::Result<()> {
        use std::ffi::OsStr;

        let watch_path = &self.watch_path;
        info!("Scanning WASM components in: {watch_path:?}");

        if !self.watch_path.exists() {
            let watch_path = &self.watch_path;
            warn!("WASM watch path does not exist: {watch_path:?}");
            return Ok(());
        }

        // Find all .wasm files in the directory tree
        let mut wasm_files = Vec::new();
        self.scan_directory_recursive(&self.watch_path, &mut wasm_files)
            .await?;

        info!("Found {} WASM files", wasm_files.len());

        // Track which components we found this scan
        let mut found_components = std::collections::HashSet::new();

        // Process each WASM file
        for wasm_path in wasm_files {
            // Use directory name instead of file stem to avoid collisions when all files are named "component.wasm"
            let component_name = if let Some(parent) = wasm_path.parent() {
                if let Some(dir_name) = parent.file_name().and_then(OsStr::to_str) {
                    dir_name.to_string()
                } else {
                    // Fallback to file stem if directory name can't be determined
                    wasm_path
                        .file_stem()
                        .and_then(OsStr::to_str)
                        .unwrap_or("unknown")
                        .to_string()
                }
            } else {
                // Fallback to file stem if no parent directory
                wasm_path
                    .file_stem()
                    .and_then(OsStr::to_str)
                    .unwrap_or("unknown")
                    .to_string()
            };

            found_components.insert(component_name.clone());

            // Check if component exists or needs updating
            if let Some(existing) = self.components.get_mut(&component_name) {
                existing.file_exists = true;
                existing.last_seen = Some(Utc::now());
                existing.removed_at = None;
            } else {
                // New component discovered
                let component = self.extract_component_info(&wasm_path).await?;
                self.components.insert(component_name, component);
            }
        }

        // Mark missing components
        for (name, component) in self.components.iter_mut() {
            if !found_components.contains(name) && component.file_exists {
                component.file_exists = false;
                component.removed_at = Some(Utc::now());
                warn!("Component {name} file is now missing");
            }
        }

        self.last_scan = Utc::now();

        // Generate and display comprehensive statistics
        self.display_scan_statistics().await;

        Ok(())
    }

    async fn scan_directory_recursive(
        &self,
        dir: &PathBuf,
        wasm_files: &mut Vec<PathBuf>,
    ) -> anyhow::Result<()> {
        let mut entries = tokio::fs::read_dir(dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();

            if path.is_dir() {
                // Recursively scan subdirectories
                Box::pin(self.scan_directory_recursive(&path, wasm_files)).await?;
            } else if path.extension().and_then(|s| s.to_str()) == Some("wasm") {
                wasm_files.push(path);
            }
        }

        Ok(())
    }

    async fn extract_component_info(&self, wasm_path: &PathBuf) -> anyhow::Result<WasmComponent> {
        // Use directory name instead of file stem to match the naming logic in scan_components
        let component_name = if let Some(parent) = wasm_path.parent() {
            if let Some(dir_name) = parent.file_name().and_then(|s| s.to_str()) {
                dir_name.to_string()
            } else {
                wasm_path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown")
                    .to_string()
            }
        } else {
            wasm_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string()
        };

        debug!("Extracting component info from: {wasm_path:?}");

        // Try to extract actual metadata using wasm-tools
        match self.extract_wasm_metadata(wasm_path).await {
            Ok((interfaces, metadata, wit_content, dependencies)) => {
                let description = metadata
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or(&format!("ADAS component: {component_name}"))
                    .to_string();

                // Perform security analysis
                let security_analysis =
                    match self.security_scanner.analyze_component(wasm_path).await {
                        Ok(analysis) => {
                            info!(
                                "Security analysis completed for {}: {:?} risk",
                                component_name, analysis.overall_risk
                            );
                            Some(analysis)
                        }
                        Err(e) => {
                            warn!("Security analysis failed for {}: {}", component_name, e);
                            None
                        }
                    };

                Ok(WasmComponent {
                    name: component_name,
                    path: wasm_path.to_string_lossy().to_string(),
                    description,
                    file_exists: true,
                    last_seen: Some(Utc::now()),
                    removed_at: None,
                    interfaces,
                    metadata,
                    wit_interfaces: wit_content,
                    dependencies,
                    security_analysis,
                    last_security_scan: Some(Utc::now()),
                })
            }
            Err(e) => {
                warn!("Failed to extract WASM metadata for {component_name}: {e}. Using fallback.");

                // Fallback to basic component info if extraction fails
                Ok(WasmComponent {
                    name: component_name.clone(),
                    path: wasm_path.to_string_lossy().to_string(),
                    description: format!(
                        "ADAS component: {component_name} (metadata extraction failed)"
                    ),
                    file_exists: true,
                    last_seen: Some(Utc::now()),
                    removed_at: None,
                    interfaces: vec![
                        // Export interface
                        WasmInterface {
                            name: {
                                let normalized_name = component_name.replace('-', "_");
                                format!("adas:{normalized_name}/component")
                            },
                            interface_type: "export".to_string(),
                            functions: vec![WasmFunction {
                                name: "process".to_string(),
                                params: vec![WasmParam {
                                    name: "input".to_string(),
                                    param_type: "sensor-data".to_string(),
                                }],
                                returns: vec![WasmParam {
                                    name: "output".to_string(),
                                    param_type: "processed-data".to_string(),
                                }],
                            }],
                        },
                        // Import interface for sensor data
                        WasmInterface {
                            name: "wasi:sensors/input".to_string(),
                            interface_type: "import".to_string(),
                            functions: vec![WasmFunction {
                                name: "read".to_string(),
                                params: vec![],
                                returns: vec![WasmParam {
                                    name: "data".to_string(),
                                    param_type: "sensor-data".to_string(),
                                }],
                            }],
                        },
                        // Import interface for configuration
                        WasmInterface {
                            name: "adas:config/reader".to_string(),
                            interface_type: "import".to_string(),
                            functions: vec![WasmFunction {
                                name: "get-config".to_string(),
                                params: vec![WasmParam {
                                    name: "key".to_string(),
                                    param_type: "string".to_string(),
                                }],
                                returns: vec![WasmParam {
                                    name: "value".to_string(),
                                    param_type: "string".to_string(),
                                }],
                            }],
                        },
                    ],
                    metadata: HashMap::new(),
                    wit_interfaces: None,
                    dependencies: Vec::new(),
                    security_analysis: None,
                    last_security_scan: None,
                })
            }
        }
    }

    async fn extract_wasm_metadata(
        &self,
        wasm_path: &PathBuf,
    ) -> anyhow::Result<(
        Vec<WasmInterface>,
        HashMap<String, serde_json::Value>,
        Option<String>,
        Vec<String>,
    )> {
        // First try to use the advanced WIT analyzer
        match WitAnalyzer::analyze_component(wasm_path).await {
            Ok(wit_analysis) => {
                debug!("Successfully analyzed component with WIT analyzer");
                self.convert_wit_analysis_to_legacy_format(wit_analysis)
                    .await
            }
            Err(wit_error) => {
                warn!("WIT analysis failed: {wit_error}, falling back to wasmparser");
                self.extract_wasm_metadata_fallback(wasm_path).await
            }
        }
    }

    /// Convert WIT analysis to legacy format for backward compatibility
    async fn convert_wit_analysis_to_legacy_format(
        &self,
        analysis: ComponentWitAnalysis,
    ) -> anyhow::Result<(
        Vec<WasmInterface>,
        HashMap<String, serde_json::Value>,
        Option<String>,
        Vec<String>,
    )> {
        let mut interfaces = Vec::new();
        let mut metadata = HashMap::new();
        let mut dependencies = Vec::new();

        // Convert imports
        for wit_interface in analysis.imports {
            let interface = WasmInterface {
                name: wit_interface.name,
                interface_type: "import".to_string(),
                functions: wit_interface
                    .functions
                    .into_iter()
                    .map(|f| WasmFunction {
                        name: f.name,
                        params: f
                            .params
                            .into_iter()
                            .map(|p| WasmParam {
                                name: p.name,
                                param_type: Self::wit_type_to_string(&p.param_type),
                            })
                            .collect(),
                        returns: f
                            .results
                            .into_iter()
                            .map(|r| WasmParam {
                                name: r.name,
                                param_type: Self::wit_type_to_string(&r.param_type),
                            })
                            .collect(),
                    })
                    .collect(),
            };
            interfaces.push(interface);
        }

        // Convert exports
        for wit_interface in analysis.exports {
            let interface = WasmInterface {
                name: wit_interface.name,
                interface_type: "export".to_string(),
                functions: wit_interface
                    .functions
                    .into_iter()
                    .map(|f| WasmFunction {
                        name: f.name,
                        params: f
                            .params
                            .into_iter()
                            .map(|p| WasmParam {
                                name: p.name,
                                param_type: Self::wit_type_to_string(&p.param_type),
                            })
                            .collect(),
                        returns: f
                            .results
                            .into_iter()
                            .map(|r| WasmParam {
                                name: r.name,
                                param_type: Self::wit_type_to_string(&r.param_type),
                            })
                            .collect(),
                    })
                    .collect(),
            };
            interfaces.push(interface);
        }

        // Extract dependencies
        for dep in analysis.dependencies {
            dependencies.push(dep.package);
        }

        // Add metadata
        metadata.insert(
            "wit_world".to_string(),
            serde_json::Value::String(analysis.world_name.unwrap_or("unknown".to_string())),
        );
        metadata.insert(
            "wit_analysis_version".to_string(),
            serde_json::Value::String("2.0".to_string()),
        );
        metadata.insert(
            "extracted_at".to_string(),
            serde_json::Value::String(Utc::now().to_rfc3339()),
        );
        metadata.insert(
            "interface_count".to_string(),
            serde_json::Value::Number(serde_json::Number::from(interfaces.len())),
        );

        Ok((interfaces, metadata, analysis.raw_wit, dependencies))
    }

    /// Convert WIT type to string representation for legacy compatibility
    fn wit_type_to_string(wit_type: &WitType) -> String {
        match &wit_type.type_def {
            WitTypeDefinition::Primitive(name) => name.clone(),
            WitTypeDefinition::Record { .. } => format!("record({})", wit_type.name),
            WitTypeDefinition::Variant { .. } => format!("variant({})", wit_type.name),
            WitTypeDefinition::Enum { .. } => format!("enum({})", wit_type.name),
            WitTypeDefinition::Union { .. } => format!("union({})", wit_type.name),
            WitTypeDefinition::Option { inner } => {
                format!("option<{}>", Self::wit_type_to_string(inner))
            }
            WitTypeDefinition::Result { .. } => format!("result({})", wit_type.name),
            WitTypeDefinition::List { element } => {
                format!("list<{}>", Self::wit_type_to_string(element))
            }
            WitTypeDefinition::Tuple { .. } => format!("tuple({})", wit_type.name),
            WitTypeDefinition::Flags { .. } => format!("flags({})", wit_type.name),
            WitTypeDefinition::Resource { .. } => format!("resource({})", wit_type.name),
        }
    }

    /// Fallback method using the original wasmparser approach
    async fn extract_wasm_metadata_fallback(
        &self,
        wasm_path: &PathBuf,
    ) -> anyhow::Result<(
        Vec<WasmInterface>,
        HashMap<String, serde_json::Value>,
        Option<String>,
        Vec<String>,
    )> {
        use wasmparser::{Parser, Payload};

        debug!("Using fallback WASM parser for basic metadata extraction");

        // Read the WASM file
        let wasm_bytes = tokio::fs::read(wasm_path).await?;

        let mut interfaces = Vec::new();
        let mut metadata = HashMap::new();
        let mut wit_content = None;
        let mut dependencies = Vec::new();

        // Parse the WASM module using wasmparser
        let parser = Parser::new(0);
        for payload in parser.parse_all(&wasm_bytes) {
            match payload? {
                Payload::CustomSection(reader) => match reader.name() {
                    "component-type" => {
                        debug!("Found component-type section");
                    }
                    "wit-component" => {
                        debug!("Found wit-component section");
                        if let Ok(wit_str) = std::str::from_utf8(reader.data()) {
                            wit_content = Some(wit_str.to_string());
                        }
                    }
                    "producers" => {
                        debug!("Found producers section");
                    }
                    name if name.starts_with("adas:") => {
                        debug!("Found ADAS metadata section: {name}");
                        if let Ok(metadata_str) = std::str::from_utf8(reader.data()) {
                            if let Ok(json_val) =
                                serde_json::from_str::<serde_json::Value>(metadata_str)
                            {
                                metadata.insert(name.to_string(), json_val);
                            }
                        }
                    }
                    _ => {}
                },
                Payload::ImportSection(reader) => {
                    for import in reader {
                        let import = import?;
                        dependencies.push(format!("{}::{}", import.module, import.name));

                        if let wasmparser::TypeRef::Func(_) = import.ty {
                            let interface = WasmInterface {
                                name: format!("{}::{}", import.module, import.name),
                                interface_type: "import".to_string(),
                                functions: vec![WasmFunction {
                                    name: import.name.to_string(),
                                    params: vec![],
                                    returns: vec![],
                                }],
                            };
                            interfaces.push(interface);
                        }
                    }
                }
                Payload::ExportSection(reader) => {
                    let mut export_functions = Vec::new();

                    for export in reader {
                        let export = export?;

                        if let wasmparser::ExternalKind::Func = export.kind {
                            export_functions.push(WasmFunction {
                                name: export.name.to_string(),
                                params: vec![],
                                returns: vec![],
                            });
                        }
                    }

                    if !export_functions.is_empty() {
                        interfaces.push(WasmInterface {
                            name: "exports".to_string(),
                            interface_type: "export".to_string(),
                            functions: export_functions,
                        });
                    }
                }
                _ => {}
            }
        }

        // Add basic metadata
        metadata.insert(
            "file_size".to_string(),
            serde_json::Value::Number(serde_json::Number::from(wasm_bytes.len())),
        );
        metadata.insert(
            "extracted_at".to_string(),
            serde_json::Value::String(Utc::now().to_rfc3339()),
        );
        metadata.insert(
            "analysis_method".to_string(),
            serde_json::Value::String("wasmparser_fallback".to_string()),
        );

        // Add default interfaces if none found
        if interfaces.is_empty() {
            debug!("No interfaces found, adding default ones for visualization");
            interfaces.push(WasmInterface {
                name: "component-export".to_string(),
                interface_type: "export".to_string(),
                functions: vec![WasmFunction {
                    name: "main".to_string(),
                    params: vec![],
                    returns: vec![],
                }],
            });
            interfaces.push(WasmInterface {
                name: "wasi-imports".to_string(),
                interface_type: "import".to_string(),
                functions: vec![WasmFunction {
                    name: "imported".to_string(),
                    params: vec![],
                    returns: vec![],
                }],
            });
        }

        Ok((interfaces, metadata, wit_content, dependencies))
    }

    pub fn remove_missing_component(&mut self, name: &str) -> bool {
        if let Some(component) = self.components.get(name) {
            if !component.file_exists {
                self.components.remove(name);
                return true;
            }
        }
        false
    }

    /// Get security analysis for a specific component
    pub fn get_security_analysis(&self, component_name: &str) -> Option<&SecurityAnalysis> {
        self.components
            .get(component_name)
            .and_then(|comp| comp.security_analysis.as_ref())
    }

    /// Get security risk summary for all components
    pub fn get_security_summary(&self) -> HashMap<SecurityRiskLevel, usize> {
        let mut summary = HashMap::new();
        summary.insert(SecurityRiskLevel::Low, 0);
        summary.insert(SecurityRiskLevel::Medium, 0);
        summary.insert(SecurityRiskLevel::High, 0);
        summary.insert(SecurityRiskLevel::Critical, 0);

        for component in self.components.values() {
            if let Some(analysis) = &component.security_analysis {
                *summary.entry(analysis.overall_risk.clone()).or_insert(0) += 1;
            }
        }

        summary
    }

    /// Execute a WASM component method
    pub async fn execute_component(
        &self,
        component_name: &str,
        method: &str,
        args: serde_json::Value,
        timeout_ms: u64,
        max_memory_mb: u32,
    ) -> Result<String, anyhow::Error> {
        let execution_engine = self
            .execution_engine
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Execution engine not initialized"))?;

        let component = self
            .components
            .get(component_name)
            .ok_or_else(|| anyhow::anyhow!("Component '{}' not found", component_name))?;

        if !component.file_exists {
            return Err(anyhow::anyhow!(
                "Component '{}' file does not exist",
                component_name
            ));
        }

        let execution_id = uuid::Uuid::new_v4().to_string();

        let context = ExecutionContext {
            execution_id: execution_id.clone(),
            component_name: component_name.to_string(),
            method: method.to_string(),
            args,
            timeout_ms,
            max_memory_mb,
            created_at: Utc::now(),
            sensor_config: None,
        };

        let component_path = std::path::Path::new(&component.path);

        execution_engine
            .execute_component(context, component_path)
            .await
    }

    /// Cancel an execution
    pub fn cancel_execution(&self, execution_id: &str) -> bool {
        self.execution_engine
            .as_ref()
            .map(|engine| engine.cancel_execution(execution_id))
            .unwrap_or(false)
    }

    /// Display comprehensive statistics after component scan
    async fn display_scan_statistics(&self) {
        let total_components = self.components.len();
        let available_components = self.components.values().filter(|c| c.file_exists).count();
        let missing_components = total_components - available_components;

        // Interface statistics
        let mut total_interfaces = 0;
        let mut total_imports = 0;
        let mut total_exports = 0;
        let mut total_functions = 0;
        let mut components_with_wit = 0;
        let mut interface_types = std::collections::HashMap::new();
        let mut dependency_count = 0;

        // Security statistics
        let mut components_with_security_analysis = 0;
        let security_summary = self.get_security_summary();
        let mut total_security_issues = 0;

        for component in self.components.values() {
            if !component.file_exists {
                continue;
            }

            total_interfaces += component.interfaces.len();
            dependency_count += component.dependencies.len();

            if component.wit_interfaces.is_some() {
                components_with_wit += 1;
            }

            if let Some(security_analysis) = &component.security_analysis {
                components_with_security_analysis += 1;
                total_security_issues += security_analysis.issues.len();
            }

            for interface in &component.interfaces {
                total_functions += interface.functions.len();

                match interface.interface_type.as_str() {
                    "import" => total_imports += 1,
                    "export" => total_exports += 1,
                    _ => {}
                }

                // Count interface types properly
                let interface_category = match interface.interface_type.as_str() {
                    "import" => {
                        if interface.name.starts_with("wasi:") {
                            "WASI Imports"
                        } else if interface.name.starts_with("adas:") {
                            "ADAS Imports"
                        } else {
                            "Component Imports"
                        }
                    }
                    "export" => {
                        if interface.name.starts_with("wasi:") {
                            "WASI Exports"
                        } else if interface.name.starts_with("adas:") {
                            "ADAS Exports"
                        } else {
                            "Component Exports"
                        }
                    }
                    _ => "Unknown Type",
                };

                *interface_types
                    .entry(interface_category.to_string())
                    .or_insert(0) += 1;
            }
        }

        // Calculate percentages
        let wit_coverage = if available_components > 0 {
            (components_with_wit as f64 / available_components as f64) * 100.0
        } else {
            0.0
        };

        let avg_interfaces_per_component = if available_components > 0 {
            total_interfaces as f64 / available_components as f64
        } else {
            0.0
        };

        let avg_functions_per_interface = if total_interfaces > 0 {
            total_functions as f64 / total_interfaces as f64
        } else {
            0.0
        };

        // Display formatted statistics
        info!("WASM Component Scan Statistics");
        info!("=====================================");
        info!("Scan Path: {:?}", self.watch_path);
        info!(
            "Scan Time: {}",
            self.last_scan.format("%Y-%m-%d %H:%M:%S UTC")
        );
        // Empty line for formatting

        // Component Overview
        info!("Component Overview:");
        info!("   Total Components: {total_components}");
        let available_pct = if total_components > 0 {
            (available_components as f64 / total_components as f64) * 100.0
        } else {
            0.0
        };
        info!("   Available: {available_components} ({available_pct:.1}%)");
        let missing_pct = if total_components > 0 {
            (missing_components as f64 / total_components as f64) * 100.0
        } else {
            0.0
        };
        info!("   Missing: {missing_components} ({missing_pct:.1}%)");
        info!("   WIT Analysis Coverage: {components_with_wit} ({wit_coverage:.1}%)");
        // Empty line for formatting

        // Interface Statistics
        info!("Interface Analysis:");
        info!("   Total Interfaces: {total_interfaces}");
        let imports_pct = if total_interfaces > 0 {
            (total_imports as f64 / total_interfaces as f64) * 100.0
        } else {
            0.0
        };
        info!("   Imports: {total_imports} ({imports_pct:.1}%)");
        let exports_pct = if total_interfaces > 0 {
            (total_exports as f64 / total_interfaces as f64) * 100.0
        } else {
            0.0
        };
        info!("   Exports: {total_exports} ({exports_pct:.1}%)");
        info!("   Total Functions: {total_functions}");
        info!("   Dependencies: {dependency_count}");
        // Empty line for formatting

        // Averages
        info!("Averages:");
        info!("   Interfaces per Component: {avg_interfaces_per_component:.1}");
        info!("   Functions per Interface: {avg_functions_per_interface:.1}");
        let deps_per_component = if available_components > 0 {
            dependency_count as f64 / available_components as f64
        } else {
            0.0
        };
        info!("   Dependencies per Component: {deps_per_component:.1}");
        // Empty line for formatting

        // Interface Type Breakdown
        if !interface_types.is_empty() {
            info!("Interface Categories:");
            let mut sorted_types: Vec<_> = interface_types.iter().collect();
            sorted_types.sort_by(|a, b| b.1.cmp(a.1));

            for (category, count) in sorted_types {
                let percentage = if total_interfaces > 0 {
                    (*count as f64 / total_interfaces as f64) * 100.0
                } else {
                    0.0
                };
                info!("   {category}: {count} ({percentage:.1}%)");
            }
            // Empty line for formatting
        }

        // Component Details (top 5 by interface count)
        if available_components > 0 {
            info!("Top Components by Interface Count:");
            let mut components_by_interfaces: Vec<_> =
                self.components.values().filter(|c| c.file_exists).collect();
            components_by_interfaces.sort_by(|a, b| b.interfaces.len().cmp(&a.interfaces.len()));

            for (i, component) in components_by_interfaces.iter().take(5).enumerate() {
                let wit_status = if component.wit_interfaces.is_some() {
                    "✅"
                } else {
                    "❌"
                };
                let rank = i + 1;
                let name = &component.name;
                let interface_count = component.interfaces.len();
                let dep_count = component.dependencies.len();
                info!("   {rank}. {name} - {interface_count} interfaces, {dep_count} deps {wit_status}");
            }
            // Empty line for formatting
        }

        // Security Analysis Summary
        if components_with_security_analysis > 0 {
            info!("Security Analysis Summary:");
            let security_coverage = if available_components > 0 {
                (components_with_security_analysis as f64 / available_components as f64) * 100.0
            } else {
                0.0
            };
            info!("   Security Coverage: {components_with_security_analysis}/{available_components} ({security_coverage:.1}%)");
            info!("   Total Security Issues: {total_security_issues}");

            for (risk_level, count) in &security_summary {
                if *count > 0 {
                    let icon = match risk_level {
                        SecurityRiskLevel::Critical => "🔴",
                        SecurityRiskLevel::High => "🟠",
                        SecurityRiskLevel::Medium => "🟡",
                        SecurityRiskLevel::Low => "🟢",
                    };
                    info!("   {icon} {:?}: {count} components", risk_level);
                }
            }

            // Security recommendations
            let critical_count = security_summary
                .get(&SecurityRiskLevel::Critical)
                .unwrap_or(&0);
            let high_count = security_summary.get(&SecurityRiskLevel::High).unwrap_or(&0);

            if *critical_count > 0 {
                warn!("   URGENT: {critical_count} components have critical security issues!");
            }
            if *high_count > 0 {
                warn!("   WARNING: {high_count} components have high-risk security issues");
            }
            // Empty line for formatting
        }

        // Health Assessment
        let health_status = if missing_components == 0 && wit_coverage > 80.0 {
            "🟢 EXCELLENT"
        } else if missing_components == 0 && wit_coverage > 50.0 {
            "🟡 GOOD"
        } else if missing_components < total_components / 2 {
            "🟠 DEGRADED"
        } else {
            "🔴 CRITICAL"
        };

        info!("Component Ecosystem Health: {health_status}");

        if missing_components > 0 {
            warn!("Warning: {missing_components} components have missing files");
        }

        if wit_coverage < 50.0 && available_components > 0 {
            info!("Suggestion: Consider running WIT analysis on more components");
        }

        info!("=====================================");
    }

    /// Change the watched path and restart filesystem monitoring
    pub async fn change_watch_path(&mut self, new_path: PathBuf) -> anyhow::Result<()> {
        info!(
            "Changing WASM file watcher path from {:?} to {:?}",
            self.watch_path, new_path
        );

        // Update the path
        self.watch_path = new_path;

        // Clear existing components since they're from the old path
        self.components.clear();

        // Clear recent changes
        self.recent_changes.lock().await.clear();

        // If we have a filesystem watcher, update its path
        if let Some(fs_watcher_arc) = &self.filesystem_watcher {
            let mut fs_watcher = fs_watcher_arc.write().await;
            fs_watcher
                .change_watch_path(self.watch_path.clone())
                .await
                .map_err(|e| anyhow::anyhow!("Failed to change filesystem watcher path: {}", e))?;
        }

        // Perform initial scan of the new path
        self.scan_components().await?;

        info!("WASM file watcher successfully changed to new path");
        Ok(())
    }
}

impl InterfaceConnection {
    /// Create a new interface connection
    pub fn new(
        source_component: String,
        source_interface: String,
        target_component: String,
        target_interface: String,
        connection_type: ConnectionType,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            source_component,
            source_interface,
            source_function: None,
            target_component,
            target_interface,
            target_function: None,
            connection_type,
            metadata: HashMap::new(),
        }
    }

    /// Create a function-level connection
    pub fn new_function_connection(
        source_component: String,
        source_interface: String,
        source_function: String,
        target_component: String,
        target_interface: String,
        target_function: String,
        connection_type: ConnectionType,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            source_component,
            source_interface,
            source_function: Some(source_function),
            target_component,
            target_interface,
            target_function: Some(target_function),
            connection_type,
            metadata: HashMap::new(),
        }
    }
}

impl ExternalInterface {
    /// Create a new external interface from an internal component interface
    pub fn from_component_interface(
        name: String,
        interface_type: String,
        source_component: String,
        source_interface: String,
        functions: Vec<WasmFunction>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            interface_type,
            source_component,
            source_interface,
            functions,
            description: None,
            metadata: HashMap::new(),
        }
    }
}

impl ComponentGroup {
    /// Create a new component group
    pub fn new(name: String, description: Option<String>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            description,
            component_ids: Vec::new(),
            internal_connections: Vec::new(),
            external_interfaces: Vec::new(),
            created_at: now,
            updated_at: now,
            metadata: HashMap::new(),
        }
    }

    /// Add a component to the group
    pub fn add_component(&mut self, component_id: String) {
        if !self.component_ids.contains(&component_id) {
            self.component_ids.push(component_id);
            self.updated_at = Utc::now();
        }
    }

    /// Remove a component from the group
    pub fn remove_component(&mut self, component_id: &str) -> bool {
        if let Some(pos) = self.component_ids.iter().position(|id| id == component_id) {
            self.component_ids.remove(pos);

            // Remove any connections involving this component
            self.internal_connections.retain(|conn| {
                conn.source_component != component_id && conn.target_component != component_id
            });

            // Remove any external interfaces from this component
            self.external_interfaces
                .retain(|iface| iface.source_component != component_id);

            self.updated_at = Utc::now();
            true
        } else {
            false
        }
    }

    /// Add an internal connection between components
    pub fn add_connection(&mut self, connection: InterfaceConnection) {
        // Validate that both components are in the group
        if self.component_ids.contains(&connection.source_component)
            && self.component_ids.contains(&connection.target_component)
        {
            self.internal_connections.push(connection);
            self.updated_at = Utc::now();
        }
    }

    /// Add an external interface
    pub fn add_external_interface(&mut self, interface: ExternalInterface) {
        // Validate that the source component is in the group
        if self.component_ids.contains(&interface.source_component) {
            self.external_interfaces.push(interface);
            self.updated_at = Utc::now();
        }
    }

    /// Get all components that have unconnected interfaces
    pub fn get_unconnected_components(&self) -> Vec<&String> {
        // This would require component interface analysis
        // For now, return all components
        self.component_ids.iter().collect()
    }

    /// Validate the component group
    pub fn validate(&self, components: &HashMap<String, WasmComponent>) -> ValidationStatus {
        let mut issues = Vec::new();
        let mut interface_compatibility = true;

        // Check that all component IDs exist
        for component_id in &self.component_ids {
            if !components.contains_key(component_id) {
                issues.push(format!("Component '{component_id}' not found"));
                interface_compatibility = false;
            }
        }

        // Check that all connections reference valid components and interfaces
        for connection in &self.internal_connections {
            if !self.component_ids.contains(&connection.source_component) {
                issues.push(format!(
                    "Connection source component '{}' not in group",
                    connection.source_component
                ));
                interface_compatibility = false;
            }
            if !self.component_ids.contains(&connection.target_component) {
                issues.push(format!(
                    "Connection target component '{}' not in group",
                    connection.target_component
                ));
                interface_compatibility = false;
            }
        }

        // Check that all external interfaces reference valid components
        for interface in &self.external_interfaces {
            if !self.component_ids.contains(&interface.source_component) {
                issues.push(format!(
                    "External interface source component '{}' not in group",
                    interface.source_component
                ));
                interface_compatibility = false;
            }
        }

        ValidationStatus {
            is_valid: issues.is_empty(),
            issues,
            interface_compatibility,
            timing_constraints_met: true, // TODO: Implement timing validation
            last_validated: Utc::now(),
        }
    }
}

impl ComponentGroupInfo {
    /// Create component group info from a group and component map
    pub fn from_group(
        group: ComponentGroup,
        all_components: &HashMap<String, WasmComponent>,
    ) -> Self {
        let components = group
            .component_ids
            .iter()
            .filter_map(|id| all_components.get(id).cloned())
            .collect();

        Self {
            group,
            components,
            bazel_config: None,
            wac_config: None,
            validation_status: None,
        }
    }

    /// Generate Bazel configuration for this component group
    pub fn generate_bazel_config(&self) -> String {
        let group_name = self.group.name.replace(' ', "_").to_lowercase();

        let mut config = format!(
            "# Generated Bazel configuration for component group: {}\n",
            self.group.name
        );
        config.push_str("load(\"//bazel:wasm_component_rules.bzl\", \"wac_compose\")\n\n");

        config.push_str(&format!("wac_compose(\n    name = \"{group_name}\",\n"));

        config.push_str("    components = [\n");
        for component in &self.components {
            config.push_str(&format!("        \"//{}:component\",\n", component.name));
        }
        config.push_str("    ],\n");

        config.push_str(&format!("    wac_config = \"{group_name}.wac.toml\",\n"));
        config.push_str(&format!("    output = \"{group_name}.wasm\",\n"));
        config.push_str("    validate_timing = True,\n");
        config.push_str("    validate_safety = True,\n");
        config.push_str(")\n");

        config
    }

    /// Generate WAC configuration for this component group
    pub fn generate_wac_config(&self) -> String {
        let mut config = format!(
            "# WAC configuration for component group: {}\n",
            self.group.name
        );
        config.push_str("[package]\n");
        config.push_str(&format!(
            "name = \"{}\"\n",
            self.group.name.replace(' ', "-").to_lowercase()
        ));
        config.push_str("version = \"0.1.0\"\n\n");

        config.push_str("[dependencies]\n");
        for component in &self.components {
            config.push_str(&format!(
                "{} = {{ path = \"{}\" }}\n",
                component.name, component.path
            ));
        }
        config.push('\n');

        config.push_str("[compose]\n");
        for connection in &self.group.internal_connections {
            config.push_str(&format!(
                "connect({}:{}, {}:{})\n",
                connection.source_component,
                connection.source_interface,
                connection.target_component,
                connection.target_interface
            ));
        }

        config
    }

    /// Generate enhanced Bazel BUILD.bazel file content with proper rules_wasm_component integration
    pub fn generate_enhanced_build_file(
        &self,
        profile: &str,
        optimizations: bool,
        validation: bool,
    ) -> String {
        let group_name = self.group.name.replace(' ', "_").to_lowercase();
        let target_name = format!("{group_name}_composition");

        let mut config = format!(
            "# Generated BUILD.bazel for component group: {}\n# Generated by GLSP Component Grouping System\n\n",
            self.group.name
        );

        config.push_str("load(\"@rules_wasm_component//wac:defs.bzl\", \"wac_compose\")\n");
        if validation {
            config.push_str("load(\"@rules_wasm_component//wasm:defs.bzl\", \"wasm_validate\")\n");
        }
        config.push('\n');

        // Main composition rule
        config.push_str("wac_compose(\n");
        config.push_str(&format!("    name = \"{target_name}\",\n"));
        config.push_str("    components = {\n");

        for component in &self.components {
            let component_target = component.name.to_lowercase().replace(' ', "_");
            config.push_str(&format!(
                "        \"{component_target}\": \":{component_target}_{profile}\",\n"
            ));
        }

        config.push_str("    },\n");
        config.push_str("    composition_file = \"production.wac\",\n");
        config.push_str(&format!("    profile = \"{profile}\",\n"));

        if optimizations {
            config.push_str("    tags = [\"optimize\"],\n");
        }

        config.push_str("    visibility = [\"//visibility:public\"],\n");
        config.push_str(")\n\n");

        // Validation target
        if validation {
            config.push_str("wasm_validate(\n");
            config.push_str(&format!("    name = \"{target_name}_validate\",\n"));
            config.push_str(&format!("    src = \":{target_name}\",\n"));
            config.push_str("    validate_connections = True,\n");
            config.push_str("    lint_wit = True,\n");
            config.push_str(")\n\n");
        }

        // Individual component targets (assuming they exist)
        config.push_str("# Individual component targets (assuming they exist)\n");
        for component in &self.components {
            let component_target = component.name.to_lowercase().replace(' ', "_");
            config.push_str(&format!("# Component: {}\n", component.name));
            config.push_str("rust_wasm_component(\n");
            config.push_str(&format!("    name = \"{component_target}_{profile}\",\n"));
            config.push_str(&format!(
                "    srcs = [\"src/{component_target}/lib.rs\"],\n"
            ));
            config.push_str(&format!("    wit_bindgen = \":{component_target}_wit\",\n"));
            config.push_str(&format!("    profile = \"{profile}\",\n"));

            if optimizations && profile == "release" {
                config.push_str("    strip_debug_info = True,\n");
            }

            config.push_str("    visibility = [\"//visibility:public\"],\n");
            config.push_str(")\n\n");
        }

        config
    }

    /// Write BUILD.bazel file to workspace directory
    pub async fn write_build_file_to_workspace(
        &self,
        workspace_path: &std::path::Path,
        profile: &str,
        optimizations: bool,
        validation: bool,
    ) -> Result<std::path::PathBuf, anyhow::Error> {
        let group_name = self.group.name.replace(' ', "_").to_lowercase();
        let target_dir = workspace_path.join(&group_name);

        // Create target directory
        tokio::fs::create_dir_all(&target_dir).await?;

        // Generate BUILD.bazel content
        let build_content = self.generate_enhanced_build_file(profile, optimizations, validation);

        // Write BUILD.bazel file
        let build_file_path = target_dir.join("BUILD.bazel");
        tokio::fs::write(&build_file_path, build_content).await?;

        tracing::info!("Generated BUILD.bazel file at: {:?}", build_file_path);
        Ok(build_file_path)
    }

    /// Write WAC configuration file to workspace directory
    pub async fn write_wac_file_to_workspace(
        &self,
        workspace_path: &std::path::Path,
    ) -> Result<std::path::PathBuf, anyhow::Error> {
        let group_name = self.group.name.replace(' ', "_").to_lowercase();
        let target_dir = workspace_path.join(&group_name);

        // Create target directory
        tokio::fs::create_dir_all(&target_dir).await?;

        // Generate WAC content
        let wac_content = self.generate_wac_config();

        // Write production.wac file
        let wac_file_path = target_dir.join("production.wac");
        tokio::fs::write(&wac_file_path, wac_content).await?;

        tracing::info!("Generated production.wac file at: {:?}", wac_file_path);
        Ok(wac_file_path)
    }

    /// Write both BUILD.bazel and WAC files to workspace with comprehensive configuration
    pub async fn deploy_to_workspace(
        &self,
        workspace_path: &std::path::Path,
        config: &DeploymentConfig,
    ) -> Result<DeploymentResult, anyhow::Error> {
        let mut files_written = Vec::new();
        let mut errors = Vec::new();

        // Write BUILD.bazel file if requested
        if config.generate_build_file {
            match self
                .write_build_file_to_workspace(
                    workspace_path,
                    &config.profile,
                    config.optimizations.enable_optimizations,
                    config.validation.validate_components,
                )
                .await
            {
                Ok(path) => files_written.push(path),
                Err(e) => errors.push(format!("Failed to write BUILD.bazel: {e}")),
            }
        }

        // Write WAC file if requested
        if config.generate_wac_file {
            match self.write_wac_file_to_workspace(workspace_path).await {
                Ok(path) => files_written.push(path),
                Err(e) => errors.push(format!("Failed to write production.wac: {e}")),
            }
        }

        let success = errors.is_empty();
        Ok(DeploymentResult {
            files_written,
            errors,
            success,
        })
    }
}

/// Deployment configuration for component groups
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentConfig {
    pub group_id: String,
    pub group_name: String,
    pub profile: String,
    pub target_name: String,
    pub package_name: String,
    pub generate_wac_file: bool,
    pub generate_build_file: bool,
    pub optimizations: OptimizationConfig,
    pub validation: ValidationConfig,
}

/// Optimization settings for deployment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationConfig {
    pub enable_optimizations: bool,
    pub strip_debug_info: bool,
    pub use_symlinks: bool,
}

/// Validation settings for deployment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationConfig {
    pub validate_components: bool,
    pub validate_connections: bool,
    pub lint_wit: bool,
}

/// Result of deploying component group to workspace
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentResult {
    pub files_written: Vec<std::path::PathBuf>,
    pub errors: Vec<String>,
    pub success: bool,
}
