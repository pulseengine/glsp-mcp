// Lidar ECU Component - Multi-interface lidar sensor implementation
use lidar_ecu_bindings::exports::adas::lidar::{
    diagnostics::{self, Health, TestResult},
    lidar_sensor::{self, Config, Point, Scan, Stats, Status},
};

use std::cell::RefCell;
use std::time::{SystemTime, UNIX_EPOCH};

// Component state
struct LidarState {
    config: Config,
    status: Status,
    scans_processed: u64,
    points_processed: u64,
    start_time: u64,
    last_frame_time: u64,
    health: Health,
    current_scan: Option<Scan>,
}

impl Default for LidarState {
    fn default() -> Self {
        Self {
            config: Config {
                range_meters: 100.0,
                resolution_cm: 2.0,
                field_of_view_degrees: 360.0,
                scan_rate_hz: 10.0,
                detection_threshold: 0.1,
            },
            status: Status::Inactive,
            scans_processed: 0,
            points_processed: 0,
            start_time: 0,
            last_frame_time: 0,
            health: Health::Healthy,
            current_scan: None,
        }
    }
}

thread_local! {
    static STATE: RefCell<LidarState> = RefCell::new(LidarState::default());
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

impl lidar_sensor::Guest for Component {
    fn initialize(cfg: Config) -> Result<(), String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            // Validate configuration
            if cfg.range_meters <= 0.0 || cfg.range_meters > 200.0 {
                return Err("Invalid range (must be 0-200 meters)".to_string());
            }
            if cfg.scan_rate_hz <= 0.0 || cfg.scan_rate_hz > 50.0 {
                return Err("Invalid scan rate (must be 0-50 Hz)".to_string());
            }

            println!(
                "Lidar: Initializing {:.1}m range, {:.1}° FOV, {:.1} Hz",
                cfg.range_meters, cfg.field_of_view_degrees, cfg.scan_rate_hz
            );

            s.config = cfg;
            s.status = Status::Initializing;
            s.scans_processed = 0;
            s.points_processed = 0;
            s.current_scan = None;

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
                return Err("Lidar already active".to_string());
            }

            println!("Lidar: Starting scanning");
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
                return Err("Lidar not active".to_string());
            }

            println!("Lidar: Stopping scanning");
            s.status = Status::Inactive;
            s.current_scan = None;

            Ok(())
        })
    }

    fn process_frame() -> Result<Scan, String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            if !matches!(s.status, Status::Active) {
                return Err("Lidar not active".to_string());
            }

            let now = get_timestamp_ms();
            s.scans_processed += 1;
            s.last_frame_time = now;

            // Simulate lidar point cloud generation
            let mut points = Vec::new();
            let point_count = 100 + (s.scans_processed % 50) as usize; // Varying point count

            for i in 0..point_count {
                let angle = (i as f32 / point_count as f32) * 2.0 * 3.14159; // Full circle
                let range = 10.0 + (i as f32 * 0.1 + s.scans_processed as f32 * 0.01).sin() * 30.0;

                if range <= s.config.range_meters {
                    let x = range * angle.cos();
                    let y = range * angle.sin();
                    let z = (s.scans_processed as f32 * 0.02).sin() * 2.0; // Slight height variation

                    points.push(Point {
                        x,
                        y,
                        z,
                        intensity: 0.5 + (i as f32 * 0.1).sin() * 0.3,
                        timestamp: now,
                    });
                }
            }

            s.points_processed += points.len() as u64;

            let scan = Scan {
                points,
                timestamp: now,
                scan_id: s.scans_processed,
            };

            s.current_scan = Some(scan.clone());

            Ok(scan)
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

            let average_points_per_scan = if s.scans_processed > 0 {
                s.points_processed as f32 / s.scans_processed as f32
            } else {
                0.0
            };

            Stats {
                scans_processed: s.scans_processed,
                points_processed: s.points_processed,
                average_points_per_scan,
                cpu_percent: 25.0 + (elapsed_sec * 0.03).sin() * 5.0,
                memory_mb: 256,
                power_watts: 35.0 + (elapsed_sec * 0.01).cos() * 3.0,
            }
        })
    }

    fn reset_stats() {
        STATE.with(|state| {
            let mut s = state.borrow_mut();
            s.scans_processed = 0;
            s.points_processed = 0;
            s.start_time = get_timestamp_ms();
            s.health = Health::Healthy;
            s.current_scan = None;
            println!("Lidar: Statistics reset");
        });
    }
}

impl diagnostics::Guest for Component {
    fn get_health() -> Health {
        STATE.with(|state| state.borrow().health.clone())
    }

    fn run_diagnostics() -> Vec<TestResult> {
        let mut results = vec![];

        // Test 1: Laser diode
        results.push(TestResult {
            name: "laser_diode".to_string(),
            passed: true,
            message: "905nm laser diode operational".to_string(),
            duration_ms: 30.0,
        });

        // Test 2: Photodetector
        results.push(TestResult {
            name: "photodetector".to_string(),
            passed: true,
            message: "APD photodetector calibrated".to_string(),
            duration_ms: 25.0,
        });

        // Test 3: Rotation mechanism
        results.push(TestResult {
            name: "rotation_mechanism".to_string(),
            passed: true,
            message: "Mechanical rotation stable".to_string(),
            duration_ms: 40.0,
        });

        // Test 4: Point cloud quality
        STATE.with(|state| {
            let s = state.borrow();
            let quality_ok = s.points_processed > 0;

            results.push(TestResult {
                name: "point_cloud_quality".to_string(),
                passed: quality_ok,
                message: if quality_ok {
                    format!("Point cloud generation OK: {} points", s.points_processed)
                } else {
                    "No point cloud data".to_string()
                },
                duration_ms: 20.0,
            });
        });

        results
    }

    fn get_report() -> String {
        STATE.with(|state| {
            let s = state.borrow();
            let stats = <Component as lidar_sensor::Guest>::get_stats();

            format!(
                r#"Lidar ECU Diagnostic Report
============================
Status: {:?}
Health: {:?}

Configuration:
  Range: {:.1} meters
  Resolution: {:.1} cm
  Field of View: {:.1}°
  Scan Rate: {:.1} Hz
  Detection Threshold: {:.2}

Performance:
  Scans processed: {}
  Points processed: {}
  Average points/scan: {:.1}
  CPU usage: {:.1}%
  Memory usage: {} MB
  Power consumption: {:.1}W

Current Scan: {}
Lidar Info:
  Laser: 905nm diode
  Photodetector: APD
  Rotation: Mechanical
  Point Cloud: Active
"#,
                s.status,
                s.health,
                s.config.range_meters,
                s.config.resolution_cm,
                s.config.field_of_view_degrees,
                s.config.scan_rate_hz,
                s.config.detection_threshold,
                stats.scans_processed,
                stats.points_processed,
                stats.average_points_per_scan,
                stats.cpu_percent,
                stats.memory_mb,
                stats.power_watts,
                if s.current_scan.is_some() {
                    "Available"
                } else {
                    "None"
                }
            )
        })
    }
}

// Export the component with multi-interface support
lidar_ecu_bindings::export!(Component with_types_in lidar_ecu_bindings);
