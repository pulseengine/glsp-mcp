// Ultrasonic ECU Component - Multi-interface ultrasonic sensor array implementation
use ultrasonic_ecu_bindings::exports::adas::ultrasonic::{
    diagnostics::{self, Health, TestResult},
    ultrasonic_sensor::{
        self, Config, DistanceReading, SensorArrayData, SensorPosition, Stats, Status,
    },
};

use std::cell::RefCell;
use std::time::{SystemTime, UNIX_EPOCH};

// Component state
struct UltrasonicState {
    config: Config,
    status: Status,
    measurements_processed: u64,
    out_of_range_detections: u64,
    start_time: u64,
    last_frame_time: u64,
    health: Health,
    current_readings: Vec<DistanceReading>,
}

impl Default for UltrasonicState {
    fn default() -> Self {
        // Default ultrasonic sensor configuration for parking assistance
        let default_positions = vec![
            SensorPosition {
                sensor_id: 0,
                position: "front-left".to_string(),
                angle_degrees: -45.0,
                height_cm: 55,
            },
            SensorPosition {
                sensor_id: 1,
                position: "front-center".to_string(),
                angle_degrees: 0.0,
                height_cm: 55,
            },
            SensorPosition {
                sensor_id: 2,
                position: "front-right".to_string(),
                angle_degrees: 45.0,
                height_cm: 55,
            },
            SensorPosition {
                sensor_id: 3,
                position: "rear-left".to_string(),
                angle_degrees: -135.0,
                height_cm: 55,
            },
            SensorPosition {
                sensor_id: 4,
                position: "rear-center".to_string(),
                angle_degrees: 180.0,
                height_cm: 55,
            },
            SensorPosition {
                sensor_id: 5,
                position: "rear-right".to_string(),
                angle_degrees: 135.0,
                height_cm: 55,
            },
        ];

        Self {
            config: Config {
                sensor_count: 6,
                max_range_cm: 200,
                resolution_cm: 1,
                frequency_khz: 40,
                detection_threshold: 0.3,
                position_mapping: default_positions,
            },
            status: Status::Inactive,
            measurements_processed: 0,
            out_of_range_detections: 0,
            start_time: 0,
            last_frame_time: 0,
            health: Health::Healthy,
            current_readings: Vec::new(),
        }
    }
}

