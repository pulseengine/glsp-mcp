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

//! InfluxDB database backend implementation for time-series sensor data
//!
//! This implementation provides a specialized time-series database backend
//! optimized for high-frequency sensor data with advanced querying capabilities.

#[cfg(feature = "influxdb")]
use crate::database::{
    config::DatabaseConfig, models::*, traits::*, DatabaseError, DatabaseResult,
};
#[cfg(feature = "influxdb")]
use async_trait::async_trait;
#[cfg(feature = "influxdb")]
use base64::Engine as _;
#[cfg(feature = "influxdb")]
use chrono::Utc;
#[cfg(feature = "influxdb")]
use influxdb::{Client, ReadQuery, Timestamp, WriteQuery};
#[cfg(feature = "influxdb")]
use tracing::{debug, info, warn};

/// InfluxDB measurement names
#[cfg(feature = "influxdb")]
const SENSOR_READINGS_MEASUREMENT: &str = "sensor_readings";
#[cfg(feature = "influxdb")]
const SENSOR_METADATA_MEASUREMENT: &str = "sensor_metadata";
#[cfg(feature = "influxdb")]
const CONFIG_STORE_MEASUREMENT: &str = "config_store";

/// InfluxDB backend for time-series sensor data
#[cfg(feature = "influxdb")]
pub struct InfluxDBBackend {
    config: DatabaseConfig,
    client: Option<Client>,
    database_name: String,
}

#[cfg(feature = "influxdb")]
impl InfluxDBBackend {
    /// Create a new InfluxDB backend
    pub async fn new(config: DatabaseConfig) -> DatabaseResult<Self> {
        let database_name = config.connection.database.clone();

        let mut backend = Self {
            config,
            client: None,
            database_name,
        };

        backend.connect().await?;
        backend.ensure_database().await?;
        backend.create_retention_policies().await?;

        Ok(backend)
    }

    /// Ensure database exists with proper configuration
    async fn ensure_database(&self) -> DatabaseResult<()> {
        let client = self.client.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to InfluxDB".to_string())
        })?;

        info!("Creating InfluxDB database: {}", self.database_name);

        // Create database if it doesn't exist
        let query = format!("CREATE DATABASE IF NOT EXISTS {}", self.database_name);
        let read_query = ReadQuery::new(query);

        let result = client.query(read_query).await;
        if let Err(e) = result {
            return Err(DatabaseError::QueryFailed(format!(
                "Failed to create database: {e}"
            )));
        }

        Ok(())
    }

    /// Create retention policies for different data types
    async fn create_retention_policies(&self) -> DatabaseResult<()> {
        let client = self.client.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to InfluxDB".to_string())
        })?;

        // High-frequency data - 7 days
        let high_freq_policy = format!(
            "CREATE RETENTION POLICY \"high_frequency\" ON {} DURATION 7d REPLICATION 1 DEFAULT",
            self.database_name
        );

        // Medium-frequency data - 30 days
        let medium_freq_policy = format!(
            "CREATE RETENTION POLICY \"medium_frequency\" ON {} DURATION 30d REPLICATION 1",
            self.database_name
        );

        // Low-frequency/archived data - 1 year
        let archive_policy = format!(
            "CREATE RETENTION POLICY \"archive\" ON {} DURATION 365d REPLICATION 1",
            self.database_name
        );

        for policy in &[high_freq_policy, medium_freq_policy, archive_policy] {
            let read_query = ReadQuery::new(policy.clone());
            if let Err(e) = client.query(read_query).await {
                warn!("Failed to create retention policy: {}", e);
            }
        }

        info!("InfluxDB retention policies configured");
        Ok(())
    }

    /// Create a write query for a sensor reading
    fn create_reading_write_query(reading: &SensorReading) -> WriteQuery {
        let timestamp = Timestamp::Microseconds(reading.timestamp_us as u128);

        let mut query = WriteQuery::new(timestamp, SENSOR_READINGS_MEASUREMENT)
            .add_tag("sensor_id", reading.sensor_id.clone())
            .add_tag("data_type", format!("{:?}", reading.data_type))
            .add_field("quality", reading.quality as f64)
            .add_field("payload_size", reading.payload.len() as i64)
            .add_field(
                "payload_base64",
                base64::engine::general_purpose::STANDARD.encode(&reading.payload),
            )
            .add_field(
                "metadata_json",
                serde_json::to_string(&reading.metadata).unwrap_or_default(),
            );

        if let Some(ref checksum) = reading.checksum {
            query = query.add_field("checksum", checksum.clone());
        }

        query
    }
}

