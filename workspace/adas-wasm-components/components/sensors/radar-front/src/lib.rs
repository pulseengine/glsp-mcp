// Radar Front ECU Component - Multi-interface radar sensor implementation
use radar_front_ecu_bindings::exports::adas::radar_front::{
    diagnostics::{self, Health, TestResult},
    radar_sensor::{self, Config, Detection, Stats, Status},
};

use std::cell::RefCell;
use std::time::{SystemTime, UNIX_EPOCH};

// Component state
struct RadarState {
    config: Config,
    status: Status,
    detections_processed: u64,
    false_positives: u64,
    start_time: u64,
    last_frame_time: u64,
    health: Health,
    current_targets: Vec<Detection>,
}

impl Default for RadarState {
    fn default() -> Self {
        Self {
            config: Config {
                range_meters: 200.0,
                resolution_cm: 10.0,
                field_of_view_degrees: 60.0,
                frequency_ghz: 77.0,
                detection_threshold: 0.3,
            },
            status: Status::Inactive,
            detections_processed: 0,
            false_positives: 0,
            start_time: 0,
            last_frame_time: 0,
            health: Health::Healthy,
            current_targets: Vec::new(),
        }
    }
}

thread_local! {
    static STATE: RefCell<RadarState> = RefCell::new(RadarState::default());
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

impl radar_sensor::Guest for Component {
    fn initialize(cfg: Config) -> Result<(), String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            // Validate configuration
            if cfg.range_meters <= 0.0 || cfg.range_meters > 300.0 {
                return Err("Invalid range (must be 0-300 meters)".to_string());
            }
            if cfg.field_of_view_degrees <= 0.0 || cfg.field_of_view_degrees > 180.0 {
                return Err("Invalid field of view (must be 0-180 degrees)".to_string());
            }

            println!(
                "Radar Front: Initializing {:.1}m range, {:.1}° FOV, {:.1} GHz",
                cfg.range_meters, cfg.field_of_view_degrees, cfg.frequency_ghz
            );

            s.config = cfg;
            s.status = Status::Initializing;
            s.detections_processed = 0;
            s.false_positives = 0;
            s.current_targets.clear();

            // Simulate initialization
            s.status = Status::Inactive;
            s.health = Health::Healthy;

            Ok(())
        })
    }

    fn start() -> Result<(), String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            if matches!(s.status, Status::Active) {
                return Err("Radar already active".to_string());
            }

            println!("Radar Front: Starting detection");
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
                return Err("Radar not active".to_string());
            }

            println!("Radar Front: Stopping detection");
            s.status = Status::Inactive;
            s.current_targets.clear();

            Ok(())
        })
    }

    fn process_frame() -> Result<Vec<Detection>, String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            if !matches!(s.status, Status::Active) {
                return Err("Radar not active".to_string());
            }

            let now = get_timestamp_ms();
            s.detections_processed += 1;
            s.last_frame_time = now;

            // Simulate radar detections with some variation
            let mut detections = Vec::new();

            // Simulate a few targets at different ranges and angles
            let target_count = ((s.detections_processed % 5) + 1) as usize;

            for i in 0..target_count {
                let range =
                    50.0 + (i as f32 * 30.0) + (s.detections_processed as f32 * 0.1).sin() * 10.0;
                let angle =
                    -20.0 + (i as f32 * 10.0) + (s.detections_processed as f32 * 0.05).cos() * 5.0;
                let velocity = 15.0 + (s.detections_processed as f32 * 0.02).sin() * 10.0;

                if range <= s.config.range_meters {
                    detections.push(Detection {
                        range_meters: range,
                        angle_degrees: angle,
                        velocity_ms: velocity,
                        signal_strength: 0.8 + (s.detections_processed as f32 * 0.03).cos() * 0.2,
                        target_type: if i % 2 == 0 {
                            "vehicle".to_string()
                        } else {
                            "pedestrian".to_string()
                        },
                        confidence: 0.75 + (s.detections_processed as f32 * 0.01).sin() * 0.2,
                    });
                }
            }

            // Simulate occasional false positives
            if s.detections_processed % 20 == 0 {
                s.false_positives += 1;
                s.health = Health::Degraded;
            }

            s.current_targets = detections.clone();

            Ok(detections)
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

            let average_range = if !s.current_targets.is_empty() {
                s.current_targets
                    .iter()
                    .map(|t| t.range_meters)
                    .sum::<f32>()
                    / s.current_targets.len() as f32
            } else {
                0.0
            };

            Stats {
                detections_processed: s.detections_processed,
                false_positives: s.false_positives,
                average_range,
                cpu_percent: 12.0 + (elapsed_sec * 0.05).sin() * 3.0,
                memory_mb: 64,
                power_watts: 15.0 + (elapsed_sec * 0.02).cos() * 2.0,
            }
        })
    }

    fn reset_stats() {
        STATE.with(|state| {
            let mut s = state.borrow_mut();
            s.detections_processed = 0;
            s.false_positives = 0;
            s.start_time = get_timestamp_ms();
            s.health = Health::Healthy;
            s.current_targets.clear();
            println!("Radar Front: Statistics reset");
        });
    }
}

