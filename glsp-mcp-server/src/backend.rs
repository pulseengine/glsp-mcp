//! Simplified GLSP Backend implementation for MCP framework
//!
//! This is a simplified version to get the basic structure working first.

use crate::database::{
    config::DatabaseBackend, factory::DatabaseManager, BoxedDatasetManager, DatabaseConfig,
};
use crate::model::{DiagramModel, Edge, ElementType, Node, Position};
use crate::persistence::PersistenceManager;
use crate::wasm::{
    FileSystemWatcher, WasmExecutionEngine, WasmFileWatcher, WasmPipelineEngine,
    WasmSimulationEngine,
};
use clap::Parser;
use pulseengine_mcp_cli_derive::McpConfig;
use pulseengine_mcp_protocol::*;
use pulseengine_mcp_server::{BackendError, McpBackend};
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use tracing::{error, info};

/// Configuration for the GLSP backend
#[derive(Debug, Clone, McpConfig, Parser)]
#[command(author, version, about = "GLSP MCP Server - AI-native graphical modeling platform", long_about = None)]
pub struct GlspConfig {
    /// Path to WebAssembly components directory
    #[clap(short, long, default_value = "../workspace/adas-wasm-components")]
    pub wasm_path: String,

    /// Path to diagrams storage directory
    #[clap(short, long, default_value = "../workspace/diagrams")]
    pub diagrams_path: String,

    /// HTTP server port
    #[clap(short, long, default_value = "3000")]
    pub port: u16,

    /// Transport type: 'stdio', 'http', or 'http-streaming' (default: http-streaming)
    #[clap(long, default_value = "http-streaming")]
    pub transport: String,

    /// Force create directories if they don't exist
    #[clap(short, long)]
    pub force: bool,

    /// Database backend type (postgresql, influxdb, redis, mock)
    #[clap(long, default_value = "mock")]
    pub database_backend: String,

    /// Database host
    #[clap(long, default_value = "localhost")]
    pub database_host: String,

    /// Database port
    #[clap(long, default_value = "5432")]
    pub database_port: u16,

    /// Database name
    #[clap(long, default_value = "glsp_sensors")]
    pub database_name: String,

    /// Database username
    #[clap(long)]
    pub database_user: Option<String>,

    /// Enable database features for sensor data
    #[clap(long)]
    pub enable_database: bool,

    /// Server name (auto-populated)
    #[mcp(auto_populate)]
    #[clap(skip)]
    pub server_name: String,

    /// Server version (auto-populated)
    #[mcp(auto_populate)]
    #[clap(skip)]
    pub server_version: String,
}

impl Default for GlspConfig {
    fn default() -> Self {
        Self {
            wasm_path: "../workspace/adas-wasm-components".to_string(),
            diagrams_path: "../workspace/diagrams".to_string(),
            port: 3000,
            transport: "http-streaming".to_string(),
            force: false,
            database_backend: "mock".to_string(),
            database_host: "localhost".to_string(),
            database_port: 5432,
            database_name: "glsp_sensors".to_string(),
            database_user: None,
            enable_database: false,
            server_name: "GLSP MCP Server".to_string(),
            server_version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }
}

impl GlspConfig {
    /// Convert to database configuration
    pub fn to_database_config(&self) -> std::result::Result<DatabaseConfig, String> {
        if !self.enable_database {
            return Ok(DatabaseConfig::mock());
        }

        let backend = match self.database_backend.to_lowercase().as_str() {
            "postgresql" | "postgres" => DatabaseBackend::PostgreSQL,
            "influxdb" | "influx" => DatabaseBackend::InfluxDB,
            "redis" => DatabaseBackend::Redis,
            "sqlite" => DatabaseBackend::SQLite,
            "mock" => DatabaseBackend::Mock,
            _ => {
                return Err(format!(
                    "Unknown database backend: {}",
                    self.database_backend
                ))
            }
        };

        let mut config = DatabaseConfig {
            backend,
            ..Default::default()
        };
        config.connection.host = self.database_host.clone();
        config.connection.port = self.database_port;
        config.connection.database = self.database_name.clone();
        config.connection.username = self.database_user.clone();

        // Load password from environment if available
        if let Ok(password) = std::env::var("GLSP_DB_PASSWORD") {
            config.connection.password = Some(password);
        }

        Ok(config)
    }

    /// Get the base directory for diagram storage, ensuring it exists
    pub async fn ensure_diagrams_dir(&self) -> std::result::Result<PathBuf, std::io::Error> {
        let path = PathBuf::from(&self.diagrams_path);
        if self.force || !path.exists() {
            tokio::fs::create_dir_all(&path).await?;
        }
        Ok(path)
    }

    /// Get the base directory for WASM components, ensuring it exists
    pub async fn ensure_wasm_dir(&self) -> std::result::Result<PathBuf, std::io::Error> {
        let path = PathBuf::from(&self.wasm_path);
        if self.force || !path.exists() {
            tokio::fs::create_dir_all(&path).await?;
        }
        Ok(path)
    }
}

/// Error type for GLSP backend operations
#[derive(Debug, thiserror::Error)]
pub enum GlspError {
    #[error("Tool execution failed: {0}")]
    ToolExecution(String),