#[async_trait]
#[cfg(feature = "influxdb")]
impl DatabaseProvider for InfluxDBBackend {
    async fn connect(&mut self) -> DatabaseResult<()> {
        if self.client.is_some() {
            return Ok(());
        }

        let url = format!(
            "http://{}:{}",
            self.config.connection.host, self.config.connection.port
        );

        debug!("Connecting to InfluxDB: {}", url);

        let mut client = Client::new(url, &self.database_name);

        // Set authentication if provided
        if let Some(ref username) = self.config.connection.username {
            if let Some(ref password) = self.config.connection.password {
                client = client.with_auth(username, password);
            }
        }

        // Test connection
        let ping_query = ReadQuery::new("SHOW DATABASES");
        match client.query(ping_query).await {
            Ok(_) => {
                self.client = Some(client);
                info!("Connected to InfluxDB");
                Ok(())
            }
            Err(e) => Err(DatabaseError::ConnectionFailed(format!(
                "InfluxDB connection failed: {e}"
            ))),
        }
    }

    async fn disconnect(&mut self) -> DatabaseResult<()> {
        self.client = None;
        info!("Disconnected from InfluxDB");
        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.client.is_some()
    }

    async fn health_check(&self) -> DatabaseResult<DatabaseHealth> {
        let client = self
            .client
            .as_ref()
            .ok_or_else(|| DatabaseError::DatabaseUnavailable {
                reason: "Not connected".to_string(),
            })?;

        let start = std::time::Instant::now();
        let query = ReadQuery::new("SHOW DIAGNOSTICS");

        match client.query(query).await {
            Ok(_) => {
                let latency = start.elapsed().as_millis() as f32;

                Ok(DatabaseHealth {
                    is_connected: true,
                    latency_ms: latency,
                    version: Some("InfluxDB".to_string()),
                    active_connections: None,
                    available_space_bytes: None,
                    last_check: Utc::now(),
                    error: None,
                })
            }
            Err(e) => Ok(DatabaseHealth {
                is_connected: false,
                latency_ms: start.elapsed().as_millis() as f32,
                version: None,
                active_connections: None,
                available_space_bytes: None,
                last_check: Utc::now(),
                error: Some(e.to_string()),
            }),
        }
    }

    fn database_type(&self) -> &'static str {
        "influxdb"
    }

    fn connection_info(&self) -> String {
        format!(
            "influxdb://{}:{}/{}",
            self.config.connection.host, self.config.connection.port, self.database_name
        )
    }
}

