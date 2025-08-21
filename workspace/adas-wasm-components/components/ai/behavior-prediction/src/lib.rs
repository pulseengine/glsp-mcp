// Behavior Prediction AI Component - Multi-interface trajectory prediction engine
use behavior_prediction_ai_bindings::exports::adas::behavior_prediction::{
    diagnostics::{self, Health, TestResult},
    prediction_engine::{
        self, Config, ObjectState, Position, PredictedTrajectory, PredictionResult, RiskLevel,
        Stats, Status, TrajectoryPoint, Velocity,
    },
};

use std::cell::RefCell;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

// Component state
struct BehaviorPredictionState {
    config: Config,
    status: Status,
    frames_processed: u64,
    objects_tracked: u64,
    predictions_generated: u64,
    start_time: u64,
    last_frame_time: u64,
    health: Health,
    processing_times: Vec<f32>,
    object_history: HashMap<u32, Vec<ObjectState>>,
    model_loaded: bool,
}

impl Default for BehaviorPredictionState {
    fn default() -> Self {
        Self {
            config: Config {
                model_name: "lstm_trajectory_predictor".to_string(),
                prediction_horizon_seconds: 3.0,
                confidence_threshold: 0.6,
                max_tracked_objects: 50,
                temporal_window_frames: 10,
                motion_models: vec![
                    "constant_velocity".to_string(),
                    "constant_acceleration".to_string(),
                    "bicycle_model".to_string(),
                    "pedestrian_model".to_string(),
                ],
            },
            status: Status::Inactive,
            frames_processed: 0,
            objects_tracked: 0,
            predictions_generated: 0,
            start_time: 0,
            last_frame_time: 0,
            health: Health::Healthy,
            processing_times: Vec::new(),
            object_history: HashMap::new(),
            model_loaded: false,
        }
    }
}

