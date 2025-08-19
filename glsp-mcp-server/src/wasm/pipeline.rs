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

//! WASM Component Pipeline Execution
//!
//! Enables linking multiple WASM components together into processing pipelines
//! with support for sequential and parallel execution patterns.

use crate::wasm::execution_engine::{ExecutionContext, ExecutionResult, WasmExecutionEngine};
use crate::wasm::sensor_bridge::SensorBridgeConfig;
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

/// Pipeline configuration defining component execution order and data flow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineConfig {
    /// Unique pipeline identifier
    pub pipeline_id: String,

    /// Pipeline name
    pub name: String,

    /// Pipeline description
    pub description: String,

    /// Pipeline stages (components and their execution order)
    pub stages: Vec<PipelineStage>,

    /// Data flow connections between stages
    pub connections: Vec<DataConnection>,

    /// Global pipeline settings
    pub settings: PipelineSettings,

    /// Sensor configuration for the entire pipeline
    pub sensor_config: Option<SensorBridgeConfig>,

    /// Created timestamp
    pub created_at: DateTime<Utc>,
}

/// A single stage in the pipeline (represents a WASM component)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineStage {
    /// Unique stage identifier
    pub stage_id: String,

    /// Stage name for display
    pub name: String,

    /// WASM component name
    pub component_name: String,

    /// Method to call on the component
    pub method: String,

    /// Stage-specific arguments
    pub args: serde_json::Value,

    /// Execution settings for this stage
    pub execution_settings: StageExecutionSettings,

    /// Dependencies (other stages that must complete before this one)
    pub dependencies: Vec<String>,

    /// Whether this stage can run in parallel with others
    pub parallel_group: Option<String>,
}

/// Data connection between pipeline stages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataConnection {
    /// Source stage ID
    pub from_stage: String,

    /// Target stage ID
    pub to_stage: String,

    /// Data mapping configuration
    pub mapping: DataMapping,

    /// Connection type
    pub connection_type: ConnectionType,
}

/// Data mapping between stages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataMapping {
    /// Source output field
    pub source_field: String,

    /// Target input field
    pub target_field: String,

    /// Optional data transformation
    pub transform: Option<DataTransform>,
}

/// Data transformation options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DataTransform {
    /// Pass data as-is
    Identity,

    /// Convert to JSON string
    ToJson,

    /// Parse from JSON
    FromJson,

    /// Extract specific field
    Extract { field_path: String },

    /// Custom transformation function
    Custom { function_name: String },
}

/// Connection type between stages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConnectionType {
    /// Direct data passing
    Direct,

    /// Buffered data passing
    Buffered { buffer_size: usize },

    /// Streaming data passing
    Streaming,
}

/// Stage execution settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageExecutionSettings {
    /// Timeout for this stage (milliseconds)
    pub timeout_ms: u64,

    /// Memory limit for this stage (MB)
    pub max_memory_mb: u32,

    /// Retry settings
    pub retry_config: RetryConfig,

    /// Whether to continue pipeline on error
    pub continue_on_error: bool,
}

/// Retry configuration for stage execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryConfig {
    /// Maximum number of retries
    pub max_retries: u32,

    /// Delay between retries (milliseconds)
    pub retry_delay_ms: u64,

    /// Backoff strategy
    pub backoff_strategy: BackoffStrategy,
}

/// Backoff strategy for retries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BackoffStrategy {
    /// Fixed delay
    Fixed,

    /// Exponential backoff
    Exponential { multiplier: f64 },

    /// Linear backoff
    Linear { increment_ms: u64 },
}

/// Global pipeline settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineSettings {
    /// Overall pipeline timeout (milliseconds)
    pub timeout_ms: u64,

    /// Maximum concurrent stages
    pub max_concurrent_stages: usize,

    /// Whether to stop on first error
    pub fail_fast: bool,

    /// Data persistence settings
    pub persistence: PersistenceSettings,

    /// Pipeline execution mode
    pub execution_mode: ExecutionMode,
}

/// Data persistence settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistenceSettings {
    /// Whether to save intermediate results
    pub save_intermediate: bool,

    /// Whether to save final results
    pub save_final: bool,

    /// Storage location for results
    pub storage_path: Option<String>,

    /// Data retention period (hours)
    pub retention_hours: Option<u32>,
}

