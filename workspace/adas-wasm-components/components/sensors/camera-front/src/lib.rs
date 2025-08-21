// Camera Front ECU Component - Complex multi-interface implementation
use camera_front_ecu_bindings::exports::adas::camera_front::{
    camera_sensor::{self, Config, FrameInfo, Stats, Status},
    diagnostics::{self, Health, TestResult},
};

use std::cell::RefCell;
use std::time::{SystemTime, UNIX_EPOCH};

// Component state
struct CameraState {
    config: Config,
    status: Status,
    frames_processed: u64,
    frames_dropped: u64,
    start_time: u64,
    last_frame_time: u64,
    health: Health,
}

impl Default for CameraState {
    fn default() -> Self {
        Self {
            config: Config {
                width: 1920,
                height: 1080,
                fps: 30,
                format: "YUV420".to_string(),
                auto_exposure: true,
                auto_white_balance: true,
            },
            status: Status::Inactive,
            frames_processed: 0,
            frames_dropped: 0,
            start_time: 0,
            last_frame_time: 0,
            health: Health::Healthy,
        }
    }
}

thread_local! {
    static STATE: RefCell<CameraState> = RefCell::new(CameraState::default());
}

// Helper to get current timestamp in milliseconds
fn get_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// Component implementation with unified interface
struct Component;

impl camera_sensor::Guest for Component {
    // === SENSOR OPERATIONS ===

    fn initialize(cfg: Config) -> Result<(), String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            // Validate configuration
            if cfg.width == 0 || cfg.height == 0 {
                return Err("Invalid resolution".to_string());
            }
            if cfg.fps == 0 || cfg.fps > 120 {
                return Err("Invalid frame rate".to_string());
            }

            println!(
                "Camera Front: Initializing {}x{} @ {} FPS, format: {}",
                cfg.width, cfg.height, cfg.fps, cfg.format
            );

            s.config = cfg;
            s.status = Status::Initializing;
            s.frames_processed = 0;
            s.frames_dropped = 0;

            // Simulate initialization delay
            s.status = Status::Inactive;
            s.health = Health::Healthy;

            Ok(())
        })
    }

    fn start() -> Result<(), String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            if matches!(s.status, Status::Active) {
                return Err("Camera already active".to_string());
            }

            println!("Camera Front: Starting capture");
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
                return Err("Camera not active".to_string());
            }

            println!("Camera Front: Stopping capture");
            s.status = Status::Inactive;

            Ok(())
        })
    }

    fn process_frame() -> Result<FrameInfo, String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            if !matches!(s.status, Status::Active) {
                return Err("Camera not active".to_string());
            }

            let now = get_timestamp_ms();
            let frame_interval = 1000 / s.config.fps as u64;

            // Check if we're keeping up with frame rate
            if now - s.last_frame_time > frame_interval * 2 {
                s.frames_dropped += 1;
                s.health = Health::Degraded;
            }

            s.frames_processed += 1;
            s.last_frame_time = now;

            // Simulate varying exposure based on frame number
            let exposure_ms = 8.0 + (s.frames_processed as f32 * 0.1).sin() * 2.0;
            let gain = 1.0 + (s.frames_processed as f32 * 0.05).cos() * 0.5;

            Ok(FrameInfo {
                timestamp: now,
                frame_number: s.frames_processed,
                exposure_ms,
                gain,
                temperature_celsius: 45.0 + (s.frames_processed as f32 * 0.01).sin() * 5.0,
            })
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

            let average_fps = if elapsed_sec > 0.0 {
                (s.frames_processed as f32) / elapsed_sec
            } else {
                0.0
            };

            Stats {
                frames_processed: s.frames_processed,
                frames_dropped: s.frames_dropped,
                average_fps,
                cpu_percent: 15.5 + (elapsed_sec * 0.1).sin() * 5.0,
                memory_mb: 128,
                bandwidth_mbps: (s.config.width * s.config.height * s.config.fps * 12) as f32
                    / 1_000_000.0,
            }
        })
    }

    fn reset_stats() {
        STATE.with(|state| {
            let mut s = state.borrow_mut();
            s.frames_processed = 0;
            s.frames_dropped = 0;
            s.start_time = get_timestamp_ms();
            s.health = Health::Healthy;
            println!("Camera Front: Statistics reset");
        });
    }
}

impl diagnostics::Guest for Component {
    fn get_health() -> Health {
        STATE.with(|state| state.borrow().health.clone())
    }

    fn run_diagnostics() -> Vec<TestResult> {
        let mut results = vec![];

        // Test 1: Camera sensor connectivity
        results.push(TestResult {
            name: "sensor_connectivity".to_string(),
            passed: true,
            message: "MIPI CSI-2 interface operational".to_string(),
            duration_ms: 15.0,
        });

        // Test 2: Image Signal Processor
        results.push(TestResult {
            name: "isp_pipeline".to_string(),
            passed: true,
            message: "ISP pipeline stages configured correctly".to_string(),
            duration_ms: 25.0,
        });

        // Test 3: Frame timing
        STATE.with(|state| {
            let s = state.borrow();
            let timing_ok = s.frames_dropped < s.frames_processed / 100; // Less than 1% drop rate

            results.push(TestResult {
                name: "frame_timing".to_string(),
                passed: timing_ok,
                message: if timing_ok {
                    format!(
                        "Frame timing within tolerance: {} dropped",
                        s.frames_dropped
                    )
                } else {
                    format!("Excessive frame drops: {}", s.frames_dropped)
                },
                duration_ms: 5.0,
            });
        });

        // Test 4: Temperature check
        let temp_ok = true; // Simulated temperature is always in range
        results.push(TestResult {
            name: "temperature_check".to_string(),
            passed: temp_ok,
            message: "Sensor temperature within operating range".to_string(),
            duration_ms: 10.0,
        });

        results
    }

    fn get_report() -> String {
        STATE.with(|state| {
            let s = state.borrow();
            let stats = <Component as camera_sensor::Guest>::get_stats();

            format!(
                r#"Camera Front ECU Diagnostic Report
=====================================
Status: {:?}
Health: {:?}

Configuration:
  Resolution: {}x{} @ {} FPS
  Format: {}
  Auto-exposure: {}
  Auto-white-balance: {}

Performance:
  Frames processed: {}
  Frames dropped: {}
  Average FPS: {:.1}
  CPU usage: {:.1}%
  Memory usage: {} MB
  Bandwidth: {:.1} Mbps

Sensor Info:
  Temperature: ~45°C (nominal)
  MIPI CSI-2: Active
  ISP Pipeline: Operational
"#,
                s.status,
                s.health,
                s.config.width,
                s.config.height,
                s.config.fps,
                s.config.format,
                s.config.auto_exposure,
                s.config.auto_white_balance,
                stats.frames_processed,
                stats.frames_dropped,
                stats.average_fps,
                stats.cpu_percent,
                stats.memory_mb,
                stats.bandwidth_mbps
            )
        })
    }
}

// Export the component with unified interface (should work around the multi-interface issue)
camera_front_ecu_bindings::export!(Component with_types_in camera_front_ecu_bindings);
