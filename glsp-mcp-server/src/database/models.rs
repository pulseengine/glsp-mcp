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

//! Sensor data models and types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Sensor reading with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorReading {
    /// Unique sensor identifier
    pub sensor_id: String,

    /// Timestamp in microseconds since Unix epoch
    pub timestamp_us: i64,

    /// Type of sensor data
    pub data_type: SensorDataType,

    /// Raw sensor data payload
    pub payload: Vec<u8>,

    /// Data quality score (0.0 = poor, 1.0 = excellent)
    pub quality: f32,

    /// Additional metadata
    pub metadata: HashMap<String, serde_json::Value>,

    /// Optional data checksum for integrity verification
    pub checksum: Option<String>,
}

/// Types of sensor data supported
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "params")]
pub enum SensorDataType {
    /// Camera sensor data
    Camera {
        width: u32,
        height: u32,
        format: ImageFormat,
        fps: Option<f32>,
    },

    /// Radar sensor data
    Radar {
        point_count: u32,
        range_m: f32,
        resolution: RadarResolution,
    },

    /// LiDAR sensor data
    Lidar {
        point_count: u32,
        horizontal_fov: f32,
        vertical_fov: f32,
        range_m: f32,
    },

    /// Ultrasonic sensor data
    Ultrasonic { distance_m: f32, cone_angle: f32 },

    /// IMU (Inertial Measurement Unit) data
    IMU {
        acceleration: Vec3,
        angular_velocity: Vec3,
        orientation: Option<Quaternion>,
    },

    /// GPS sensor data
    GPS {
        latitude: f64,
        longitude: f64,
        altitude: f64,
        accuracy_m: f32,
    },

    /// CAN bus message
    CAN { message_id: u32, data_length: u8 },

    /// Generic sensor data
    Generic {
        sensor_type: String,
        data_size: usize,
    },
}

/// Image formats supported by camera sensors
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ImageFormat {
    RGB24,
    BGR24,
    RGBA32,
    YUV420P,
    NV12,
    GRAY8,
    JPEG,
    PNG,
    H264,
    H265,
}

/// Radar resolution specifications
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RadarResolution {
    pub range_resolution_m: f32,
    pub azimuth_resolution_deg: f32,
    pub elevation_resolution_deg: Option<f32>,
}

/// 3D vector for acceleration, velocity, etc.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Vec3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// Quaternion for orientation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Quaternion {
    pub w: f32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// Query parameters for sensor data retrieval
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorQuery {
    /// Sensors to query (empty = all sensors)
    pub sensor_ids: Vec<String>,

    /// Start time (microseconds since Unix epoch)
    pub start_time_us: i64,

    /// End time (microseconds since Unix epoch)
    pub end_time_us: i64,

    /// Maximum number of readings to return
    pub limit: Option<usize>,

    /// Minimum quality threshold
    pub min_quality: Option<f32>,

    /// Downsample to this interval (microseconds)
    pub downsample_interval_us: Option<i64>,

    /// Data types to include
    pub data_types: Option<Vec<SensorDataType>>,
}

/// Batch of sensor readings for efficient bulk operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorBatch {
    /// All readings in this batch
    pub readings: Vec<SensorReading>,

    /// Batch metadata
    pub batch_id: String,
    pub created_at: DateTime<Utc>,
    pub source: String,
}

/// Sensor metadata and configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorMetadata {
    /// Sensor identifier
    pub sensor_id: String,

    /// Human-readable name
    pub name: String,

    /// Sensor type
    pub sensor_type: SensorDataType,

    /// Installation location/position
    pub location: Option<String>,

    /// Expected sampling rate (Hz)
    pub sampling_rate_hz: Option<f32>,

    /// Calibration data
    pub calibration: Option<HashMap<String, serde_json::Value>>,

    /// When this sensor was first seen
    pub first_seen: DateTime<Utc>,

    /// When this sensor was last seen
    pub last_seen: DateTime<Utc>,

    /// Whether this sensor is currently active
    pub is_active: bool,
}