thread_local! {
    static STATE: RefCell<UltrasonicState> = RefCell::new(UltrasonicState::default());
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

impl ultrasonic_sensor::Guest for Component {
    fn initialize(cfg: Config) -> Result<(), String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            // Validate configuration
            if cfg.sensor_count == 0 || cfg.sensor_count > 12 {
                return Err("Invalid sensor count (must be 1-12)".to_string());
            }
            if cfg.max_range_cm == 0 || cfg.max_range_cm > 500 {
                return Err("Invalid max range (must be 1-500 cm)".to_string());
            }
            if cfg.position_mapping.len() != cfg.sensor_count as usize {
                return Err("Position mapping count must match sensor count".to_string());
            }

            println!(
                "Ultrasonic: Initializing {} sensors, max range: {} cm, frequency: {} kHz",
                cfg.sensor_count, cfg.max_range_cm, cfg.frequency_khz
            );

            s.config = cfg;
            s.status = Status::Initializing;
            s.measurements_processed = 0;
            s.out_of_range_detections = 0;
            s.current_readings.clear();

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
                return Err("Ultrasonic sensors already active".to_string());
            }

            println!("Ultrasonic: Starting measurement");
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
                return Err("Ultrasonic sensors not active".to_string());
            }

            println!("Ultrasonic: Stopping measurement");
            s.status = Status::Inactive;
            s.current_readings.clear();

            Ok(())
        })
    }

    fn process_frame() -> Result<SensorArrayData, String> {
        STATE.with(|state| {
            let mut s = state.borrow_mut();

            if !matches!(s.status, Status::Active) {
                return Err("Ultrasonic sensors not active".to_string());
            }

            let now = get_timestamp_ms();
            s.measurements_processed += 1;
            s.last_frame_time = now;

            // Simulate ultrasonic sensor readings
            let mut readings = Vec::new();

            for i in 0..s.config.sensor_count {
                let base_distance = 80.0 + (i as f32 * 20.0);
                let time_variation =
                    (s.measurements_processed as f32 * 0.05 + i as f32).sin() * 30.0;
                let distance_cm = (base_distance + time_variation).max(10.0) as u32;

                // Check if reading is out of range
                let is_out_of_range = distance_cm >= s.config.max_range_cm;
                if is_out_of_range {
                    s.out_of_range_detections += 1;
                }

                // Calculate confidence based on distance and signal strength
                let confidence = if is_out_of_range {
                    0.1
                } else {
                    let signal_strength = 1.0 - (distance_cm as f32 / s.config.max_range_cm as f32);
                    (signal_strength * 0.8 + 0.2).min(1.0)
                };

                readings.push(DistanceReading {
                    sensor_id: i,
                    distance_cm: if is_out_of_range {
                        s.config.max_range_cm
                    } else {
                        distance_cm
                    },
                    confidence,
                    timestamp: now,
                });
            }

            // Simulate occasional sensor degradation
            if s.measurements_processed % 200 == 0 {
                s.health = Health::Degraded;
            }

            s.current_readings = readings.clone();

            let sensor_data = SensorArrayData {
                readings,
                timestamp: now,
                frame_number: s.measurements_processed,
            };

            Ok(sensor_data)
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

            let average_distance_cm = if !s.current_readings.is_empty() {
                s.current_readings
                    .iter()
                    .map(|r| r.distance_cm as f32)
                    .sum::<f32>()
                    / s.current_readings.len() as f32
            } else {
                0.0
            };

            Stats {
                measurements_processed: s.measurements_processed,
                out_of_range_detections: s.out_of_range_detections,
                average_distance_cm,
                cpu_percent: 5.0 + (elapsed_sec * 0.08).sin() * 1.5,
                memory_mb: 16,
                power_watts: 3.0 + (elapsed_sec * 0.04).cos() * 0.5,
            }
        })
    }

    fn reset_stats() {
        STATE.with(|state| {
            let mut s = state.borrow_mut();
            s.measurements_processed = 0;
            s.out_of_range_detections = 0;
            s.start_time = get_timestamp_ms();
            s.health = Health::Healthy;
            s.current_readings.clear();
            println!("Ultrasonic: Statistics reset");
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

            // Test 1: Sensor connectivity
            for i in 0..s.config.sensor_count {
                let sensor_ok = true; // Simulate sensor connectivity check
                results.push(TestResult {
                    name: format!("sensor_{}_connectivity", i),
                    passed: sensor_ok,
                    message: if sensor_ok {
                        format!("Sensor {} connected and responsive", i)
                    } else {
                        format!("Sensor {} not responding", i)
                    },
                    duration_ms: 8.0,
                });
            }

            // Test 2: Frequency generation
            results.push(TestResult {
                name: "frequency_generation".to_string(),
                passed: true,
                message: format!("{} kHz ultrasonic frequency stable", s.config.frequency_khz),
                duration_ms: 15.0,
            });

            // Test 3: Signal processing
            results.push(TestResult {
                name: "signal_processing".to_string(),
                passed: true,
                message: "Echo processing and time-of-flight calculation operational".to_string(),
                duration_ms: 12.0,
            });

            // Test 4: Measurement accuracy
            let accuracy_ok = s.out_of_range_detections < s.measurements_processed / 20; // Less than 5% out of range
            results.push(TestResult {
                name: "measurement_accuracy".to_string(),
                passed: accuracy_ok,
                message: if accuracy_ok {
                    format!(
                        "Measurement accuracy good: {} out-of-range readings",
                        s.out_of_range_detections
                    )
                } else {
                    format!(
                        "Too many out-of-range readings: {}",
                        s.out_of_range_detections
                    )
                },
                duration_ms: 10.0,
            });
        });

        results
    }

    fn get_report() -> String {
        STATE.with(|state| {
            let s = state.borrow();
            let stats = <Component as ultrasonic_sensor::Guest>::get_stats();

            let sensor_positions: Vec<String> = s
                .config
                .position_mapping
                .iter()
                .map(|pos| {
                    format!(
                        "  Sensor {}: {} ({:.0}°)",
                        pos.sensor_id, pos.position, pos.angle_degrees
                    )
                })
                .collect();

            format!(
                r#"Ultrasonic ECU Diagnostic Report
=================================
Status: {:?}
Health: {:?}

Configuration:
  Sensor count: {}
  Max range: {} cm
  Resolution: {} cm
  Frequency: {} kHz
  Detection threshold: {:.2}

Sensor Positions:
{}

Performance:
  Measurements processed: {}
  Out-of-range detections: {}
  Average distance: {:.1} cm
  CPU usage: {:.1}%
  Memory usage: {} MB
  Power consumption: {:.1}W

Current Readings: {}
Ultrasonic Info:
  Parking assistance sensors
  360° proximity detection
  High precision distance measurement
"#,
                s.status,
                s.health,
                s.config.sensor_count,
                s.config.max_range_cm,
                s.config.resolution_cm,
                s.config.frequency_khz,
                s.config.detection_threshold,
                sensor_positions.join("\n"),
                stats.measurements_processed,
                stats.out_of_range_detections,
                stats.average_distance_cm,
                stats.cpu_percent,
                stats.memory_mb,
                stats.power_watts,
                s.current_readings.len()
            )
        })
    }
}

// Export the component with multi-interface support
ultrasonic_ecu_bindings::export!(Component with_types_in ultrasonic_ecu_bindings);
