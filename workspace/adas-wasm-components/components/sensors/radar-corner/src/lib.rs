// Radar Corner ECU Component - Multi-interface corner radar sensor implementation
use radar_corner_ecu_bindings::exports::adas::radar_corner::{
    diagnostics::{self, Health, TestResult},
    radar_sensor::{self, Config, Detection, Stats, Status},
};

use std::cell::RefCell;
use std::time::{SystemTime, UNIX_EPOCH};

// Component state
struct RadarCornerState {
    config: Config,
    status: Status,
    detections_processed: u64,
    false_positives: u64,
    start_time: u64,
    last_frame_time: u64,
    health: Health,
    current_targets: Vec<Detection>,
}

impl Default for RadarCornerState {
    fn default() -> Self {
        Self {
            config: Config {
                range_meters: 100.0,
                resolution_cm: 15.0,
                field_of_view_degrees: 120.0,
                frequency_ghz: 24.0,
                detection_threshold: 0.2,
                corner_position: "front-left".to_string(),
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
    static STATE: RefCell<RadarCornerState> = RefCell::new(RadarCornerState::default());
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
            if cfg.range_meters <= 0.0 || cfg.range_meters > 150.0 {
                return Err("Invalid range (must be 0-150 meters for corner radar)".to_string());
            }
            if cfg.field_of_view_degrees <= 0.0 || cfg.field_of_view_degrees > 150.0 {
                return Err("Invalid field of view (must be 0-150 degrees)".to_string());
            }

            println!(
                "Radar Corner {}: Initializing {:.1}m range, {:.1}° FOV, {:.1} GHz",
                cfg.corner_position, cfg.range_meters, cfg.field_of_view_degrees, cfg.frequency_ghz
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
                return Err("Radar corner already active".to_string());
            }

            println!(
                "Radar Corner {}: Starting detection",
                s.config.corner_position
            );
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
                return Err("Radar corner not active".to_string());
            }

            println!(
                "Radar Corner {}: Stopping detection",
                s.config.corner_position
            );
            s.status = Status::Inactive;
            s.current_targets.clear();

            Ok(())
        })
    }

    fn process_frame() -> Result<Vec<Detection>, String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            if !matches!(s.status, Status::Active) {
                return Err("Radar corner not active".to_string());
            }

            let now = get_timestamp_ms();
            s.detections_processed += 1;
            s.last_frame_time = now;

            // Simulate corner radar detections (typically for parking/blind spot)
            let mut detections = Vec::new();

            // Corner radars typically detect closer objects with wider angles
            let target_count = ((s.detections_processed % 4) + 1) as usize;

            for i in 0..target_count {
                let range =
                    5.0 + (i as f32 * 15.0) + (s.detections_processed as f32 * 0.08).sin() * 8.0;
                let angle =
                    -60.0 + (i as f32 * 30.0) + (s.detections_processed as f32 * 0.04).cos() * 10.0;
                let velocity = 2.0 + (s.detections_processed as f32 * 0.03).sin() * 5.0;

                if range <= s.config.range_meters
                    && angle.abs() <= s.config.field_of_view_degrees / 2.0
                {
                    let target_type = match i % 4 {
                        0 => "vehicle",
                        1 => "pedestrian",
                        2 => "cyclist",
                        _ => "object",
                    };

                    detections.push(Detection {
                        range_meters: range,
                        angle_degrees: angle,
                        velocity_ms: velocity,
                        signal_strength: 0.6 + (s.detections_processed as f32 * 0.04).cos() * 0.3,
                        target_type: target_type.to_string(),
                        confidence: 0.7 + (s.detections_processed as f32 * 0.02).sin() * 0.25,
                    });
                }
            }

            // Simulate occasional false positives (more common in corner radars)
            if s.detections_processed % 15 == 0 {
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
                cpu_percent: 8.0 + (elapsed_sec * 0.06).sin() * 2.0,
                memory_mb: 32,
                power_watts: 8.0 + (elapsed_sec * 0.03).cos() * 1.5,
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
            println!(
                "Radar Corner {}: Statistics reset",
                s.config.corner_position
            );
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
            message: "24 GHz RF frontend operational".to_string(),
            duration_ms: 18.0,
        });

        // Test 2: Signal processing
        results.push(TestResult {
            name: "signal_processing".to_string(),
            passed: true,
            message: "Corner radar signal processing functional".to_string(),
            duration_ms: 22.0,
        });

        // Test 3: Target tracking
        STATE.with(|state| {
            let s = state.borrow();
            let tracking_ok = s.false_positives < s.detections_processed / 30; // Corner radars have higher false positive tolerance

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
                duration_ms: 12.0,
            });
        });

        // Test 4: Position calibration
        results.push(TestResult {
            name: "position_calibration".to_string(),
            passed: true,
            message: "Corner position calibration accurate".to_string(),
            duration_ms: 20.0,
        });

        results
    }

    fn get_report() -> String {
        STATE.with(|state| {
            let s = state.borrow();
            let stats = <Component as radar_sensor::Guest>::get_stats();

            format!(
                r#"Radar Corner ECU Diagnostic Report
====================================
Status: {:?}
Health: {:?}

Configuration:
  Position: {}
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
  Corner radar for blind spot/parking
  Wide angle coverage
  Short to medium range detection
"#,
                s.status,
                s.health,
                s.config.corner_position,
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
radar_corner_ecu_bindings::export!(Component with_types_in radar_corner_ecu_bindings);
