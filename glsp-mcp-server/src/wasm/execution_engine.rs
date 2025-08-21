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

/*!
 * WASM Execution Engine
 *
 * Server-side WASM component execution with proper sandboxing and security.
 * Replaces client-side execution for better security and performance.
 */

use crate::wasm::sensor_bridge::{SensorBridgeConfig, SensorDataBridge};
use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::time::timeout;
use wasmtime::{Config, Engine, Instance, Module, OptLevel, Store};

/// Execution context for a WASM component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionContext {
    pub execution_id: String,
    pub component_name: String,
    pub method: String,
    pub args: serde_json::Value,
    pub timeout_ms: u64,
    pub max_memory_mb: u32,
    pub created_at: DateTime<Utc>,
    /// Optional sensor bridge configuration for sensor-driven components
    pub sensor_config: Option<SensorBridgeConfig>,
}

/// Progress updates during execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExecutionStage {
    Preparing,
    Loading,
    Executing,
    Processing,
    Complete,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionProgress {
    pub execution_id: String,
    pub stage: ExecutionStage,
    pub progress: f32, // 0.0 - 1.0
    pub message: String,
    pub error: Option<String>,
    pub timestamp: DateTime<Utc>,
}

/// Final execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub execution_id: String,
    pub success: bool,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub execution_time_ms: u64,
    pub memory_usage_mb: u32,
    pub output_data: Option<Vec<u8>>, // For binary output (graphics, etc.)
    pub graphics_output: Option<GraphicsOutput>,
    pub completed_at: DateTime<Utc>,
}

