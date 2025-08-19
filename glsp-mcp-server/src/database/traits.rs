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

//! Database abstraction traits for exchangeable backends

use crate::database::{
    DatabaseHealth, DatabaseResult, SensorBatch, SensorMetadata, SensorQuery, SensorReading,
    SensorStatistics, TimeRange,
};
use async_trait::async_trait;

/// Core database provider trait
///
/// Provides connection management and basic database operations.
/// All concrete database implementations must implement this trait.
#[async_trait]
pub trait DatabaseProvider: Send + Sync {
    /// Connect to the database
    async fn connect(&mut self) -> DatabaseResult<()>;

    /// Disconnect from the database
    async fn disconnect(&mut self) -> DatabaseResult<()>;

    /// Check if connected
    fn is_connected(&self) -> bool;

    /// Get database health status
    async fn health_check(&self) -> DatabaseResult<DatabaseHealth>;

    /// Get database type identifier
    fn database_type(&self) -> &'static str;

    /// Get connection string (sanitized, no passwords)
    fn connection_info(&self) -> String;
}

/// Sensor data repository trait
///
/// Provides high-level operations for sensor data storage and retrieval.
/// Focuses on time-series sensor data with metadata.
#[async_trait]
pub trait SensorDataRepository: DatabaseProvider {
    /// Store a single sensor reading
    async fn store_reading(&mut self, reading: &SensorReading) -> DatabaseResult<()>;

    /// Store multiple sensor readings in a batch
    async fn store_batch(&mut self, batch: &SensorBatch) -> DatabaseResult<()>;

    /// Query sensor readings by time range and criteria
    async fn query_readings(&self, query: &SensorQuery) -> DatabaseResult<Vec<SensorReading>>;

    /// Get a reading at a specific time (with interpolation if supported)
    async fn get_reading_at_time(
        &self,
        sensor_id: &str,
        timestamp_us: i64,
    ) -> DatabaseResult<Option<SensorReading>>;

    /// Get available time range for a sensor
    async fn get_time_range(&self, sensor_id: &str) -> DatabaseResult<Option<TimeRange>>;

    /// Get available time range across all sensors
    async fn get_global_time_range(&self) -> DatabaseResult<Option<TimeRange>>;

    /// List all available sensors
    async fn list_sensors(&self) -> DatabaseResult<Vec<String>>;

    /// Get statistics for a sensor
    async fn get_sensor_statistics(&self, sensor_id: &str) -> DatabaseResult<SensorStatistics>;

    /// Delete readings for a sensor in a time range
    async fn delete_readings(
        &mut self,
        sensor_id: &str,
        start_time_us: i64,
        end_time_us: i64,
    ) -> DatabaseResult<u64>;
}

/// Time-series specific storage operations
///
/// Provides advanced time-series operations like downsampling,
/// interpolation, and aggregate queries.
#[async_trait]
pub trait TimeSeriesStore: DatabaseProvider {
    /// Get downsampled data for visualization
    async fn downsample(
        &self,
        sensor_id: &str,
        start_time_us: i64,
        end_time_us: i64,
        interval_us: i64,
    ) -> DatabaseResult<Vec<SensorReading>>;

    /// Interpolate missing data points
    async fn interpolate(
        &self,
        sensor_id: &str,
        timestamps_us: &[i64],
    ) -> DatabaseResult<Vec<SensorReading>>;

    /// Get aggregate statistics over time windows
    async fn aggregate(
        &self,
        sensor_id: &str,
        start_time_us: i64,
        end_time_us: i64,
        window_size_us: i64,
    ) -> DatabaseResult<Vec<SensorStatistics>>;

    /// Check for data gaps
    async fn detect_gaps(
        &self,
        sensor_id: &str,
        start_time_us: i64,
        end_time_us: i64,
        max_gap_us: i64,
    ) -> DatabaseResult<Vec<TimeRange>>;
}

