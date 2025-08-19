// Copyright (c) 2024 GLSP-Rust Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

//! Sensor data bridge for WASM component execution
//!
//! Provides a bridge between the database sensor data and WASM component execution,
//! enabling components to receive real-time or replay sensor data during execution.

use crate::database::{
    dataset::{DatasetManager, SensorSelector},
    BoxedDatasetManager, SensorQuery, SensorReading, SensorSelection, TimeRange,
};
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tracing::{debug, error, info, warn};

/// Configuration for sensor data bridge
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorBridgeConfig {
    /// Dataset to use for sensor data
    pub dataset_id: String,

    /// Sensor selection configuration
    pub sensor_selection: SensorSelection,

    /// Simulation timing configuration
    pub timing: TimingConfig,

    /// Buffer settings for sensor data
    pub buffer_settings: BufferSettings,

    /// Whether to enable real-time mode
    pub real_time_mode: bool,
}

/// Timing configuration for sensor data replay
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimingConfig {
    /// Playback speed multiplier (1.0 = real-time)
    pub playback_speed: f32,

    /// Start time for replay (None = from beginning)
    pub start_time_us: Option<i64>,

    /// End time for replay (None = to end)
    pub end_time_us: Option<i64>,

    /// Whether to loop the replay
    pub loop_replay: bool,

    /// Synchronization mode
    pub sync_mode: SyncMode,

    /// Frame rate for simulation (Hz)
    pub target_fps: f32,
}

/// Synchronization modes for sensor data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SyncMode {
    /// Use original sensor timestamps
    OriginalTimestamp,

    /// Synchronize to simulation time
    SimulationTime,

    /// Fixed frame rate
    FixedFrameRate,

    /// Real-time with current timestamps
    RealTime,
}

/// Buffer settings for sensor data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BufferSettings {
    /// Maximum number of readings to buffer per sensor
    pub max_buffer_size: usize,

    /// Prefetch buffer size
    pub prefetch_size: usize,

    /// Memory limit for total buffer (bytes)
    pub max_memory_mb: u32,

    /// Whether to compress buffered data
    pub enable_compression: bool,
}

/// Sensor data frame for a specific time point
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorFrame {
    /// Simulation timestamp (microseconds)
    pub timestamp_us: i64,

    /// Sensor readings at this timestamp
    pub readings: HashMap<String, SensorReading>,

    /// Frame sequence number
    pub frame_number: u64,

    /// Whether this is an interpolated frame
    pub is_interpolated: bool,
}

/// Status of the sensor bridge
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeStatus {
    /// Whether the bridge is active
    pub is_active: bool,

    /// Current simulation time
    pub current_time_us: i64,

    /// Total duration of the dataset
    pub total_duration_us: i64,

    /// Playback progress (0.0 - 1.0)
    pub progress: f32,

    /// Current playback speed
    pub playback_speed: f32,

    /// Number of sensors active
    pub active_sensors: usize,

    /// Buffer statistics
    pub buffer_stats: BufferStats,

    /// Last update timestamp
    pub last_update: DateTime<Utc>,
}

/// Buffer statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BufferStats {
    /// Total buffered readings across all sensors
    pub total_buffered_readings: usize,

    /// Memory usage in MB
    pub memory_usage_mb: f32,

    /// Buffer utilization percentage
    pub buffer_utilization: f32,

    /// Number of cache hits
    pub cache_hits: u64,

    /// Number of cache misses
    pub cache_misses: u64,
}

/// WASM sensor interface for components
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WasmSensorInterface {
    /// Available sensors
    pub available_sensors: Vec<String>,

    /// Current frame data
    pub current_frame: Option<SensorFrame>,

    /// Simulation time info
    pub simulation_time: SimulationTimeInfo,
}

/// Simulation time information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationTimeInfo {
    /// Current simulation timestamp (microseconds)
    pub current_time_us: i64,

    /// Simulation start time
    pub start_time_us: i64,

    /// Delta time since last frame (microseconds)
    pub delta_time_us: i64,

    /// Frame number
    pub frame_number: u64,

    /// Real-world time when this frame was created
    pub real_time: DateTime<Utc>,
}