    #[error("Not implemented: {0}")]
    NotImplemented(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Backend error: {0}")]
    Backend(#[from] BackendError),
}

impl From<GlspError> for Error {
    fn from(err: GlspError) -> Self {
        match err {
            GlspError::ToolExecution(msg) => {
                Error::internal_error(format!("Tool execution failed: {msg}"))
            }
            GlspError::NotImplemented(msg) => {
                Error::method_not_found(format!("Not implemented: {msg}"))
            }
            GlspError::Io(e) => Error::internal_error(format!("IO error: {e}")),
            GlspError::Json(e) => Error::internal_error(format!("JSON error: {e}")),
            GlspError::Backend(e) => Error::internal_error(format!("Backend error: {e}")),
        }
    }
}

/// GLSP Backend implementation - The core server backend for AI-native diagram modeling
///
/// This backend provides a complete implementation of the Model Context Protocol (MCP)
/// for AI agents to interact with graphical diagrams and WASM components. It manages
/// diagram persistence, WASM component execution, and real-time collaboration.
///
/// # Features
///
/// - **Diagram Management**: Create, edit, and persist graphical diagrams
/// - **WASM Execution**: Execute WebAssembly components with security sandboxing
/// - **File System Monitoring**: Real-time monitoring of WASM component changes
/// - **Database Integration**: Optional sensor data storage and querying
/// - **Pipeline Execution**: Complex data processing workflows
/// - **Simulation Engine**: Time-driven scenario execution
///
/// # Examples
///
/// ```rust,no_run
/// use glsp_mcp_server::{GlspBackend, GlspConfig};
/// use clap::Parser;
///
/// #[tokio::main]
/// async fn main() -> Result<(), Box<dyn std::error::Error>> {
///     let config = GlspConfig::parse();
///     let backend = GlspBackend::initialize(config).await?;
///     
///     // Backend is now ready for MCP operations
///     Ok(())
/// }
/// ```
#[derive(Clone)]
pub struct GlspBackend {
    config: GlspConfig,
    models: std::sync::Arc<tokio::sync::Mutex<HashMap<String, DiagramModel>>>,
    wasm_watcher: std::sync::Arc<tokio::sync::Mutex<WasmFileWatcher>>,
    filesystem_watcher: std::sync::Arc<tokio::sync::RwLock<FileSystemWatcher>>,
    persistence: std::sync::Arc<PersistenceManager>,
    database_manager: Option<std::sync::Arc<DatabaseManager>>,
    execution_engine: Option<std::sync::Arc<WasmExecutionEngine>>,
    pipeline_engine: Option<std::sync::Arc<WasmPipelineEngine>>,
    simulation_engine: Option<std::sync::Arc<WasmSimulationEngine>>,
}

impl GlspBackend {
    pub async fn initialize(config: GlspConfig) -> std::result::Result<Self, GlspError> {
        info!("Initializing GLSP backend with config: {:?}", config);

        let wasm_path = PathBuf::from(&config.wasm_path);
        let wasm_watcher = WasmFileWatcher::new(wasm_path.clone());
        let mut filesystem_watcher = FileSystemWatcher::new(wasm_path);

        // Start filesystem watching
        filesystem_watcher.start_watching().await.map_err(|e| {
            GlspError::NotImplemented(format!("Failed to start filesystem watcher: {e}"))
        })?;

        let diagrams_path = PathBuf::from(&config.diagrams_path);
        let persistence = PersistenceManager::new(diagrams_path);

        // Ensure storage directory exists
        persistence.ensure_storage_dir().await.map_err(|e| {
            GlspError::NotImplemented(format!("Failed to create storage directory: {e}"))
        })?;

        // Initialize database if enabled
        let database_manager = if config.enable_database {
            info!("Initializing database connection...");
            match config.to_database_config() {
                Ok(db_config) => {
                    match DatabaseManager::new(db_config).await {
                        Ok(db_manager) => {
                            // Start health monitoring
                            db_manager.start_health_monitoring().await;
                            Some(std::sync::Arc::new(db_manager))
                        }
                        Err(e) => {
                            error!("Failed to initialize database: {}", e);
                            info!("Continuing without database support");
                            None
                        }
                    }
                }
                Err(e) => {
                    error!("Invalid database configuration: {}", e);
                    info!("Continuing without database support");
                    None
                }
            }
        } else {
            info!("Database support disabled");
            None
        };

        // Initialize WASM execution engines if database is available
        let (execution_engine, pipeline_engine, simulation_engine) = if let Some(ref _db_manager) =
            database_manager
        {
            // Create dataset manager using database backend
            match config.to_database_config() {
                Ok(db_config) => {
                    match crate::database::DatabaseFactory::create(db_config).await {
                        Ok(backend) => {
                            let dataset_manager =
                                crate::database::BoxedDatasetManager::new(backend);
                            let dataset_manager_arc =
                                std::sync::Arc::new(tokio::sync::Mutex::new(dataset_manager));

                            // Create execution engine with sensor support
                            match WasmExecutionEngine::with_dataset_manager(
                                10,
                                dataset_manager_arc.clone(),
                            ) {
                                Ok(exec_engine) => {
                                    let exec_engine_arc = std::sync::Arc::new(exec_engine);

                                    // Create pipeline engine
                                    let pipeline_engine =
                                        WasmPipelineEngine::new(exec_engine_arc.clone(), 5);
                                    let pipeline_engine_arc = std::sync::Arc::new(pipeline_engine);

                                    // Create simulation engine with sensor support
                                    match WasmSimulationEngine::with_sensor_support(
                                        pipeline_engine_arc.clone(),
                                        dataset_manager_arc.clone(),
                                        3,
                                    )
                                    .await
                                    {
                                        Ok(sim_engine) => {
                                            let sim_engine_arc = std::sync::Arc::new(sim_engine);
                                            info!("WASM execution engines initialized with sensor support");
                                            (
                                                Some(exec_engine_arc),
                                                Some(pipeline_engine_arc),
                                                Some(sim_engine_arc),
                                            )
                                        }
                                        Err(e) => {
                                            error!("Failed to create simulation engine: {}", e);
                                            (Some(exec_engine_arc), Some(pipeline_engine_arc), None)
                                        }
                                    }
                                }
                                Err(e) => {
                                    error!("Failed to create execution engine: {}", e);
                                    (None, None, None)
                                }
                            }
                        }
                        Err(e) => {
                            error!("Failed to create dataset manager backend: {}", e);
                            (None, None, None)
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to get database configuration: {}", e);
                    (None, None, None)
                }
            }
        } else {
            // Create basic execution engine without sensor support
            match WasmExecutionEngine::new(10) {
                Ok(exec_engine) => {
                    let exec_engine_arc = std::sync::Arc::new(exec_engine);
                    let pipeline_engine = WasmPipelineEngine::new(exec_engine_arc.clone(), 5);
                    let pipeline_engine_arc = std::sync::Arc::new(pipeline_engine);

                    // Create simulation engine without sensor support
                    let simulation_engine =
                        WasmSimulationEngine::new(pipeline_engine_arc.clone(), 3);
                    let simulation_engine_arc = std::sync::Arc::new(simulation_engine);

                    info!("WASM execution engines initialized without sensor support");
                    (
                        Some(exec_engine_arc),
                        Some(pipeline_engine_arc),
                        Some(simulation_engine_arc),
                    )
                }
                Err(e) => {
                    error!("Failed to create basic execution engine: {}", e);
                    (None, None, None)
                }
            }
        };

        // Create backend instance
        let backend = Self {
            config,
            models: std::sync::Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            wasm_watcher: std::sync::Arc::new(tokio::sync::Mutex::new(wasm_watcher)),
            filesystem_watcher: std::sync::Arc::new(tokio::sync::RwLock::new(filesystem_watcher)),
            persistence: std::sync::Arc::new(persistence),
            database_manager,
            execution_engine,
            pipeline_engine,
            simulation_engine,
        };

        // Load existing diagrams from disk
        backend.load_all_diagrams().await?;

        // Perform initial WASM component scan with statistics
        info!("Performing initial WASM component scan...");
        {
            let mut wasm_watcher = backend.wasm_watcher.lock().await;

            // Initialize with execution engine
            *wasm_watcher = wasm_watcher.clone().with_execution_engine(3).map_err(|e| {
                GlspError::NotImplemented(format!("Failed to init execution engine: {e}"))
            })?;

            // Start file watching for real-time updates
            if let Err(e) = wasm_watcher.start_file_watching().await {
                error!("Failed to start file watching: {}", e);
            }

            // Perform initial scan
            if let Err(e) = wasm_watcher.scan_components().await {
                error!("Failed to perform initial WASM component scan: {}", e);
            }
        }

        Ok(backend)
    }

    pub fn get_server_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: ProtocolVersion::default(),
            capabilities: ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .enable_prompts()
                .build(),
            server_info: Implementation {
                name: self.config.server_name.clone(),
                version: self.config.server_version.clone(),
            },
            instructions: Some("GLSP MCP Server for AI-native diagram modeling".to_string()),
        }
    }

    pub async fn health_check(&self) -> std::result::Result<(), GlspError> {
        // Check if WASM components directory exists
        if !std::path::Path::new(&self.config.wasm_path).exists() {
            return Err(GlspError::ToolExecution(format!(
                "WASM components directory not found: {}",
                self.config.wasm_path
            )));
        }

        // Check database health if enabled
        if let Some(db_manager) = &self.database_manager {
            if !db_manager.is_healthy().await {
                return Err(GlspError::ToolExecution(
                    "Database connection is unhealthy".to_string(),
                ));
            }
        }

        info!("GLSP backend health check passed");
        Ok(())
    }

    /// Get database manager if available
    pub fn database_manager(&self) -> Option<std::sync::Arc<DatabaseManager>> {
        self.database_manager.clone()
    }

    /// Create a dataset manager using the database backend
    pub async fn create_dataset_manager(&self) -> std::result::Result<BoxedDatasetManager, String> {
        if let Some(_db_manager) = &self.database_manager {
            let db_config = self.config.to_database_config()?;
            match crate::database::DatabaseFactory::create(db_config).await {
                Ok(backend) => Ok(BoxedDatasetManager::new(backend)),
                Err(e) => Err(format!("Failed to create dataset manager: {e}")),
            }
        } else {
            Err("Database not enabled".to_string())
        }
    }

    /// Check if database features are enabled and healthy
    pub async fn is_database_enabled(&self) -> bool {
        if let Some(db_manager) = &self.database_manager {
            db_manager.is_healthy().await
        } else {
            false
        }
    }

    /// Get database configuration if enabled
    pub fn get_database_config(&self) -> std::result::Result<DatabaseConfig, String> {
        self.config.to_database_config()
    }

    /// Get execution engine for WASM components
    pub fn execution_engine(&self) -> Option<std::sync::Arc<WasmExecutionEngine>> {
        self.execution_engine.clone()
    }

    /// Get pipeline engine for WASM component pipelines
    pub fn pipeline_engine(&self) -> Option<std::sync::Arc<WasmPipelineEngine>> {
        self.pipeline_engine.clone()
    }

    /// Get simulation engine for complex WASM simulations
    pub fn simulation_engine(&self) -> Option<std::sync::Arc<WasmSimulationEngine>> {
        self.simulation_engine.clone()
    }

    /// Check if WASM execution capabilities are available
    pub fn is_execution_enabled(&self) -> bool {
        self.execution_engine.is_some() && self.pipeline_engine.is_some()
    }

    /// Check if full simulation capabilities are available
    pub fn is_simulation_enabled(&self) -> bool {
        self.execution_engine.is_some()
            && self.pipeline_engine.is_some()
            && self.simulation_engine.is_some()
    }

    /// Set a new workspace directory (sets both wasm and diagrams subdirectories)
    pub async fn set_workspace_directory(
        &self,
        workspace_path: String,
    ) -> std::result::Result<(), GlspError> {
        use std::path::Path;

        let workspace = Path::new(&workspace_path);
        if !workspace.exists() {
            return Err(GlspError::ToolExecution(format!(
                "Workspace directory does not exist: {workspace_path}"
            )));
        }

        if !workspace.is_dir() {
            return Err(GlspError::ToolExecution(format!(
                "Path is not a directory: {workspace_path}"
            )));
        }

        // Set standard workspace structure
        let wasm_path = workspace
            .join("wasm-components")
            .to_string_lossy()
            .to_string();
        let diagrams_path = workspace.join("diagrams").to_string_lossy().to_string();

        // Create directories if they don't exist
        std::fs::create_dir_all(&wasm_path).map_err(|e| {
            GlspError::ToolExecution(format!("Failed to create wasm-components directory: {e}"))
        })?;
        std::fs::create_dir_all(&diagrams_path).map_err(|e| {
            GlspError::ToolExecution(format!("Failed to create diagrams directory: {e}"))
        })?;

        // Update paths
        self.set_wasm_components_path(wasm_path).await?;
        self.set_diagrams_path(diagrams_path).await?;

        info!("Workspace directory set to: {}", workspace_path);
        Ok(())
    }

    /// Set a new WASM components path and update the file watcher
    pub async fn set_wasm_components_path(
        &self,
        wasm_path: String,
    ) -> std::result::Result<(), GlspError> {
        use std::path::Path;

        let path = Path::new(&wasm_path);
        if !path.exists() {
            std::fs::create_dir_all(path).map_err(|e| {
                GlspError::ToolExecution(format!("Failed to create WASM directory: {e}"))
            })?;
        }

        // Update filesystem watcher
        {
            let mut filesystem_watcher = self.filesystem_watcher.write().await;
            filesystem_watcher
                .change_watch_path(path.to_path_buf())
                .await
                .map_err(|e| {
                    GlspError::ToolExecution(format!("Failed to update filesystem watcher: {e}"))
                })?;
        }

        // Update WASM file watcher
        {
            let mut wasm_watcher = self.wasm_watcher.lock().await;
            wasm_watcher
                .change_watch_path(path.to_path_buf())
                .await
                .map_err(|e| {
                    GlspError::ToolExecution(format!("Failed to update WASM watcher: {e}"))
                })?;
        }

        info!("WASM components path set to: {}", wasm_path);
        Ok(())
    }

    /// Set a new diagrams path and update the persistence manager
    pub async fn set_diagrams_path(
        &self,
        diagrams_path: String,
    ) -> std::result::Result<(), GlspError> {
        use std::path::Path;

        let path = Path::new(&diagrams_path);
        if !path.exists() {
            std::fs::create_dir_all(path).map_err(|e| {
                GlspError::ToolExecution(format!("Failed to create diagrams directory: {e}"))
            })?;
        }

        // Update persistence manager - since it's in an Arc, we need to replace it
        // For now, just validate the path change
        self.persistence
            .change_storage_path(path.to_path_buf())
            .await
            .map_err(|e| {
                GlspError::ToolExecution(format!("Failed to update persistence manager: {e}"))
            })?;

        info!("Diagrams path set to: {}", diagrams_path);
        Ok(())
    }

    /// Get current workspace information
    pub async fn get_current_workspace(&self) -> std::result::Result<serde_json::Value, GlspError> {
        let wasm_path = &self.config.wasm_path;
        let diagrams_path = &self.config.diagrams_path;

        // Try to determine workspace root by checking if both paths are subdirectories of a common parent
        let workspace_root = if let (Some(wasm_parent), Some(diagrams_parent)) = (
            std::path::Path::new(wasm_path)
                .parent()
                .map(|p| p.to_string_lossy().to_string()),
            std::path::Path::new(diagrams_path)
                .parent()
                .map(|p| p.to_string_lossy().to_string()),
        ) {
            if wasm_parent == diagrams_parent {
                Some(wasm_parent)
            } else {
                None
            }
        } else {
            None
        };

        Ok(json!({
            "workspace_root": workspace_root,
            "wasm_components_path": wasm_path,
            "diagrams_path": diagrams_path,
            "wasm_components_count": self.count_wasm_components().await,
            "diagrams_count": self.count_diagrams().await
        }))
    }

    /// Trigger a rescan of the current workspace
    pub async fn rescan_workspace(&self) -> std::result::Result<(), GlspError> {
        // Trigger WASM component rescan
        {
            let mut wasm_watcher = self.wasm_watcher.lock().await;
            wasm_watcher.scan_components().await.map_err(|e| {
                GlspError::ToolExecution(format!("Failed to rescan WASM components: {e}"))
            })?;
        }

        // Reload diagrams from disk
        self.load_all_diagrams().await?;

        info!("Workspace rescan completed");
        Ok(())
    }

    /// Validate workspace paths and structure
    pub async fn validate_workspace_paths(
        &self,
        workspace_path: &str,
    ) -> std::result::Result<serde_json::Value, GlspError> {
        use std::path::Path;

        let workspace = Path::new(workspace_path);
        let wasm_dir = workspace.join("wasm-components");
        let diagrams_dir = workspace.join("diagrams");

        let mut errors = Vec::new();

        // Check workspace root
        let workspace_exists = workspace.exists();
        let workspace_is_dir = workspace.is_dir();
        let workspace_writable = workspace_exists
            && workspace
                .metadata()
                .map(|m| !m.permissions().readonly())
                .unwrap_or(false);

        if !workspace_exists {
            errors.push("Workspace directory does not exist".to_string());
        } else if !workspace_is_dir {
            errors.push("Workspace path is not a directory".to_string());
        } else if !workspace_writable {
            errors.push("Workspace directory is not writable".to_string());
        }

        // Check subdirectories
        let wasm_exists = wasm_dir.exists();
        let diagrams_exists = diagrams_dir.exists();

        // Count existing files
        let wasm_count = if wasm_exists {
            std::fs::read_dir(&wasm_dir)
                .map(|entries| entries.filter_map(|e| e.ok()).count())
                .unwrap_or(0)
        } else {
            0
        };

        let diagrams_count = if diagrams_exists {
            std::fs::read_dir(&diagrams_dir)
                .map(|entries| entries.filter_map(|e| e.ok()).count())
                .unwrap_or(0)
        } else {
            0
        };

        Ok(json!({
            "valid": errors.is_empty(),
            "workspace_exists": workspace_exists,
            "workspace_is_directory": workspace_is_dir,
            "workspace_writable": workspace_writable,
            "wasm_directory_exists": wasm_exists,
            "diagrams_directory_exists": diagrams_exists,
            "wasm_components_count": wasm_count,
            "diagrams_count": diagrams_count,
            "errors": errors
        }))
    }

    /// Count WASM components in current path
    async fn count_wasm_components(&self) -> u32 {
        std::fs::read_dir(&self.config.wasm_path)
            .map(|entries| entries.filter_map(|e| e.ok()).count() as u32)
            .unwrap_or(0)
    }

    /// Count diagrams in current path
    async fn count_diagrams(&self) -> u32 {
        std::fs::read_dir(&self.config.diagrams_path)
            .map(|entries| entries.filter_map(|e| e.ok()).count() as u32)
            .unwrap_or(0)
    }

    pub async fn list_tools(
        &self,
        _request: PaginatedRequestParam,
    ) -> std::result::Result<ListToolsResult, GlspError> {
        let tools = vec![
            // Core diagram tools
            Tool {
                name: "create_diagram".to_string(),
                description: "Create a new diagram model".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramType": {
                            "type": "string",
                            "description": "Type of diagram to create (e.g., 'workflow', 'bpmn', 'uml')"
                        },
                        "name": {
                            "type": "string",
                            "description": "Name for the new diagram"
                        }
                    },
                    "required": ["diagramType"]
                }),
            },
            Tool {
                name: "delete_diagram".to_string(),
                description: "Delete a diagram and its associated files".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram to delete"
                        }
                    },
                    "required": ["diagramId"]
                }),
            },
            Tool {
                name: "create_node".to_string(),
                description: "Create a new node in the diagram".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {"type": "string"},
                        "nodeType": {"type": "string"},
                        "position": {
                            "type": "object",
                            "properties": {
                                "x": {"type": "number"},
                                "y": {"type": "number"}
                            },
                            "required": ["x", "y"]
                        },
                        "label": {"type": "string"}
                    },
                    "required": ["diagramId", "nodeType", "position"]
                }),
            },
            Tool {
                name: "create_edge".to_string(),
                description: "Create a new edge connecting two nodes".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {"type": "string"},
                        "edgeType": {"type": "string"},
                        "sourceId": {"type": "string"},
                        "targetId": {"type": "string"},
                        "label": {"type": "string"}
                    },
                    "required": ["diagramId", "edgeType", "sourceId", "targetId"]
                }),
            },
            Tool {
                name: "delete_element".to_string(),
                description: "Delete an element from the diagram".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {"type": "string"},
                        "elementId": {"type": "string"}
                    },
                    "required": ["diagramId", "elementId"]
                }),
            },
            Tool {
                name: "update_element".to_string(),
                description: "Update properties of an existing element".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {"type": "string"},
                        "elementId": {"type": "string"},
                        "properties": {"type": "object"},
                        "position": {
                            "type": "object",
                            "properties": {
                                "x": {"type": "number"},
                                "y": {"type": "number"}
                            }
                        }
                    },
                    "required": ["diagramId", "elementId"]
                }),
            },
            Tool {
                name: "apply_layout".to_string(),
                description: "Apply automatic layout to the diagram".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {"type": "string"},
                        "algorithm": {
                            "type": "string",
                            "enum": ["hierarchical", "force", "circular", "grid"]
                        },
                        "direction": {
                            "type": "string",
                            "enum": ["top-bottom", "left-right", "bottom-top", "right-left"]
                        }
                    },
                    "required": ["diagramId", "algorithm"]
                }),
            },
            Tool {
                name: "export_diagram".to_string(),
                description: "Export diagram in various formats".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {"type": "string"},
                        "format": {
                            "type": "string",
                            "enum": ["svg", "png", "json", "dot"]
                        }
                    },
                    "required": ["diagramId", "format"]
                }),
            },
            Tool {
                name: "save_diagram".to_string(),
                description: "Save a diagram to disk (creates both content and layout files)"
                    .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {"type": "string"}
                    },
                    "required": ["diagramId"]
                }),
            },
            // Selection tools
            Tool {
                name: "select_elements".to_string(),
                description: "Select one or more elements in the diagram".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {"type": "string"},
                        "elementIds": {
                            "type": "array",
                            "items": {"type": "string"}
                        },
                        "mode": {
                            "type": "string",
                            "enum": ["single", "multiple", "range"],
                            "default": "single"
                        },
                        "append": {"type": "boolean", "default": false}
                    },
                    "required": ["diagramId", "elementIds"]
                }),
            },
            Tool {
                name: "select_all".to_string(),
                description: "Select all elements in the diagram".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {"type": "string"}
                    },
                    "required": ["diagramId"]
                }),
            },
            Tool {
                name: "clear_selection".to_string(),
                description: "Clear the current selection".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {"type": "string"}
                    },
                    "required": ["diagramId"]
                }),
            },
            Tool {
                name: "get_selection".to_string(),
                description: "Get the currently selected elements".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {"type": "string"}
                    },
                    "required": ["diagramId"]
                }),
            },
            // WASM component tools
            Tool {
                name: "scan_wasm_components".to_string(),
                description: "Scan for WASM components in the watch directory".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {},
                    "additionalProperties": false
                }),
            },
            Tool {
                name: "check_wasm_component_status".to_string(),
                description: "Check the status of a specific WASM component".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "componentName": {"type": "string"}
                    },
                    "required": ["componentName"]
                }),
            },
            Tool {
                name: "load_wasm_component".to_string(),
                description: "Load a WASM component into a diagram".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {"type": "string"},
                        "componentName": {"type": "string"},
                        "position": {
                            "type": "object",
                            "properties": {
                                "x": {"type": "number"},
                                "y": {"type": "number"}
                            },
                            "required": ["x", "y"]
                        }
                    },
                    "required": ["diagramId", "componentName", "position"]
                }),
            },
            Tool {
                name: "refresh_wasm_interfaces".to_string(),
                description: "Refresh interface data for all WASM components in a diagram"
                    .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {"type": "string"}
                    },
                    "required": ["diagramId"]
                }),
            },
            Tool {
                name: "get_component_path".to_string(),
                description: "Get the file path for a WASM component".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "componentName": {
                            "type": "string",
                            "description": "Name of the WASM component"
                        }
                    },
                    "required": ["componentName"]
                }),
            },
            Tool {
                name: "get_component_wit_info".to_string(),
                description: "Get WIT interface information for a selected component in a diagram"
                    .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram containing the component"
                        },
                        "elementId": {
                            "type": "string",
                            "description": "ID of the component element to analyze"
                        }
                    },
                    "required": ["diagramId", "elementId"]
                }),
            },
            Tool {
                name: "debug_wit_analysis".to_string(),
                description: "Debug WIT interface analysis for a specific WASM component file"
                    .to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "componentPath": {
                            "type": "string",
                            "description": "Full file path to the WASM component file to analyze"
                        }
                    },
                    "required": ["componentPath"]
                }),
            },

            // Workspace management tools
            Tool {
                name: "set_workspace_directory".to_string(),
                description: "Set workspace root directory (creates wasm-components and diagrams subdirectories)".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "workspace_path": {
                            "type": "string",
                            "description": "Absolute path to the workspace root directory"
                        },
                        "create_if_missing": {
                            "type": "boolean",
                            "description": "Create the directory if it doesn't exist",
                            "default": true
                        }
                    },
                    "required": ["workspace_path"]
                }),
            },
            Tool {
                name: "get_workspace_info".to_string(),
                description: "Get current workspace information and statistics".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {}
                }),
            },
            Tool {
                name: "set_wasm_components_path".to_string(),
                description: "Set custom WASM components directory path".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "wasm_path": {
                            "type": "string",
                            "description": "Absolute path to WASM components directory"
                        }
                    },
                    "required": ["wasm_path"]
                }),
            },
            Tool {
                name: "set_diagrams_path".to_string(),
                description: "Set custom diagrams storage directory path".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagrams_path": {
                            "type": "string",
                            "description": "Absolute path to diagrams storage directory"
                        }
                    },
                    "required": ["diagrams_path"]
                }),
            },
            Tool {
                name: "rescan_workspace".to_string(),
                description: "Trigger immediate rescan of current workspace (WASM components and diagrams)".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {}
                }),
            },
            Tool {
                name: "validate_workspace".to_string(),
                description: "Validate workspace structure and permissions".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "workspace_path": {
                            "type": "string",
                            "description": "Path to workspace directory to validate"
                        }
                    },
                    "required": ["workspace_path"]
                }),
            },
            Tool {
                name: "create_workspace_structure".to_string(),
                description: "Create standard workspace directory structure (wasm-components and diagrams subdirectories)".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "workspace_path": {
                            "type": "string",
                            "description": "Path to workspace root where subdirectories will be created"
                        }
                    },
                    "required": ["workspace_path"]
                }),
            },
            // UML diagram tools
            Tool {
                name: "add_uml_class".to_string(),
                description: "Add a UML class node to a UML diagram".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": { "type": "string", "description": "ID of the UML diagram" },
                        "name": { "type": "string", "description": "Class name" },
                        "attributes": { "type": "array", "items": { "type": "string" }, "description": "Class attributes" },
                        "methods": { "type": "array", "items": { "type": "string" }, "description": "Class methods" },
                        "position": {
                            "type": "object",
                            "properties": {
                                "x": { "type": "number" },
                                "y": { "type": "number" }
                            },
                            "required": ["x", "y"],
                            "description": "Position of the class node"
                        }
                    },
                    "required": ["diagramId", "name"]
                }),
            },
            Tool {
                name: "remove_uml_class".to_string(),
                description: "Remove a UML class node from a diagram".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": { "type": "string", "description": "ID of the diagram" },
                        "classId": { "type": "string", "description": "ID of the class node to remove" }
                    },
                    "required": ["diagramId", "classId"]
                }),
            },
            Tool {
                name: "update_uml_class".to_string(),
                description: "Update a UML class node's properties in a diagram".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": { "type": "string", "description": "ID of the diagram" },
                        "classId": { "type": "string", "description": "ID of the class node to update" },
                        "name": { "type": "string", "description": "New class name" },
                        "attributes": { "type": "array", "items": { "type": "object" }, "description": "Updated attributes" },
                        "methods": { "type": "array", "items": { "type": "object" }, "description": "Updated methods" }
                    },
                    "required": ["diagramId", "classId"]
                }),
            },
        ];

        Ok(ListToolsResult {
            tools,
            next_cursor: None,
        })
    }

    pub async fn call_tool(
        &self,
        request: CallToolRequestParam,
    ) -> std::result::Result<CallToolResult, GlspError> {
        match request.name.as_str() {
            "create_diagram" => self.create_diagram(request.arguments).await,
            "delete_diagram" => self.delete_diagram(request.arguments).await,
            "create_node" => self.create_node(request.arguments).await,
            "create_edge" => self.create_edge(request.arguments).await,
            "delete_element" => self.delete_element(request.arguments).await,
            "update_element" => self.update_element(request.arguments).await,
            "apply_layout" => self.apply_layout(request.arguments).await,
            "export_diagram" => self.export_diagram(request.arguments).await,
            "save_diagram" => self.save_diagram_tool(request.arguments).await,
            "select_elements" => self.select_elements(request.arguments).await,
            "select_all" => self.select_all(request.arguments).await,
            "clear_selection" => self.clear_selection(request.arguments).await,
            "get_selection" => self.get_selection(request.arguments).await,
            "scan_wasm_components" => self.scan_wasm_components().await,
            "check_wasm_component_status" => {
                self.check_wasm_component_status(request.arguments).await
            }
            "load_wasm_component" => self.load_wasm_component(request.arguments).await,
            "refresh_wasm_interfaces" => self.refresh_wasm_interfaces(request.arguments).await,
            "get_component_path" => self.get_component_path(request.arguments).await,
            "get_component_wit_info" => self.get_component_wit_info(request.arguments).await,
            "debug_wit_analysis" => self.debug_wit_analysis(request.arguments).await,

            // Workspace management tools
            "set_workspace_directory" => self.set_workspace_directory_tool(request.arguments).await,
            "get_workspace_info" => self.get_current_workspace_tool().await,
            "set_wasm_components_path" => {
                self.set_wasm_components_path_tool(request.arguments).await
            }
            "set_diagrams_path" => self.set_diagrams_path_tool(request.arguments).await,
            "rescan_workspace" => self.rescan_workspace_tool().await,
            "validate_workspace" => self.validate_workspace_tool(request.arguments).await,
            "create_workspace_structure" => {
                self.create_workspace_structure_tool(request.arguments)
                    .await
            }
            // UML tools
            "add_uml_class" => self.add_uml_class(request.arguments).await,
            "remove_uml_class" => self.remove_uml_class(request.arguments).await,
            "update_uml_class" => self.update_uml_class(request.arguments).await,

            _ => Err(GlspError::NotImplemented(format!(
                "Tool not implemented: {}",
                request.name
            ))),
        }
    }

    pub async fn list_resources(
        &self,
        _request: PaginatedRequestParam,
    ) -> std::result::Result<ListResourcesResult, GlspError> {
        let models = self.models.lock().await;
        let mut resources = vec![
            Resource {
                uri: "diagram://list".to_string(),
                name: "Diagram List".to_string(),
                description: Some("List of all available diagrams".to_string()),
                mime_type: Some("application/json".to_string()),
                annotations: None,
                raw: None,
            },
            Resource {
                uri: "wasm://components/list".to_string(),
                name: "WASM Components List".to_string(),
                description: Some("List of all available WASM components".to_string()),
                mime_type: Some("application/json".to_string()),
                annotations: None,
                raw: None,
            },
        ];

        // Add resources for each loaded diagram
        for (id, diagram) in models.iter() {
            resources.push(Resource {
                uri: format!("diagram://model/{id}"),
                name: diagram.name.clone(),
                description: Some(format!("{} diagram", diagram.diagram_type)),
                mime_type: Some("application/json".to_string()),
                annotations: None,
                raw: None,
            });

            resources.push(Resource {
                uri: format!("diagram://validation/{id}"),
                name: format!("{} Validation", diagram.name),
                description: Some("Validation results for the diagram".to_string()),
                mime_type: Some("application/json".to_string()),
                annotations: None,
                raw: None,
            });
        }

        // Add resources for individual WASM components
        let wasm_watcher = self.wasm_watcher.lock().await;
        let wasm_components = wasm_watcher.get_components();
        for component in wasm_components {
            resources.push(Resource {
                uri: format!("wasm://component/{}", component.name),
                name: format!("WASM Component: {}", component.name),
                description: Some(format!("Details for {} component", component.name)),
                mime_type: Some("application/json".to_string()),
                annotations: None,
                raw: None,
            });

            // Add WIT-specific resources for each component
            resources.push(Resource {
                uri: format!("wasm://component/{}/wit", component.name),
                name: format!("WIT Analysis: {}", component.name),
                description: Some(format!(
                    "WIT interface analysis for {} component",
                    component.name
                )),
                mime_type: Some("application/json".to_string()),
                annotations: None,
                raw: None,
            });

            resources.push(Resource {
                uri: format!("wasm://component/{}/wit/raw", component.name),
                name: format!("Raw WIT: {}", component.name),
                description: Some(format!("Raw WIT content for {} component", component.name)),
                mime_type: Some("text/plain".to_string()),
                annotations: None,
                raw: None,
            });

            resources.push(Resource {
                uri: format!("wasm://component/{}/interfaces", component.name),
                name: format!("Interfaces: {}", component.name),
                description: Some(format!("All interfaces for {} component", component.name)),
                mime_type: Some("application/json".to_string()),
                annotations: None,
                raw: None,
            });
        }

        Ok(ListResourcesResult {
            resources,
            next_cursor: None,
        })
    }

    pub async fn read_resource(
        &self,
        request: ReadResourceRequestParam,
    ) -> std::result::Result<ReadResourceResult, GlspError> {
        // Parse the URI to determine what resource is being requested
        if request.uri.starts_with("diagram://model/") {
            let diagram_id = request.uri.strip_prefix("diagram://model/").unwrap_or("");

            let models = self.models.lock().await;
            if let Some(model) = models.get(diagram_id) {
                // Return the diagram model as JSON
                let content = serde_json::to_string(model)
                    .map_err(|e| GlspError::NotImplemented(format!("Serialization error: {e}")))?;

                Ok(ReadResourceResult {
                    contents: vec![ResourceContents {
                        uri: request.uri.clone(),
                        mime_type: Some("application/json".to_string()),
                        text: Some(content),
                        blob: None,
                    }],
                })
            } else {
                Err(GlspError::NotImplemented(format!(
                    "Diagram not found: {diagram_id}"
                )))
            }
        } else if request.uri.starts_with("diagram://validation/") {
            // Return a simple validation result
            let _diagram_id = request
                .uri
                .strip_prefix("diagram://validation/")
                .unwrap_or("");
            let validation = json!({
                "isValid": true,
                "issues": []
            });

            Ok(ReadResourceResult {
                contents: vec![ResourceContents {
                    uri: request.uri.clone(),
                    mime_type: Some("application/json".to_string()),
                    text: Some(validation.to_string()),
                    blob: None,
                }],
            })
        } else if request.uri == "diagram://list" {
            // Return list of diagrams from both memory and disk
            let models = self.models.lock().await;
            let mut diagram_infos = Vec::new();

            // Add loaded diagrams with their info
            for (id, diagram) in models.iter() {
                diagram_infos.push(json!({
                    "id": id,
                    "name": diagram.name,
                    "diagramType": diagram.diagram_type,
                    "createdAt": diagram.created_at,
                    "updatedAt": diagram.updated_at,
                }));
            }

            let list = json!({
                "diagrams": diagram_infos
            });

            Ok(ReadResourceResult {
                contents: vec![ResourceContents {
                    uri: request.uri.clone(),
                    mime_type: Some("application/json".to_string()),
                    text: Some(list.to_string()),
                    blob: None,
                }],
            })
        } else if request.uri == "wasm://components/list" {
            // Get WASM components from the wasm watcher (with analyzed data)
            let wasm_watcher = self.wasm_watcher.lock().await;
            let wasm_components = wasm_watcher.get_components();

            let component_list: Vec<serde_json::Value> = wasm_components
                .iter()
                .map(|component| {
                    json!({
                        "name": component.name,
                        "path": component.path,
                        "description": format!("WASM component: {}", component.name),
                        "status": if component.file_exists { "available" } else { "missing" },
                        "interfaces": component.interfaces.len(),
                        "uri": format!("wasm://component/{}", component.name)
                    })
                })
                .collect();

            let available_count = wasm_components.iter().filter(|c| c.file_exists).count();
            let missing_count = wasm_components.len() - available_count;

            let wasm_list = json!({
                "components": component_list,
                "total": component_list.len(),
                "available": available_count,
                "missing": missing_count
            });

            Ok(ReadResourceResult {
                contents: vec![ResourceContents {
                    uri: request.uri.clone(),
                    mime_type: Some("application/json".to_string()),
                    text: Some(wasm_list.to_string()),
                    blob: None,
                }],
            })
        } else if request.uri.starts_with("wasm://component/") {
            let path = request
                .uri
                .strip_prefix("wasm://component/")
                .ok_or_else(|| {
                    GlspError::NotImplemented(format!(
                        "Invalid WASM component URI: {}",
                        request.uri
                    ))
                })?;

            if let Some((component_name, suffix)) = path.split_once('/') {
                match suffix {
                    "wit" => self.get_component_wit_analysis(component_name).await,
                    "wit/raw" => self.get_component_raw_wit(component_name).await,
                    "interfaces" => self.get_component_interfaces(component_name).await,
                    _ => Err(GlspError::NotImplemented(format!(
                        "Unknown component resource: {}",
                        request.uri
                    ))),
                }
            } else {
                self.get_wasm_component_details(path).await
            }
        } else {
            Err(GlspError::NotImplemented(format!(
                "Resource type not supported: {}",
                request.uri
            )))
        }
    }

    // Helper methods for component-specific resources
    async fn get_wasm_component_details(
        &self,
        component_name: &str,
    ) -> std::result::Result<ReadResourceResult, GlspError> {
        let wasm_watcher = self.wasm_watcher.lock().await;
        let component = wasm_watcher.get_component(component_name).ok_or_else(|| {
            GlspError::NotImplemented(format!("WASM component not found: {component_name}"))
        })?;

        let content = json!({
            "name": component.name,
            "path": component.path,
            "description": component.description,
            "fileExists": component.file_exists,
            "lastSeen": component.last_seen,
            "removedAt": component.removed_at,
            "interfaces": component.interfaces,
            "metadata": component.metadata,
            "witInterfaces": component.wit_interfaces,
            "dependencies": component.dependencies
        });

        Ok(ReadResourceResult {
            contents: vec![ResourceContents {
                uri: format!("wasm://component/{component_name}"),
                mime_type: Some("application/json".to_string()),
                text: Some(content.to_string()),
                blob: None,
            }],
        })
    }

    async fn get_component_interfaces(
        &self,
        component_name: &str,
    ) -> std::result::Result<ReadResourceResult, GlspError> {
        let wasm_watcher = self.wasm_watcher.lock().await;
        let component = wasm_watcher.get_component(component_name).ok_or_else(|| {
            GlspError::NotImplemented(format!("WASM component not found: {component_name}"))
        })?;

        let content = json!({
            "componentName": component.name,
            "interfaces": component.interfaces,
            "totalInterfaces": component.interfaces.len()
        });

        Ok(ReadResourceResult {
            contents: vec![ResourceContents {
                uri: format!("wasm://component/{component_name}/interfaces"),
                mime_type: Some("application/json".to_string()),
                text: Some(content.to_string()),
                blob: None,
            }],
        })
    }

    async fn get_component_wit_analysis(
        &self,
        component_name: &str,
    ) -> std::result::Result<ReadResourceResult, GlspError> {
        let wasm_watcher = self.wasm_watcher.lock().await;
        let component = wasm_watcher.get_component(component_name).ok_or_else(|| {
            GlspError::NotImplemented(format!("WASM component not found: {component_name}"))
        })?;

        // Analyze WIT interfaces specifically
        let mut imports = Vec::new();
        let mut exports = Vec::new();

        for interface in &component.interfaces {
            let interface_data = json!({
                "name": interface.name,
                "functions": interface.functions.iter().map(|f| json!({
                    "name": f.name,
                    "parameters": f.params.iter().map(|p| json!({
                        "name": p.name,
                        "type": p.param_type
                    })).collect::<Vec<_>>(),
                    "returns": f.returns.iter().map(|r| json!({
                        "name": r.name,
                        "type": r.param_type
                    })).collect::<Vec<_>>()
                })).collect::<Vec<_>>()
            });

            match interface.interface_type.as_str() {
                "import" => imports.push(interface_data),
                "export" => exports.push(interface_data),
                _ => {}
            }
        }

        let content = json!({
            "componentName": component.name,
            "witAnalysis": {
                "imports": imports,
                "exports": exports,
                "summary": {
                    "totalImports": imports.len(),
                    "totalExports": exports.len(),
                    "totalFunctions": component.interfaces.iter()
                        .map(|i| i.functions.len())
                        .sum::<usize>()
                }
            },
            "metadata": component.metadata,
            "dependencies": component.dependencies
        });

        Ok(ReadResourceResult {
            contents: vec![ResourceContents {
                uri: format!("wasm://component/{component_name}/wit"),
                mime_type: Some("application/json".to_string()),
                text: Some(content.to_string()),
                blob: None,
            }],
        })
    }

    async fn get_component_raw_wit(
        &self,
        component_name: &str,
    ) -> std::result::Result<ReadResourceResult, GlspError> {
        let wasm_watcher = self.wasm_watcher.lock().await;
        let component = wasm_watcher.get_component(component_name).ok_or_else(|| {
            GlspError::NotImplemented(format!("WASM component not found: {component_name}"))
        })?;

        let wit_content = component
            .wit_interfaces
            .clone()
            .unwrap_or_else(|| "// No WIT content available for this component".to_string());

        Ok(ReadResourceResult {
            contents: vec![ResourceContents {
                uri: format!("wasm://component/{component_name}/wit/raw"),
                mime_type: Some("text/plain".to_string()),
                text: Some(wit_content),
                blob: None,
            }],
        })
    }

    pub async fn list_prompts(
        &self,
        _request: PaginatedRequestParam,
    ) -> std::result::Result<ListPromptsResult, GlspError> {
        // Return empty prompts for now
        Ok(ListPromptsResult {
            prompts: vec![],
            next_cursor: None,
        })
    }

    pub async fn get_prompt(
        &self,
        request: GetPromptRequestParam,
    ) -> std::result::Result<GetPromptResult, GlspError> {
        Err(GlspError::NotImplemented(format!(
            "Prompt not found: {}",
            request.name
        )))
    }
}

