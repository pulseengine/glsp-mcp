//! WASM Component Simulation Framework
//!
//! Provides a comprehensive simulation framework for managing complex, time-driven
//! executions of interconnected WASM component graphs with sensor data integration.

use crate::database::BoxedDatasetManager;
use crate::wasm::pipeline::{PipelineConfig, WasmPipelineEngine};
use crate::wasm::sensor_bridge::{BridgeStatus, SensorBridgeConfig, SensorDataBridge};
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tokio::time::{Duration, Instant};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

/// Simulation configuration defining the complete simulation environment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationConfig {
    /// Unique simulation identifier
    pub simulation_id: String,

    /// Simulation name
    pub name: String,

    /// Simulation description
    pub description: String,

    /// Simulation scenarios to execute
    pub scenarios: Vec<SimulationScenario>,

    /// Global simulation settings
    pub settings: SimulationSettings,

    /// Sensor data configuration
    pub sensor_config: SensorBridgeConfig,

    /// Environment variables for all components
    pub environment: HashMap<String, String>,

    /// Created timestamp
    pub created_at: DateTime<Utc>,
}

/// A simulation scenario containing multiple related pipelines
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationScenario {
    /// Unique scenario identifier
    pub scenario_id: String,

    /// Scenario name
    pub name: String,

    /// Scenario description
    pub description: String,

    /// Pipeline configurations for this scenario
    pub pipelines: Vec<PipelineConfig>,

    /// Inter-pipeline dependencies
    pub pipeline_dependencies: Vec<PipelineDependency>,

    /// Scenario-specific settings
    pub settings: ScenarioSettings,

    /// Trigger conditions for starting this scenario
    pub triggers: Vec<ScenarioTrigger>,

    /// Success/failure conditions
    pub conditions: Vec<ScenarioCondition>,
}

/// Dependency between pipelines in a scenario
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineDependency {
    /// Source pipeline ID
    pub from_pipeline: String,

    /// Target pipeline ID  
    pub to_pipeline: String,

    /// Dependency type
    pub dependency_type: DependencyType,

    /// Optional delay before starting dependent pipeline
    pub delay_ms: Option<u64>,

    /// Data sharing configuration
    pub data_sharing: Option<DataSharingConfig>,
}

/// Type of dependency between pipelines
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DependencyType {
    /// Target pipeline starts after source completes
    Sequential,

    /// Target pipeline starts when source reaches specific stage
    StageGated { stage_id: String },

    /// Pipelines run in parallel with data sharing
    Parallel,

    /// Target pipeline starts on source completion or failure
    Always,

    /// Target pipeline starts only on source success
    OnSuccess,

    /// Target pipeline starts only on source failure
    OnFailure,
}

/// Configuration for data sharing between pipelines
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataSharingConfig {
    /// Shared data key
    pub key: String,

    /// Source stage to extract data from
    pub source_stage: String,

    /// Target stage to inject data into
    pub target_stage: String,

    /// Data transformation rules
    pub transform: Option<DataTransformRule>,

    /// Whether to persist data across scenario runs
    pub persist: bool,
}

/// Data transformation rules for pipeline data sharing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DataTransformRule {
    /// Pass data as-is
    Identity,

    /// Aggregate data from multiple executions
    Aggregate { function: AggregateFunction },

    /// Filter data based on conditions
    Filter { condition: FilterCondition },

    /// Transform using custom function
    Custom { function_name: String },
}

/// Aggregation functions for data transformation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AggregateFunction {
    Sum,
    Average,
    Min,
    Max,
    Count,
    Latest,
    Earliest,
}

/// Filter conditions for data transformation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FilterCondition {
    /// Value equals specified value
    Equals {
        field: String,
        value: serde_json::Value,
    },

    /// Value greater than threshold
    GreaterThan { field: String, threshold: f64 },

    /// Value less than threshold
    LessThan { field: String, threshold: f64 },

    /// Field exists
    Exists { field: String },

    /// Complex boolean expression
    Expression { expression: String },
}