/// Pipeline execution mode
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExecutionMode {
    /// Execute once and stop
    Single,

    /// Execute continuously (for real-time processing)
    Continuous,

    /// Execute in batch mode
    Batch { batch_size: usize },

    /// Execute with timing synchronization
    Synchronized { frame_rate_hz: f32 },
}

/// Pipeline execution status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineExecution {
    /// Execution ID
    pub execution_id: String,

    /// Pipeline configuration
    pub config: PipelineConfig,

    /// Current execution state
    pub state: PipelineState,

    /// Stage execution results
    pub stage_results: HashMap<String, StageResult>,

    /// Execution statistics
    pub stats: ExecutionStats,

    /// Start time
    pub started_at: DateTime<Utc>,

    /// End time (if completed)
    pub completed_at: Option<DateTime<Utc>>,

    /// Error information (if failed)
    pub error: Option<String>,
}

/// Pipeline execution state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PipelineState {
    /// Pipeline is being prepared
    Preparing,

    /// Pipeline is running
    Running,

    /// Pipeline completed successfully
    Completed,

    /// Pipeline failed with error
    Failed,

    /// Pipeline was cancelled
    Cancelled,

    /// Pipeline is paused
    Paused,
}

/// Result of a single stage execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageResult {
    /// Stage ID
    pub stage_id: String,

    /// Execution result
    pub result: ExecutionResult,

    /// Input data received
    pub input_data: Option<serde_json::Value>,

    /// Output data produced
    pub output_data: Option<serde_json::Value>,

    /// Stage execution statistics
    pub stats: StageStats,
}

/// Statistics for stage execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageStats {
    /// Number of retries performed
    pub retry_count: u32,

    /// Total execution time including retries
    pub total_execution_ms: u64,

    /// Input data size (bytes)
    pub input_size_bytes: usize,

    /// Output data size (bytes)
    pub output_size_bytes: usize,
}

/// Overall pipeline execution statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionStats {
    /// Total stages executed
    pub stages_executed: usize,

    /// Total stages failed
    pub stages_failed: usize,

    /// Total execution time
    pub total_execution_ms: u64,

    /// Peak memory usage
    pub peak_memory_mb: u32,

    /// Total data processed (bytes)
    pub total_data_bytes: usize,

    /// Average stage execution time
    pub avg_stage_execution_ms: f64,
}

/// Pipeline execution engine
pub struct WasmPipelineEngine {
    /// WASM execution engine for individual components
    execution_engine: Arc<WasmExecutionEngine>,

    /// Active pipeline executions
    active_executions: Arc<RwLock<HashMap<String, Arc<Mutex<PipelineExecution>>>>>,

    /// Component cache (component name -> path)
    component_paths: Arc<RwLock<HashMap<String, PathBuf>>>,

    /// Maximum concurrent pipelines
    max_concurrent_pipelines: usize,
}

impl WasmPipelineEngine {
    /// Create a new pipeline execution engine
    pub fn new(
        execution_engine: Arc<WasmExecutionEngine>,
        max_concurrent_pipelines: usize,
    ) -> Self {
        Self {
            execution_engine,
            active_executions: Arc::new(RwLock::new(HashMap::new())),
            component_paths: Arc::new(RwLock::new(HashMap::new())),
            max_concurrent_pipelines,
        }
    }

    /// Register a component with its file path
    pub async fn register_component(&self, name: String, path: PathBuf) {
        let mut paths = self.component_paths.write().await;
        paths.insert(name, path);
    }

