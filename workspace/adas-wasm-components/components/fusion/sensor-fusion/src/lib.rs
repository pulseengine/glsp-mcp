// Sensor Fusion ECU Component - Multi-interface sensor data fusion engine
use sensor_fusion_ecu_bindings::exports::adas::sensor_fusion::{
    diagnostics::{self, Health, TestResult},
    fusion_engine::{
        self, Config, Dimensions, FusedObject, FusionResult, Orientation, Position, SensorData,
        SensorStatus, SensorWeight, Stats, Status, Velocity,
    },
};

use std::cell::RefCell;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

// Component state
struct SensorFusionState {
    config: Config,
    status: Status,
    frames_processed: u64,
    objects_fused: u64,
    start_time: u64,
    last_frame_time: u64,
    health: Health,
    processing_times: Vec<f32>,
    sensor_history: HashMap<String, Vec<SensorData>>,
    active_sensors: HashMap<String, u64>,
    kalman_states: HashMap<u32, KalmanState>,
    fusion_initialized: bool,
}

// Simplified Kalman filter state for object tracking
#[derive(Clone)]
struct KalmanState {
    position: Position,
    velocity: Velocity,
    confidence: f32,
    last_update: u64,
}

impl Default for SensorFusionState {
    fn default() -> Self {
        let default_weights = vec![
            SensorWeight {
                sensor_type: "camera".to_string(),
                weight: 0.4,
                reliability_factor: 0.8,
            },
            SensorWeight {
                sensor_type: "radar".to_string(),
                weight: 0.3,
                reliability_factor: 0.9,
            },
            SensorWeight {
                sensor_type: "lidar".to_string(),
                weight: 0.25,
                reliability_factor: 0.95,
            },
            SensorWeight {
                sensor_type: "ultrasonic".to_string(),
                weight: 0.05,
                reliability_factor: 0.7,
            },
        ];

        Self {
            config: Config {
                fusion_rate_hz: 30.0,
                confidence_threshold: 0.5,
                max_sensor_latency_ms: 100,
                kalman_filter_enabled: true,
                sensor_weights: default_weights,
                coordinate_system: "vehicle_frame".to_string(),
            },
            status: Status::Inactive,
            frames_processed: 0,
            objects_fused: 0,
            start_time: 0,
            last_frame_time: 0,
            health: Health::Healthy,
            processing_times: Vec::new(),
            sensor_history: HashMap::new(),
            active_sensors: HashMap::new(),
            kalman_states: HashMap::new(),
            fusion_initialized: false,
        }
    }
}

thread_local! {
    static STATE: RefCell<SensorFusionState> = RefCell::new(SensorFusionState::default());
}

// Helper to get current timestamp in milliseconds
fn get_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// Component implementation
struct Component;

impl fusion_engine::Guest for Component {
    fn initialize(cfg: Config) -> Result<(), String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            // Validate configuration
            if cfg.fusion_rate_hz <= 0.0 || cfg.fusion_rate_hz > 100.0 {
                return Err("Invalid fusion rate (must be 0.1-100.0 Hz)".to_string());
            }
            if cfg.confidence_threshold < 0.0 || cfg.confidence_threshold > 1.0 {
                return Err("Invalid confidence threshold (must be 0.0-1.0)".to_string());
            }
            if cfg.max_sensor_latency_ms == 0 || cfg.max_sensor_latency_ms > 1000 {
                return Err("Invalid max sensor latency (must be 1-1000 ms)".to_string());
            }

            // Validate sensor weights sum to approximately 1.0
            let total_weight: f32 = cfg.sensor_weights.iter().map(|w| w.weight).sum();
            if (total_weight - 1.0).abs() > 0.1 {
                return Err("Sensor weights should sum to approximately 1.0".to_string());
            }

            println!(
                "Sensor Fusion: Initializing {:.1} Hz fusion, {} sensor types, Kalman: {}",
                cfg.fusion_rate_hz,
                cfg.sensor_weights.len(),
                cfg.kalman_filter_enabled
            );

            s.config = cfg;
            s.status = Status::Initializing;
            s.frames_processed = 0;
            s.objects_fused = 0;
            s.processing_times.clear();
            s.sensor_history.clear();
            s.active_sensors.clear();
            s.kalman_states.clear();

            // Simulate fusion system initialization
            s.fusion_initialized = true;
            s.status = Status::Inactive;
            s.health = Health::Healthy;