/// Scenario-specific settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioSettings {
    /// Maximum execution time for scenario
    pub timeout_ms: u64,

    /// Maximum concurrent pipelines in scenario
    pub max_concurrent_pipelines: usize,

    /// Whether to continue scenario on pipeline failure
    pub continue_on_failure: bool,

    /// Resource limits for scenario
    pub resource_limits: ResourceLimits,

    /// Scenario execution mode
    pub execution_mode: ScenarioExecutionMode,
}

/// Resource limits for scenario execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLimits {
    /// Maximum memory usage (MB)
    pub max_memory_mb: u32,

    /// Maximum CPU usage percentage
    pub max_cpu_percent: u8,

    /// Maximum number of threads
    pub max_threads: u32,

    /// Maximum disk usage (MB)
    pub max_disk_mb: u32,

    /// Maximum network bandwidth (Mbps)
    pub max_network_mbps: Option<u32>,
}

/// Scenario execution modes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ScenarioExecutionMode {
    /// Execute once and stop
    Single,

    /// Repeat scenario N times
    Repeat { count: u32 },

    /// Execute continuously until stopped
    Continuous,

    /// Execute at specified intervals
    Scheduled { interval_ms: u64 },

    /// Execute based on external triggers
    EventDriven,
}

/// Trigger conditions for scenario execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioTrigger {
    /// Trigger type
    pub trigger_type: TriggerType,

    /// Trigger condition
    pub condition: TriggerCondition,

    /// Whether trigger is enabled
    pub enabled: bool,
}

/// Types of scenario triggers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TriggerType {
    /// Time-based trigger
    Time,

    /// Sensor data trigger
    SensorData,

    /// Pipeline completion trigger
    PipelineCompletion,

    /// External event trigger
    ExternalEvent,

    /// System state trigger
    SystemState,
}

/// Trigger condition specifications
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TriggerCondition {
    /// Trigger at specific time
    AtTime { time: DateTime<Utc> },

    /// Trigger after delay
    AfterDelay { delay_ms: u64 },

    /// Trigger when sensor value meets condition
    SensorValue {
        sensor_id: String,
        condition: FilterCondition,
    },

    /// Trigger when pipeline completes
    PipelineComplete { pipeline_id: String },

    /// Trigger on external event
    ExternalEvent { event_name: String },

    /// Trigger when system meets condition
    SystemCondition { condition: String },
}

/// Success/failure conditions for scenarios
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioCondition {
    /// Condition type
    pub condition_type: ConditionType,

    /// Condition specification
    pub specification: ConditionSpec,

    /// Action to take when condition is met
    pub action: ConditionAction,
}

/// Types of scenario conditions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConditionType {
    /// Success condition
    Success,

    /// Failure condition
    Failure,

    /// Warning condition
    Warning,

    /// Info condition
    Info,
}

/// Condition specifications
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConditionSpec {
    /// All pipelines must succeed
    AllPipelinesSuccess,

    /// Specific pipelines must succeed
    PipelinesSuccess { pipeline_ids: Vec<String> },

    /// Execution time must be within limits
    ExecutionTime { max_ms: u64 },

    /// Resource usage must be within limits
    ResourceUsage { limits: ResourceLimits },

    /// Custom condition expression
    Custom { expression: String },
}

/// Actions to take when conditions are met
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConditionAction {
    /// Continue execution
    Continue,

    /// Stop scenario execution
    Stop,

    /// Restart scenario
    Restart,

    /// Log message
    Log { message: String },

    /// Send notification
    Notify { target: String, message: String },

    /// Execute custom action
    Custom { action: String },
}

/// Global simulation settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationSettings {
    /// Overall simulation timeout
    pub timeout_ms: u64,

    /// Maximum concurrent scenarios
    pub max_concurrent_scenarios: usize,

    /// Global resource limits
    pub resource_limits: ResourceLimits,

    /// Simulation execution mode
    pub execution_mode: SimulationExecutionMode,

    /// Real-time synchronization settings
    pub real_time_sync: RealTimeSyncSettings,

    /// Output and logging configuration
    pub output_config: OutputConfig,
}

/// Simulation execution modes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SimulationExecutionMode {
    /// Real-time execution
    RealTime,

    /// Accelerated execution
    Accelerated { speed_multiplier: f64 },

    /// Step-by-step execution
    StepByStep,

    /// Batch processing mode
    Batch { batch_size: usize },
}