/// Metadata storage for sensors and configuration
///
/// Stores sensor metadata, calibration data, and configuration.
#[async_trait]
pub trait MetadataStore: DatabaseProvider {
    /// Store sensor metadata
    async fn store_sensor_metadata(&mut self, metadata: &SensorMetadata) -> DatabaseResult<()>;

    /// Get sensor metadata
    async fn get_sensor_metadata(&self, sensor_id: &str) -> DatabaseResult<Option<SensorMetadata>>;

    /// List all sensor metadata
    async fn list_sensor_metadata(&self) -> DatabaseResult<Vec<SensorMetadata>>;

    /// Update sensor metadata
    async fn update_sensor_metadata(&mut self, metadata: &SensorMetadata) -> DatabaseResult<()>;

    /// Delete sensor metadata
    async fn delete_sensor_metadata(&mut self, sensor_id: &str) -> DatabaseResult<()>;

    /// Store configuration data
    async fn store_config(&mut self, key: &str, value: &serde_json::Value) -> DatabaseResult<()>;

    /// Get configuration data
    async fn get_config(&self, key: &str) -> DatabaseResult<Option<serde_json::Value>>;

    /// List all configuration keys
    async fn list_config_keys(&self) -> DatabaseResult<Vec<String>>;
}

/// Real-time data streaming capabilities
///
/// Provides pub/sub functionality for real-time sensor data feeds.
#[async_trait]
pub trait StreamingProvider: DatabaseProvider {
    /// Subscribe to real-time sensor data
    async fn subscribe_sensor(&mut self, sensor_id: &str) -> DatabaseResult<Box<dyn SensorStream>>;

    /// Publish sensor data to subscribers
    async fn publish_reading(&mut self, reading: &SensorReading) -> DatabaseResult<()>;

    /// List active subscriptions
    async fn list_subscriptions(&self) -> DatabaseResult<Vec<String>>;

    /// Unsubscribe from sensor data
    async fn unsubscribe(&mut self, sensor_id: &str) -> DatabaseResult<()>;
}

/// Stream of real-time sensor readings
#[async_trait]
pub trait SensorStream: Send + Sync {
    /// Get the next sensor reading (blocks until available)
    async fn next_reading(&mut self) -> DatabaseResult<Option<SensorReading>>;

    /// Check if more readings are available
    fn has_more(&self) -> bool;

    /// Get the sensor ID for this stream
    fn sensor_id(&self) -> &str;

    /// Close the stream
    async fn close(&mut self) -> DatabaseResult<()>;
}

/// Transaction support for atomic operations
///
/// Provides transaction capabilities for databases that support them.
#[async_trait]
pub trait TransactionProvider: DatabaseProvider {
    /// Start a new transaction
    async fn begin_transaction(&mut self) -> DatabaseResult<Box<dyn DatabaseTransaction>>;
}

/// Database transaction handle
#[async_trait]
pub trait DatabaseTransaction: Send + Sync {
    /// Store a sensor reading within this transaction
    async fn store_reading(&mut self, reading: &SensorReading) -> DatabaseResult<()>;

    /// Store multiple readings within this transaction
    async fn store_batch(&mut self, batch: &SensorBatch) -> DatabaseResult<()>;

    /// Commit the transaction
    async fn commit(self: Box<Self>) -> DatabaseResult<()>;

    /// Rollback the transaction
    async fn rollback(self: Box<Self>) -> DatabaseResult<()>;
}

/// Comprehensive database interface combining all capabilities
///
/// This is the main interface that provides access to all database
/// functionality. Implementations can choose which capabilities to support.
#[async_trait]
pub trait DatabaseInterface:
    SensorDataRepository + TimeSeriesStore + MetadataStore + Send + Sync
{
    /// Get streaming provider if supported
    fn streaming_provider(&mut self) -> Option<&mut dyn StreamingProvider> {
        None
    }

    /// Get transaction provider if supported
    fn transaction_provider(&mut self) -> Option<&mut dyn TransactionProvider> {
        None
    }

    /// Get supported features
    fn supported_features(&self) -> DatabaseFeatures;

    /// Optimize database for better performance
    async fn optimize(&mut self) -> DatabaseResult<()>;

    /// Backup data to a file or location
    async fn backup(&self, destination: &str) -> DatabaseResult<()>;

    /// Restore data from a backup
    async fn restore(&mut self, source: &str) -> DatabaseResult<()>;
}