/// Time range for data availability queries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeRange {
    /// Earliest available data (microseconds since Unix epoch)
    pub start_time_us: i64,

    /// Latest available data (microseconds since Unix epoch)
    pub end_time_us: i64,

    /// Total number of readings in this range
    pub reading_count: u64,

    /// Data size in bytes
    pub data_size_bytes: u64,
}

/// Statistics about sensor data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorStatistics {
    /// Sensor identifier
    pub sensor_id: String,

    /// Time range covered
    pub time_range: TimeRange,

    /// Average quality score
    pub avg_quality: f32,

    /// Average sampling rate (Hz)
    pub avg_sampling_rate_hz: f32,

    /// Number of data gaps detected
    pub gap_count: u32,

    /// Total data size in bytes
    pub total_size_bytes: u64,
}

/// Health status of a database connection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseHealth {
    /// Is the database reachable?
    pub is_connected: bool,

    /// Connection latency in milliseconds
    pub latency_ms: f32,

    /// Database-specific version info
    pub version: Option<String>,

    /// Number of active connections
    pub active_connections: Option<u32>,

    /// Available storage space
    pub available_space_bytes: Option<u64>,

    /// Last health check timestamp
    pub last_check: DateTime<Utc>,

    /// Any error messages
    pub error: Option<String>,
}

impl SensorReading {
    /// Create a new sensor reading
    pub fn new(
        sensor_id: String,
        timestamp_us: i64,
        data_type: SensorDataType,
        payload: Vec<u8>,
    ) -> Self {
        Self {
            sensor_id,
            timestamp_us,
            data_type,
            payload,
            quality: 1.0,
            metadata: HashMap::new(),
            checksum: None,
        }
    }

    /// Calculate data size in bytes
    pub fn data_size(&self) -> usize {
        self.payload.len()
    }

    /// Check if reading is within a time range
    pub fn is_in_range(&self, start_us: i64, end_us: i64) -> bool {
        self.timestamp_us >= start_us && self.timestamp_us <= end_us
    }

    /// Convert timestamp to DateTime
    pub fn timestamp(&self) -> DateTime<Utc> {
        DateTime::from_timestamp(
            self.timestamp_us / 1_000_000,
            ((self.timestamp_us % 1_000_000) * 1000) as u32,
        )
        .unwrap_or_else(Utc::now)
    }
}

impl SensorQuery {
    /// Create a simple time range query
    pub fn time_range(start_us: i64, end_us: i64) -> Self {
        Self {
            sensor_ids: vec![],
            start_time_us: start_us,
            end_time_us: end_us,
            limit: None,
            min_quality: None,
            downsample_interval_us: None,
            data_types: None,
        }
    }

    /// Add sensor IDs to the query
    pub fn with_sensors(mut self, sensor_ids: Vec<String>) -> Self {
        self.sensor_ids = sensor_ids;
        self
    }

    /// Add result limit
    pub fn with_limit(mut self, limit: usize) -> Self {
        self.limit = Some(limit);
        self
    }

    /// Add quality filter
    pub fn with_min_quality(mut self, quality: f32) -> Self {
        self.min_quality = Some(quality);
        self
    }
}

impl Vec3 {
    /// Create a new 3D vector
    pub fn new(x: f32, y: f32, z: f32) -> Self {
        Self { x, y, z }
    }

    /// Calculate magnitude
    pub fn magnitude(&self) -> f32 {
        (self.x * self.x + self.y * self.y + self.z * self.z).sqrt()
    }
}

impl Quaternion {
    /// Create a new quaternion
    pub fn new(w: f32, x: f32, y: f32, z: f32) -> Self {
        Self { w, x, y, z }
    }

    /// Identity quaternion
    pub fn identity() -> Self {
        Self::new(1.0, 0.0, 0.0, 0.0)
    }
}