/// Real-time synchronization settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RealTimeSyncSettings {
    /// Enable real-time synchronization
    pub enabled: bool,

    /// Target frame rate (Hz)
    pub target_fps: f64,

    /// Maximum frame skip tolerance
    pub max_frame_skip: u32,

    /// Synchronization mode
    pub sync_mode: SyncMode,
}

/// Synchronization modes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SyncMode {
    /// Strict real-time (drops frames if behind)
    Strict,

    /// Best effort (catches up when possible)
    BestEffort,

    /// Variable speed (adjusts speed to maintain sync)
    Variable,
}

/// Output and logging configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputConfig {
    /// Enable detailed logging
    pub enable_detailed_logging: bool,

    /// Enable performance metrics
    pub enable_metrics: bool,

    /// Enable result persistence
    pub enable_persistence: bool,

    /// Output format
    pub output_format: OutputFormat,

    /// Output destination
    pub output_destination: OutputDestination,
}

/// Output formats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OutputFormat {
    JSON,
    CSV,
    Binary,
    Custom { format: String },
}

/// Output destinations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OutputDestination {
    File { path: String },
    Database { connection: String },
    Stream { endpoint: String },
    Memory,
}

/// Simulation execution state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationExecution {
    /// Execution ID
    pub execution_id: String,

    /// Simulation configuration
    pub config: SimulationConfig,

    /// Current execution state
    pub state: SimulationState,

    /// Scenario execution states
    pub scenario_executions: HashMap<String, ScenarioExecution>,

    /// Shared data store between scenarios
    pub shared_data: HashMap<String, serde_json::Value>,

    /// Execution statistics
    pub stats: SimulationStats,

    /// Start time
    pub started_at: DateTime<Utc>,

    /// End time (if completed)
    pub completed_at: Option<DateTime<Utc>>,

    /// Error information (if failed)
    pub error: Option<String>,
}

/// Simulation execution states
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SimulationState {
    /// Simulation is being prepared
    Preparing,

    /// Simulation is running
    Running,

    /// Simulation is paused
    Paused,

    /// Simulation completed successfully
    Completed,

    /// Simulation failed with error
    Failed,

    /// Simulation was cancelled
    Cancelled,
}

/// Scenario execution state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioExecution {
    /// Scenario ID
    pub scenario_id: String,

    /// Current state
    pub state: ScenarioState,

    /// Pipeline executions
    pub pipeline_executions: HashMap<String, String>, // pipeline_id -> execution_id

    /// Scenario statistics
    pub stats: ScenarioStats,

    /// Start time
    pub started_at: Option<DateTime<Utc>>,

    /// End time
    pub completed_at: Option<DateTime<Utc>>,

    /// Error information
    pub error: Option<String>,
}

/// Scenario execution states
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ScenarioState {
    Waiting,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// Simulation execution statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationStats {
    /// Total scenarios executed
    pub scenarios_executed: usize,

    /// Total scenarios failed
    pub scenarios_failed: usize,

    /// Total pipelines executed
    pub pipelines_executed: usize,

    /// Total pipelines failed
    pub pipelines_failed: usize,

    /// Total execution time
    pub total_execution_ms: u64,

    /// Peak resource usage
    pub peak_resource_usage: ResourceUsage,

    /// Average frame rate
    pub avg_frame_rate: f64,

    /// Total data processed
    pub total_data_bytes: u64,
}

/// Scenario execution statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioStats {
    /// Pipelines executed in scenario
    pub pipelines_executed: usize,

    /// Pipelines failed in scenario
    pub pipelines_failed: usize,

    /// Scenario execution time
    pub execution_ms: u64,

    /// Resource usage
    pub resource_usage: ResourceUsage,
}

/// Resource usage statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceUsage {
    /// Memory usage (MB)
    pub memory_mb: f64,

    /// CPU usage percentage
    pub cpu_percent: f64,

    /// Thread count
    pub thread_count: u32,

    /// Disk usage (MB)
    pub disk_mb: f64,

    /// Network usage (Mbps)
    pub network_mbps: f64,
}

/// Simulation framework engine
pub struct WasmSimulationEngine {
    /// Pipeline engine for executing component pipelines
    pipeline_engine: Arc<WasmPipelineEngine>,