/// Sensor data bridge implementation
pub struct SensorDataBridge {
    /// Configuration
    config: SensorBridgeConfig,

    /// Dataset manager for data access
    dataset_manager: Option<Arc<Mutex<BoxedDatasetManager>>>,

    /// Current bridge status
    status: Arc<RwLock<BridgeStatus>>,

    /// Sensor data buffers
    buffers: Arc<Mutex<HashMap<String, Vec<SensorReading>>>>,

    /// Current simulation time
    simulation_time: Arc<Mutex<i64>>,

    /// Frame counter
    frame_counter: Arc<Mutex<u64>>,

    /// Time range for current dataset
    time_range: Option<TimeRange>,

    /// Whether the bridge is running
    is_running: Arc<RwLock<bool>>,
}

impl SensorDataBridge {
    /// Create a new sensor data bridge
    pub async fn new(
        config: SensorBridgeConfig,
        dataset_manager: Option<Arc<Mutex<BoxedDatasetManager>>>,
    ) -> Result<Self> {
        info!(
            "Creating sensor data bridge for dataset: {}",
            config.dataset_id
        );

        // Get time range for the dataset
        let time_range = if let Some(ref dm) = dataset_manager {
            let dm_guard = dm.lock().await;
            match dm_guard.get_dataset(&config.dataset_id).await {
                Ok(Some(dataset)) => Some(dataset.time_range),
                Ok(None) => {
                    warn!("Dataset {} not found", config.dataset_id);
                    None
                }
                Err(e) => {
                    error!("Failed to get dataset {}: {}", config.dataset_id, e);
                    None
                }
            }
        } else {
            None
        };

        let total_duration = time_range
            .as_ref()
            .map(|tr| tr.end_time_us - tr.start_time_us)
            .unwrap_or(0);

        let status = BridgeStatus {
            is_active: false,
            current_time_us: config.timing.start_time_us.unwrap_or(0),
            total_duration_us: total_duration,
            progress: 0.0,
            playback_speed: config.timing.playback_speed,
            active_sensors: config.sensor_selection.selected_sensors.len(),
            buffer_stats: BufferStats {
                total_buffered_readings: 0,
                memory_usage_mb: 0.0,
                buffer_utilization: 0.0,
                cache_hits: 0,
                cache_misses: 0,
            },
            last_update: Utc::now(),
        };

        Ok(Self {
            config,
            dataset_manager,
            status: Arc::new(RwLock::new(status)),
            buffers: Arc::new(Mutex::new(HashMap::new())),
            simulation_time: Arc::new(Mutex::new(0)),
            frame_counter: Arc::new(Mutex::new(0)),
            time_range,
            is_running: Arc::new(RwLock::new(false)),
        })
    }

    /// Start the sensor data bridge
    pub async fn start(&self) -> Result<()> {
        info!("Starting sensor data bridge");

        {
            let mut is_running = self.is_running.write().await;
            if *is_running {
                return Err(anyhow!("Bridge is already running"));
            }
            *is_running = true;
        }

        // Initialize simulation time
        let start_time = self.config.timing.start_time_us.unwrap_or_else(|| {
            self.time_range
                .as_ref()
                .map(|tr| tr.start_time_us)
                .unwrap_or(0)
        });

        {
            let mut sim_time = self.simulation_time.lock().await;
            *sim_time = start_time;
        }

        // Update status
        {
            let mut status = self.status.write().await;
            status.is_active = true;
            status.current_time_us = start_time;
            status.last_update = Utc::now();
        }

        // Prefetch initial data
        self.prefetch_data(start_time).await?;

        info!("Sensor data bridge started successfully");
        Ok(())
    }

    /// Stop the sensor data bridge
    pub async fn stop(&self) -> Result<()> {
        info!("Stopping sensor data bridge");

        {
            let mut is_running = self.is_running.write().await;
            *is_running = false;
        }

        // Clear buffers
        {
            let mut buffers = self.buffers.lock().await;
            buffers.clear();
        }

        // Update status
        {
            let mut status = self.status.write().await;
            status.is_active = false;
            status.last_update = Utc::now();
        }

        info!("Sensor data bridge stopped");
        Ok(())
    }