    /// Execute a pipeline
    pub async fn execute_pipeline(&self, config: PipelineConfig) -> Result<String> {
        let execution_id = Uuid::new_v4().to_string();

        // Check concurrent execution limit
        {
            let executions = self.active_executions.read().await;
            if executions.len() >= self.max_concurrent_pipelines {
                return Err(anyhow!("Maximum concurrent pipelines reached"));
            }
        }

        info!(
            "Starting pipeline execution: {} ({})",
            config.name, execution_id
        );

        // Create pipeline execution
        let execution = PipelineExecution {
            execution_id: execution_id.clone(),
            config: config.clone(),
            state: PipelineState::Preparing,
            stage_results: HashMap::new(),
            stats: ExecutionStats {
                stages_executed: 0,
                stages_failed: 0,
                total_execution_ms: 0,
                peak_memory_mb: 0,
                total_data_bytes: 0,
                avg_stage_execution_ms: 0.0,
            },
            started_at: Utc::now(),
            completed_at: None,
            error: None,
        };

        let execution_arc = Arc::new(Mutex::new(execution));

        // Register execution
        {
            let mut executions = self.active_executions.write().await;
            executions.insert(execution_id.clone(), execution_arc.clone());
        }

        // Spawn execution task
        let engine = self.execution_engine.clone();
        let component_paths = self.component_paths.clone();
        let active_executions = self.active_executions.clone();
        let exec_id_for_cleanup = execution_id.clone();

        tokio::spawn(async move {
            let result =
                Self::execute_pipeline_impl(engine, component_paths, execution_arc, config).await;

            // Clean up execution from active list
            {
                let mut executions = active_executions.write().await;
                executions.remove(&exec_id_for_cleanup);
            }

            if let Err(e) = result {
                error!("Pipeline execution failed: {}", e);
            }
        });

        Ok(execution_id)
    }

    /// Internal pipeline execution implementation
    async fn execute_pipeline_impl(
        execution_engine: Arc<WasmExecutionEngine>,
        component_paths: Arc<RwLock<HashMap<String, PathBuf>>>,
        execution_arc: Arc<Mutex<PipelineExecution>>,
        config: PipelineConfig,
    ) -> Result<()> {
        let start_time = std::time::Instant::now();

        // Update state to running
        {
            let mut execution = execution_arc.lock().await;
            execution.state = PipelineState::Running;
        }

        // Build execution graph
        let execution_graph = Self::build_execution_graph(&config)?;

        // Execute stages according to dependency graph
        match Self::execute_stages(
            execution_engine,
            component_paths,
            execution_arc.clone(),
            execution_graph,
        )
        .await
        {
            Ok(_) => {
                let mut execution = execution_arc.lock().await;
                execution.state = PipelineState::Completed;
                execution.completed_at = Some(Utc::now());
                execution.stats.total_execution_ms = start_time.elapsed().as_millis() as u64;
                info!("Pipeline completed successfully: {}", config.name);
            }
            Err(e) => {
                let mut execution = execution_arc.lock().await;
                execution.state = PipelineState::Failed;
                execution.completed_at = Some(Utc::now());
                execution.error = Some(e.to_string());
                error!("Pipeline failed: {} - {}", config.name, e);
            }
        }

        Ok(())
    }

    /// Build execution graph from pipeline configuration
    fn build_execution_graph(config: &PipelineConfig) -> Result<ExecutionGraph> {
        let mut graph = ExecutionGraph {
            stages: HashMap::new(),
            parallel_groups: HashMap::new(),
            execution_order: Vec::new(),
        };

        // Add stages to graph
        for stage in &config.stages {
            graph.stages.insert(stage.stage_id.clone(), stage.clone());

            // Group parallel stages
            if let Some(ref group_name) = stage.parallel_group {
                graph
                    .parallel_groups
                    .entry(group_name.clone())
                    .or_default()
                    .push(stage.stage_id.clone());
            }
        }

        // Build execution order based on dependencies
        graph.execution_order = Self::topological_sort(&config.stages)?;

        Ok(graph)
    }

    /// Perform topological sort to determine execution order
    fn topological_sort(stages: &[PipelineStage]) -> Result<Vec<Vec<String>>> {
        let mut result = Vec::new();
        let mut remaining: HashMap<String, PipelineStage> = stages
            .iter()
            .map(|s| (s.stage_id.clone(), s.clone()))
            .collect();
        let mut resolved = std::collections::HashSet::new();

        while !remaining.is_empty() {
            // Find stages with no unresolved dependencies
            let ready_stages: Vec<String> = remaining
                .values()
                .filter(|stage| stage.dependencies.iter().all(|dep| resolved.contains(dep)))
                .map(|stage| stage.stage_id.clone())
                .collect();

            if ready_stages.is_empty() {
                return Err(anyhow!("Circular dependency detected in pipeline"));
            }

            // Group by parallel execution groups
            let mut parallel_batch = Vec::new();
            let mut processed_groups = std::collections::HashSet::new();

            for stage_id in ready_stages {
                let stage = remaining.get(&stage_id).unwrap();

                if let Some(ref group) = stage.parallel_group {
                    if !processed_groups.contains(group) {
                        // Add all stages in this parallel group that are ready
                        let group_stages: Vec<String> = remaining
                            .values()
                            .filter(|s| s.parallel_group.as_ref() == Some(group))
                            .filter(|s| s.dependencies.iter().all(|dep| resolved.contains(dep)))
                            .map(|s| s.stage_id.clone())
                            .collect();

                        parallel_batch.extend(group_stages);
                        processed_groups.insert(group.clone());
                    }
                } else {
                    parallel_batch.push(stage_id);
                }
            }

            // Remove processed stages and mark as resolved
            for stage_id in &parallel_batch {
                remaining.remove(stage_id);
                resolved.insert(stage_id.clone());
            }

            result.push(parallel_batch);
        }

        Ok(result)
    }