impl GlspBackend {
    // Tool implementation methods
    async fn create_diagram(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;
        let diagram_type = args["diagramType"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing diagramType".to_string()))?;
        let name = args["name"].as_str().unwrap_or("Untitled Diagram");

        let mut diagram = DiagramModel::new(diagram_type);
        diagram.name = name.to_string();
        let diagram_id = diagram.id.clone();

        // Save to memory
        let mut models = self.models.lock().await;
        models.insert(diagram_id.clone(), diagram.clone());
        drop(models); // Release the lock before saving to disk

        // Save to disk
        if let Err(e) = self.save_diagram(&diagram_id).await {
            error!("Failed to save new diagram to disk: {e}");
        }

        Ok(CallToolResult {
            content: vec![Content::text(format!(
                "Created diagram '{name}' with ID: {diagram_id}"
            ))],
            is_error: Some(false),
        })
    }

    async fn delete_diagram(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing diagramId".to_string()))?;

        // Get the diagram name before deletion for the response
        let diagram_name = {
            let models = self.models.lock().await;
            models.get(diagram_id).map(|d| d.name.clone())
        };

        // Remove from memory
        let mut models = self.models.lock().await;
        let removed = models.remove(diagram_id);
        drop(models); // Release the lock before filesystem operations

        if removed.is_none() {
            return Err(GlspError::ToolExecution(format!(
                "Diagram not found: {diagram_id}"
            )));
        }

        // Delete from disk using persistence manager
        let name_for_deletion = diagram_name.as_deref().unwrap_or("Unknown");
        if let Err(e) = self.delete_diagram_files(name_for_deletion).await {
            error!("Failed to delete diagram files from disk: {e}");
            return Err(GlspError::ToolExecution(format!(
                "Failed to delete diagram files: {e}"
            )));
        }

        info!("Deleted diagram '{name_for_deletion}' (ID: {diagram_id})");

        Ok(CallToolResult {
            content: vec![Content::text(format!(
                "Successfully deleted diagram '{name_for_deletion}' (ID: {diagram_id})"
            ))],
            is_error: Some(false),
        })
    }

    async fn create_node(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing diagramId".to_string()))?;
        let node_type = args["nodeType"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing nodeType".to_string()))?;

        let position = Position {
            x: args["position"]["x"]
                .as_f64()
                .ok_or_else(|| GlspError::ToolExecution("Missing position.x".to_string()))?,
            y: args["position"]["y"]
                .as_f64()
                .ok_or_else(|| GlspError::ToolExecution("Missing position.y".to_string()))?,
        };

        let label = args["label"].as_str().map(|s| s.to_string());

        let mut models = self.models.lock().await;
        let diagram = models
            .get_mut(diagram_id)
            .ok_or_else(|| GlspError::ToolExecution("Diagram not found".to_string()))?;

        let mut node = Node::new(node_type, position, label);
        let node_id = node.base.id.clone();

        // Add custom properties if provided
        if let Some(properties) = args["properties"].as_object() {
            for (key, value) in properties {
                node.base.properties.insert(key.clone(), value.clone());
            }
        }

        diagram.add_element(node.base);
        diagram.add_child_to_root(&node_id);
        drop(models); // Release the lock before saving

        // Save to disk
        if let Err(e) = self.save_diagram(diagram_id).await {
            error!("Failed to save diagram after creating node: {}", e);
        }

        Ok(CallToolResult {
            content: vec![Content::text(format!(
                "Created {node_type} node with ID: {node_id}"
            ))],
            is_error: Some(false),
        })
    }

    async fn create_edge(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing diagramId".to_string()))?;
        let edge_type = args["edgeType"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing edgeType".to_string()))?;
        let source_id = args["sourceId"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing sourceId".to_string()))?;
        let target_id = args["targetId"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing targetId".to_string()))?;

        let label = args["label"].as_str().map(|s| s.to_string());

        let mut models = self.models.lock().await;
        let diagram = models
            .get_mut(diagram_id)
            .ok_or_else(|| GlspError::ToolExecution("Diagram not found".to_string()))?;

        // Verify source and target exist
        if !diagram.elements.contains_key(source_id) {
            return Ok(CallToolResult {
                content: vec![Content::text(format!(
                    "Source element {source_id} not found"
                ))],
                is_error: Some(true),
            });
        }

        if !diagram.elements.contains_key(target_id) {
            return Ok(CallToolResult {
                content: vec![Content::text(format!(
                    "Target element {target_id} not found"
                ))],
                is_error: Some(true),
            });
        }

        let edge = Edge::new(
            edge_type,
            source_id.to_string(),
            target_id.to_string(),
            label,
        );
        let edge_id = edge.base.id.clone();

        // Convert Edge to ModelElement with sourceId and targetId in properties
        let mut edge_element = edge.base;
        edge_element.properties.insert(
            "sourceId".to_string(),
            serde_json::Value::String(source_id.to_string()),
        );
        edge_element.properties.insert(
            "targetId".to_string(),
            serde_json::Value::String(target_id.to_string()),
        );

        diagram.add_element(edge_element);
        diagram.add_child_to_root(&edge_id);
        drop(models); // Release the lock before saving

        // Save to disk
        if let Err(e) = self.save_diagram(diagram_id).await {
            error!("Failed to save diagram after creating edge: {}", e);
        }

        Ok(CallToolResult {
            content: vec![Content::text(format!(
                "Created {edge_type} edge with ID: {edge_id}"
            ))],
            is_error: Some(false),
        })
    }

    async fn delete_element(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing diagramId".to_string()))?;
        let element_id = args["elementId"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing elementId".to_string()))?;

        let mut models = self.models.lock().await;
        let diagram = models
            .get_mut(diagram_id)
            .ok_or_else(|| GlspError::ToolExecution("Diagram not found".to_string()))?;

        match diagram.remove_element(element_id) {
            Some(_) => {
                drop(models); // Release the lock before saving

                // Save to disk
                if let Err(e) = self.save_diagram(diagram_id).await {
                    error!("Failed to save diagram after deleting element: {}", e);
                }

                Ok(CallToolResult {
                    content: vec![Content::text(format!(
                        "Deleted element with ID: {element_id}"
                    ))],
                    is_error: Some(false),
                })
            }
            None => Ok(CallToolResult {
                content: vec![Content::text(format!("Element {element_id} not found"))],
                is_error: Some(true),
            }),
        }
    }

    async fn update_element(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing diagramId".to_string()))?;
        let element_id = args["elementId"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing elementId".to_string()))?;

        let mut models = self.models.lock().await;
        let diagram = models
            .get_mut(diagram_id)
            .ok_or_else(|| GlspError::ToolExecution("Diagram not found".to_string()))?;

        let element = diagram
            .get_element_mut(element_id)
            .ok_or_else(|| GlspError::ToolExecution("Element not found".to_string()))?;

        if let Some(properties) = args["properties"].as_object() {
            for (key, value) in properties {
                element.properties.insert(key.clone(), value.clone());
            }
        }

        if let Some(position) = args["position"].as_object() {
            if let (Some(x), Some(y)) = (position["x"].as_f64(), position["y"].as_f64()) {
                if let Some(bounds) = &mut element.bounds {
                    bounds.x = x;
                    bounds.y = y;
                }
            }
        }

        drop(models); // Release the lock before saving

        // Save to disk
        if let Err(e) = self.save_diagram(diagram_id).await {
            error!("Failed to save diagram after updating element: {}", e);
        }

        Ok(CallToolResult {
            content: vec![Content::text(format!(
                "Updated element with ID: {element_id}"
            ))],
            is_error: Some(false),
        })
    }

    async fn apply_layout(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing diagramId".to_string()))?;
        let algorithm = args["algorithm"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing algorithm".to_string()))?;

        let mut models = self.models.lock().await;
        let diagram = models
            .get_mut(diagram_id)
            .ok_or_else(|| GlspError::ToolExecution("Diagram not found".to_string()))?;

        // Simple layout implementation
        match algorithm {
            "grid" => Self::apply_grid_layout(diagram),
            "hierarchical" => Self::apply_hierarchical_layout(diagram),
            _ => {
                return Ok(CallToolResult {
                    content: vec![Content::text(format!(
                        "Layout algorithm '{algorithm}' not implemented yet"
                    ))],
                    is_error: Some(true),
                });
            }
        }

        drop(models); // Release the lock before saving

        // Save to disk
        if let Err(e) = self.save_diagram(diagram_id).await {
            error!("Failed to save diagram after applying layout: {}", e);
        }

        Ok(CallToolResult {
            content: vec![Content::text(format!(
                "Applied {algorithm} layout to diagram {diagram_id}"
            ))],
            is_error: Some(false),
        })
    }

    async fn export_diagram(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing diagramId".to_string()))?;
        let format = args["format"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing format".to_string()))?;

        let models = self.models.lock().await;
        let diagram = models
            .get(diagram_id)
            .ok_or_else(|| GlspError::ToolExecution("Diagram not found".to_string()))?;

        match format {
            "json" => {
                let json_str = serde_json::to_string_pretty(diagram).map_err(|e| {
                    GlspError::ToolExecution(format!("JSON serialization failed: {e}"))
                })?;
                Ok(CallToolResult {
                    content: vec![Content::text(format!(
                        "Exported diagram as JSON:\\n{json_str}"
                    ))],
                    is_error: Some(false),
                })
            }
            "svg" => {
                let svg = Self::generate_svg(diagram);
                Ok(CallToolResult {
                    content: vec![Content::text(format!("Exported diagram as SVG:\\n{svg}"))],
                    is_error: Some(false),
                })
            }
            _ => Ok(CallToolResult {
                content: vec![Content::text(format!(
                    "Export format '{format}' not supported yet"
                ))],
                is_error: Some(true),
            }),
        }
    }

    // Selection tool implementations - simplified for now
    async fn select_elements(
        &self,
        _args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        Ok(CallToolResult {
            content: vec![Content::text("Selection functionality not yet implemented")],
            is_error: Some(false),
        })
    }

    async fn select_all(
        &self,
        _args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        Ok(CallToolResult {
            content: vec![Content::text(
                "Select all functionality not yet implemented",
            )],
            is_error: Some(false),
        })
    }

    async fn clear_selection(
        &self,
        _args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        Ok(CallToolResult {
            content: vec![Content::text(
                "Clear selection functionality not yet implemented",
            )],
            is_error: Some(false),
        })
    }

    async fn get_selection(
        &self,
        _args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        Ok(CallToolResult {
            content: vec![Content::text(
                "Get selection functionality not yet implemented",
            )],
            is_error: Some(false),
        })
    }

    // WASM component implementations
    async fn scan_wasm_components(&self) -> std::result::Result<CallToolResult, GlspError> {
        // Trigger rescan and get components from the wasm watcher
        let wasm_watcher = self.wasm_watcher.lock().await;
        let components = wasm_watcher.get_components();
        let available = components.iter().filter(|c| c.file_exists).count();
        let missing = components.len() - available;

        // Convert components to JSON format expected by the client
        let components_json: Vec<_> = components
            .iter()
            .map(|c| {
                json!({
                    "name": c.name,
                    "path": c.path,
                    "fileExists": c.file_exists,
                    "lastSeen": c.last_seen.map(|dt| dt.to_rfc3339()),
                    "metadata": c.metadata,
                    "interfaces": c.interfaces
                })
            })
            .collect();

        let result = json!({
            "components": components_json,
            "summary": {
                "total": components.len(),
                "available": available,
                "missing": missing
            }
        });

        Ok(CallToolResult {
            content: vec![Content::text(result.to_string())],
            is_error: Some(false),
        })
    }

    async fn check_wasm_component_status(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;
        let component_name = args["componentName"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing componentName".to_string()))?;

        let wasm_watcher = self.wasm_watcher.lock().await;

        match wasm_watcher.get_component(component_name) {
            Some(component) => {
                let status = json!({
                    "name": component.name,
                    "path": component.path,
                    "fileExists": component.file_exists,
                    "status": if component.file_exists { "available" } else { "missing" },
                    "lastSeen": component.last_seen,
                    "removedAt": component.removed_at,
                    "interfaces": component.interfaces.len(),
                    "description": component.description
                });

                Ok(CallToolResult {
                    content: vec![Content::text(
                        serde_json::to_string_pretty(&status).map_err(|e| {
                            GlspError::ToolExecution(format!("JSON serialization failed: {e}"))
                        })?,
                    )],
                    is_error: Some(false),
                })
            }
            None => Ok(CallToolResult {
                content: vec![Content::text(format!(
                    "WASM component '{component_name}' not found"
                ))],
                is_error: Some(true),
            }),
        }
    }

    async fn save_diagram_tool(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing diagramId".to_string()))?;

        match self.save_diagram(diagram_id).await {
            Ok(_) => Ok(CallToolResult {
                content: vec![Content::text(format!(
                    "Successfully saved diagram {diagram_id} to disk"
                ))],
                is_error: Some(false),
            }),
            Err(e) => Ok(CallToolResult {
                content: vec![Content::text(format!("Failed to save diagram: {e}"))],
                is_error: Some(true),
            }),
        }
    }

    async fn load_wasm_component(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing diagramId".to_string()))?;
        let component_name = args["componentName"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing componentName".to_string()))?;

        let position = Position {
            x: args["position"]["x"].as_f64().unwrap_or(100.0),
            y: args["position"]["y"].as_f64().unwrap_or(100.0),
        };

        // Check if component exists and is available
        // Use the flexible component finding method from WasmFileWatcher
        let component = {
            let wasm_watcher = self.wasm_watcher.lock().await;

            wasm_watcher
                .find_component_flexible(component_name)
                .cloned()
                .ok_or_else(|| {
                    GlspError::ToolExecution(format!("WASM component '{component_name}' not found"))
                })?
        };

        if !component.file_exists {
            return Ok(CallToolResult {
                content: vec![Content::text(format!(
                    "Cannot load component '{component_name}': file is missing at {}",
                    component.path
                ))],
                is_error: Some(true),
            });
        }

        // Get the diagram
        let mut models = self.models.lock().await;
        let diagram = models
            .get_mut(diagram_id)
            .ok_or_else(|| GlspError::ToolExecution(format!("Diagram '{diagram_id}' not found")))?;

        // Create a WASM component node
        let mut node = Node::new("wasm-component", position, Some(component.name.clone()));

        // Add component-specific properties
        node.base
            .properties
            .insert("componentName".to_string(), json!(component.name));
        node.base
            .properties
            .insert("componentPath".to_string(), json!(component.path));
        node.base
            .properties
            .insert("description".to_string(), json!(component.description));

        // Add interface data for rendering
        node.base
            .properties
            .insert("interfaces".to_string(), json!(component.interfaces));
        node.base
            .properties
            .insert("status".to_string(), json!("available"));
        node.base.properties.insert(
            "importsCount".to_string(),
            json!(component
                .interfaces
                .iter()
                .filter(|i| i.interface_type == "import")
                .count()),
        );
        node.base.properties.insert(
            "exportsCount".to_string(),
            json!(component
                .interfaces
                .iter()
                .filter(|i| i.interface_type == "export")
                .count()),
        );
        node.base.properties.insert(
            "totalFunctions".to_string(),
            json!(component
                .interfaces
                .iter()
                .map(|i| i.functions.len())
                .sum::<usize>()),
        );

        let node_id = node.base.id.clone();
        diagram.add_element(node.base);
        diagram.add_child_to_root(&node_id);
        drop(models); // Release the lock before saving

        // Save to disk
        if let Err(e) = self.save_diagram(diagram_id).await {
            error!("Failed to save diagram after loading WASM component: {}", e);
        }

        Ok(CallToolResult {
            content: vec![Content::text(format!(
                "Loaded WASM component '{component_name}' into diagram with ID: {node_id}"
            ))],
            is_error: Some(false),
        })
    }

    async fn refresh_wasm_interfaces(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing diagramId".to_string()))?;

        let mut models = self.models.lock().await;
        let diagram = models
            .get_mut(diagram_id)
            .ok_or_else(|| GlspError::ToolExecution(format!("Diagram '{diagram_id}' not found")))?;

        let mut updated_count = 0;
        let wasm_watcher = self.wasm_watcher.lock().await;

        // Find all WASM components in the diagram
        let mut elements_to_update = Vec::new();
        for (element_id, element) in diagram.elements.iter() {
            // Check if this is a WASM component
            let is_wasm_component = match &element.element_type {
                ElementType::Component => true,
                ElementType::Custom(type_name) => type_name == "wasm-component",
                _ => false,
            };

            if is_wasm_component {
                // Try to get component name from properties or label
                if let Some(component_name) = element
                    .properties
                    .get("componentName")
                    .and_then(|v| v.as_str())
                    .or(element.label.as_deref())
                {
                    // Find the component using flexible name matching
                    if let Some(component) = wasm_watcher.find_component_flexible(component_name) {
                        elements_to_update.push((element_id.clone(), component.clone()));
                    }
                }
            }
        }
        drop(wasm_watcher); // Release the wasm_watcher lock

        // Update each WASM component with interface data
        for (element_id, component) in elements_to_update {
            if let Some(element) = diagram.elements.get_mut(&element_id) {
                // Add interface data for rendering
                element
                    .properties
                    .insert("interfaces".to_string(), json!(component.interfaces));
                element.properties.insert(
                    "status".to_string(),
                    json!(if component.file_exists {
                        "available"
                    } else {
                        "missing"
                    }),
                );
                element.properties.insert(
                    "importsCount".to_string(),
                    json!(component
                        .interfaces
                        .iter()
                        .filter(|i| i.interface_type == "import")
                        .count()),
                );
                element.properties.insert(
                    "exportsCount".to_string(),
                    json!(component
                        .interfaces
                        .iter()
                        .filter(|i| i.interface_type == "export")
                        .count()),
                );
                element.properties.insert(
                    "totalFunctions".to_string(),
                    json!(component
                        .interfaces
                        .iter()
                        .map(|i| i.functions.len())
                        .sum::<usize>()),
                );

                updated_count += 1;
            }
        }

        drop(models); // Release the lock before saving

        // Save to disk if we updated any components
        if updated_count > 0 {
            if let Err(e) = self.save_diagram(diagram_id).await {
                error!("Failed to save diagram after refreshing interfaces: {}", e);
            }
        }

        Ok(CallToolResult {
            content: vec![Content::text(format!("Refreshed interface data for {updated_count} WASM components in diagram {diagram_id}"))],
            is_error: Some(false),
        })
    }

    // Layout helpers
    fn apply_grid_layout(diagram: &mut DiagramModel) {
        let mut x = 50.0;
        let mut y = 50.0;
        let spacing_x = 150.0;
        let _spacing_y = 100.0;
        let cols = 4;
        let mut col = 0;

        for (_, element) in diagram.elements.iter_mut() {
            if element.element_type != ElementType::Graph && element.bounds.is_some() {
                if let Some(bounds) = &mut element.bounds {
                    bounds.x = x;
                    bounds.y = y;
                }

                col += 1;
                if col >= cols {
                    col = 0;
                    x = 50.0;
                    y += 100.0;
                } else {
                    x += spacing_x;
                }
            }
        }
        diagram.revision += 1;
    }

    fn apply_hierarchical_layout(diagram: &mut DiagramModel) {
        let y = 50.0;
        let mut x = 50.0;
        let spacing_x = 150.0;

        for (_, element) in diagram.elements.iter_mut() {
            if element.element_type != ElementType::Graph && element.bounds.is_some() {
                if let Some(bounds) = &mut element.bounds {
                    bounds.x = x;
                    bounds.y = y;
                }
                x += spacing_x;
            }
        }
        diagram.revision += 1;
    }

    fn generate_svg(diagram: &DiagramModel) -> String {
        let mut svg =
            String::from(r#"<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">"#);

        // Add elements
        for element in diagram.elements.values() {
            if element.element_type != ElementType::Graph {
                if let Some(bounds) = &element.bounds {
                    if element.element_type.is_node_like() {
                        svg.push_str(&format!(
                            r#"<rect x="{}" y="{}" width="{}" height="{}" fill="lightblue" stroke="black" stroke-width="1"/>"#,
                            bounds.x, bounds.y, bounds.width, bounds.height
                        ));

                        if let Some(label) = element.properties.get("label") {
                            if let Some(label_text) = label.as_str() {
                                svg.push_str(&format!(
                                    r#"<text x="{}" y="{}" text-anchor="middle" dominant-baseline="middle">{}</text>"#,
                                    bounds.x + bounds.width / 2.0,
                                    bounds.y + bounds.height / 2.0,
                                    label_text
                                ));
                            }
                        }
                    }
                }
            }
        }

        svg.push_str("</svg>");
        svg
    }

    // Persistence helper methods
    async fn load_all_diagrams(&self) -> std::result::Result<(), GlspError> {
        let diagram_infos = self
            .persistence
            .list_diagrams()
            .await
            .map_err(|e| GlspError::NotImplemented(format!("Failed to list diagrams: {e}")))?;

        let mut models = self.models.lock().await;

        for info in diagram_infos {
            match self.persistence.load_diagram(&info.file_name).await {
                Ok(diagram) => {
                    info!("Loaded diagram '{}' from disk", info.name);
                    models.insert(diagram.id.clone(), diagram);
                }
                Err(e) => {
                    error!("Failed to load diagram '{}': {e}", info.file_name);
                }
            }
        }

        info!("Loaded {} diagrams from disk", models.len());
        Ok(())
    }

    async fn save_diagram(&self, diagram_id: &str) -> std::result::Result<(), GlspError> {
        let models = self.models.lock().await;

        if let Some(diagram) = models.get(diagram_id) {
            self.persistence
                .save_diagram(diagram)
                .await
                .map_err(|e| GlspError::NotImplemented(format!("Failed to save diagram: {e}")))?;
            info!("Saved diagram '{}' to disk", diagram.name);
            Ok(())
        } else {
            Err(GlspError::NotImplemented(format!(
                "Diagram not found: {diagram_id}"
            )))
        }
    }

    async fn delete_diagram_files(&self, diagram_name: &str) -> std::result::Result<(), GlspError> {
        self.persistence
            .delete_diagram(diagram_name)
            .await
            .map_err(|e| {
                GlspError::NotImplemented(format!("Failed to delete diagram files: {e}"))
            })?;
        info!("Deleted diagram files for '{}'", diagram_name);
        Ok(())
    }

    pub fn get_filesystem_watcher(&self) -> std::sync::Arc<tokio::sync::RwLock<FileSystemWatcher>> {
        self.filesystem_watcher.clone()
    }

    pub fn get_wasm_watcher(&self) -> std::sync::Arc<tokio::sync::Mutex<WasmFileWatcher>> {
        self.wasm_watcher.clone()
    }

    async fn get_component_path(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;

        let component_name = args["componentName"].as_str().ok_or_else(|| {
            GlspError::ToolExecution("Missing componentName parameter".to_string())
        })?;

        // Look up the component using flexible name matching
        let wasm_watcher = self.wasm_watcher.lock().await;
        let component = wasm_watcher
            .find_component_flexible(component_name)
            .ok_or_else(|| {
                GlspError::ToolExecution(format!("WASM component not found: {component_name}"))
            })?;

        Ok(CallToolResult {
            content: vec![Content::text(component.path.clone())],
            is_error: Some(false),
        })
    }

    async fn get_component_wit_info(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        use crate::wasm::WitAnalyzer;
        use std::path::PathBuf;

        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;

        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing diagramId parameter".to_string()))?;

        let element_id = args["elementId"]
            .as_str()
            .ok_or_else(|| GlspError::ToolExecution("Missing elementId parameter".to_string()))?;

        // Get the diagram
        let models = self.models.lock().await;
        let diagram = models
            .get(diagram_id)
            .ok_or_else(|| GlspError::ToolExecution(format!("Diagram not found: {diagram_id}")))?;

        // Get the element
        let element = diagram
            .elements
            .get(element_id)
            .ok_or_else(|| GlspError::ToolExecution(format!("Element not found: {element_id}")))?;

        // Check if it's a WASM component
        let is_wasm_component = match &element.element_type {
            ElementType::Component => true,
            ElementType::Custom(type_name) => type_name == "wasm-component",
            _ => false,
        };

        if !is_wasm_component {
            return Ok(CallToolResult {
                content: vec![Content::text(format!(
                    "Element '{}' is not a WASM component (type: {})",
                    element_id, element.element_type
                ))],
                is_error: Some(true),
            });
        }

        // First, try to get the component file path from element properties
        let component_path = if let Some(path_value) = element.properties.get("componentPath") {
            path_value.as_str().map(|s| s.to_string())
        } else {
            None
        };

        // If we have a path, use it directly
        let component_file_path = if let Some(path) = component_path {
            PathBuf::from(path)
        } else {
            // Fallback: Try to find by component name
            let component_name = element
                .properties
                .get("componentName")
                .and_then(|v| v.as_str())
                .or(element.properties.get("name").and_then(|v| v.as_str()))
                .or(element.label.as_deref())
                .ok_or_else(|| {
                    GlspError::ToolExecution(
                        "Component name not found in element properties".to_string(),
                    )
                })?;

            // Look up the component in the watcher using flexible name matching
            let wasm_watcher = self.wasm_watcher.lock().await;
            let component = wasm_watcher
                .find_component_flexible(component_name)
                .ok_or_else(|| {
                    GlspError::ToolExecution(format!(
                        "WASM component file not found: {component_name}"
                    ))
                })?;

            PathBuf::from(&component.path)
        };

        // Verify the file exists
        if !component_file_path.exists() {
            return Ok(CallToolResult {
                content: vec![Content::text(format!(
                    "WASM component file not found at path: {}",
                    component_file_path.display()
                ))],
                is_error: Some(true),
            });
        }

        // Analyze the component
        match WitAnalyzer::analyze_component(&component_file_path).await {
            Ok(analysis) => {
                // Return structured WIT information suitable for properties panel
                let wit_info = json!({
                    "componentName": analysis.component_name,
                    "worldName": analysis.world_name,
                    "filePath": component_file_path.to_string_lossy(),
                    "imports": analysis.imports.iter().map(|interface| json!({
                        "name": interface.name,
                        "namespace": interface.namespace,
                        "package": interface.package,
                        "version": interface.version,
                        "functions": interface.functions.iter().map(|func| json!({
                            "name": func.name,
                            "params": func.params.iter().map(|p| json!({
                                "name": p.name,
                                "type": p.param_type.name
                            })).collect::<Vec<_>>(),
                            "results": func.results.iter().map(|r| json!({
                                "name": r.name,
                                "type": r.param_type.name
                            })).collect::<Vec<_>>(),
                            "isAsync": func.is_async
                        })).collect::<Vec<_>>(),
                        "types": interface.types.iter().map(|t| json!({
                            "name": t.name,
                            "definition": format!("{:?}", t.type_def)
                        })).collect::<Vec<_>>()
                    })).collect::<Vec<_>>(),
                    "exports": analysis.exports.iter().map(|interface| json!({
                        "name": interface.name,
                        "namespace": interface.namespace,
                        "package": interface.package,
                        "version": interface.version,
                        "functions": interface.functions.iter().map(|func| json!({
                            "name": func.name,
                            "params": func.params.iter().map(|p| json!({
                                "name": p.name,
                                "type": p.param_type.name
                            })).collect::<Vec<_>>(),
                            "results": func.results.iter().map(|r| json!({
                                "name": r.name,
                                "type": r.param_type.name
                            })).collect::<Vec<_>>(),
                            "isAsync": func.is_async
                        })).collect::<Vec<_>>(),
                        "types": interface.types.iter().map(|t| json!({
                            "name": t.name,
                            "definition": format!("{:?}", t.type_def)
                        })).collect::<Vec<_>>()
                    })).collect::<Vec<_>>(),
                    "dependencies": analysis.dependencies.iter().map(|dep| json!({
                        "package": dep.package,
                        "version": dep.version,
                        "interfaces": dep.interfaces
                    })).collect::<Vec<_>>(),
                    "summary": {
                        "importsCount": analysis.imports.len(),
                        "exportsCount": analysis.exports.len(),
                        "totalFunctions": analysis.imports.iter()
                            .chain(analysis.exports.iter())
                            .map(|i| i.functions.len())
                            .sum::<usize>(),
                        "typesCount": analysis.types.len(),
                        "dependenciesCount": analysis.dependencies.len()
                    }
                });

                Ok(CallToolResult {
                    content: vec![Content::text(
                        serde_json::to_string_pretty(&wit_info).map_err(|e| {
                            GlspError::ToolExecution(format!("Failed to serialize WIT info: {e}"))
                        })?,
                    )],
                    is_error: Some(false),
                })
            }
            Err(error) => Ok(CallToolResult {
                content: vec![Content::text(format!(
                    "Failed to analyze component WIT interfaces: {error}"
                ))],
                is_error: Some(true),
            }),
        }
    }

    /// Debug tool to analyze WIT interfaces for a specific component file
    async fn debug_wit_analysis(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        use crate::wasm::WitAnalyzer;
        use std::path::PathBuf;

        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;

        let component_path = args["componentPath"].as_str().ok_or_else(|| {
            GlspError::ToolExecution("Missing componentPath parameter".to_string())
        })?;

        let path = PathBuf::from(component_path);

        if !path.exists() {
            return Ok(CallToolResult {
                content: vec![Content::text(format!(
                    "Component file not found: {component_path}"
                ))],
                is_error: Some(true),
            });
        }

        // Analyze the component with the WIT analyzer
        match WitAnalyzer::analyze_component(&path).await {
            Ok(analysis) => {
                let debug_info = json!({
                    "analysis": "WIT Debug Analysis",
                    "componentName": analysis.component_name,
                    "worldName": analysis.world_name,
                    "filePath": component_path,
                    "imports": analysis.imports.iter().map(|interface| json!({
                        "name": interface.name,
                        "type": "import",
                        "functions": interface.functions.iter().map(|f| f.name.clone()).collect::<Vec<_>>(),
                        "functionCount": interface.functions.len(),
                        "types": interface.types.iter().map(|t| t.name.clone()).collect::<Vec<_>>(),
                        "typeCount": interface.types.len()
                    })).collect::<Vec<_>>(),
                    "exports": analysis.exports.iter().map(|interface| json!({
                        "name": interface.name,
                        "type": "export",
                        "functions": interface.functions.iter().map(|f| f.name.clone()).collect::<Vec<_>>(),
                        "functionCount": interface.functions.len(),
                        "types": interface.types.iter().map(|t| t.name.clone()).collect::<Vec<_>>(),
                        "typeCount": interface.types.len()
                    })).collect::<Vec<_>>(),
                    "summary": {
                        "totalImports": analysis.imports.len(),
                        "totalExports": analysis.exports.len(),
                        "totalInterfaces": analysis.imports.len() + analysis.exports.len(),
                        "totalTypes": analysis.types.len(),
                        "totalDependencies": analysis.dependencies.len(),
                        "hasRawWit": analysis.raw_wit.is_some()
                    },
                    "expectedForVideoAIPipeline": {
                        "expectedImports": ["video-decoder", "object-detection"],
                        "expectedExports": ["pipeline-control"],
                        "note": "If this is the video-ai-pipeline component, we should see exactly these interfaces"
                    }
                });

                Ok(CallToolResult {
                    content: vec![Content::text(serde_json::to_string_pretty(&debug_info)
                        .map_err(|e| GlspError::ToolExecution(format!("Failed to serialize debug info: {e}")))?)],
                    is_error: Some(false),
                })
            }
            Err(error) => {
                Ok(CallToolResult {
                    content: vec![Content::text(format!("WIT Analysis Failed: {error}\n\nThis might indicate:\n1. File is not a valid WASM component\n2. Component doesn't have WIT interfaces\n3. WIT parser error\n\nFalling back to basic file info..."))],
                    is_error: Some(true),
                })
            }
        }
    }

    // Workspace management tool wrapper methods

    async fn set_workspace_directory_tool(
        &self,
        arguments: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = arguments.unwrap_or_default();
        let workspace_path = args
            .get("workspace_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                GlspError::ToolExecution("workspace_path parameter is required".to_string())
            })?;

        let create_if_missing = args
            .get("create_if_missing")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        // Create workspace directory if requested and it doesn't exist
        if create_if_missing && !std::path::Path::new(workspace_path).exists() {
            std::fs::create_dir_all(workspace_path).map_err(|e| {
                GlspError::ToolExecution(format!("Failed to create workspace directory: {e}"))
            })?;
        }

        self.set_workspace_directory(workspace_path.to_string())
            .await?;

        Ok(CallToolResult {
            content: vec![Content::text(format!(
                "Successfully set workspace directory to: {workspace_path}"
            ))],
            is_error: Some(false),
        })
    }

    async fn get_current_workspace_tool(&self) -> std::result::Result<CallToolResult, GlspError> {
        let workspace_info = self.get_current_workspace().await?;

        Ok(CallToolResult {
            content: vec![Content::text(
                serde_json::to_string_pretty(&workspace_info).map_err(|e| {
                    GlspError::ToolExecution(format!("Failed to serialize workspace info: {e}"))
                })?,
            )],
            is_error: Some(false),
        })
    }

    async fn set_wasm_components_path_tool(
        &self,
        arguments: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = arguments.unwrap_or_default();
        let wasm_path = args
            .get("wasm_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                GlspError::ToolExecution("wasm_path parameter is required".to_string())
            })?;

        self.set_wasm_components_path(wasm_path.to_string()).await?;

        Ok(CallToolResult {
            content: vec![Content::text(format!(
                "Successfully set WASM components path to: {wasm_path}"
            ))],
            is_error: Some(false),
        })
    }

    async fn set_diagrams_path_tool(
        &self,
        arguments: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = arguments.unwrap_or_default();
        let diagrams_path = args
            .get("diagrams_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                GlspError::ToolExecution("diagrams_path parameter is required".to_string())
            })?;

        self.set_diagrams_path(diagrams_path.to_string()).await?;

        Ok(CallToolResult {
            content: vec![Content::text(format!(
                "Successfully set diagrams path to: {diagrams_path}"
            ))],
            is_error: Some(false),
        })
    }

    async fn rescan_workspace_tool(&self) -> std::result::Result<CallToolResult, GlspError> {
        self.rescan_workspace().await?;

        Ok(CallToolResult {
            content: vec![Content::text(
                "Successfully rescanned workspace for WASM components and diagrams".to_string(),
            )],
            is_error: Some(false),
        })
    }

    async fn validate_workspace_tool(
        &self,
        arguments: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = arguments.unwrap_or_default();
        let workspace_path = args
            .get("workspace_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                GlspError::ToolExecution("workspace_path parameter is required".to_string())
            })?;

        let validation_result = self.validate_workspace_paths(workspace_path).await?;

        Ok(CallToolResult {
            content: vec![Content::text(
                serde_json::to_string_pretty(&validation_result).map_err(|e| {
                    GlspError::ToolExecution(format!("Failed to serialize validation result: {e}"))
                })?,
            )],
            is_error: Some(false),
        })
    }

    async fn create_workspace_structure_tool(
        &self,
        arguments: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = arguments.unwrap_or_default();
        let workspace_path = args
            .get("workspace_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                GlspError::ToolExecution("workspace_path parameter is required".to_string())
            })?;

        use std::path::Path;
        let workspace = Path::new(workspace_path);

        // Create workspace root
        std::fs::create_dir_all(workspace).map_err(|e| {
            GlspError::ToolExecution(format!("Failed to create workspace directory: {e}"))
        })?;

        // Create subdirectories
        let wasm_dir = workspace.join("wasm-components");
        let diagrams_dir = workspace.join("diagrams");

        std::fs::create_dir_all(&wasm_dir).map_err(|e| {
            GlspError::ToolExecution(format!("Failed to create wasm-components directory: {e}"))
        })?;
        std::fs::create_dir_all(&diagrams_dir).map_err(|e| {
            GlspError::ToolExecution(format!("Failed to create diagrams directory: {e}"))
        })?;

        Ok(CallToolResult {
            content: vec![Content::text(format!(
                "Successfully created workspace structure:\n- {}\n- {}\n- {}",
                workspace_path,
                wasm_dir.display(),
                diagrams_dir.display()
            ))],
            is_error: Some(false),
        })
    }

    async fn add_uml_class(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        use crate::model::{ModelElement, ElementType, Bounds};
        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;
        let diagram_id = args["diagramId"].as_str().ok_or_else(|| GlspError::ToolExecution("Missing diagramId".to_string()))?;
        let name = args["name"].as_str().ok_or_else(|| GlspError::ToolExecution("Missing class name".to_string()))?;
        
        // Accept attributes/methods as array of objects or strings, convert to array of objects
        let attributes = args.get("attributes").and_then(|v| v.as_array()).map(|arr| {
            arr.iter().map(|item| {
                if let Some(s) = item.as_str() {
                    serde_json::json!({"name": s, "type": "", "visibility": "public"})
                } else if let Some(obj) = item.as_object() {
                    serde_json::Value::Object(obj.clone())
                } else {
                    serde_json::json!({"name": "attribute", "type": "", "visibility": "public"})
                }
            }).collect::<Vec<_>>()
        }).unwrap_or_default();
        
        let methods = args.get("methods").and_then(|v| v.as_array()).map(|arr| {
            arr.iter().map(|item| {
                if let Some(s) = item.as_str() {
                    serde_json::json!({"name": s, "returnType": "", "visibility": "public"})
            } else if let Some(obj) = item.as_object() {
                serde_json::Value::Object(obj.clone())
            } else {
                serde_json::json!({"name": "method", "returnType": "", "visibility": "public"})
            }
        }).collect::<Vec<_>>()
    }).unwrap_or_default();
        
        let (x, y) = if let Some(pos) = args.get("position") {
            let x = pos.get("x").and_then(|v| v.as_f64()).unwrap_or(100.0);
            let y = pos.get("y").and_then(|v| v.as_f64()).unwrap_or(100.0);
            (x, y)
        } else {
            (100.0, 100.0)
        };
        
        let class_id = uuid::Uuid::new_v4().to_string();
        let mut properties = std::collections::HashMap::new();
        properties.insert("name".to_string(), serde_json::Value::String(name.to_string()));
        properties.insert("attributes".to_string(), serde_json::Value::Array(attributes));
        properties.insert("methods".to_string(), serde_json::Value::Array(methods));
        
        let class_node = ModelElement {
            id: class_id.clone(),
            element_type: ElementType::Custom("uml_class".to_string()),
            children: None,
            bounds: Some(Bounds { x, y, width: 120.0, height: 80.0 }),
            layout_options: None,
            properties,
            label: Some(name.to_string()),
            source_id: None,
            target_id: None,
            route: None,
            visible: true,
            z_index: Some(1),
            style: std::collections::HashMap::new(),
        };
        
        let mut models = self.models.lock().await;
        let diagram = models.get_mut(diagram_id).ok_or_else(|| GlspError::ToolExecution("Diagram not found".to_string()))?;
        diagram.elements.insert(class_id.clone(), class_node);
        if let Some(root) = diagram.elements.get_mut(&diagram.root.id) {
            if let Some(children) = &mut root.children {
                children.push(class_id.clone());
            }
        }
        
        Ok(CallToolResult {
            content: vec![Content::text(format!("Added UML class '{}' with ID: {}", name, class_id))],
            is_error: Some(false),
        })
    }

    async fn remove_uml_class(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;
        let diagram_id = args["diagramId"].as_str().ok_or_else(|| GlspError::ToolExecution("Missing diagramId".to_string()))?;
        let class_id = args["classId"].as_str().ok_or_else(|| GlspError::ToolExecution("Missing classId".to_string()))?;
        
        let mut models = self.models.lock().await;
        let diagram = models.get_mut(diagram_id).ok_or_else(|| GlspError::ToolExecution("Diagram not found".to_string()))?;
        
        if diagram.elements.remove(class_id).is_some() {
            // Remove from root's children
            if let Some(root) = diagram.elements.get_mut(&diagram.root.id) {
                if let Some(children) = &mut root.children {
                    children.retain(|id| id != class_id);
                }
            }
            Ok(CallToolResult {
                content: vec![Content::text(format!("Removed UML class node with ID: {}", class_id))],
                is_error: Some(false),
            })
        } else {
            Ok(CallToolResult {
                content: vec![Content::text(format!("Class node with ID: {} not found", class_id))],
                is_error: Some(true),
            })
        }
    }

    async fn update_uml_class(
        &self,
        args: Option<serde_json::Value>,
    ) -> std::result::Result<CallToolResult, GlspError> {
        let args = args.ok_or_else(|| GlspError::ToolExecution("Missing arguments".to_string()))?;
        let diagram_id = args["diagramId"].as_str().ok_or_else(|| GlspError::ToolExecution("Missing diagramId".to_string()))?;
        let class_id = args["classId"].as_str().ok_or_else(|| GlspError::ToolExecution("Missing classId".to_string()))?;
        
        let mut models = self.models.lock().await;
        let diagram = models.get_mut(diagram_id).ok_or_else(|| GlspError::ToolExecution("Diagram not found".to_string()))?;
        
        if let Some(class_node) = diagram.elements.get_mut(class_id) {
            if let Some(name) = args.get("name").and_then(|v| v.as_str()) {
                class_node.label = Some(name.to_string());
                class_node.properties.insert("name".to_string(), serde_json::Value::String(name.to_string()));
            }
            if let Some(attributes) = args.get("attributes").and_then(|v| v.as_array()) {
                class_node.properties.insert("attributes".to_string(), serde_json::Value::Array(attributes.clone()));
            }
            if let Some(methods) = args.get("methods").and_then(|v| v.as_array()) {
                class_node.properties.insert("methods".to_string(), serde_json::Value::Array(methods.clone()));
            }
            Ok(CallToolResult {
                content: vec![Content::text(format!("Updated UML class node with ID: {}", class_id))],
                is_error: Some(false),
            })
        } else {
            Ok(CallToolResult {
                content: vec![Content::text(format!("Class node with ID: {} not found", class_id))],
                is_error: Some(true),
            })
        }
    }
}

/// Implementation of McpBackend trait for framework integration
#[async_trait::async_trait]
impl McpBackend for GlspBackend {
    type Error = GlspError;
    type Config = GlspConfig;

    async fn initialize(config: GlspConfig) -> std::result::Result<Self, Self::Error> {
        Self::initialize(config).await
    }

    fn get_server_info(&self) -> ServerInfo {
        self.get_server_info()
    }

    async fn health_check(&self) -> std::result::Result<(), Self::Error> {
        self.health_check().await
    }

    async fn list_tools(
        &self,
        params: PaginatedRequestParam,
    ) -> std::result::Result<ListToolsResult, Self::Error> {
        self.list_tools(params).await
    }

    async fn call_tool(
        &self,
        params: CallToolRequestParam,
    ) -> std::result::Result<CallToolResult, Self::Error> {
        self.call_tool(params).await
    }

    async fn list_resources(
        &self,
        params: PaginatedRequestParam,
    ) -> std::result::Result<ListResourcesResult, Self::Error> {
        self.list_resources(params).await
    }

    async fn read_resource(
        &self,
        params: ReadResourceRequestParam,
    ) -> std::result::Result<ReadResourceResult, Self::Error> {
        self.read_resource(params).await
    }

    async fn list_prompts(
        &self,
        params: PaginatedRequestParam,
    ) -> std::result::Result<ListPromptsResult, Self::Error> {
        self.list_prompts(params).await
    }

    async fn get_prompt(
        &self,
        params: GetPromptRequestParam,
    ) -> std::result::Result<GetPromptResult, Self::Error> {
        self.get_prompt(params).await
    }
}