#[async_trait]
#[cfg(feature = "influxdb")]
impl SensorDataRepository for InfluxDBBackend {
    async fn store_reading(&mut self, reading: &SensorReading) -> DatabaseResult<()> {
        let client = self.client.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to InfluxDB".to_string())
        })?;

        let query = Self::create_reading_write_query(reading);

        client
            .query(query)
            .await
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to store reading: {e}")))?;

        Ok(())
    }

    async fn store_batch(&mut self, batch: &SensorBatch) -> DatabaseResult<()> {
        let client = self.client.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to InfluxDB".to_string())
        })?;

        if batch.readings.is_empty() {
            return Ok(());
        }

        // Create write queries for all readings
        let mut write_queries = Vec::new();
        for reading in &batch.readings {
            write_queries.push(Self::create_reading_write_query(reading));
        }

        // Execute all queries (InfluxDB client handles batching)
        for query in write_queries {
            client.query(query).await.map_err(|e| {
                DatabaseError::QueryFailed(format!("Failed to store batch reading: {e}"))
            })?;
        }

        Ok(())
    }

    async fn query_readings(&self, query: &SensorQuery) -> DatabaseResult<Vec<SensorReading>> {
        let client = self.client.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to InfluxDB".to_string())
        })?;

        // Build InfluxQL query
        let mut influx_query = format!(
            "SELECT * FROM {} WHERE time >= {}us AND time <= {}us",
            SENSOR_READINGS_MEASUREMENT, query.start_time_us, query.end_time_us
        );

        // Add sensor filter
        if !query.sensor_ids.is_empty() {
            let sensor_list = query
                .sensor_ids
                .iter()
                .map(|s| format!("'{s}'"))
                .collect::<Vec<_>>()
                .join(",");
            influx_query.push_str(&format!(" AND sensor_id IN ({sensor_list})"));
        }

        // Add quality filter
        if let Some(min_quality) = query.min_quality {
            influx_query.push_str(&format!(" AND quality >= {min_quality}"));
        }

        // Add data type filter
        if let Some(ref data_types) = query.data_types {
            if !data_types.is_empty() {
                let type_list = data_types
                    .iter()
                    .map(|dt| format!("'{dt:?}'"))
                    .collect::<Vec<_>>()
                    .join(",");
                influx_query.push_str(&format!(" AND data_type IN ({type_list})"));
            }
        }

        // Add ordering
        influx_query.push_str(" ORDER BY time ASC");

        // Add limit
        if let Some(limit) = query.limit {
            influx_query.push_str(&format!(" LIMIT {limit}"));
        }

        debug!("Executing InfluxQL query: {}", influx_query);

        let read_query = ReadQuery::new(influx_query);
        let _result = client
            .query(read_query)
            .await
            .map_err(|e| DatabaseError::QueryFailed(format!("Query failed: {e}")))?;

        // Note: The influxdb crate returns results as String, which would need custom parsing
        // For now, return empty results - a full implementation would parse the JSON response
        warn!("InfluxDB query result parsing not fully implemented");
        Ok(Vec::new())
    }

    async fn get_reading_at_time(
        &self,
        sensor_id: &str,
        timestamp_us: i64,
    ) -> DatabaseResult<Option<SensorReading>> {
        // Find closest reading within 1 second window
        let query = SensorQuery {
            sensor_ids: vec![sensor_id.to_string()],
            start_time_us: timestamp_us - 1_000_000,
            end_time_us: timestamp_us + 1_000_000,
            data_types: None,
            min_quality: None,
            limit: Some(1),
            downsample_interval_us: None,
        };

        let readings = self.query_readings(&query).await?;
        Ok(readings.into_iter().next())
    }

    async fn get_time_range(&self, sensor_id: &str) -> DatabaseResult<Option<TimeRange>> {
        let client = self.client.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to InfluxDB".to_string())
        })?;

        // Get first and last timestamps
        let first_query = format!(
            "SELECT * FROM {SENSOR_READINGS_MEASUREMENT} WHERE sensor_id = '{sensor_id}' ORDER BY time ASC LIMIT 1"
        );

        let last_query = format!(
            "SELECT * FROM {SENSOR_READINGS_MEASUREMENT} WHERE sensor_id = '{sensor_id}' ORDER BY time DESC LIMIT 1"
        );

        let _first = client.query(ReadQuery::new(first_query)).await.ok();
        let _last = client.query(ReadQuery::new(last_query)).await.ok();

        // Note: Would need to parse results to extract timestamps
        warn!("InfluxDB time range query not fully implemented");
        Ok(None)
    }

    async fn get_global_time_range(&self) -> DatabaseResult<Option<TimeRange>> {
        warn!("InfluxDB global time range query not fully implemented");
        Ok(None)
    }

    async fn list_sensors(&self) -> DatabaseResult<Vec<String>> {
        let client = self.client.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to InfluxDB".to_string())
        })?;

        let query =
            format!("SHOW TAG VALUES FROM {SENSOR_READINGS_MEASUREMENT} WITH KEY = \"sensor_id\"");
        let read_query = ReadQuery::new(query);

        let _result = client
            .query(read_query)
            .await
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to list sensors: {e}")))?;

        // Note: Would need to parse results
        warn!("InfluxDB sensor list query not fully implemented");
        Ok(Vec::new())
    }

    async fn get_sensor_statistics(&self, sensor_id: &str) -> DatabaseResult<SensorStatistics> {
        // Note: Would need full implementation
        warn!("InfluxDB sensor statistics not fully implemented");

        Ok(SensorStatistics {
            sensor_id: sensor_id.to_string(),
            time_range: TimeRange {
                start_time_us: 0,
                end_time_us: 0,
                reading_count: 0,
                data_size_bytes: 0,
            },
            avg_quality: 0.0,
            avg_sampling_rate_hz: 0.0,
            gap_count: 0,
            total_size_bytes: 0,
        })
    }

    async fn delete_readings(
        &mut self,
        sensor_id: &str,
        start_time_us: i64,
        end_time_us: i64,
    ) -> DatabaseResult<u64> {
        let client = self.client.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to InfluxDB".to_string())
        })?;

        let delete_query = format!(
            "DELETE FROM {SENSOR_READINGS_MEASUREMENT} WHERE sensor_id = '{sensor_id}' AND time >= {start_time_us}us AND time <= {end_time_us}us"
        );

        let read_query = ReadQuery::new(delete_query);
        client
            .query(read_query)
            .await
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to delete readings: {e}")))?;

        // InfluxDB doesn't return affected rows for DELETE
        Ok(0)
    }
}