    /// Execute stages according to the execution graph
    async fn execute_stages(
        execution_engine: Arc<WasmExecutionEngine>,
        component_paths: Arc<RwLock<HashMap<String, PathBuf>>>,
        execution_arc: Arc<Mutex<PipelineExecution>>,
        graph: ExecutionGraph,
    ) -> Result<()> {
        let mut stage_outputs: HashMap<String, serde_json::Value> = HashMap::new();

        // Execute stages in dependency order
        for stage_batch in &graph.execution_order {
            if stage_batch.len() == 1 {
                // Sequential execution
                let stage_id = &stage_batch[0];
                let result = Self::execute_single_stage(
                    execution_engine.clone(),
                    component_paths.clone(),
                    execution_arc.clone(),
                    &graph,
                    stage_id,
                    &stage_outputs,
                )
                .await?;

                if let Some(output) = result.output_data {
                    stage_outputs.insert(stage_id.clone(), output);
                }
            } else {
                // Parallel execution
                let mut parallel_tasks = Vec::new();

                for stage_id in stage_batch {
                    let engine = execution_engine.clone();
                    let paths = component_paths.clone();
                    let exec_arc = execution_arc.clone();
                    let execution_graph = graph.clone();
                    let outputs = stage_outputs.clone();
                    let stage_id_owned = stage_id.clone();

                    let task = tokio::spawn(async move {
                        Self::execute_single_stage(
                            engine,
                            paths,
                            exec_arc,
                            &execution_graph,
                            &stage_id_owned,
                            &outputs,
                        )
                        .await
                    });

                    parallel_tasks.push((stage_id.clone(), task));
                }

                // Wait for all parallel tasks to complete
                for (stage_id, task) in parallel_tasks {
                    let result = task.await??;
                    if let Some(output) = result.output_data {
                        stage_outputs.insert(stage_id, output);
                    }
                }
            }
        }

        Ok(())
    }