    /// Active simulation executions
    active_simulations: Arc<RwLock<HashMap<String, Arc<Mutex<SimulationExecution>>>>>,

    /// Dataset manager for sensor data
    dataset_manager: Option<Arc<Mutex<BoxedDatasetManager>>>,

    /// Maximum concurrent simulations
    max_concurrent_simulations: usize,

    /// Real-time synchronization state
    sync_state: Arc<RwLock<SyncState>>,
}

/// Real-time synchronization state
#[derive(Debug)]
struct SyncState {
    /// Current simulation time
    current_time: Instant,

    /// Target frame duration
    frame_duration: Duration,

    /// Frame skip count
    frame_skip_count: u32,

    /// Is synchronization active
    is_active: bool,
}

impl WasmSimulationEngine {
    /// Create a new simulation engine
    pub fn new(
        pipeline_engine: Arc<WasmPipelineEngine>,
        max_concurrent_simulations: usize,
    ) -> Self {
        Self {
            pipeline_engine,
            active_simulations: Arc::new(RwLock::new(HashMap::new())),
            dataset_manager: None,
            max_concurrent_simulations,
            sync_state: Arc::new(RwLock::new(SyncState {
                current_time: Instant::now(),
                frame_duration: Duration::from_millis(33), // ~30 FPS default
                frame_skip_count: 0,
                is_active: false,
            })),
        }
    }

    /// Create simulation engine with sensor support
    pub async fn with_sensor_support(
        pipeline_engine: Arc<WasmPipelineEngine>,
        dataset_manager: Arc<Mutex<BoxedDatasetManager>>,
        max_concurrent_simulations: usize,
    ) -> Result<Self> {
        let mut engine = Self::new(pipeline_engine, max_concurrent_simulations);
        engine.dataset_manager = Some(dataset_manager);
        Ok(engine)
    }

    /// Execute a simulation
    pub async fn execute_simulation(&self, config: SimulationConfig) -> Result<String> {
        let execution_id = Uuid::new_v4().to_string();

        // Check concurrent execution limit
        {
            let simulations = self.active_simulations.read().await;
            if simulations.len() >= self.max_concurrent_simulations {
                return Err(anyhow!("Maximum concurrent simulations reached"));
            }
        }

        info!("Starting simulation: {} ({})", config.name, execution_id);

        // Create sensor bridge if needed
        let sensor_bridge = if let Some(ref dataset_manager) = self.dataset_manager {
            match SensorDataBridge::new(config.sensor_config.clone(), Some(dataset_manager.clone()))
                .await
            {
                Ok(bridge) => {
                    let bridge_arc = Arc::new(bridge);
                    bridge_arc.start().await?;
                    Some(bridge_arc)
                }
                Err(e) => {
                    error!("Failed to create sensor bridge: {}", e);
                    None
                }
            }
        } else {
            None
        };

        // Create simulation execution
        let execution = SimulationExecution {
            execution_id: execution_id.clone(),
            config: config.clone(),
            state: SimulationState::Preparing,
            scenario_executions: HashMap::new(),
            shared_data: HashMap::new(),
            stats: SimulationStats {
                scenarios_executed: 0,
                scenarios_failed: 0,
                pipelines_executed: 0,
                pipelines_failed: 0,
                total_execution_ms: 0,
                peak_resource_usage: ResourceUsage {
                    memory_mb: 0.0,
                    cpu_percent: 0.0,
                    thread_count: 0,
                    disk_mb: 0.0,
                    network_mbps: 0.0,
                },
                avg_frame_rate: 0.0,
                total_data_bytes: 0,
            },
            started_at: Utc::now(),
            completed_at: None,
            error: None,
        };

        let execution_arc = Arc::new(Mutex::new(execution));

        // Register simulation
        {
            let mut simulations = self.active_simulations.write().await;
            simulations.insert(execution_id.clone(), execution_arc.clone());
        }

        // Spawn execution task
        let pipeline_engine = self.pipeline_engine.clone();
        let active_simulations = self.active_simulations.clone();
        let sync_state = self.sync_state.clone();
        let exec_id_for_cleanup = execution_id.clone();

        tokio::spawn(async move {
            let result = Self::execute_simulation_impl(
                pipeline_engine,
                execution_arc,
                config,
                sensor_bridge,
                sync_state,
            )
            .await;

            // Clean up simulation from active list
            {
                let mut simulations = active_simulations.write().await;
                simulations.remove(&exec_id_for_cleanup);
            }

            if let Err(e) = result {
                error!("Simulation execution failed: {}", e);
            }
        });

        Ok(execution_id)
    }