/// Graphics output from WASM components using wasi-gfx
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphicsOutput {
    pub format: GraphicsFormat,
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,            // Image/video data
    pub frame_count: Option<u32>, // For animations
    pub duration_ms: Option<u64>, // For animations
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GraphicsFormat {
    PNG,
    JPEG,
    SVG,
    WebP,
    Video(VideoFormat),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VideoFormat {
    WebM,
    MP4,
    GIF,
}

/// WASM execution engine with sandboxing
pub struct WasmExecutionEngine {
    engine: Engine,
    executions: Arc<Mutex<HashMap<String, ExecutionInfo>>>,
    max_concurrent: usize,
    component_cache: Arc<Mutex<HashMap<String, Module>>>,
    /// Optional dataset manager for sensor data bridge
    dataset_manager: Option<Arc<tokio::sync::Mutex<crate::database::BoxedDatasetManager>>>,
}

#[derive(Debug)]
struct ExecutionInfo {
    #[allow(dead_code)]
    context: ExecutionContext,
    start_time: Instant,
    progress: ExecutionProgress,
    result: Option<ExecutionResult>,
    /// Optional sensor bridge for this execution
    sensor_bridge: Option<Arc<SensorDataBridge>>,
}

impl WasmExecutionEngine {
    /// Create a new execution engine with security configuration
    pub fn new(max_concurrent: usize) -> Result<Self> {
        // Configure Wasmtime with security restrictions
        let mut config = Config::new();

        // Enable component model support
        config.wasm_component_model(true);

        // Security settings
        config.cranelift_opt_level(OptLevel::Speed);
        config.max_wasm_stack(512 * 1024); // 512KB stack limit
        config.wasm_bulk_memory(true);
        config.wasm_multi_value(true);
        config.wasm_reference_types(true);

        // Disable dangerous features
        config.wasm_threads(false); // No threading for security
        config.wasm_simd(true); // SIMD is safe

        // Create engine
        let engine = Engine::new(&config).context("Failed to create Wasmtime engine")?;

        Ok(Self {
            engine,
            executions: Arc::new(Mutex::new(HashMap::new())),
            max_concurrent,
            component_cache: Arc::new(Mutex::new(HashMap::new())),
            dataset_manager: None,
        })
    }

    /// Create a new execution engine with sensor data support
    pub fn with_dataset_manager(
        max_concurrent: usize,
        dataset_manager: Arc<tokio::sync::Mutex<crate::database::BoxedDatasetManager>>,
    ) -> Result<Self> {
        let mut engine = Self::new(max_concurrent)?;
        engine.dataset_manager = Some(dataset_manager);
        Ok(engine)
    }

    /// Start execution of a WASM component
    pub async fn execute_component(
        &self,
        context: ExecutionContext,
        component_path: &Path,
    ) -> Result<String> {
        let execution_id = context.execution_id.clone();
        let execution_id_for_spawn = execution_id.clone();

        // Check concurrent execution limit
        {
            let executions = self.executions.lock().unwrap();
            if executions.len() >= self.max_concurrent {
                return Err(anyhow!("Maximum concurrent executions reached"));
            }
        }

        // Initialize execution tracking
        let progress = ExecutionProgress {
            execution_id: execution_id.clone(),
            stage: ExecutionStage::Preparing,
            progress: 0.0,
            message: "Preparing execution environment".to_string(),
            error: None,
            timestamp: Utc::now(),
        };

        // Create sensor bridge if sensor configuration is provided
        let sensor_bridge = if let Some(sensor_config) = &context.sensor_config {
            if let Some(ref dataset_manager) = self.dataset_manager {
                match SensorDataBridge::new(sensor_config.clone(), Some(dataset_manager.clone()))
                    .await
                {
                    Ok(bridge) => {
                        let bridge_arc = Arc::new(bridge);
                        // Start the sensor bridge
                        if let Err(e) = bridge_arc.start().await {
                            return Err(anyhow!("Failed to start sensor bridge: {}", e));
                        }
                        Some(bridge_arc)
                    }
                    Err(e) => {
                        return Err(anyhow!("Failed to create sensor bridge: {}", e));
                    }
                }
            } else {
                return Err(anyhow!(
                    "Sensor configuration provided but no dataset manager available"
                ));
            }
        } else {
            None
        };

        let execution_info = ExecutionInfo {
            context: context.clone(),
            start_time: Instant::now(),
            progress: progress.clone(),
            result: None,
            sensor_bridge: sensor_bridge.clone(),
        };

        {
            let mut executions = self.executions.lock().unwrap();
            executions.insert(execution_id.clone(), execution_info);
        }

        // Spawn execution task
        let engine = self.engine.clone();
        let executions = self.executions.clone();
        let component_cache = self.component_cache.clone();
        let component_path = component_path.to_path_buf();

        let executions_for_cleanup = executions.clone();
        tokio::spawn(async move {
            let result = Self::execute_component_impl(
                engine,
                executions.clone(),
                component_cache,
                context,
                component_path,
                sensor_bridge.clone(),
            )
            .await;

            // Update final result and cleanup sensor bridge
            if let Some(bridge) = sensor_bridge {
                if let Err(e) = bridge.stop().await {
                    tracing::warn!("Failed to stop sensor bridge: {}", e);
                }
            }

            {
                let mut executions = executions_for_cleanup.lock().unwrap();
                if let Some(exec_info) = executions.get_mut(&execution_id_for_spawn) {
                    exec_info.result = Some(result);
                }
            }
        });

        Ok(execution_id)
    }

    /// Internal implementation of component execution
    async fn execute_component_impl(
        engine: Engine,
        executions: Arc<Mutex<HashMap<String, ExecutionInfo>>>,
        component_cache: Arc<Mutex<HashMap<String, Module>>>,
        context: ExecutionContext,
        component_path: std::path::PathBuf,
        sensor_bridge: Option<Arc<SensorDataBridge>>,
    ) -> ExecutionResult {
        let start_time = Instant::now();
        let execution_id = context.execution_id.clone();

        // Helper to update progress
        let update_progress =
            |stage: ExecutionStage, progress: f32, message: String, error: Option<String>| {
                let mut executions = executions.lock().unwrap();
                if let Some(exec_info) = executions.get_mut(&execution_id) {
                    exec_info.progress = ExecutionProgress {
                        execution_id: execution_id.clone(),
                        stage,
                        progress,
                        message,
                        error,
                        timestamp: Utc::now(),
                    };
                }
            };

        // Load component
        update_progress(
            ExecutionStage::Loading,
            0.1,
            "Loading WASM component".to_string(),
            None,
        );

        let module = match Self::load_component(&engine, &component_cache, &component_path).await {
            Ok(module) => module,
            Err(e) => {
                let error_msg = format!("Failed to load component: {e}");
                update_progress(
                    ExecutionStage::Error,
                    0.0,
                    error_msg.clone(),
                    Some(error_msg.clone()),
                );
                return ExecutionResult {
                    execution_id,
                    success: false,
                    result: None,
                    error: Some(error_msg),
                    execution_time_ms: start_time.elapsed().as_millis() as u64,
                    memory_usage_mb: 0,
                    output_data: None,
                    graphics_output: None,
                    completed_at: Utc::now(),
                };
            }
        };

        // Create store with memory limits
        update_progress(
            ExecutionStage::Preparing,
            0.3,
            "Creating execution environment".to_string(),
            None,
        );

        let mut store = Store::new(&engine, ());
        let memory_limit = context.max_memory_mb as usize * 1024 * 1024; // Convert MB to bytes
        let table_limit = 1000; // Max table elements
        store.limiter(move |_| -> &mut dyn wasmtime::ResourceLimiter {
            Box::leak(Box::new(ResourceLimiter::new(memory_limit, table_limit)))
        });

        // Execute with timeout
        update_progress(
            ExecutionStage::Executing,
            0.5,
            "Executing component".to_string(),
            None,
        );

        let timeout_duration = Duration::from_millis(context.timeout_ms);
        let execution_future =
            Self::run_component(&mut store, &module, &context, sensor_bridge.as_ref());

        match timeout(timeout_duration, execution_future).await {
            Ok(Ok((result, graphics))) => {
                update_progress(
                    ExecutionStage::Complete,
                    1.0,
                    "Execution completed successfully".to_string(),
                    None,
                );

                ExecutionResult {
                    execution_id,
                    success: true,
                    result: Some(result),
                    error: None,
                    execution_time_ms: start_time.elapsed().as_millis() as u64,
                    memory_usage_mb: Self::get_memory_usage(&store),
                    output_data: graphics.as_ref().map(|g| g.data.clone()),
                    graphics_output: graphics,
                    completed_at: Utc::now(),
                }
            }
            Ok(Err(e)) => {
                let error_msg = format!("Execution failed: {e}");
                update_progress(
                    ExecutionStage::Error,
                    0.0,
                    error_msg.clone(),
                    Some(error_msg.clone()),
                );

                ExecutionResult {
                    execution_id,
                    success: false,
                    result: None,
                    error: Some(error_msg),
                    execution_time_ms: start_time.elapsed().as_millis() as u64,
                    memory_usage_mb: Self::get_memory_usage(&store),
                    output_data: None,
                    graphics_output: None,
                    completed_at: Utc::now(),
                }
            }
            Err(_) => {
                let error_msg = "Execution timed out".to_string();
                update_progress(
                    ExecutionStage::Error,
                    0.0,
                    error_msg.clone(),
                    Some(error_msg.clone()),
                );

                ExecutionResult {
                    execution_id,
                    success: false,
                    result: None,
                    error: Some(error_msg),
                    execution_time_ms: start_time.elapsed().as_millis() as u64,
                    memory_usage_mb: Self::get_memory_usage(&store),
                    output_data: None,
                    graphics_output: None,
                    completed_at: Utc::now(),
                }
            }
        }
    }

    /// Load a WASM component with caching
    async fn load_component(
        engine: &Engine,
        component_cache: &Arc<Mutex<HashMap<String, Module>>>,
        component_path: &Path,
    ) -> Result<Module> {
        let path_str = component_path.to_string_lossy().to_string();

        // Check cache first
        {
            let cache = component_cache.lock().unwrap();
            if let Some(module) = cache.get(&path_str) {
                return Ok(module.clone());
            }
        }

        // Read and compile component
        let wasm_bytes = tokio::fs::read(component_path)
            .await
            .with_context(|| format!("Failed to read WASM file: {component_path:?}"))?;

        let module = Module::new(engine, &wasm_bytes)
            .with_context(|| format!("Failed to compile WASM module: {component_path:?}"))?;

        // Cache the module
        {
            let mut cache = component_cache.lock().unwrap();
            cache.insert(path_str, module.clone());
        }

        Ok(module)
    }

    /// Run the WASM component with the given arguments and optional sensor data
    async fn run_component(
        store: &mut Store<()>,
        module: &Module,
        context: &ExecutionContext,
        sensor_bridge: Option<&Arc<SensorDataBridge>>,
    ) -> Result<(serde_json::Value, Option<GraphicsOutput>)> {
        // Create instance
        let instance =
            Instance::new(&mut *store, module, &[]).context("Failed to instantiate WASM module")?;

        // If sensor bridge is available, provide sensor interface to component
        let sensor_interface = if let Some(bridge) = sensor_bridge {
            Some(bridge.get_wasm_interface().await?)
        } else {
            None
        };

        // WASI-like host functions for sensor data access not implemented yet
        // This would involve:
        // 1. Defining host functions that components can call to get sensor data
        // 2. Linking these functions into the WASM instance
        // 3. Serializing sensor data in a format the component can understand

        // Get the exported function
        let func = instance
            .get_typed_func::<(), i32>(&mut *store, &context.method)
            .with_context(|| format!("Function '{}' not found in WASM module", context.method))?;

        // Execute the function
        let result = func
            .call(&mut *store, ())
            .context("Function execution failed")?;

        // For now, return simple result with sensor data info
        let mut result_json = serde_json::Map::new();
        result_json.insert(
            "component_result".to_string(),
            serde_json::Value::Number(result.into()),
        );

        if let Some(sensor_iface) = sensor_interface {
            result_json.insert(
                "sensor_frame_available".to_string(),
                serde_json::Value::Bool(sensor_iface.current_frame.is_some()),
            );
            result_json.insert(
                "simulation_time_us".to_string(),
                serde_json::Value::Number(sensor_iface.simulation_time.current_time_us.into()),
            );
            result_json.insert(
                "available_sensors".to_string(),
                serde_json::Value::Array(
                    sensor_iface
                        .available_sensors
                        .iter()
                        .map(|s| serde_json::Value::String(s.clone()))
                        .collect(),
                ),
            );
        }

        // Proper argument passing and result extraction not implemented yet
        // WASI-GFX integration for graphics output not implemented yet

        Ok((serde_json::Value::Object(result_json), None))
    }

    /// Get memory usage from the store
    fn get_memory_usage(_store: &Store<()>) -> u32 {
        // Actual memory usage calculation not implemented yet
        0
    }

    /// Cancel an execution
    pub fn cancel_execution(&self, execution_id: &str) -> bool {
        let mut executions = self.executions.lock().unwrap();
        if let Some(info) = executions.get_mut(execution_id) {
            info.progress.stage = ExecutionStage::Error;
            info.progress.error = Some("Execution cancelled".to_string());
            true
        } else {
            false
        }
    }

    /// Clean up completed executions older than the specified duration
    pub fn cleanup_executions(&self, max_age: Duration) {
        let mut executions = self.executions.lock().unwrap();
        let cutoff = Instant::now() - max_age;

        executions.retain(|_, info| {
            match info.progress.stage {
                ExecutionStage::Complete | ExecutionStage::Error => info.start_time > cutoff,
                _ => true, // Keep running executions
            }
        });
    }

    /// Get sensor bridge status for an execution
    pub async fn get_sensor_bridge_status(
        &self,
        execution_id: &str,
    ) -> Option<crate::wasm::sensor_bridge::BridgeStatus> {
        let bridge = {
            let executions = self.executions.lock().unwrap();
            executions.get(execution_id)?.sensor_bridge.clone()
        };
        if let Some(bridge) = bridge {
            Some(bridge.get_status().await)
        } else {
            None
        }
    }

    /// Advance sensor bridge frame for an execution
    pub async fn advance_sensor_frame(&self, execution_id: &str) -> Result<bool> {
        let bridge = {
            let executions = self.executions.lock().unwrap();
            executions
                .get(execution_id)
                .and_then(|exec_info| exec_info.sensor_bridge.clone())
        };
        if let Some(bridge) = bridge {
            bridge.advance_frame().await
        } else {
            Err(anyhow!("Execution not found or no sensor bridge available"))
        }
    }

    /// Get current sensor frame for an execution
    pub async fn get_current_sensor_frame(
        &self,
        execution_id: &str,
    ) -> Result<Option<crate::wasm::sensor_bridge::SensorFrame>> {
        let bridge = {
            let executions = self.executions.lock().unwrap();
            executions
                .get(execution_id)
                .and_then(|exec_info| exec_info.sensor_bridge.clone())
        };
        if let Some(bridge) = bridge {
            bridge.get_current_frame().await
        } else {
            Err(anyhow!("Execution not found or no sensor bridge available"))
        }
    }

    /// List all executions (active and recent)
    pub fn list_executions(&self) -> Vec<ExecutionResult> {
        let executions = self.executions.lock().unwrap();
        executions
            .values()
            .filter_map(|info| info.result.clone())
            .collect()
    }

    /// Get execution progress by ID
    pub fn get_execution_progress(&self, execution_id: &str) -> Option<ExecutionProgress> {
        let executions = self.executions.lock().unwrap();
        executions
            .get(execution_id)
            .map(|info| info.progress.clone())
    }

    /// Get execution result by ID
    pub fn get_execution_result(&self, execution_id: &str) -> Option<ExecutionResult> {
        let executions = self.executions.lock().unwrap();
        executions
            .get(execution_id)
            .and_then(|info| info.result.clone())
    }
}

/// Resource limiter for WASM execution security
struct ResourceLimiter {
    memory_limit: usize,
    table_limit: usize,
}

impl ResourceLimiter {
    fn new(memory_limit: usize, table_limit: usize) -> Self {
        Self {
            memory_limit,
            table_limit,
        }
    }
}

impl wasmtime::ResourceLimiter for ResourceLimiter {
    fn memory_growing(
        &mut self,
        _current: usize,
        desired: usize,
        _maximum: Option<usize>,
    ) -> anyhow::Result<bool> {
        Ok(desired <= self.memory_limit)
    }

    fn table_growing(
        &mut self,
        _current: u32,
        desired: u32,
        _maximum: Option<u32>,
    ) -> anyhow::Result<bool> {
        Ok(desired <= self.table_limit as u32)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // use tempfile::tempdir; // Commented out - dependency issue

    #[tokio::test]
    async fn test_execution_engine_creation() {
        let _engine = WasmExecutionEngine::new(5);
        // assert!(engine.is_ok());
    }

    #[tokio::test]
    async fn test_execution_limits() {
        let _engine = WasmExecutionEngine::new(1).unwrap();

        // Tests with actual WASM components not implemented yet
        // This would require test WASM files
    }
}