/// Features supported by a database implementation
#[derive(Debug, Clone)]
pub struct DatabaseFeatures {
    /// Supports time-series specific operations
    pub time_series: bool,

    /// Supports real-time streaming
    pub streaming: bool,

    /// Supports transactions
    pub transactions: bool,

    /// Supports data interpolation
    pub interpolation: bool,

    /// Supports downsampling
    pub downsampling: bool,

    /// Supports aggregate queries
    pub aggregation: bool,

    /// Supports backup/restore
    pub backup_restore: bool,

    /// Maximum batch size supported
    pub max_batch_size: usize,

    /// Supported data types
    pub supported_data_types: Vec<String>,
}

impl DatabaseFeatures {
    /// Create basic feature set (minimal capabilities)
    pub fn basic() -> Self {
        Self {
            time_series: true,
            streaming: false,
            transactions: false,
            interpolation: false,
            downsampling: false,
            aggregation: false,
            backup_restore: false,
            max_batch_size: 1000,
            supported_data_types: vec!["generic".to_string()],
        }
    }

    /// Create full feature set (all capabilities)
    pub fn full() -> Self {
        Self {
            time_series: true,
            streaming: true,
            transactions: true,
            interpolation: true,
            downsampling: true,
            aggregation: true,
            backup_restore: true,
            max_batch_size: 10000,
            supported_data_types: vec![
                "camera".to_string(),
                "radar".to_string(),
                "lidar".to_string(),
                "imu".to_string(),
                "gps".to_string(),
                "can".to_string(),
                "generic".to_string(),
            ],
        }
    }
}

// Blanket implementations for boxed trait objects
#[async_trait]
impl DatabaseProvider for Box<dyn DatabaseInterface> {
    async fn connect(&mut self) -> DatabaseResult<()> {
        self.as_mut().connect().await
    }

    async fn disconnect(&mut self) -> DatabaseResult<()> {
        self.as_mut().disconnect().await
    }

    fn is_connected(&self) -> bool {
        self.as_ref().is_connected()
    }

    async fn health_check(&self) -> DatabaseResult<DatabaseHealth> {
        self.as_ref().health_check().await
    }

    fn database_type(&self) -> &'static str {
        self.as_ref().database_type()
    }

    fn connection_info(&self) -> String {
        self.as_ref().connection_info()
    }
}

#[async_trait]
impl SensorDataRepository for Box<dyn DatabaseInterface> {
    async fn store_reading(&mut self, reading: &SensorReading) -> DatabaseResult<()> {
        self.as_mut().store_reading(reading).await
    }

    async fn store_batch(&mut self, batch: &SensorBatch) -> DatabaseResult<()> {
        self.as_mut().store_batch(batch).await
    }

    async fn query_readings(&self, query: &SensorQuery) -> DatabaseResult<Vec<SensorReading>> {
        self.as_ref().query_readings(query).await
    }

    async fn get_reading_at_time(
        &self,
        sensor_id: &str,
        timestamp_us: i64,
    ) -> DatabaseResult<Option<SensorReading>> {
        self.as_ref()
            .get_reading_at_time(sensor_id, timestamp_us)
            .await
    }

    async fn get_time_range(&self, sensor_id: &str) -> DatabaseResult<Option<TimeRange>> {
        self.as_ref().get_time_range(sensor_id).await
    }

    async fn get_global_time_range(&self) -> DatabaseResult<Option<TimeRange>> {
        self.as_ref().get_global_time_range().await
    }