            Ok(())
        })
    }

    fn start() -> Result<(), String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            if matches!(s.status, Status::Active) {
                return Err("Sensor fusion already active".to_string());
            }

            if !s.fusion_initialized {
                return Err("Fusion system not initialized".to_string());
            }

            println!("Sensor Fusion: Starting multi-sensor data fusion");
            s.status = Status::Active;
            s.start_time = get_timestamp_ms();
            s.last_frame_time = s.start_time;

            Ok(())
        })
    }

    fn stop() -> Result<(), String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            if !matches!(s.status, Status::Active) {
                return Err("Sensor fusion not active".to_string());
            }

            println!("Sensor Fusion: Stopping data fusion");
            s.status = Status::Inactive;
            s.sensor_history.clear();
            s.kalman_states.clear();

            Ok(())
        })
    }

    fn fuse_sensor_data(sensor_inputs: Vec<SensorData>) -> Result<FusionResult, String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            if !matches!(s.status, Status::Active) {
                return Err("Sensor fusion not active".to_string());
            }

            let now = get_timestamp_ms();
            s.frames_processed += 1;
            s.last_frame_time = now;

            // Update sensor activity tracking
            let mut sensor_statuses = Vec::new();
            for input in &sensor_inputs {
                s.active_sensors.insert(input.sensor_id.clone(), now);

                // Calculate latency
                let latency_ms = if now >= input.timestamp {
                    (now - input.timestamp) as u32
                } else {
                    0
                };

                // Store sensor history
                let history = s
                    .sensor_history
                    .entry(input.sensor_id.clone())
                    .or_insert_with(Vec::new);
                history.push(input.clone());
                if history.len() > 10 {
                    history.remove(0);
                }

                sensor_statuses.push(SensorStatus {
                    sensor_id: input.sensor_id.clone(),
                    is_active: latency_ms <= s.config.max_sensor_latency_ms,
                    latency_ms,
                    data_quality: input.confidence,
                    last_update: input.timestamp,
                });
            }

            // Simulate sensor data fusion process
            let mut fused_objects = Vec::new();
            let object_count = ((s.frames_processed % 6) + 1) as usize;

            for i in 0..object_count {
                let object_id = i as u32;

                // Get sensor weight for primary sensor type
                let primary_sensor_type = match i % 4 {
                    0 => "camera",
                    1 => "radar",
                    2 => "lidar",
                    _ => "ultrasonic",
                };

                let sensor_weight = s
                    .config
                    .sensor_weights
                    .iter()
                    .find(|w| w.sensor_type == primary_sensor_type)
                    .map(|w| w.weight)
                    .unwrap_or(0.1);

                // Simulate position from multiple sensors
                let base_x = 20.0 + (i as f32 * 15.0);
                let base_y = -5.0 + (i as f32 * 8.0);
                let base_z = 0.0;

                // Add noise and fusion uncertainty
                let time_factor = s.frames_processed as f32 * 0.1;
                let fusion_noise_x = (time_factor + i as f32).sin() * 2.0;
                let fusion_noise_y = (time_factor * 0.7 + i as f32).cos() * 1.5;

                let mut position = Position {
                    x: base_x + fusion_noise_x,
                    y: base_y + fusion_noise_y,
                    z: base_z,
                };

                let mut velocity = Velocity {
                    x: 5.0 + (time_factor * 0.05).sin() * 3.0,
                    y: 1.0 + (time_factor * 0.03).cos() * 2.0,
                    z: 0.0,
                };

                // Apply Kalman filtering if enabled
                if s.config.kalman_filter_enabled {
                    if let Some(kalman_state) = s.kalman_states.get_mut(&object_id) {
                        // Update Kalman filter (simplified)
                        let dt = 0.033; // Assume ~30 Hz

                        // Predict step
                        kalman_state.position.x += kalman_state.velocity.x * dt;
                        kalman_state.position.y += kalman_state.velocity.y * dt;
                        kalman_state.position.z += kalman_state.velocity.z * dt;

                        // Update step (blend with measurement)
                        let alpha = 0.7; // Kalman gain approximation
                        kalman_state.position.x =
                            alpha * position.x + (1.0 - alpha) * kalman_state.position.x;
                        kalman_state.position.y =
                            alpha * position.y + (1.0 - alpha) * kalman_state.position.y;
                        kalman_state.velocity.x =
                            alpha * velocity.x + (1.0 - alpha) * kalman_state.velocity.x;
                        kalman_state.velocity.y =
                            alpha * velocity.y + (1.0 - alpha) * kalman_state.velocity.y;

                        position = kalman_state.position.clone();
                        velocity = kalman_state.velocity.clone();
                    } else {
                        // Initialize new Kalman state
                        s.kalman_states.insert(
                            object_id,
                            KalmanState {
                                position: position.clone(),
                                velocity: velocity.clone(),
                                confidence: sensor_weight,
                                last_update: now,
                            },
                        );
                    }
                }

                // Calculate fused confidence
                let base_confidence = sensor_weight + 0.3;
                let confidence =
                    (base_confidence * 0.8 + (time_factor * 0.02).cos() * 0.1).min(1.0);

                // Determine contributing sensors
                let source_sensors = vec![
                    format!("{}-sensor-1", primary_sensor_type),
                    format!("{}-sensor-2", primary_sensor_type),
                ];

                // Object type and dimensions based on sensor data
                let (object_type, dimensions) = match i % 3 {
                    0 => (
                        "vehicle",
                        Dimensions {
                            length: 4.5,
                            width: 1.8,
                            height: 1.5,
                        },
                    ),
                    1 => (
                        "pedestrian",
                        Dimensions {
                            length: 0.6,
                            width: 0.4,
                            height: 1.7,
                        },
                    ),
                    _ => (
                        "cyclist",
                        Dimensions {
                            length: 1.8,
                            width: 0.6,
                            height: 1.2,
                        },
                    ),
                };

                fused_objects.push(FusedObject {
                    object_id,
                    position,
                    velocity,
                    acceleration: Velocity {
                        x: 0.5,
                        y: 0.2,
                        z: 0.0,
                    },
                    orientation: Orientation {
                        roll: 0.0,
                        pitch: 0.0,
                        yaw: (time_factor * 0.1 + i as f32).sin() * 10.0,
                    },
                    dimensions,
                    object_type: object_type.to_string(),
                    confidence,
                    source_sensors,
                    timestamp: now,
                });
            }

            s.objects_fused += fused_objects.len() as u64;

            // Simulate processing time
            let processing_time = 20.0 + (s.frames_processed as f32 * 0.06).sin() * 12.0;
            s.processing_times.push(processing_time);

            // Keep only last 100 processing times
            if s.processing_times.len() > 100 {
                s.processing_times.remove(0);
            }

            // Simulate occasional fusion issues
            if s.frames_processed % 80 == 0 {
                s.health = Health::Degraded;
            }

            let result = FusionResult {
                fused_objects,
                sensor_status: sensor_statuses,
                processing_time_ms: processing_time,
                frame_number: s.frames_processed,
                timestamp: now,
            };

            Ok(result)
        })
    }

    fn get_status() -> Status {
        STATE.with(|state| state.borrow().status.clone())
    }

    fn get_stats() -> Stats {
        STATE.with(|state| {
            let s = state.borrow();
            let elapsed_sec = if s.start_time > 0 {
                ((get_timestamp_ms() - s.start_time) as f32) / 1000.0
            } else {
                0.0
            };

            let average_processing_time = if !s.processing_times.is_empty() {
                s.processing_times.iter().sum::<f32>() / s.processing_times.len() as f32
            } else {
                0.0
            };

            // Calculate fusion accuracy based on Kalman states
            let fusion_accuracy = if s.config.kalman_filter_enabled && !s.kalman_states.is_empty() {
                let avg_confidence: f32 =
                    s.kalman_states.values().map(|k| k.confidence).sum::<f32>()
                        / s.kalman_states.len() as f32;
                (avg_confidence * 100.0).min(100.0)
            } else {
                85.0 + (elapsed_sec * 0.01).sin() * 10.0
            };

            Stats {
                frames_processed: s.frames_processed,
                objects_fused: s.objects_fused,
                sensors_active: s.active_sensors.len() as u32,
                average_processing_time_ms: average_processing_time,
                fusion_accuracy,
                cpu_percent: 35.0 + (elapsed_sec * 0.05).sin() * 8.0,
                memory_mb: 512,
            }
        })
    }

    fn reset_stats() {
        STATE.with(|state| {
            let mut s = state.borrow_mut();
            s.frames_processed = 0;
            s.objects_fused = 0;
            s.processing_times.clear();
            s.sensor_history.clear();
            s.active_sensors.clear();
            s.kalman_states.clear();
            s.start_time = get_timestamp_ms();
            s.health = Health::Healthy;
            println!("Sensor Fusion: Statistics reset");
        });
    }
}