    /// Get current sensor frame for WASM components
    pub async fn get_current_frame(&self) -> Result<Option<SensorFrame>> {
        let current_time = {
            let sim_time = self.simulation_time.lock().await;
            *sim_time
        };

        let frame_number = {
            let counter = self.frame_counter.lock().await;
            *counter
        };

        // Get sensor readings for current time
        let readings = self.get_readings_at_time(current_time).await?;

        if readings.is_empty() {
            return Ok(None);
        }

        Ok(Some(SensorFrame {
            timestamp_us: current_time,
            readings,
            frame_number,
            is_interpolated: false, // Interpolation not implemented yet
        }))
    }

    /// Advance simulation by one frame
    pub async fn advance_frame(&self) -> Result<bool> {
        let is_running = {
            let running_guard = self.is_running.read().await;
            *running_guard
        };

        if !is_running {
            return Ok(false);
        }

        // Calculate time step based on target FPS
        let time_step_us = (1_000_000.0 / self.config.timing.target_fps) as i64;
        let speed_adjusted_step = (time_step_us as f32 / self.config.timing.playback_speed) as i64;

        let (new_time, should_continue) = {
            let mut sim_time = self.simulation_time.lock().await;
            *sim_time += speed_adjusted_step;

            // Check if we've reached the end
            let end_time = self.config.timing.end_time_us.unwrap_or_else(|| {
                self.time_range
                    .as_ref()
                    .map(|tr| tr.end_time_us)
                    .unwrap_or(i64::MAX)
            });

            if *sim_time >= end_time {
                if self.config.timing.loop_replay {
                    // Loop back to start
                    let start_time = self.config.timing.start_time_us.unwrap_or_else(|| {
                        self.time_range
                            .as_ref()
                            .map(|tr| tr.start_time_us)
                            .unwrap_or(0)
                    });
                    *sim_time = start_time;
                    (*sim_time, true)
                } else {
                    // Stop at end
                    (*sim_time, false)
                }
            } else {
                (*sim_time, true)
            }
        };

        // Increment frame counter
        {
            let mut counter = self.frame_counter.lock().await;
            *counter += 1;
        }

        // Update status
        self.update_status().await;

        debug!("Advanced to simulation time: {}μs", new_time);
        Ok(should_continue)
    }

    /// Get WASM sensor interface for components
    pub async fn get_wasm_interface(&self) -> Result<WasmSensorInterface> {
        let current_frame = self.get_current_frame().await?;

        let simulation_time = {
            let sim_time = self.simulation_time.lock().await;
            let frame_num = self.frame_counter.lock().await;

            SimulationTimeInfo {
                current_time_us: *sim_time,
                start_time_us: self.config.timing.start_time_us.unwrap_or(0),
                delta_time_us: (1_000_000.0 / self.config.timing.target_fps) as i64,
                frame_number: *frame_num,
                real_time: Utc::now(),
            }
        };

        Ok(WasmSensorInterface {
            available_sensors: self.config.sensor_selection.selected_sensors.clone(),
            current_frame,
            simulation_time,
        })
    }

    /// Get bridge status
    pub async fn get_status(&self) -> BridgeStatus {
        let status = self.status.read().await;
        status.clone()
    }

    /// Prefetch sensor data for the given time range
    async fn prefetch_data(&self, start_time_us: i64) -> Result<()> {
        if self.dataset_manager.is_none() {
            return Ok(());
        }

        let end_time_us =
            start_time_us + (self.config.buffer_settings.prefetch_size as i64 * 1_000_000);

        debug!(
            "Prefetching data from {}μs to {}μs",
            start_time_us, end_time_us
        );

        let dm = self.dataset_manager.as_ref().unwrap();
        let dm_guard = dm.lock().await;

        let query = SensorQuery {
            sensor_ids: self.config.sensor_selection.selected_sensors.clone(),
            start_time_us,
            end_time_us,
            limit: Some(self.config.buffer_settings.max_buffer_size),
            min_quality: self.config.sensor_selection.min_quality,
            downsample_interval_us: None,
            data_types: None,
        };

        match dm_guard
            .query_selected_data(&self.config.dataset_id, &query)
            .await
        {
            Ok(readings) => {
                let mut buffers = self.buffers.lock().await;

                // Group readings by sensor
                for reading in readings {
                    let sensor_buffer = buffers
                        .entry(reading.sensor_id.clone())
                        .or_insert_with(Vec::new);

                    // Keep buffer within limits
                    if sensor_buffer.len() >= self.config.buffer_settings.max_buffer_size {
                        sensor_buffer.remove(0); // Remove oldest
                    }

                    sensor_buffer.push(reading);
                }

                debug!("Prefetched data for {} sensors", buffers.len());
            }
            Err(e) => {
                error!("Failed to prefetch data: {}", e);
                return Err(anyhow!("Prefetch failed: {}", e));
            }
        }

        Ok(())
    }