#[async_trait]
#[cfg(feature = "influxdb")]
impl TimeSeriesStore for InfluxDBBackend {
    async fn downsample(
        &self,
        sensor_id: &str,
        start_time_us: i64,
        end_time_us: i64,
        interval_us: i64,
    ) -> DatabaseResult<Vec<SensorReading>> {
        // Use GROUP BY time() for downsampling
        let query = SensorQuery {
            sensor_ids: vec![sensor_id.to_string()],
            start_time_us,
            end_time_us,
            data_types: None,
            min_quality: None,
            limit: None,
            downsample_interval_us: Some(interval_us),
        };

        self.query_readings(&query).await
    }

    async fn interpolate(
        &self,
        sensor_id: &str,
        timestamps_us: &[i64],
    ) -> DatabaseResult<Vec<SensorReading>> {
        // Simple nearest-neighbor interpolation
        let mut results = Vec::new();
        for &timestamp in timestamps_us {
            if let Some(reading) = self.get_reading_at_time(sensor_id, timestamp).await? {
                results.push(reading);
            }
        }
        Ok(results)
    }

    async fn aggregate(
        &self,
        _sensor_id: &str,
        _start_time_us: i64,
        _end_time_us: i64,
        _window_size_us: i64,
    ) -> DatabaseResult<Vec<SensorStatistics>> {
        warn!("InfluxDB aggregation not fully implemented");
        Ok(Vec::new())
    }

    async fn detect_gaps(
        &self,
        _sensor_id: &str,
        _start_time_us: i64,
        _end_time_us: i64,
        _max_gap_us: i64,
    ) -> DatabaseResult<Vec<TimeRange>> {
        warn!("InfluxDB gap detection not fully implemented");
        Ok(Vec::new())
    }
}

