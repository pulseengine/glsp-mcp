// Camera Surround ECU Component - Multi-interface surround view camera implementation
use camera_surround_ecu_bindings::exports::adas::camera_surround::{
    camera_sensor::{self, CameraFrame, Config, Stats, Status, SurroundView},
    diagnostics::{self, Health, TestResult},
};

use std::cell::RefCell;
use std::time::{SystemTime, UNIX_EPOCH};

// Component state
struct CameraSurroundState {
    config: Config,
    status: Status,
    frames_processed: u64,
    frames_dropped: u64,
    start_time: u64,
    last_frame_time: u64,
    health: Health,
    current_view: Option<SurroundView>,
    stitching_failures: u64,
}

impl Default for CameraSurroundState {
    fn default() -> Self {
        Self {
            config: Config {
                camera_count: 4,
                resolution_width: 1920,
                resolution_height: 1080,
                fps: 30,
                format: "YUV420".to_string(),
                stitching_enabled: true,
                overlap_degrees: 10.0,
            },
            status: Status::Inactive,
            frames_processed: 0,
            frames_dropped: 0,
            start_time: 0,
            last_frame_time: 0,
            health: Health::Healthy,
            current_view: None,
            stitching_failures: 0,
        }
    }
}

thread_local! {
    static STATE: RefCell<CameraSurroundState> = RefCell::new(CameraSurroundState::default());
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

impl camera_sensor::Guest for Component {
    fn initialize(cfg: Config) -> Result<(), String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            // Validate configuration
            if cfg.camera_count == 0 || cfg.camera_count > 8 {
                return Err("Invalid camera count (must be 1-8)".to_string());
            }
            if cfg.fps == 0 || cfg.fps > 60 {
                return Err("Invalid frame rate (must be 1-60 fps)".to_string());
            }

            println!(
                "Camera Surround: Initializing {} cameras, {}x{} @ {} fps",
                cfg.camera_count, cfg.resolution_width, cfg.resolution_height, cfg.fps
            );

            s.config = cfg;
            s.status = Status::Initializing;
            s.frames_processed = 0;
            s.frames_dropped = 0;
            s.stitching_failures = 0;
            s.current_view = None;

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
                return Err("Camera surround already active".to_string());
            }

            println!("Camera Surround: Starting capture");
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
                return Err("Camera surround not active".to_string());
            }

            println!("Camera Surround: Stopping capture");
            s.status = Status::Inactive;
            s.current_view = None;

            Ok(())
        })
    }

    fn process_frame() -> Result<SurroundView, String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            if !matches!(s.status, Status::Active) {
                return Err("Camera surround not active".to_string());
            }

            let now = get_timestamp_ms();
            s.frames_processed += 1;
            s.last_frame_time = now;

            // Simulate camera frames from multiple cameras
            let mut camera_frames = Vec::new();
            let positions = [
                "front",
                "rear",
                "left",
                "right",
                "front-left",
                "front-right",
                "rear-left",
                "rear-right",
            ];

            for i in 0..s.config.camera_count {
                let position = positions[i as usize % positions.len()];
                let exposure_var = (s.frames_processed as f32 * 0.01 + i as f32).sin() * 5.0;
                let gain_var = (s.frames_processed as f32 * 0.02 + i as f32).cos() * 2.0;

                camera_frames.push(CameraFrame {
                    camera_id: i,
                    position: position.to_string(),
                    image_data: format!("cam{}_frame_{}", i, s.frames_processed),
                    exposure_ms: 33.0 + exposure_var,
                    gain: 1.0 + gain_var,
                });
            }

            // Simulate stitching process
            let stitched_image = if s.config.stitching_enabled {
                // Occasionally simulate stitching failure
                if s.frames_processed % 100 == 0 {
                    s.stitching_failures += 1;
                    s.health = Health::Degraded;
                    None
                } else {
                    Some(format!("stitched_panorama_{}", s.frames_processed))
                }
            } else {
                None
            };

            let surround_view = SurroundView {
                timestamp: now,
                frame_number: s.frames_processed,
                camera_frames,
                stitched_image,
            };

            s.current_view = Some(surround_view.clone());

            Ok(surround_view)
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

            let stitching_success_rate = if s.frames_processed > 0 && s.config.stitching_enabled {
                ((s.frames_processed - s.stitching_failures) as f32 / s.frames_processed as f32)
                    * 100.0
            } else {
                100.0
            };

            Stats {
                frames_processed: s.frames_processed,
                frames_dropped: s.frames_dropped,
                average_fps: if elapsed_sec > 0.0 {
                    s.frames_processed as f32 / elapsed_sec
                } else {
                    0.0
                },
                stitching_success_rate,
                cpu_percent: 45.0 + (elapsed_sec * 0.02).sin() * 8.0,
                memory_mb: 512,
                bandwidth_mbps: s.config.camera_count as f32 * 100.0,
            }
        })
    }

    fn reset_stats() {
        STATE.with(|state| {
            let mut s = state.borrow_mut();
            s.frames_processed = 0;
            s.frames_dropped = 0;
            s.stitching_failures = 0;
            s.start_time = get_timestamp_ms();
            s.health = Health::Healthy;
            s.current_view = None;
            println!("Camera Surround: Statistics reset");
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

            // Test 1: Camera connectivity
            for i in 0..s.config.camera_count {
                results.push(TestResult {
                    name: format!("camera_{}_connectivity", i),
                    passed: true,
                    message: format!("Camera {} connected and responsive", i),
                    duration_ms: 15.0,
                });
            }

            // Test 2: Image processing pipeline
            results.push(TestResult {
                name: "image_processing".to_string(),
                passed: true,
                message: "Image processing pipeline operational".to_string(),
                duration_ms: 25.0,
            });

            // Test 3: Stitching algorithm
            let stitching_ok = s.stitching_failures < s.frames_processed / 50; // Less than 2% failure rate
            results.push(TestResult {
                name: "stitching_algorithm".to_string(),
                passed: stitching_ok,
                message: if stitching_ok {
                    format!("Stitching stable: {} failures", s.stitching_failures)
                } else {
                    format!("Excessive stitching failures: {}", s.stitching_failures)
                },
                duration_ms: 30.0,
            });

            // Test 4: Memory usage
            results.push(TestResult {
                name: "memory_usage".to_string(),
                passed: true,
                message: "Memory usage within acceptable limits".to_string(),
                duration_ms: 10.0,
            });
        });

        results
    }

    fn get_report() -> String {
        STATE.with(|state| {
            let s = state.borrow();
            let stats = <Component as camera_sensor::Guest>::get_stats();

            format!(
                r#"Camera Surround ECU Diagnostic Report
======================================
Status: {:?}
Health: {:?}

Configuration:
  Camera count: {}
  Resolution: {}x{}
  Frame rate: {} fps
  Format: {}
  Stitching enabled: {}
  Overlap: {:.1}°

Performance:
  Frames processed: {}
  Frames dropped: {}
  Average FPS: {:.1}
  Stitching success rate: {:.1}%
  CPU usage: {:.1}%
  Memory usage: {} MB
  Bandwidth: {:.1} Mbps

Current View: {}
Camera Info:
  Multi-camera surround view system
  Real-time image stitching
  360° coverage capability
"#,
                s.status,
                s.health,
                s.config.camera_count,
                s.config.resolution_width,
                s.config.resolution_height,
                s.config.fps,
                s.config.format,
                s.config.stitching_enabled,
                s.config.overlap_degrees,
                stats.frames_processed,
                stats.frames_dropped,
                stats.average_fps,
                stats.stitching_success_rate,
                stats.cpu_percent,
                stats.memory_mb,
                stats.bandwidth_mbps,
                if s.current_view.is_some() {
                    "Available"
                } else {
                    "None"
                }
            )
        })
    }
}

// Export the component with multi-interface support
camera_surround_ecu_bindings::export!(Component with_types_in camera_surround_ecu_bindings);