impl diagnostics::Guest for Component {
    fn get_health() -> Health {
        STATE.with(|state| state.borrow().health.clone())
    }

    fn run_diagnostics() -> Vec<TestResult> {
        let mut results = vec![];

        // Test 1: RF frontend
        results.push(TestResult {
            name: "rf_frontend".to_string(),
            passed: true,
            message: "77 GHz RF frontend operational".to_string(),
            duration_ms: 20.0,
        });

        // Test 2: Signal processing
        results.push(TestResult {
            name: "signal_processing".to_string(),
            passed: true,
            message: "FFT and CFAR processing functional".to_string(),
            duration_ms: 35.0,
        });

        // Test 3: Target tracking
        STATE.with(|state| {
            let s = state.borrow();
            let tracking_ok = s.false_positives < s.detections_processed / 50; // Less than 2% false positive rate

            results.push(TestResult {
                name: "target_tracking".to_string(),
                passed: tracking_ok,
                message: if tracking_ok {
                    format!(
                        "Target tracking stable: {} false positives",
                        s.false_positives
                    )
                } else {
                    format!("Excessive false positives: {}", s.false_positives)
                },
                duration_ms: 15.0,
            });
        });

        // Test 4: Antenna calibration
        results.push(TestResult {
            name: "antenna_calibration".to_string(),
            passed: true,
            message: "Antenna array calibration within tolerance".to_string(),
            duration_ms: 25.0,
        });

        results
    }

    fn get_report() -> String {
        STATE.with(|state| {
            let s = state.borrow();
            let stats = <Component as radar_sensor::Guest>::get_stats();

            format!(
                r#"Radar Front ECU Diagnostic Report
=====================================
Status: {:?}
Health: {:?}

Configuration:
  Range: {:.1} meters
  Resolution: {:.1} cm
  Field of View: {:.1}°
  Frequency: {:.1} GHz
  Detection Threshold: {:.2}

Performance:
  Detections processed: {}
  False positives: {}
  Average range: {:.1}m
  CPU usage: {:.1}%
  Memory usage: {} MB
  Power consumption: {:.1}W

Current Targets: {}
Radar Info:
  RF Frontend: Active
  Signal Processing: Operational
  Target Tracking: Enabled
"#,
                s.status,
                s.health,
                s.config.range_meters,
                s.config.resolution_cm,
                s.config.field_of_view_degrees,
                s.config.frequency_ghz,
                s.config.detection_threshold,
                stats.detections_processed,
                stats.false_positives,
                stats.average_range,
                stats.cpu_percent,
                stats.memory_mb,
                stats.power_watts,
                s.current_targets.len()
            )
        })
    }
}

// Export the component with multi-interface support
radar_front_ecu_bindings::export!(Component with_types_in radar_front_ecu_bindings);