    /// Internal simulation execution implementation
    async fn execute_simulation_impl(
        pipeline_engine: Arc<WasmPipelineEngine>,
        execution_arc: Arc<Mutex<SimulationExecution>>,
        config: SimulationConfig,
        sensor_bridge: Option<Arc<SensorDataBridge>>,
        sync_state: Arc<RwLock<SyncState>>,
    ) -> Result<()> {
        let start_time = Instant::now();

        // Update state to running
        {
            let mut execution = execution_arc.lock().await;
            execution.state = SimulationState::Running;
        }

        // Initialize real-time synchronization
        if let SimulationExecutionMode::RealTime = config.settings.execution_mode {
            let mut sync = sync_state.write().await;
            sync.current_time = Instant::now();
            sync.frame_duration =
                Duration::from_millis((1000.0 / config.settings.real_time_sync.target_fps) as u64);
            sync.frame_skip_count = 0;
            sync.is_active = config.settings.real_time_sync.enabled;
        }

        // Execute scenarios based on execution mode
        let config_name = config.name.clone();
        match config.settings.execution_mode {
            SimulationExecutionMode::RealTime => {
                Self::execute_real_time_simulation(
                    pipeline_engine,
                    execution_arc.clone(),
                    &config,
                    sensor_bridge.clone(),
                    sync_state,
                )
                .await?;
            }
            SimulationExecutionMode::Accelerated { speed_multiplier } => {
                Self::execute_accelerated_simulation(
                    pipeline_engine,
                    execution_arc.clone(),
                    &config,
                    sensor_bridge.clone(),
                    speed_multiplier,
                )
                .await?;
            }
            SimulationExecutionMode::StepByStep => {
                Self::execute_step_by_step_simulation(
                    pipeline_engine,
                    execution_arc.clone(),
                    &config,
                    sensor_bridge.clone(),
                )
                .await?;
            }
            SimulationExecutionMode::Batch { batch_size } => {
                Self::execute_batch_simulation(
                    pipeline_engine,
                    execution_arc.clone(),
                    &config,
                    sensor_bridge.clone(),
                    batch_size,
                )
                .await?;
            }
        }

        // Update completion status
        {
            let mut execution = execution_arc.lock().await;
            execution.state = SimulationState::Completed;
            execution.completed_at = Some(Utc::now());
            execution.stats.total_execution_ms = start_time.elapsed().as_millis() as u64;
        }

        // Stop sensor bridge
        if let Some(bridge) = sensor_bridge {
            if let Err(e) = bridge.stop().await {
                warn!("Failed to stop sensor bridge: {}", e);
            }
        }

        info!("Simulation completed: {}", config_name);
        Ok(())
    }