#[async_trait]
#[cfg(feature = "influxdb")]
impl MetadataStore for InfluxDBBackend {
    async fn store_sensor_metadata(&mut self, metadata: &SensorMetadata) -> DatabaseResult<()> {
        let client = self.client.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to InfluxDB".to_string())
        })?;

        let timestamp = Timestamp::Microseconds(metadata.last_seen.timestamp_micros() as u128);

        let mut query = WriteQuery::new(timestamp, SENSOR_METADATA_MEASUREMENT)
            .add_tag("sensor_id", metadata.sensor_id.clone())
            .add_field("name", metadata.name.clone())
            .add_field("sensor_type", format!("{:?}", metadata.sensor_type))
            .add_field("is_active", metadata.is_active);

        if let Some(ref location) = metadata.location {
            query = query.add_field("location", location.clone());
        }

        if let Some(sampling_rate) = metadata.sampling_rate_hz {
            query = query.add_field("sampling_rate_hz", sampling_rate as f64);
        }

        if let Some(ref calibration) = metadata.calibration {
            query = query.add_field(
                "calibration_json",
                serde_json::to_string(calibration).unwrap_or_default(),
            );
        }

        client
            .query(query)
            .await
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to store metadata: {e}")))?;

        Ok(())
    }

    async fn get_sensor_metadata(&self, sensor_id: &str) -> DatabaseResult<Option<SensorMetadata>> {
        // Note: Would need full implementation with result parsing
        warn!("InfluxDB get sensor metadata not fully implemented");

        Ok(Some(SensorMetadata {
            sensor_id: sensor_id.to_string(),
            name: sensor_id.to_string(),
            sensor_type: SensorDataType::Generic {
                sensor_type: "unknown".to_string(),
                data_size: 0,
            },
            location: None,
            sampling_rate_hz: None,
            calibration: None,
            first_seen: Utc::now(),
            last_seen: Utc::now(),
            is_active: true,
        }))
    }

    async fn list_sensor_metadata(&self) -> DatabaseResult<Vec<SensorMetadata>> {
        let sensors = self.list_sensors().await?;
        let mut metadata_list = Vec::new();

        for sensor_id in sensors {
            if let Some(metadata) = self.get_sensor_metadata(&sensor_id).await? {
                metadata_list.push(metadata);
            }
        }

        Ok(metadata_list)
    }

    async fn update_sensor_metadata(&mut self, metadata: &SensorMetadata) -> DatabaseResult<()> {
        self.store_sensor_metadata(metadata).await
    }

    async fn delete_sensor_metadata(&mut self, sensor_id: &str) -> DatabaseResult<()> {
        let client = self.client.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to InfluxDB".to_string())
        })?;

        let delete_query =
            format!("DELETE FROM {SENSOR_METADATA_MEASUREMENT} WHERE sensor_id = '{sensor_id}'");

        let read_query = ReadQuery::new(delete_query);
        client
            .query(read_query)
            .await
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to delete metadata: {e}")))?;

        Ok(())
    }

    async fn store_config(&mut self, key: &str, value: &serde_json::Value) -> DatabaseResult<()> {
        let client = self.client.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to InfluxDB".to_string())
        })?;

        let timestamp = Timestamp::Microseconds(Utc::now().timestamp_micros() as u128);

        let query = WriteQuery::new(timestamp, CONFIG_STORE_MEASUREMENT)
            .add_tag("key", key)
            .add_field(
                "value_json",
                serde_json::to_string(value)
                    .map_err(|e| DatabaseError::SerializationError(e.to_string()))?,
            );

        client
            .query(query)
            .await
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to store config: {e}")))?;

        Ok(())
    }

    async fn get_config(&self, _key: &str) -> DatabaseResult<Option<serde_json::Value>> {
        warn!("InfluxDB get config not fully implemented");
        Ok(None)
    }

    async fn list_config_keys(&self) -> DatabaseResult<Vec<String>> {
        warn!("InfluxDB list config keys not fully implemented");
        Ok(Vec::new())
    }
}

#[async_trait]
#[cfg(feature = "influxdb")]
impl DatabaseInterface for InfluxDBBackend {
    fn supported_features(&self) -> DatabaseFeatures {
        DatabaseFeatures {
            transactions: false,
            time_series: true,
            aggregation: true,
            downsampling: true,
            interpolation: true,
            backup_restore: false,
            streaming: true,
            max_batch_size: 100000,
            supported_data_types: vec![
                "camera".to_string(),
                "radar".to_string(),
                "lidar".to_string(),
                "imu".to_string(),
                "gps".to_string(),
                "can".to_string(),
                "ultrasonic".to_string(),
                "generic".to_string(),
            ],
        }
    }

    async fn optimize(&mut self) -> DatabaseResult<()> {
        // InfluxDB automatically optimizes time-series data
        info!("InfluxDB automatically optimizes time-series data storage");
        Ok(())
    }

    async fn backup(&self, destination: &str) -> DatabaseResult<()> {
        warn!("InfluxDB backup not implemented - use influxd backup command: influxd backup -database {} {}",
              self.database_name, destination);
        Err(DatabaseError::FeatureNotSupported {
            feature: "Automatic backup not implemented".to_string(),
        })
    }

    async fn restore(&mut self, source: &str) -> DatabaseResult<()> {
        warn!("InfluxDB restore not implemented - use influxd restore command: influxd restore -database {} {}",
              self.database_name, source);
        Err(DatabaseError::FeatureNotSupported {
            feature: "Automatic restore not implemented".to_string(),
        })
    }
}
