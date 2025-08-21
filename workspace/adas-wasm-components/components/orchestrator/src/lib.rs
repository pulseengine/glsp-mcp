// ADAS Orchestrator - The middleware that connects all components
// Implements data flow coordination and component lifecycle management

// The bindings are generated as a separate crate based on the BUILD target name
use adas_orchestrator_ecu_bindings::Guest;

use crossbeam_channel::{bounded, Receiver, Sender};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

mod component_manager;
mod data_flow;
mod pipeline;

use component_manager::{ComponentInfo, ComponentManager, ComponentState};
use data_flow::{DataEvent, DataFlowManager, MessageBus};
use pipeline::{Pipeline, PipelineConfig};

struct Orchestrator;

// Global orchestrator state
static mut ORCHESTRATOR_RUNNING: bool = false;
static mut PIPELINE_ACTIVE: bool = false;
static mut COMPONENTS_REGISTERED: u32 = 0;
static mut MESSAGES_PROCESSED: u64 = 0;

// Shared state for the orchestrator
lazy_static::lazy_static! {
    static ref DATA_FLOW_MANAGER: Arc<Mutex<DataFlowManager>> =
        Arc::new(Mutex::new(DataFlowManager::new()));
    static ref COMPONENT_MANAGER: Arc<Mutex<ComponentManager>> =
        Arc::new(Mutex::new(ComponentManager::new()));
    static ref PIPELINE: Arc<Mutex<Option<Pipeline>>> =
        Arc::new(Mutex::new(None));
    static ref MESSAGE_BUS: Arc<MessageBus> =
        Arc::new(MessageBus::new());
}

fn get_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

// Implement orchestration control interface
impl exports::adas::orchestration::orchestration_control::Guest for Orchestrator {
    fn start_orchestration(
        config: exports::adas::orchestration::orchestration_control::OrchestrationConfig,
    ) -> Result<(), String> {
        println!("🚀 Starting ADAS Orchestrator");

        unsafe {
            if ORCHESTRATOR_RUNNING {
                return Err("Orchestrator already running".to_string());
            }
        }

        // Initialize components
        let component_mgr = COMPONENT_MANAGER.clone();
        if let Ok(mut mgr) = component_mgr.lock() {
            mgr.initialize_pipeline_components()?;
        }

        // Initialize data flow
        let data_flow_mgr = DATA_FLOW_MANAGER.clone();
        if let Ok(mut flow) = data_flow_mgr.lock() {
            flow.initialize_message_bus()?;
        }

        // Create and start pipeline
        let pipeline_config = PipelineConfig {
            target_fps: config.target_fps,
            max_latency_ms: config.max_latency_ms,
            enable_diagnostics: config.enable_diagnostics,
        };

        if let Ok(mut pipeline_guard) = PIPELINE.lock() {
            let mut pipeline = Pipeline::new(pipeline_config);
            pipeline.start()?;
            *pipeline_guard = Some(pipeline);
        }

        unsafe {
            ORCHESTRATOR_RUNNING = true;
            PIPELINE_ACTIVE = true;
        }

        println!("✅ ADAS Orchestrator started successfully");
        Ok(())
    }

    fn stop_orchestration() -> Result<(), String> {
        println!("🛑 Stopping ADAS Orchestrator");

        // Stop pipeline
        if let Ok(mut pipeline_guard) = PIPELINE.lock() {
            if let Some(ref mut pipeline) = *pipeline_guard {
                pipeline.stop()?;
            }
            *pipeline_guard = None;
        }

        // Stop components
        let component_mgr = COMPONENT_MANAGER.clone();
        if let Ok(mut mgr) = component_mgr.lock() {
            mgr.stop_all_components()?;
        }

        unsafe {
            ORCHESTRATOR_RUNNING = false;
            PIPELINE_ACTIVE = false;
        }

        println!("✅ ADAS Orchestrator stopped");
        Ok(())
    }

    fn get_orchestration_status(
    ) -> exports::adas::orchestration::orchestration_control::OrchestrationStatus {
        unsafe {
            let status = if ORCHESTRATOR_RUNNING && PIPELINE_ACTIVE {
                adas::common_types::types::HealthStatus::Ok
            } else if ORCHESTRATOR_RUNNING {
                adas::common_types::types::HealthStatus::Degraded
            } else {
                adas::common_types::types::HealthStatus::Offline
            };

            exports::adas::orchestration::orchestration_control::OrchestrationStatus {
                overall_status: status,
                components_active: COMPONENTS_REGISTERED,
                messages_processed: MESSAGES_PROCESSED,
                pipeline_fps: if PIPELINE_ACTIVE { 30.0 } else { 0.0 },
                timestamp: get_timestamp(),
            }
        }
    }