    /// Execute simulation in real-time mode
    async fn execute_real_time_simulation(
        pipeline_engine: Arc<WasmPipelineEngine>,
        execution_arc: Arc<Mutex<SimulationExecution>>,
        config: &SimulationConfig,
        sensor_bridge: Option<Arc<SensorDataBridge>>,
        sync_state: Arc<RwLock<SyncState>>,
    ) -> Result<()> {
        info!("Executing real-time simulation: {}", config.name);

        let mut _frame_count = 0u64;
        let start_time = Instant::now();

        loop {
            let frame_start = Instant::now();

            // Check if simulation should continue
            let should_continue = {
                let execution = execution_arc.lock().await;
                matches!(execution.state, SimulationState::Running)
            };

            if !should_continue {
                break;
            }

            // Advance sensor bridge frame if available
            if let Some(ref bridge) = sensor_bridge {
                if !bridge.advance_frame().await? {
                    info!("Sensor data exhausted, ending simulation");
                    break;
                }
            }

            // Execute scenarios for this frame
            Self::execute_frame_scenarios(pipeline_engine.clone(), execution_arc.clone(), config)
                .await?;

            _frame_count += 1;

            // Real-time synchronization
            {
                let sync = sync_state.read().await;
                if sync.is_active {
                    let frame_elapsed = frame_start.elapsed();
                    if frame_elapsed < sync.frame_duration {
                        let sleep_duration = sync.frame_duration - frame_elapsed;
                        tokio::time::sleep(sleep_duration).await;
                    } else {
                        // Frame took too long, might need to skip
                        debug!(
                            "Frame took {}ms, target is {}ms",
                            frame_elapsed.as_millis(),
                            sync.frame_duration.as_millis()
                        );
                    }
                }
            }

            // Update frame rate statistics
            if _frame_count.is_multiple_of(30) {
                let elapsed = start_time.elapsed().as_secs_f64();
                let fps = _frame_count as f64 / elapsed;

                let mut execution = execution_arc.lock().await;
                execution.stats.avg_frame_rate = fps;
                debug!("Current frame rate: {:.1} FPS", fps);
            }
        }

        Ok(())
    }

    /// Execute simulation in accelerated mode
    async fn execute_accelerated_simulation(
        pipeline_engine: Arc<WasmPipelineEngine>,
        execution_arc: Arc<Mutex<SimulationExecution>>,
        config: &SimulationConfig,
        sensor_bridge: Option<Arc<SensorDataBridge>>,
        speed_multiplier: f64,
    ) -> Result<()> {
        info!(
            "Executing accelerated simulation: {} ({}x speed)",
            config.name, speed_multiplier
        );

        // Similar to real-time but with adjusted timing
        let mut _frame_count = 0u64;
        let frame_duration = Duration::from_millis(
            (1000.0 / (config.settings.real_time_sync.target_fps * speed_multiplier)) as u64,
        );

        loop {
            let should_continue = {
                let execution = execution_arc.lock().await;
                matches!(execution.state, SimulationState::Running)
            };

            if !should_continue {
                break;
            }

            // Advance sensor bridge frame if available
            if let Some(ref bridge) = sensor_bridge {
                if !bridge.advance_frame().await? {
                    break;
                }
            }

            // Execute scenarios for this frame
            Self::execute_frame_scenarios(pipeline_engine.clone(), execution_arc.clone(), config)
                .await?;

            _frame_count += 1;

            // Accelerated timing
            tokio::time::sleep(frame_duration).await;
        }

        Ok(())
    }

    /// Execute simulation in step-by-step mode
    async fn execute_step_by_step_simulation(
        _pipeline_engine: Arc<WasmPipelineEngine>,
        _execution_arc: Arc<Mutex<SimulationExecution>>,
        config: &SimulationConfig,
        _sensor_bridge: Option<Arc<SensorDataBridge>>,
    ) -> Result<()> {
        info!(
            "Step-by-step simulation mode not fully implemented for: {}",
            config.name
        );
        // Step-by-step execution not implemented yet
        Ok(())
    }

    /// Execute simulation in batch mode
    async fn execute_batch_simulation(
        _pipeline_engine: Arc<WasmPipelineEngine>,
        _execution_arc: Arc<Mutex<SimulationExecution>>,
        config: &SimulationConfig,
        _sensor_bridge: Option<Arc<SensorDataBridge>>,
        _batch_size: usize,
    ) -> Result<()> {
        info!(
            "Batch simulation mode not fully implemented for: {}",
            config.name
        );
        // Batch processing execution not implemented yet
        Ok(())
    }

    /// Execute scenarios for a single frame
    async fn execute_frame_scenarios(
        pipeline_engine: Arc<WasmPipelineEngine>,
        execution_arc: Arc<Mutex<SimulationExecution>>,
        config: &SimulationConfig,
    ) -> Result<()> {
        // For now, execute all scenarios in sequence
        // Dependency resolution and parallel execution not implemented yet

        for scenario in &config.scenarios {
            for pipeline_config in &scenario.pipelines {
                match pipeline_engine
                    .execute_pipeline(pipeline_config.clone())
                    .await
                {
                    Ok(pipeline_execution_id) => {
                        debug!(
                            "Started pipeline: {} -> {}",
                            pipeline_config.name, pipeline_execution_id
                        );

                        // Update statistics
                        let mut execution = execution_arc.lock().await;
                        execution.stats.pipelines_executed += 1;
                    }
                    Err(e) => {
                        error!("Failed to start pipeline {}: {}", pipeline_config.name, e);

                        // Update statistics
                        let mut execution = execution_arc.lock().await;
                        execution.stats.pipelines_failed += 1;
                    }
                }
            }
        }

        Ok(())
    }