    /// Get sensor readings at a specific time
    async fn get_readings_at_time(
        &self,
        timestamp_us: i64,
    ) -> Result<HashMap<String, SensorReading>> {
        let mut readings = HashMap::new();

        let buffers = self.buffers.lock().await;

        for (sensor_id, buffer) in buffers.iter() {
            // Find the closest reading to the target timestamp
            if let Some(reading) = Self::find_closest_reading(buffer, timestamp_us) {
                readings.insert(sensor_id.clone(), reading.clone());
            }
        }

        Ok(readings)
    }

    /// Find the closest reading to a target timestamp
    fn find_closest_reading(
        buffer: &[SensorReading],
        target_time_us: i64,
    ) -> Option<&SensorReading> {
        buffer
            .iter()
            .min_by_key(|reading| (reading.timestamp_us - target_time_us).abs())
    }

    /// Update bridge status
    async fn update_status(&self) {
        let mut status = self.status.write().await;

        let current_time = {
            let sim_time = self.simulation_time.lock().await;
            *sim_time
        };

        // Calculate progress
        let progress = if let Some(ref time_range) = self.time_range {
            let duration = time_range.end_time_us - time_range.start_time_us;
            if duration > 0 {
                ((current_time - time_range.start_time_us) as f32 / duration as f32).clamp(0.0, 1.0)
            } else {
                0.0
            }
        } else {
            0.0
        };

        // Calculate buffer stats
        let buffer_stats = {
            let buffers = self.buffers.try_lock();
            if let Ok(buffers) = buffers {
                let total_readings = buffers.values().map(|b| b.len()).sum();
                let memory_usage = buffers
                    .values()
                    .flat_map(|b| b.iter())
                    .map(|r| r.payload.len())
                    .sum::<usize>() as f32
                    / 1_048_576.0; // Convert to MB

                BufferStats {
                    total_buffered_readings: total_readings,
                    memory_usage_mb: memory_usage,
                    buffer_utilization: total_readings as f32
                        / (self.config.buffer_settings.max_buffer_size * buffers.len()).max(1)
                            as f32,
                    cache_hits: status.buffer_stats.cache_hits, // Preserve existing
                    cache_misses: status.buffer_stats.cache_misses, // Preserve existing
                }
            } else {
                status.buffer_stats.clone()
            }
        };

        status.current_time_us = current_time;
        status.progress = progress;
        status.buffer_stats = buffer_stats;
        status.last_update = Utc::now();
    }
}

impl Default for TimingConfig {
    fn default() -> Self {
        Self {
            playback_speed: 1.0,
            start_time_us: None,
            end_time_us: None,
            loop_replay: false,
            sync_mode: SyncMode::OriginalTimestamp,
            target_fps: 30.0,
        }
    }
}

impl Default for BufferSettings {
    fn default() -> Self {
        Self {
            max_buffer_size: 1000,
            prefetch_size: 100,
            max_memory_mb: 100,
            enable_compression: false,
        }
    }
}

impl Default for SensorBridgeConfig {
    fn default() -> Self {
        Self {
            dataset_id: "default".to_string(),
            sensor_selection: Default::default(),
            timing: TimingConfig::default(),
            buffer_settings: BufferSettings::default(),
            real_time_mode: false,
        }
    }
}

impl std::fmt::Debug for SensorDataBridge {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SensorDataBridge")
            .field("config", &self.config)
            .field("dataset_manager", &self.dataset_manager.is_some())
            .field("time_range", &self.time_range)
            .finish()
    }
}