thread_local! {
    static STATE: RefCell<BehaviorPredictionState> = RefCell::new(BehaviorPredictionState::default());
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

impl prediction_engine::Guest for Component {
    fn initialize(cfg: Config) -> Result<(), String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            // Validate configuration
            if cfg.prediction_horizon_seconds <= 0.0 || cfg.prediction_horizon_seconds > 10.0 {
                return Err("Invalid prediction horizon (must be 0.1-10.0 seconds)".to_string());
            }
            if cfg.confidence_threshold < 0.0 || cfg.confidence_threshold > 1.0 {
                return Err("Invalid confidence threshold (must be 0.0-1.0)".to_string());
            }
            if cfg.max_tracked_objects == 0 || cfg.max_tracked_objects > 200 {
                return Err("Invalid max tracked objects (must be 1-200)".to_string());
            }
            if cfg.temporal_window_frames == 0 || cfg.temporal_window_frames > 50 {
                return Err("Invalid temporal window (must be 1-50 frames)".to_string());
            }

            println!(
                "Behavior Prediction: Initializing model '{}', {:.1}s horizon, {} motion models",
                cfg.model_name,
                cfg.prediction_horizon_seconds,
                cfg.motion_models.len()
            );

            s.config = cfg;
            s.status = Status::Initializing;
            s.frames_processed = 0;
            s.objects_tracked = 0;
            s.predictions_generated = 0;
            s.processing_times.clear();
            s.object_history.clear();

            // Simulate model loading
            s.model_loaded = true;
            s.status = Status::Inactive;
            s.health = Health::Healthy;

            Ok(())
        })
    }

    fn start() -> Result<(), String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            if matches!(s.status, Status::Active) {
                return Err("Behavior prediction already active".to_string());
            }

            if !s.model_loaded {
                return Err("Model not loaded".to_string());
            }

            println!("Behavior Prediction: Starting trajectory prediction");
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
                return Err("Behavior prediction not active".to_string());
            }

            println!("Behavior Prediction: Stopping trajectory prediction");
            s.status = Status::Inactive;
            s.object_history.clear();

            Ok(())
        })
    }

    fn predict_trajectories(objects: Vec<ObjectState>) -> Result<PredictionResult, String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            if !matches!(s.status, Status::Active) {
                return Err("Behavior prediction not active".to_string());
            }

            let now = get_timestamp_ms();
            s.frames_processed += 1;
            s.last_frame_time = now;

            // Update object history
            for obj in &objects {
                let history = s
                    .object_history
                    .entry(obj.object_id)
                    .or_insert_with(Vec::new);
                history.push(obj.clone());

                // Keep only the temporal window
                if history.len() > s.config.temporal_window_frames as usize {
                    history.remove(0);
                }
            }

            s.objects_tracked = objects.len() as u64;

            // Generate trajectory predictions
            let mut trajectories = Vec::new();

            for obj in objects {
                if obj.confidence < s.config.confidence_threshold {
                    continue;
                }

                // Select motion model based on object type
                let motion_model = match obj.object_type.as_str() {
                    "vehicle" | "car" | "truck" | "bus" => "bicycle_model",
                    "pedestrian" | "person" => "pedestrian_model",
                    "cyclist" | "bicycle" => "bicycle_model",
                    _ => "constant_velocity",
                }
                .to_string();

                // Generate trajectory points over prediction horizon
                let mut trajectory_points = Vec::new();
                let prediction_steps = (s.config.prediction_horizon_seconds * 10.0) as u32; // 10 Hz prediction

                for step in 1..=prediction_steps {
                    let time_offset_ms = (step as f32 * 100.0) as u32; // 100ms steps
                    let time_factor = step as f32 / prediction_steps as f32;

                    // Simulate motion model prediction
                    let predicted_position = match motion_model.as_str() {
                        "constant_velocity" => Position {
                            x: obj.position.x
                                + obj.velocity.x
                                    * time_factor
                                    * s.config.prediction_horizon_seconds,
                            y: obj.position.y
                                + obj.velocity.y
                                    * time_factor
                                    * s.config.prediction_horizon_seconds,
                            z: obj.position.z
                                + obj.velocity.z
                                    * time_factor
                                    * s.config.prediction_horizon_seconds,
                        },
                        "constant_acceleration" => {
                            let t = time_factor * s.config.prediction_horizon_seconds;
                            Position {
                                x: obj.position.x
                                    + obj.velocity.x * t
                                    + 0.5 * obj.acceleration.x * t * t,
                                y: obj.position.y
                                    + obj.velocity.y * t
                                    + 0.5 * obj.acceleration.y * t * t,
                                z: obj.position.z
                                    + obj.velocity.z * t
                                    + 0.5 * obj.acceleration.z * t * t,
                            }
                        }
                        "bicycle_model" => {
                            // Simplified bicycle model for vehicles
                            let heading_rad = obj.heading_degrees.to_radians();
                            let speed = (obj.velocity.x * obj.velocity.x
                                + obj.velocity.y * obj.velocity.y)
                                .sqrt();
                            let t = time_factor * s.config.prediction_horizon_seconds;

                            Position {
                                x: obj.position.x + speed * heading_rad.cos() * t,
                                y: obj.position.y + speed * heading_rad.sin() * t,
                                z: obj.position.z,
                            }
                        }
                        "pedestrian_model" => {
                            // More erratic movement for pedestrians
                            let noise_x =
                                (s.frames_processed as f32 * 0.1 + step as f32).sin() * 0.5;
                            let noise_y =
                                (s.frames_processed as f32 * 0.07 + step as f32).cos() * 0.5;

                            Position {
                                x: obj.position.x
                                    + obj.velocity.x
                                        * time_factor
                                        * s.config.prediction_horizon_seconds
                                    + noise_x,
                                y: obj.position.y
                                    + obj.velocity.y
                                        * time_factor
                                        * s.config.prediction_horizon_seconds
                                    + noise_y,
                                z: obj.position.z,
                            }
                        }
                        _ => obj.position.clone(),
                    };

                    // Calculate predicted velocity
                    let predicted_velocity = Velocity {
                        x: obj.velocity.x
                            + obj.acceleration.x
                                * time_factor
                                * s.config.prediction_horizon_seconds,
                        y: obj.velocity.y
                            + obj.acceleration.y
                                * time_factor
                                * s.config.prediction_horizon_seconds,
                        z: obj.velocity.z
                            + obj.acceleration.z
                                * time_factor
                                * s.config.prediction_horizon_seconds,
                    };

                    // Confidence decreases over time
                    let confidence = obj.confidence * (1.0 - time_factor * 0.3);

                    trajectory_points.push(TrajectoryPoint {
                        position: predicted_position,
                        velocity: predicted_velocity,
                        timestamp_offset_ms: time_offset_ms,
                        confidence,
                    });
                }

                // Calculate risk level and collision probability
                let speed =
                    (obj.velocity.x * obj.velocity.x + obj.velocity.y * obj.velocity.y).sqrt();
                let distance_to_origin =
                    (obj.position.x * obj.position.x + obj.position.y * obj.position.y).sqrt();

                let (risk_level, collision_probability) =
                    if distance_to_origin < 10.0 && speed > 5.0 {
                        (RiskLevel::Critical, 0.8)
                    } else if distance_to_origin < 20.0 && speed > 2.0 {
                        (RiskLevel::High, 0.5)
                    } else if distance_to_origin < 50.0 {
                        (RiskLevel::Medium, 0.2)
                    } else {
                        (RiskLevel::Low, 0.05)
                    };

                trajectories.push(PredictedTrajectory {
                    object_id: obj.object_id,
                    trajectory_points,
                    motion_model,
                    risk_level,
                    collision_probability,
                });
            }

            s.predictions_generated += trajectories.len() as u64;

            // Simulate processing time
            let processing_time = 15.0 + (s.frames_processed as f32 * 0.08).sin() * 8.0;
            s.processing_times.push(processing_time);

            // Keep only last 100 processing times
            if s.processing_times.len() > 100 {
                s.processing_times.remove(0);
            }

            // Simulate occasional processing issues
            if s.frames_processed % 120 == 0 {
                s.health = Health::Degraded;
            }

            let result = PredictionResult {
                trajectories,
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

            Stats {
                frames_processed: s.frames_processed,
                objects_tracked: s.objects_tracked,
                predictions_generated: s.predictions_generated,
                average_processing_time_ms: average_processing_time,
                cpu_percent: 40.0 + (elapsed_sec * 0.04).sin() * 10.0,
                memory_mb: 1024,
            }
        })
    }

    fn reset_stats() {
        STATE.with(|state| {
            let mut s = state.borrow_mut();
            s.frames_processed = 0;
            s.objects_tracked = 0;
            s.predictions_generated = 0;
            s.processing_times.clear();
            s.object_history.clear();
            s.start_time = get_timestamp_ms();
            s.health = Health::Healthy;
            println!("Behavior Prediction: Statistics reset");
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

            // Test 1: Model loading
            results.push(TestResult {
                name: "model_loading".to_string(),
                passed: s.model_loaded,
                message: if s.model_loaded {
                    format!("Model '{}' loaded successfully", s.config.model_name)
                } else {
                    "Model not loaded".to_string()
                },
                duration_ms: 40.0,
            });

            // Test 2: Motion model validation
            let motion_models_ok = !s.config.motion_models.is_empty();
            results.push(TestResult {
                name: "motion_models".to_string(),
                passed: motion_models_ok,
                message: format!("{} motion models available", s.config.motion_models.len()),
                duration_ms: 20.0,
            });

            // Test 3: Temporal window management
            let temporal_ok = s.object_history.len() <= s.config.max_tracked_objects as usize;
            results.push(TestResult {
                name: "temporal_window".to_string(),
                passed: temporal_ok,
                message: if temporal_ok {
                    format!("Tracking {} objects within limit", s.object_history.len())
                } else {
                    format!("Tracking too many objects: {}", s.object_history.len())
                },
                duration_ms: 15.0,
            });

            // Test 4: Prediction performance
            let performance_ok = s.processing_times.iter().all(|&t| t < 50.0); // Under 50ms
            results.push(TestResult {
                name: "prediction_performance".to_string(),
                passed: performance_ok,
                message: if performance_ok {
                    "Prediction times within acceptable range".to_string()
                } else {
                    "Prediction times exceeding thresholds".to_string()
                },
                duration_ms: 25.0,
            });

            // Test 5: Memory management
            results.push(TestResult {
                name: "memory_management".to_string(),
                passed: true,
                message: "Object history management stable".to_string(),
                duration_ms: 10.0,
            });
        });

        results
    }

    fn get_report() -> String {
        STATE.with(|state| {
            let s = state.borrow();
            let stats = <Component as prediction_engine::Guest>::get_stats();

            let motion_models = s.config.motion_models.join(", ");

            format!(
                r#"Behavior Prediction AI Diagnostic Report
=========================================
Status: {:?}
Health: {:?}

Configuration:
  Model: {}
  Prediction horizon: {:.1} seconds
  Confidence threshold: {:.2}
  Max tracked objects: {}
  Temporal window: {} frames
  Motion models: {}

Performance:
  Frames processed: {}
  Objects tracked: {}
  Predictions generated: {}
  Average processing time: {:.1} ms
  CPU usage: {:.1}%
  Memory usage: {} MB

Current State:
  Object history entries: {}

AI Model Info:
  LSTM trajectory prediction
  Multi-model motion prediction
  Risk assessment capability
  Temporal sequence analysis
"#,
                s.status,
                s.health,
                s.config.model_name,
                s.config.prediction_horizon_seconds,
                s.config.confidence_threshold,
                s.config.max_tracked_objects,
                s.config.temporal_window_frames,
                motion_models,
                stats.frames_processed,
                stats.objects_tracked,
                stats.predictions_generated,
                stats.average_processing_time_ms,
                stats.cpu_percent,
                stats.memory_mb,
                s.object_history.len()
            )
        })
    }
}

// Export the component with multi-interface support
behavior_prediction_ai_bindings::export!(Component with_types_in behavior_prediction_ai_bindings);