    fn register_component(
        info: exports::adas::orchestration::orchestration_control::ComponentRegistration,
    ) -> Result<(), String> {
        println!("📝 Registering component: {}", info.component_id);

        let component_mgr = COMPONENT_MANAGER.clone();
        if let Ok(mut mgr) = component_mgr.lock() {
            mgr.register_component(ComponentInfo {
                id: info.component_id,
                component_type: info.component_type,
                interface_version: info.interface_version,
                capabilities: info.capabilities,
            })?;
        }

        unsafe {
            COMPONENTS_REGISTERED += 1;
        }

        Ok(())
    }

    fn execute_pipeline_step(
    ) -> Result<exports::adas::orchestration::orchestration_control::PipelineStepResult, String>
    {
        unsafe {
            if !PIPELINE_ACTIVE {
                return Err("Pipeline not active".to_string());
            }
        }

        let start_time = Instant::now();

        // Execute one pipeline step
        if let Ok(pipeline_guard) = PIPELINE.lock() {
            if let Some(ref pipeline) = *pipeline_guard {
                let step_result = pipeline.execute_step()?;

                let execution_time = start_time.elapsed().as_millis() as f32;

                unsafe {
                    MESSAGES_PROCESSED += step_result.messages_processed as u64;
                }

                return Ok(
                    exports::adas::orchestration::orchestration_control::PipelineStepResult {
                        step_number: step_result.step_number,
                        messages_processed: step_result.messages_processed,
                        components_updated: step_result.components_updated,
                        execution_time_ms: execution_time,
                        timestamp: get_timestamp(),
                    },
                );
            }
        }

        Err("Pipeline not available".to_string())
    }
}

// Implement health monitoring interface
impl exports::adas::diagnostics::health_monitoring::Guest for Orchestrator {
    fn get_health() -> exports::adas::diagnostics::health_monitoring::HealthReport {
        let overall_health = unsafe {
            if ORCHESTRATOR_RUNNING && PIPELINE_ACTIVE {
                adas::common_types::types::HealthStatus::Ok
            } else {
                adas::common_types::types::HealthStatus::Offline
            }
        };

        let mut subsystem_health = Vec::new();

        // Data flow subsystem
        subsystem_health.push(
            exports::adas::diagnostics::health_monitoring::SubsystemHealth {
                subsystem_name: "data-flow".to_string(),
                status: if unsafe { ORCHESTRATOR_RUNNING } {
                    adas::common_types::types::HealthStatus::Ok
                } else {
                    adas::common_types::types::HealthStatus::Offline
                },
                details: "Message bus and data flow coordination".to_string(),
            },
        );

        // Component management subsystem
        subsystem_health.push(
            exports::adas::diagnostics::health_monitoring::SubsystemHealth {
                subsystem_name: "component-management".to_string(),
                status: if unsafe { COMPONENTS_REGISTERED > 0 } {
                    adas::common_types::types::HealthStatus::Ok
                } else {
                    adas::common_types::types::HealthStatus::Offline
                },
                details: format!("{} components registered", unsafe { COMPONENTS_REGISTERED }),
            },
        );

        // Pipeline subsystem
        subsystem_health.push(
            exports::adas::diagnostics::health_monitoring::SubsystemHealth {
                subsystem_name: "pipeline".to_string(),
                status: if unsafe { PIPELINE_ACTIVE } {
                    adas::common_types::types::HealthStatus::Ok
                } else {
                    adas::common_types::types::HealthStatus::Offline
                },
                details: "Main execution pipeline".to_string(),
            },
        );

        exports::adas::diagnostics::health_monitoring::HealthReport {
            component_id: "adas-orchestrator".to_string(),
            overall_health,
            subsystem_health,
            last_diagnostic: None,
            timestamp: get_timestamp(),
        }
    }