impl diagnostics::Guest for Component {
    fn get_health() -> Health {
        STATE.with(|state| state.borrow().health.clone())
    }

    fn run_diagnostics() -> Vec<TestResult> {
        let mut results = vec![];

        STATE.with(|state| {
            let s = state.borrow();

            // Test 1: Fusion system initialization
            results.push(TestResult {
                name: "fusion_initialization".to_string(),
                passed: s.fusion_initialized,
                message: if s.fusion_initialized {
                    "Fusion system initialized successfully".to_string()
                } else {
                    "Fusion system not initialized".to_string()
                },
                duration_ms: 30.0,
            });

            // Test 2: Sensor weight validation
            let weights_valid = s
                .config
                .sensor_weights
                .iter()
                .all(|w| w.weight > 0.0 && w.weight <= 1.0);
            results.push(TestResult {
                name: "sensor_weights".to_string(),
                passed: weights_valid,
                message: if weights_valid {
                    format!(
                        "{} sensor weight configurations valid",
                        s.config.sensor_weights.len()
                    )
                } else {
                    "Invalid sensor weight configuration".to_string()
                },
                duration_ms: 20.0,
            });

            // Test 3: Kalman filter status
            let kalman_ok = !s.config.kalman_filter_enabled
                || !s.kalman_states.is_empty()
                || s.frames_processed < 10;
            results.push(TestResult {
                name: "kalman_filter".to_string(),
                passed: kalman_ok,
                message: if s.config.kalman_filter_enabled {
                    format!("Kalman filter tracking {} objects", s.kalman_states.len())
                } else {
                    "Kalman filter disabled".to_string()
                },
                duration_ms: 25.0,
            });

            // Test 4: Sensor connectivity
            let active_sensor_count = s.active_sensors.len();
            let connectivity_ok = active_sensor_count >= 2; // Need at least 2 sensors for fusion
            results.push(TestResult {
                name: "sensor_connectivity".to_string(),
                passed: connectivity_ok,
                message: if connectivity_ok {
                    format!("{} sensors actively providing data", active_sensor_count)
                } else {
                    format!("Insufficient active sensors: {}", active_sensor_count)
                },
                duration_ms: 15.0,
            });

            // Test 5: Processing performance
            let performance_ok = s.processing_times.iter().all(|&t| t < 100.0); // Under 100ms
            results.push(TestResult {
                name: "processing_performance".to_string(),
                passed: performance_ok,
                message: if performance_ok {
                    "Fusion processing times within acceptable range".to_string()
                } else {
                    "Fusion processing times exceeding thresholds".to_string()
                },
                duration_ms: 20.0,
            });
        });

        results
    }