    /// Execute a single stage
    async fn execute_single_stage(
        execution_engine: Arc<WasmExecutionEngine>,
        component_paths: Arc<RwLock<HashMap<String, PathBuf>>>,
        execution_arc: Arc<Mutex<PipelineExecution>>,
        graph: &ExecutionGraph,
        stage_id: &str,
        stage_outputs: &HashMap<String, serde_json::Value>,
    ) -> Result<StageResult> {
        let stage = graph
            .stages
            .get(stage_id)
            .ok_or_else(|| anyhow!("Stage not found: {}", stage_id))?;

        debug!("Executing stage: {} ({})", stage.name, stage_id);

        // Get component path
        let component_path = {
            let paths = component_paths.read().await;
            paths
                .get(&stage.component_name)
                .ok_or_else(|| anyhow!("Component not found: {}", stage.component_name))?
                .clone()
        };

        // Prepare input data based on connections
        let input_data =
            Self::prepare_stage_input(execution_arc.clone(), stage, stage_outputs).await?;

        // Get sensor configuration from pipeline
        let sensor_config = {
            let execution = execution_arc.lock().await;
            execution.config.sensor_config.clone()
        };

        // Create execution context
        let context = ExecutionContext {
            execution_id: Uuid::new_v4().to_string(),
            component_name: stage.component_name.clone(),
            method: stage.method.clone(),
            args: input_data.clone(),
            timeout_ms: stage.execution_settings.timeout_ms,
            max_memory_mb: stage.execution_settings.max_memory_mb,
            created_at: Utc::now(),
            sensor_config,
        };

        // Execute with retries
        let mut retry_count = 0;
        let max_retries = stage.execution_settings.retry_config.max_retries;

        loop {
            match execution_engine
                .execute_component(context.clone(), &component_path)
                .await
            {
                Ok(exec_id) => {
                    // Wait for execution to complete
                    loop {
                        if let Some(result) = execution_engine.get_execution_result(&exec_id) {
                            let output_data = result.result.clone();

                            let stage_result = StageResult {
                                stage_id: stage_id.to_string(),
                                result,
                                input_data: Some(input_data),
                                output_data,
                                stats: StageStats {
                                    retry_count,
                                    total_execution_ms: 0, // Performance metrics not implemented
                                    input_size_bytes: 0,   // Size metrics not implemented
                                    output_size_bytes: 0,  // Size metrics not implemented
                                },
                            };

                            // Update execution with stage result
                            {
                                let mut execution = execution_arc.lock().await;
                                execution
                                    .stage_results
                                    .insert(stage_id.to_string(), stage_result.clone());
                                execution.stats.stages_executed += 1;
                            }

                            return Ok(stage_result);
                        }

                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    }
                }
                Err(e) => {
                    if retry_count < max_retries {
                        retry_count += 1;
                        warn!(
                            "Stage {} failed, retrying ({}/{}): {}",
                            stage.name, retry_count, max_retries, e
                        );

                        // Calculate retry delay
                        let delay = Self::calculate_retry_delay(
                            &stage.execution_settings.retry_config,
                            retry_count,
                        );
                        tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
                    } else {
                        // Update execution with failure
                        {
                            let mut execution = execution_arc.lock().await;
                            execution.stats.stages_failed += 1;
                        }

                        if stage.execution_settings.continue_on_error {
                            warn!("Stage {} failed but continuing pipeline: {}", stage.name, e);
                            return Ok(StageResult {
                                stage_id: stage_id.to_string(),
                                result: ExecutionResult {
                                    execution_id: context.execution_id,
                                    success: false,
                                    result: None,
                                    error: Some(e.to_string()),
                                    execution_time_ms: 0,
                                    memory_usage_mb: 0,
                                    output_data: None,
                                    graphics_output: None,
                                    completed_at: Utc::now(),
                                },
                                input_data: Some(input_data),
                                output_data: None,
                                stats: StageStats {
                                    retry_count,
                                    total_execution_ms: 0,
                                    input_size_bytes: 0,
                                    output_size_bytes: 0,
                                },
                            });
                        } else {
                            return Err(anyhow!("Stage {} failed: {}", stage.name, e));
                        }
                    }
                }
            }
        }
    }

    /// Prepare input data for a stage based on data connections
    async fn prepare_stage_input(
        execution_arc: Arc<Mutex<PipelineExecution>>,
        stage: &PipelineStage,
        stage_outputs: &HashMap<String, serde_json::Value>,
    ) -> Result<serde_json::Value> {
        let execution = execution_arc.lock().await;
        let connections: Vec<&DataConnection> = execution
            .config
            .connections
            .iter()
            .filter(|conn| conn.to_stage == stage.stage_id)
            .collect();

        if connections.is_empty() {
            // No input connections, use stage args
            return Ok(stage.args.clone());
        }

        let mut input_data = serde_json::Map::new();

        // Add stage args as base
        if let serde_json::Value::Object(args_map) = &stage.args {
            for (key, value) in args_map {
                input_data.insert(key.clone(), value.clone());
            }
        }

        // Add data from connections
        for connection in connections {
            if let Some(source_output) = stage_outputs.get(&connection.from_stage) {
                let transformed_data =
                    Self::apply_data_transform(source_output, &connection.mapping)?;

                input_data.insert(connection.mapping.target_field.clone(), transformed_data);
            }
        }

        Ok(serde_json::Value::Object(input_data))
    }