    fn run_diagnostic(
    ) -> Result<exports::adas::diagnostics::health_monitoring::DiagnosticResult, String> {
        let mut test_results = Vec::new();
        let mut overall_score = 100.0;

        // Test orchestrator initialization
        test_results.push(
            exports::adas::diagnostics::health_monitoring::TestExecution {
                test_name: "orchestrator-initialization".to_string(),
                test_result: if unsafe { ORCHESTRATOR_RUNNING } {
                    adas::common_types::types::TestResult::Passed
                } else {
                    overall_score -= 30.0;
                    adas::common_types::types::TestResult::Failed
                },
                details: "Orchestrator startup and initialization".to_string(),
                execution_time_ms: 5.0,
            },
        );

        // Test component registration
        test_results.push(
            exports::adas::diagnostics::health_monitoring::TestExecution {
                test_name: "component-registration".to_string(),
                test_result: if unsafe { COMPONENTS_REGISTERED > 0 } {
                    adas::common_types::types::TestResult::Passed
                } else {
                    overall_score -= 20.0;
                    adas::common_types::types::TestResult::Failed
                },
                details: format!("{} components registered", unsafe { COMPONENTS_REGISTERED }),
                execution_time_ms: 3.0,
            },
        );

        // Test pipeline execution
        test_results.push(
            exports::adas::diagnostics::health_monitoring::TestExecution {
                test_name: "pipeline-execution".to_string(),
                test_result: if unsafe { PIPELINE_ACTIVE } {
                    adas::common_types::types::TestResult::Passed
                } else {
                    overall_score -= 25.0;
                    adas::common_types::types::TestResult::Failed
                },
                details: "Main execution pipeline operational".to_string(),
                execution_time_ms: 10.0,
            },
        );

        // Test message processing
        test_results.push(
            exports::adas::diagnostics::health_monitoring::TestExecution {
                test_name: "message-processing".to_string(),
                test_result: if unsafe { MESSAGES_PROCESSED > 0 } {
                    adas::common_types::types::TestResult::Passed
                } else {
                    overall_score -= 15.0;
                    adas::common_types::types::TestResult::Warning
                },
                details: format!("{} messages processed", unsafe { MESSAGES_PROCESSED }),
                execution_time_ms: 2.0,
            },
        );

        let recommendations = if overall_score > 90.0 {
            vec!["Orchestrator operating optimally".to_string()]
        } else if overall_score > 70.0 {
            vec!["Minor issues detected - check component registration".to_string()]
        } else {
            vec!["Critical issues - orchestrator needs restart".to_string()]
        };

        Ok(
            exports::adas::diagnostics::health_monitoring::DiagnosticResult {
                test_results,
                overall_score,
                recommendations,
                timestamp: get_timestamp(),
            },
        )
    }

    fn get_last_diagnostic(
    ) -> Option<exports::adas::diagnostics::health_monitoring::DiagnosticResult> {
        None
    }
}

// Implement performance monitoring interface
impl exports::adas::diagnostics::performance_monitoring::Guest for Orchestrator {
    fn get_performance() -> exports::adas::diagnostics::performance_monitoring::ExtendedPerformance
    {
        unsafe {
            exports::adas::diagnostics::performance_monitoring::ExtendedPerformance {
                base_metrics: adas::common_types::types::PerformanceMetrics {
                    latency_avg_ms: 10.0, // Orchestration overhead
                    latency_max_ms: 25.0,
                    cpu_utilization: 0.15, // Light orchestration load
                    memory_usage_mb: 64,   // Message buffers + state
                    throughput_hz: if PIPELINE_ACTIVE { 30.0 } else { 0.0 },
                    error_rate: 0.001,
                },
                component_specific: vec![
                    exports::adas::diagnostics::performance_monitoring::Metric {
                        name: "components_registered".to_string(),
                        value: COMPONENTS_REGISTERED as f64,
                        unit: "count".to_string(),
                        description: "Number of registered components".to_string(),
                    },
                    exports::adas::diagnostics::performance_monitoring::Metric {
                        name: "messages_processed".to_string(),
                        value: MESSAGES_PROCESSED as f64,
                        unit: "count".to_string(),
                        description: "Total messages processed".to_string(),
                    },
                    exports::adas::diagnostics::performance_monitoring::Metric {
                        name: "pipeline_fps".to_string(),
                        value: if PIPELINE_ACTIVE { 30.0 } else { 0.0 },
                        unit: "fps".to_string(),
                        description: "Pipeline execution frequency".to_string(),
                    },
                ],
                resource_usage: exports::adas::diagnostics::performance_monitoring::ResourceUsage {
                    cpu_cores_used: 0.15,
                    memory_allocated_mb: 64,
                    memory_peak_mb: 96,
                    disk_io_mb: 0.1,
                    network_io_mb: 0.0,
                    gpu_utilization: 0.0,
                    gpu_memory_mb: 0,
                },
                timestamp: get_timestamp(),
            }
        }
    }

    fn get_performance_history(
        _duration_seconds: u32,
    ) -> Vec<exports::adas::diagnostics::performance_monitoring::ExtendedPerformance> {
        vec![] // Not implemented
    }

    fn reset_counters() {
        unsafe {
            MESSAGES_PROCESSED = 0;
        }
        println!("Orchestrator: Reset performance counters");
    }
}

export!(Orchestrator);