    fn get_report() -> String {
        STATE.with(|state| {
            let s = state.borrow();
            let stats = <Component as fusion_engine::Guest>::get_stats();

            let sensor_weights: Vec<String> = s
                .config
                .sensor_weights
                .iter()
                .map(|w| {
                    format!(
                        "  {}: {:.2} (reliability: {:.2})",
                        w.sensor_type, w.weight, w.reliability_factor
                    )
                })
                .collect();

            format!(
                r#"Sensor Fusion ECU Diagnostic Report
====================================
Status: {:?}
Health: {:?}

Configuration:
  Fusion rate: {:.1} Hz
  Confidence threshold: {:.2}
  Max sensor latency: {} ms
  Kalman filter: {}
  Coordinate system: {}

Sensor Weights:
{}

Performance:
  Frames processed: {}
  Objects fused: {}
  Sensors active: {}
  Average processing time: {:.1} ms
  Fusion accuracy: {:.1}%
  CPU usage: {:.1}%
  Memory usage: {} MB

Current State:
  Kalman states: {}
  Sensor history entries: {}

Fusion Info:
  Multi-sensor data fusion
  Kalman filter tracking
  Real-time object estimation
  Confidence weighted fusion
"#,
                s.status,
                s.health,
                s.config.fusion_rate_hz,
                s.config.confidence_threshold,
                s.config.max_sensor_latency_ms,
                s.config.kalman_filter_enabled,
                s.config.coordinate_system,
                sensor_weights.join("\n"),
                stats.frames_processed,
                stats.objects_fused,
                stats.sensors_active,
                stats.average_processing_time_ms,
                stats.fusion_accuracy,
                stats.cpu_percent,
                stats.memory_mb,
                s.kalman_states.len(),
                s.sensor_history.len()
            )
        })
    }
}

// Export the component with multi-interface support
sensor_fusion_ecu_bindings::export!(Component with_types_in sensor_fusion_ecu_bindings);