    async fn list_sensors(&self) -> DatabaseResult<Vec<String>> {
        self.as_ref().list_sensors().await
    }

    async fn get_sensor_statistics(&self, sensor_id: &str) -> DatabaseResult<SensorStatistics> {
        self.as_ref().get_sensor_statistics(sensor_id).await
    }

    async fn delete_readings(
        &mut self,
        sensor_id: &str,
        start_time_us: i64,
        end_time_us: i64,
    ) -> DatabaseResult<u64> {
        self.as_mut()
            .delete_readings(sensor_id, start_time_us, end_time_us)
            .await
    }
}

#[async_trait]
impl TimeSeriesStore for Box<dyn DatabaseInterface> {
    async fn downsample(
        &self,
        sensor_id: &str,
        start_time_us: i64,
        end_time_us: i64,
        interval_us: i64,
    ) -> DatabaseResult<Vec<SensorReading>> {
        self.as_ref()
            .downsample(sensor_id, start_time_us, end_time_us, interval_us)
            .await
    }

    async fn interpolate(
        &self,
        sensor_id: &str,
        timestamps_us: &[i64],
    ) -> DatabaseResult<Vec<SensorReading>> {
        self.as_ref().interpolate(sensor_id, timestamps_us).await
    }

    async fn aggregate(
        &self,
        sensor_id: &str,
        start_time_us: i64,
        end_time_us: i64,
        window_size_us: i64,
    ) -> DatabaseResult<Vec<SensorStatistics>> {
        self.as_ref()
            .aggregate(sensor_id, start_time_us, end_time_us, window_size_us)
            .await
    }

    async fn detect_gaps(
        &self,
        sensor_id: &str,
        start_time_us: i64,
        end_time_us: i64,
        max_gap_us: i64,
    ) -> DatabaseResult<Vec<TimeRange>> {
        self.as_ref()
            .detect_gaps(sensor_id, start_time_us, end_time_us, max_gap_us)
            .await
    }
}

#[async_trait]
impl MetadataStore for Box<dyn DatabaseInterface> {
    async fn store_sensor_metadata(&mut self, metadata: &SensorMetadata) -> DatabaseResult<()> {
        self.as_mut().store_sensor_metadata(metadata).await
    }

    async fn get_sensor_metadata(&self, sensor_id: &str) -> DatabaseResult<Option<SensorMetadata>> {
        self.as_ref().get_sensor_metadata(sensor_id).await
    }

    async fn list_sensor_metadata(&self) -> DatabaseResult<Vec<SensorMetadata>> {
        self.as_ref().list_sensor_metadata().await
    }

    async fn update_sensor_metadata(&mut self, metadata: &SensorMetadata) -> DatabaseResult<()> {
        self.as_mut().update_sensor_metadata(metadata).await
    }

    async fn delete_sensor_metadata(&mut self, sensor_id: &str) -> DatabaseResult<()> {
        self.as_mut().delete_sensor_metadata(sensor_id).await
    }

    async fn store_config(&mut self, key: &str, value: &serde_json::Value) -> DatabaseResult<()> {
        self.as_mut().store_config(key, value).await
    }

    async fn get_config(&self, key: &str) -> DatabaseResult<Option<serde_json::Value>> {
        self.as_ref().get_config(key).await
    }

    async fn list_config_keys(&self) -> DatabaseResult<Vec<String>> {
        self.as_ref().list_config_keys().await
    }
}

#[async_trait]
impl DatabaseInterface for Box<dyn DatabaseInterface> {
    fn supported_features(&self) -> DatabaseFeatures {
        self.as_ref().supported_features()
    }

    async fn optimize(&mut self) -> DatabaseResult<()> {
        self.as_mut().optimize().await
    }

    async fn backup(&self, destination: &str) -> DatabaseResult<()> {
        self.as_ref().backup(destination).await
    }

    async fn restore(&mut self, source: &str) -> DatabaseResult<()> {
        self.as_mut().restore(source).await
    }
}
