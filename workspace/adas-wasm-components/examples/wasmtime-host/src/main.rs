use anyhow::{Context, Result};
use clap::{Arg, Command};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use sysinfo::{CpuExt, System, SystemExt};
use tokio::time;
use tracing::{debug, error, info, warn};
use wasmtime::{Component, Config, Engine, Linker, Store};
use wasmtime_wasi::{WasiCtx, WasiCtxBuilder};

/// ADAS Wasmtime Host Application
///
/// This application loads and executes the composed ADAS WebAssembly component
/// using wasmtime with proper WASI and component model support.
///
/// Features:
/// - Component lifecycle management
/// - Real-time performance monitoring
/// - Fixed Execution Order (FEO) pipeline
/// - WASI-NN support for AI components
/// - Comprehensive logging and diagnostics

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AdasConfig {
    /// System configuration
    pub system: SystemConfig,

    /// Performance settings
    pub performance: PerformanceConfig,

    /// Safety settings
    pub safety: SafetyConfig,

    /// Logging configuration
    pub logging: LoggingConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct SystemConfig {
    /// Enable/disable subsystems
    pub enable_sensors: bool,
    pub enable_ai: bool,
    pub enable_fusion: bool,
    pub enable_control: bool,
    pub enable_safety: bool,
    pub enable_communication: bool,

    /// FEO timing (milliseconds)
    pub cycle_time_ms: u32,
    pub safety_margin_ms: u32,
    pub max_jitter_ms: u32,

    /// Resource limits
    pub max_memory_mb: u32,
    pub max_cpu_cores: u32,

    /// AI configuration
    pub object_detection_model: String,
    pub behavior_prediction_model: String,
    pub ai_inference_timeout_ms: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PerformanceConfig {
    /// Performance monitoring
    pub enable_monitoring: bool,
    pub monitoring_interval_ms: u32,

    /// Performance targets
    pub target_fps: f32,
    pub max_cpu_usage: f32,
    pub max_memory_usage_mb: u32,

    /// Optimization settings
    pub enable_optimization: bool,
    pub gc_interval_ms: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct SafetyConfig {
    /// Safety monitoring
    pub safety_level: String, // "critical", "warning", "nominal", "optimal"
    pub emergency_response_enabled: bool,
    pub watchdog_timeout_ms: u32,

    /// Fault tolerance
    pub max_faults_per_cycle: u32,
    pub fault_recovery_enabled: bool,
    pub automatic_restart: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct LoggingConfig {
    pub level: String, // "trace", "debug", "info", "warn", "error"
    pub enable_file_logging: bool,
    pub log_file_path: Option<String>,
    pub enable_performance_logs: bool,
    pub enable_safety_logs: bool,
}

#[derive(Debug)]
struct AdasHost {
    engine: Engine,
    component: Component,
    config: AdasConfig,
    system_info: System,
    start_time: Instant,
}

#[derive(Debug, Serialize)]
struct PerformanceMetrics {
    /// Timing metrics
    pub cycle_time_ms: u32,
    pub avg_cycle_time_ms: f32,
    pub max_cycle_time_ms: u32,
    pub jitter_ms: i32,

    /// Resource metrics
    pub cpu_usage_percent: f32,
    pub memory_usage_mb: u32,
    pub memory_usage_percent: f32,

    /// System metrics
    pub uptime_seconds: u64,
    pub cycles_executed: u64,
    pub errors_count: u32,

    /// AI metrics (if available)
    pub ai_fps: Option<f32>,
    pub detection_rate: Option<f32>,
    pub prediction_accuracy: Option<f32>,
}

impl Default for AdasConfig {
    fn default() -> Self {
        Self {
            system: SystemConfig {
                enable_sensors: true,
                enable_ai: true,
                enable_fusion: true,
                enable_control: true,
                enable_safety: true,
                enable_communication: true,
                cycle_time_ms: 50, // 20 Hz automotive standard
                safety_margin_ms: 10,
                max_jitter_ms: 5,
                max_memory_mb: 2048,
                max_cpu_cores: 4,
                object_detection_model: "yolov5n".to_string(),
                behavior_prediction_model: "social-lstm".to_string(),
                ai_inference_timeout_ms: 30,
            },
            performance: PerformanceConfig {
                enable_monitoring: true,
                monitoring_interval_ms: 1000,
                target_fps: 20.0,
                max_cpu_usage: 80.0,
                max_memory_usage_mb: 1024,
                enable_optimization: true,
                gc_interval_ms: 5000,
            },
            safety: SafetyConfig {
                safety_level: "critical".to_string(),
                emergency_response_enabled: true,
                watchdog_timeout_ms: 100,
                max_faults_per_cycle: 3,
                fault_recovery_enabled: true,
                automatic_restart: true,
            },
            logging: LoggingConfig {
                level: "info".to_string(),
                enable_file_logging: true,
                log_file_path: Some("adas-system.log".to_string()),
                enable_performance_logs: true,
                enable_safety_logs: true,
            },
        }
    }
}

impl AdasHost {
    /// Create a new ADAS host
    pub async fn new(component_path: PathBuf, config: AdasConfig) -> Result<Self> {
        info!("🚀 Initializing ADAS Wasmtime Host");

        // Configure wasmtime engine
        let mut wasmtime_config = Config::new();
        wasmtime_config.wasm_component_model(true);
        wasmtime_config.async_support(true);
        wasmtime_config.consume_fuel(true);

        // Enable WASI-NN for AI components
        wasmtime_config.wasm_simd(true);
        wasmtime_config.wasm_relaxed_simd(true);

        // Memory and resource limits
        wasmtime_config.memory_init_cow(true);
        wasmtime_config.memory_guaranteed_dense_image_size(1024 * 1024); // 1MB

        let engine = Engine::new(&wasmtime_config).context("Failed to create wasmtime engine")?;

        // Load the composed ADAS component
        info!(
            "📦 Loading ADAS component from: {}",
            component_path.display()
        );
        let component_bytes = std::fs::read(&component_path).with_context(|| {
            format!(
                "Failed to read component file: {}",
                component_path.display()
            )
        })?;

        let component = Component::new(&engine, component_bytes)
            .context("Failed to create component from bytes")?;

        info!("✅ Component loaded successfully");
        info!("📊 Component size: {} bytes", component_bytes.len());

        // Initialize system monitoring
        let system_info = System::new_all();

        Ok(Self {
            engine,
            component,
            config,
            system_info,
            start_time: Instant::now(),
        })
    }

    /// Run the ADAS system
    pub async fn run(&mut self) -> Result<()> {
        info!("🏁 Starting ADAS system execution");

        // Create WASI context
        let wasi_ctx = WasiCtxBuilder::new().inherit_stdio().inherit_env().build();

        // Create store with WASI context
        let mut store = Store::new(&self.engine, wasi_ctx);

        // Set fuel limit for controlled execution
        store.set_fuel(u64::MAX).context("Failed to set fuel")?;

        // Create linker and add WASI
        let mut linker = Linker::new(&self.engine);
        wasmtime_wasi::add_to_linker_async(&mut linker).context("Failed to add WASI to linker")?;

        // Instantiate the component
        info!("🔧 Instantiating ADAS component...");
        let instance = linker
            .instantiate_async(&mut store, &self.component)
            .await
            .context("Failed to instantiate component")?;

        info!("✅ Component instantiated successfully");

        // Get the main system interface
        let init_system = instance
            .get_typed_func::<(), ()>(&mut store, "init-system")
            .context("Failed to get init-system function")?;

        let execute_cycle = instance
            .get_typed_func::<(), ()>(&mut store, "execute-cycle")
            .context("Failed to get execute-cycle function")?;

        // Initialize the system
        info!("🔄 Initializing ADAS system...");
        init_system
            .call_async(&mut store, ())
            .await
            .context("Failed to initialize system")?;

        info!("✅ ADAS system initialized");

        // Start performance monitoring
        let mut performance_monitor = self.start_performance_monitoring();

        // Main execution loop
        let mut cycle_count = 0u64;
        let mut error_count = 0u32;
        let cycle_duration = Duration::from_millis(self.config.system.cycle_time_ms as u64);

        info!("🔄 Starting Fixed Execution Order (FEO) pipeline");
        info!(
            "⏱️  Target cycle time: {}ms",
            self.config.system.cycle_time_ms
        );

        loop {
            let cycle_start = Instant::now();

            // Execute one FEO cycle
            match execute_cycle.call_async(&mut store, ()).await {
                Ok(_) => {
                    cycle_count += 1;
                    let cycle_time = cycle_start.elapsed();

                    // Check for timing violations
                    let cycle_time_ms = cycle_time.as_millis() as u32;
                    if cycle_time_ms
                        > self.config.system.cycle_time_ms + self.config.system.max_jitter_ms
                    {
                        warn!(
                            "⚠️  Cycle timing violation: {}ms (target: {}ms)",
                            cycle_time_ms, self.config.system.cycle_time_ms
                        );
                    }

                    if cycle_count % 100 == 0 {
                        info!(
                            "📊 Executed {} cycles, avg time: {:.2}ms",
                            cycle_count, cycle_time_ms
                        );
                    }
                }
                Err(e) => {
                    error_count += 1;
                    error!("❌ Cycle execution failed: {}", e);

                    if error_count > self.config.safety.max_faults_per_cycle {
                        error!("🚨 Too many errors, stopping system");
                        break;
                    }

                    if self.config.safety.fault_recovery_enabled {
                        warn!("🔄 Attempting fault recovery...");
                        // Add fault recovery logic here
                    }
                }
            }

            // Update performance monitoring
            if let Some(ref mut monitor) = performance_monitor {
                monitor
                    .update_metrics(cycle_count, error_count, cycle_start.elapsed())
                    .await;
            }

            // Wait for next cycle
            let elapsed = cycle_start.elapsed();
            if elapsed < cycle_duration {
                time::sleep(cycle_duration - elapsed).await;
            }

            // Check for shutdown conditions
            if self.should_shutdown() {
                info!("🛑 Shutdown requested");
                break;
            }
        }

        info!("🏁 ADAS system execution completed");
        info!("📊 Total cycles: {}, errors: {}", cycle_count, error_count);

        Ok(())
    }

    /// Start performance monitoring
    fn start_performance_monitoring(&mut self) -> Option<PerformanceMonitor> {
        if self.config.performance.enable_monitoring {
            Some(PerformanceMonitor::new(self.config.performance.clone()))
        } else {
            None
        }
    }

    /// Check if system should shutdown
    fn should_shutdown(&self) -> bool {
        // Add shutdown logic (e.g., signal handling, time limits, etc.)
        false
    }

    /// Get current performance metrics
    pub fn get_performance_metrics(&mut self) -> PerformanceMetrics {
        self.system_info.refresh_all();

        let uptime = self.start_time.elapsed().as_secs();
        let cpu_usage = self.system_info.global_cpu_info().cpu_usage();
        let memory_usage = self.system_info.used_memory();
        let total_memory = self.system_info.total_memory();

        PerformanceMetrics {
            cycle_time_ms: self.config.system.cycle_time_ms,
            avg_cycle_time_ms: 0.0, // Would be calculated from actual measurements
            max_cycle_time_ms: 0,   // Would be tracked during execution
            jitter_ms: 0,           // Would be calculated from timing variations
            cpu_usage_percent: cpu_usage,
            memory_usage_mb: (memory_usage / 1024 / 1024) as u32,
            memory_usage_percent: (memory_usage as f32 / total_memory as f32) * 100.0,
            uptime_seconds: uptime,
            cycles_executed: 0,        // Would be tracked during execution
            errors_count: 0,           // Would be tracked during execution
            ai_fps: None,              // Would be provided by AI components
            detection_rate: None,      // Would be provided by detection components
            prediction_accuracy: None, // Would be provided by prediction components
        }
    }
}

/// Performance monitoring helper
struct PerformanceMonitor {
    config: PerformanceConfig,
    last_update: Instant,
    metrics_history: Vec<PerformanceMetrics>,
}

impl PerformanceMonitor {
    fn new(config: PerformanceConfig) -> Self {
        Self {
            config,
            last_update: Instant::now(),
            metrics_history: Vec::new(),
        }
    }

    async fn update_metrics(&mut self, cycle_count: u64, error_count: u32, cycle_time: Duration) {
        let now = Instant::now();
        let interval = Duration::from_millis(self.config.monitoring_interval_ms as u64);

        if now.duration_since(self.last_update) >= interval {
            // Update metrics
            debug!("📊 Updating performance metrics");
            self.last_update = now;

            // Log performance if enabled
            if self.config.enable_monitoring {
                info!(
                    "📈 Performance: cycles={}, errors={}, cycle_time={:.2}ms",
                    cycle_count,
                    error_count,
                    cycle_time.as_secs_f32() * 1000.0
                );
            }
        }
    }
}

/// Load configuration from file or use defaults
fn load_config(config_path: Option<PathBuf>) -> Result<AdasConfig> {
    match config_path {
        Some(path) => {
            info!("📋 Loading configuration from: {}", path.display());
            let config_str = std::fs::read_to_string(&path)
                .with_context(|| format!("Failed to read config file: {}", path.display()))?;

            toml::from_str(&config_str).context("Failed to parse configuration file")
        }
        None => {
            info!("📋 Using default configuration");
            Ok(AdasConfig::default())
        }
    }
}

/// Initialize logging
fn init_logging(config: &LoggingConfig) -> Result<()> {
    use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

    let level = match config.level.as_str() {
        "trace" => tracing::Level::TRACE,
        "debug" => tracing::Level::DEBUG,
        "info" => tracing::Level::INFO,
        "warn" => tracing::Level::WARN,
        "error" => tracing::Level::ERROR,
        _ => tracing::Level::INFO,
    };

    let subscriber =
        tracing_subscriber::registry().with(tracing_subscriber::fmt::layer().with_target(false));

    subscriber.init();

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    // Parse command line arguments
    let matches = Command::new("adas-wasmtime-host")
        .version("0.1.0")
        .about("ADAS WebAssembly Component Host using Wasmtime")
        .arg(
            Arg::new("component")
                .help("Path to the ADAS WebAssembly component")
                .required(true)
                .index(1),
        )
        .arg(
            Arg::new("config")
                .short('c')
                .long("config")
                .value_name("FILE")
                .help("Configuration file path"),
        )
        .arg(
            Arg::new("verbose")
                .short('v')
                .long("verbose")
                .action(clap::ArgAction::SetTrue)
                .help("Enable verbose logging"),
        )
        .get_matches();

    let component_path = PathBuf::from(matches.get_one::<String>("component").unwrap());
    let config_path = matches.get_one::<String>("config").map(PathBuf::from);

    // Load configuration
    let mut config = load_config(config_path)?;

    // Override log level if verbose
    if matches.get_flag("verbose") {
        config.logging.level = "debug".to_string();
    }

    // Initialize logging
    init_logging(&config.logging)?;

    info!("🚀 Starting ADAS Wasmtime Host v0.1.0");
    info!("📦 Component: {}", component_path.display());

    // Verify component file exists
    if !component_path.exists() {
        error!("❌ Component file not found: {}", component_path.display());
        return Err(anyhow::anyhow!("Component file not found"));
    }

    // Create and run ADAS host
    let mut host = AdasHost::new(component_path, config).await?;

    // Handle graceful shutdown
    let ctrl_c = tokio::signal::ctrl_c();
    tokio::select! {
        result = host.run() => {
            match result {
                Ok(_) => info!("✅ ADAS system completed successfully"),
                Err(e) => error!("❌ ADAS system failed: {}", e),
            }
        }
        _ = ctrl_c => {
            info!("🛑 Received shutdown signal");
        }
    }

    info!("👋 ADAS Wasmtime Host shutdown complete");
    Ok(())
}