    /// Get simulation execution status
    pub async fn get_simulation_status(&self, execution_id: &str) -> Option<SimulationExecution> {
        let simulations = self.active_simulations.read().await;
        if let Some(execution_arc) = simulations.get(execution_id) {
            let execution = execution_arc.lock().await;
            Some(execution.clone())
        } else {
            None
        }
    }

    /// Pause a running simulation
    pub async fn pause_simulation(&self, execution_id: &str) -> Result<()> {
        let simulations = self.active_simulations.read().await;
        if let Some(execution_arc) = simulations.get(execution_id) {
            let mut execution = execution_arc.lock().await;
            if matches!(execution.state, SimulationState::Running) {
                execution.state = SimulationState::Paused;
                info!("Simulation paused: {}", execution_id);
                Ok(())
            } else {
                Err(anyhow!("Simulation is not running"))
            }
        } else {
            Err(anyhow!("Simulation not found: {}", execution_id))
        }
    }

    /// Resume a paused simulation
    pub async fn resume_simulation(&self, execution_id: &str) -> Result<()> {
        let simulations = self.active_simulations.read().await;
        if let Some(execution_arc) = simulations.get(execution_id) {
            let mut execution = execution_arc.lock().await;
            if matches!(execution.state, SimulationState::Paused) {
                execution.state = SimulationState::Running;
                info!("Simulation resumed: {}", execution_id);
                Ok(())
            } else {
                Err(anyhow!("Simulation is not paused"))
            }
        } else {
            Err(anyhow!("Simulation not found: {}", execution_id))
        }
    }

    /// Cancel a running simulation
    pub async fn cancel_simulation(&self, execution_id: &str) -> Result<()> {
        let simulations = self.active_simulations.read().await;
        if let Some(execution_arc) = simulations.get(execution_id) {
            let mut execution = execution_arc.lock().await;
            execution.state = SimulationState::Cancelled;
            execution.completed_at = Some(Utc::now());
            info!("Simulation cancelled: {}", execution_id);
            Ok(())
        } else {
            Err(anyhow!("Simulation not found: {}", execution_id))
        }
    }

    /// List active simulations
    pub async fn list_active_simulations(&self) -> Vec<String> {
        let simulations = self.active_simulations.read().await;
        simulations.keys().cloned().collect()
    }

    /// Get sensor bridge status for simulation
    pub async fn get_sensor_status(&self, _execution_id: &str) -> Option<BridgeStatus> {
        // Sensor bridge status tracking not implemented yet
        None
    }
}

// Default implementations
impl Default for ScenarioSettings {
    fn default() -> Self {
        Self {
            timeout_ms: 600000, // 10 minutes
            max_concurrent_pipelines: 5,
            continue_on_failure: false,
            resource_limits: ResourceLimits::default(),
            execution_mode: ScenarioExecutionMode::Single,
        }
    }
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            max_memory_mb: 1024,
            max_cpu_percent: 80,
            max_threads: 10,
            max_disk_mb: 500,
            max_network_mbps: None,
        }
    }
}

impl Default for SimulationSettings {
    fn default() -> Self {
        Self {
            timeout_ms: 3600000, // 1 hour
            max_concurrent_scenarios: 3,
            resource_limits: ResourceLimits::default(),
            execution_mode: SimulationExecutionMode::RealTime,
            real_time_sync: RealTimeSyncSettings {
                enabled: true,
                target_fps: 30.0,
                max_frame_skip: 5,
                sync_mode: SyncMode::BestEffort,
            },
            output_config: OutputConfig {
                enable_detailed_logging: true,
                enable_metrics: true,
                enable_persistence: false,
                output_format: OutputFormat::JSON,
                output_destination: OutputDestination::Memory,
            },
        }
    }
}