    /// Apply data transformation based on mapping configuration
    fn apply_data_transform(
        source_data: &serde_json::Value,
        mapping: &DataMapping,
    ) -> Result<serde_json::Value> {
        // Extract source field
        let field_data = if mapping.source_field == "*" {
            source_data.clone()
        } else {
            source_data
                .get(&mapping.source_field)
                .cloned()
                .unwrap_or(serde_json::Value::Null)
        };

        // Apply transformation
        match &mapping.transform {
            Some(DataTransform::Identity) | None => Ok(field_data),
            Some(DataTransform::ToJson) => Ok(serde_json::Value::String(serde_json::to_string(
                &field_data,
            )?)),
            Some(DataTransform::FromJson) => {
                if let serde_json::Value::String(json_str) = &field_data {
                    Ok(serde_json::from_str(json_str)?)
                } else {
                    Err(anyhow!("Cannot parse non-string as JSON"))
                }
            }
            Some(DataTransform::Extract { field_path }) => {
                Self::extract_field_path(&field_data, field_path)
            }
            Some(DataTransform::Custom { function_name }) => {
                // Custom transformation functions not implemented yet
                warn!("Custom transformation not implemented: {}", function_name);
                Ok(field_data)
            }
        }
    }

    /// Extract field using dot notation path
    fn extract_field_path(data: &serde_json::Value, path: &str) -> Result<serde_json::Value> {
        let mut current = data;
        for part in path.split('.') {
            match current {
                serde_json::Value::Object(map) => {
                    current = map.get(part).unwrap_or(&serde_json::Value::Null);
                }
                serde_json::Value::Array(arr) => {
                    if let Ok(index) = part.parse::<usize>() {
                        current = arr.get(index).unwrap_or(&serde_json::Value::Null);
                    } else {
                        return Ok(serde_json::Value::Null);
                    }
                }
                _ => return Ok(serde_json::Value::Null),
            }
        }
        Ok(current.clone())
    }

    /// Calculate retry delay based on backoff strategy
    fn calculate_retry_delay(config: &RetryConfig, retry_count: u32) -> u64 {
        match config.backoff_strategy {
            BackoffStrategy::Fixed => config.retry_delay_ms,
            BackoffStrategy::Exponential { multiplier } => {
                (config.retry_delay_ms as f64 * multiplier.powi(retry_count as i32 - 1)) as u64
            }
            BackoffStrategy::Linear { increment_ms } => {
                config.retry_delay_ms + (increment_ms * (retry_count as u64 - 1))
            }
        }
    }

    /// Get pipeline execution status
    pub async fn get_execution_status(&self, execution_id: &str) -> Option<PipelineExecution> {
        let executions = self.active_executions.read().await;
        if let Some(execution_arc) = executions.get(execution_id) {
            let execution = execution_arc.lock().await;
            Some(execution.clone())
        } else {
            None
        }
    }

    /// Cancel a running pipeline
    pub async fn cancel_pipeline(&self, execution_id: &str) -> Result<()> {
        let executions = self.active_executions.read().await;
        if let Some(execution_arc) = executions.get(execution_id) {
            let mut execution = execution_arc.lock().await;
            execution.state = PipelineState::Cancelled;
            execution.completed_at = Some(Utc::now());
            info!("Pipeline cancelled: {}", execution_id);
            Ok(())
        } else {
            Err(anyhow!("Pipeline execution not found: {}", execution_id))
        }
    }

    /// List active pipeline executions
    pub async fn list_active_executions(&self) -> Vec<String> {
        let executions = self.active_executions.read().await;
        executions.keys().cloned().collect()
    }
}

/// Internal execution graph representation
#[derive(Debug, Clone)]
struct ExecutionGraph {
    /// All stages in the pipeline
    stages: HashMap<String, PipelineStage>,

    /// Parallel execution groups
    parallel_groups: HashMap<String, Vec<String>>,

    /// Execution order (batches of stages that can run in parallel)
    execution_order: Vec<Vec<String>>,
}

// Default implementations
impl Default for StageExecutionSettings {
    fn default() -> Self {
        Self {
            timeout_ms: 30000, // 30 seconds
            max_memory_mb: 128,
            retry_config: RetryConfig::default(),
            continue_on_error: false,
        }
    }
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            retry_delay_ms: 1000,
            backoff_strategy: BackoffStrategy::Exponential { multiplier: 2.0 },
        }
    }
}

impl Default for PipelineSettings {
    fn default() -> Self {
        Self {
            timeout_ms: 300000, // 5 minutes
            max_concurrent_stages: 10,
            fail_fast: true,
            persistence: PersistenceSettings::default(),
            execution_mode: ExecutionMode::Single,
        }
    }
}

impl Default for PersistenceSettings {
    fn default() -> Self {
        Self {
            save_intermediate: false,
            save_final: true,
            storage_path: None,
            retention_hours: Some(24),
        }
    }
}
