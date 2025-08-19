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

//! Database factory for creating backend instances

use crate::database::{
    config::{DatabaseBackend, DatabaseConfig},
    traits::DatabaseInterface,
    DatabaseError, DatabaseResult,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

/// Factory for creating database backend instances
pub struct DatabaseFactory;

impl DatabaseFactory {
    /// Create a database backend from configuration
    pub async fn create(config: DatabaseConfig) -> DatabaseResult<Box<dyn DatabaseInterface>> {
        config.validate()?;

        info!(
            "Creating {} database backend: {}:{}",
            config.backend.as_str(),
            config.connection.host,
            config.connection.port
        );

        match config.backend {
            DatabaseBackend::PostgreSQL => {
                #[cfg(feature = "postgresql")]
                {
                    let backend =
                        crate::database::postgresql::PostgreSQLBackend::new(config).await?;
                    Ok(Box::new(backend))
                }
                #[cfg(not(feature = "postgresql"))]
                {
                    Err(DatabaseError::FeatureNotSupported {
                        feature: "PostgreSQL backend not compiled in".to_string(),
                    })
                }
            }

            DatabaseBackend::InfluxDB => {
                #[cfg(feature = "influxdb")]
                {
                    let backend = crate::database::influxdb::InfluxDBBackend::new(config).await?;
                    Ok(Box::new(backend))
                }
                #[cfg(not(feature = "influxdb"))]
                {
                    Err(DatabaseError::FeatureNotSupported {
                        feature: "InfluxDB backend not compiled in".to_string(),
                    })
                }
            }

            DatabaseBackend::Redis => {
                #[cfg(feature = "redis")]
                {
                    let mut backend = crate::database::redis::RedisBackend::new(&config)?;
                    backend.initialize().await?;
                    Ok(Box::new(backend))
                }
                #[cfg(not(feature = "redis"))]
                {
                    Err(DatabaseError::FeatureNotSupported {
                        feature: "Redis backend not compiled in".to_string(),
                    })
                }
            }

            DatabaseBackend::SQLite => {
                let mut backend = MockDatabaseBackend::new(config).await?;
                backend.connect().await?;
                warn!("SQLite backend not yet implemented, using mock backend");
                Ok(Box::new(backend))
            }

            DatabaseBackend::Mock => {
                let mut backend = MockDatabaseBackend::new(config).await?;
                backend.connect().await?;
                Ok(Box::new(backend))
            }
        }
    }

    /// Create backend from environment variables
    pub async fn from_env() -> DatabaseResult<Box<dyn DatabaseInterface>> {
        let config = DatabaseConfig::from_env()?;
        Self::create(config).await
    }

    /// Create backend with default configuration for testing
    pub async fn mock() -> DatabaseResult<Box<dyn DatabaseInterface>> {
        let config = DatabaseConfig::mock();
        Self::create(config).await
    }
}

/// Database manager that handles connection lifecycle and health monitoring
pub struct DatabaseManager {
    backend: Arc<RwLock<Box<dyn DatabaseInterface>>>,
    config: DatabaseConfig,
    is_healthy: Arc<RwLock<bool>>,
}

impl DatabaseManager {
    /// Create a new database manager
    pub async fn new(config: DatabaseConfig) -> DatabaseResult<Self> {
        let backend = DatabaseFactory::create(config.clone()).await?;

        // Perform initial health check
        let is_healthy = backend.health_check().await.is_ok() && backend.is_connected();

        Ok(Self {
            backend: Arc::new(RwLock::new(backend)),
            config,
            is_healthy: Arc::new(RwLock::new(is_healthy)),
        })
    }

    /// Get a reference to the database backend
    pub async fn backend(&self) -> Arc<RwLock<Box<dyn DatabaseInterface>>> {
        Arc::clone(&self.backend)
    }

    /// Check if database is healthy
    pub async fn is_healthy(&self) -> bool {
        *self.is_healthy.read().await
    }

    /// Start health monitoring (runs in background)
    pub async fn start_health_monitoring(&self) {
        let backend = Arc::clone(&self.backend);
        let is_healthy = Arc::clone(&self.is_healthy);
        let check_interval = self.config.timeouts.health_check_secs;

        tokio::spawn(async move {
            let mut interval =
                tokio::time::interval(std::time::Duration::from_secs(check_interval));

            loop {
                interval.tick().await;

                let health_status = {
                    let backend_guard = backend.read().await;
                    backend_guard.health_check().await
                };

                let healthy = match health_status {
                    Ok(health) => {
                        if health.is_connected {
                            true
                        } else {
                            warn!("Database health check failed: not connected");
                            false
                        }
                    }
                    Err(err) => {
                        warn!("Database health check error: {}", err);
                        false
                    }
                };

                {
                    let mut is_healthy_guard = is_healthy.write().await;
                    *is_healthy_guard = healthy;
                }
            }
        });
    }

    /// Reconnect to database if connection is lost
    pub async fn reconnect(&self) -> DatabaseResult<()> {
        info!("Reconnecting to database...");

        let new_backend = DatabaseFactory::create(self.config.clone()).await?;

        {
            let mut backend_guard = self.backend.write().await;
            *backend_guard = new_backend;
        }

        {
            let mut is_healthy_guard = self.is_healthy.write().await;
            *is_healthy_guard = true;
        }

        info!("Database reconnection successful");
        Ok(())
    }

    /// Shutdown database connections gracefully
    pub async fn shutdown(&self) -> DatabaseResult<()> {
        info!("Shutting down database connections...");

        {
            let mut backend_guard = self.backend.write().await;
            backend_guard.disconnect().await?;
        }

        {
            let mut is_healthy_guard = self.is_healthy.write().await;
            *is_healthy_guard = false;
        }

        info!("Database shutdown complete");
        Ok(())
    }
}

// Mock backend implementation for testing and fallback
use crate::database::{models::*, traits::*};
use async_trait::async_trait;
use std::collections::HashMap;
use tokio::sync::Mutex;

/// Mock database backend for testing
pub struct MockDatabaseBackend {
    connected: bool,
    readings: Arc<Mutex<Vec<SensorReading>>>,
    metadata: Arc<Mutex<HashMap<String, SensorMetadata>>>,
}

impl MockDatabaseBackend {
    pub async fn new(_config: DatabaseConfig) -> DatabaseResult<Self> {
        Ok(Self {
            connected: false,
            readings: Arc::new(Mutex::new(Vec::new())),
            metadata: Arc::new(Mutex::new(HashMap::new())),
        })
    }
}

#[async_trait]
impl DatabaseProvider for MockDatabaseBackend {
    async fn connect(&mut self) -> DatabaseResult<()> {
        self.connected = true;
        Ok(())
    }

    async fn disconnect(&mut self) -> DatabaseResult<()> {
        self.connected = false;
        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.connected
    }

    async fn health_check(&self) -> DatabaseResult<DatabaseHealth> {
        Ok(DatabaseHealth {
            is_connected: self.connected,
            latency_ms: 1.0,
            version: Some("mock-1.0.0".to_string()),
            active_connections: Some(1),
            available_space_bytes: Some(1_000_000_000),
            last_check: chrono::Utc::now(),
            error: None,
        })
    }

    fn database_type(&self) -> &'static str {
        "mock"
    }

    fn connection_info(&self) -> String {
        "mock://localhost/test".to_string()
    }
}

#[async_trait]
impl SensorDataRepository for MockDatabaseBackend {
    async fn store_reading(&mut self, reading: &SensorReading) -> DatabaseResult<()> {
        let mut readings = self.readings.lock().await;
        readings.push(reading.clone());
        Ok(())
    }

    async fn store_batch(&mut self, batch: &SensorBatch) -> DatabaseResult<()> {
        let mut readings = self.readings.lock().await;
        readings.extend(batch.readings.iter().cloned());
        Ok(())
    }

    async fn query_readings(&self, query: &SensorQuery) -> DatabaseResult<Vec<SensorReading>> {
        let readings = self.readings.lock().await;
        let filtered: Vec<SensorReading> = readings
            .iter()
            .filter(|r| {
                // Time range filter
                if r.timestamp_us < query.start_time_us || r.timestamp_us > query.end_time_us {
                    return false;
                }

                // Sensor ID filter
                if !query.sensor_ids.is_empty() && !query.sensor_ids.contains(&r.sensor_id) {
                    return false;
                }

                // Quality filter
                if let Some(min_quality) = query.min_quality {
                    if r.quality < min_quality {
                        return false;
                    }
                }

                true
            })
            .cloned()
            .collect();

        // Apply limit
        if let Some(limit) = query.limit {
            Ok(filtered.into_iter().take(limit).collect())
        } else {
            Ok(filtered)
        }
    }

    async fn get_reading_at_time(
        &self,
        sensor_id: &str,
        timestamp_us: i64,
    ) -> DatabaseResult<Option<SensorReading>> {
        let readings = self.readings.lock().await;
        Ok(readings
            .iter()
            .filter(|r| r.sensor_id == sensor_id)
            .min_by_key(|r| (r.timestamp_us - timestamp_us).abs())
            .cloned())
    }

    async fn get_time_range(&self, sensor_id: &str) -> DatabaseResult<Option<TimeRange>> {
        let readings = self.readings.lock().await;
        let sensor_readings: Vec<&SensorReading> = readings
            .iter()
            .filter(|r| r.sensor_id == sensor_id)
            .collect();

        if sensor_readings.is_empty() {
            return Ok(None);
        }

        let min_time = sensor_readings
            .iter()
            .map(|r| r.timestamp_us)
            .min()
            .unwrap();
        let max_time = sensor_readings
            .iter()
            .map(|r| r.timestamp_us)
            .max()
            .unwrap();
        let total_bytes: u64 = sensor_readings.iter().map(|r| r.payload.len() as u64).sum();

        Ok(Some(TimeRange {
            start_time_us: min_time,
            end_time_us: max_time,
            reading_count: sensor_readings.len() as u64,
            data_size_bytes: total_bytes,
        }))
    }

    async fn get_global_time_range(&self) -> DatabaseResult<Option<TimeRange>> {
        let readings = self.readings.lock().await;
        if readings.is_empty() {
            return Ok(None);
        }

        let min_time = readings.iter().map(|r| r.timestamp_us).min().unwrap();
        let max_time = readings.iter().map(|r| r.timestamp_us).max().unwrap();
        let total_bytes: u64 = readings.iter().map(|r| r.payload.len() as u64).sum();

        Ok(Some(TimeRange {
            start_time_us: min_time,
            end_time_us: max_time,
            reading_count: readings.len() as u64,
            data_size_bytes: total_bytes,
        }))
    }

    async fn list_sensors(&self) -> DatabaseResult<Vec<String>> {
        let readings = self.readings.lock().await;
        let mut sensors: Vec<String> = readings
            .iter()
            .map(|r| r.sensor_id.clone())
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();
        sensors.sort();
        Ok(sensors)
    }

    async fn get_sensor_statistics(&self, sensor_id: &str) -> DatabaseResult<SensorStatistics> {
        let time_range = self
            .get_time_range(sensor_id)
            .await?
            .ok_or_else(|| DatabaseError::SensorNotFound(sensor_id.to_string()))?;

        let readings = self.readings.lock().await;
        let sensor_readings: Vec<&SensorReading> = readings
            .iter()
            .filter(|r| r.sensor_id == sensor_id)
            .collect();

        let avg_quality =
            sensor_readings.iter().map(|r| r.quality).sum::<f32>() / sensor_readings.len() as f32;

        let duration_secs =
            (time_range.end_time_us - time_range.start_time_us) as f32 / 1_000_000.0;
        let avg_sampling_rate = sensor_readings.len() as f32 / duration_secs;

        Ok(SensorStatistics {
            sensor_id: sensor_id.to_string(),
            time_range,
            avg_quality,
            avg_sampling_rate_hz: avg_sampling_rate,
            gap_count: 0, // Mock implementation
            total_size_bytes: sensor_readings.iter().map(|r| r.payload.len() as u64).sum(),
        })
    }

    async fn delete_readings(
        &mut self,
        sensor_id: &str,
        start_time_us: i64,
        end_time_us: i64,
    ) -> DatabaseResult<u64> {
        let mut readings = self.readings.lock().await;
        let initial_len = readings.len();

        readings.retain(|r| {
            !(r.sensor_id == sensor_id
                && r.timestamp_us >= start_time_us
                && r.timestamp_us <= end_time_us)
        });

        Ok((initial_len - readings.len()) as u64)
    }
}

#[async_trait]
impl TimeSeriesStore for MockDatabaseBackend {
    async fn downsample(
        &self,
        sensor_id: &str,
        start_time_us: i64,
        end_time_us: i64,
        interval_us: i64,
    ) -> DatabaseResult<Vec<SensorReading>> {
        // Simple mock downsampling - just return every Nth reading
        let query = SensorQuery {
            sensor_ids: vec![sensor_id.to_string()],
            start_time_us,
            end_time_us,
            limit: None,
            min_quality: None,
            downsample_interval_us: Some(interval_us),
            data_types: None,
        };

        self.query_readings(&query).await
    }

    async fn interpolate(
        &self,
        sensor_id: &str,
        timestamps_us: &[i64],
    ) -> DatabaseResult<Vec<SensorReading>> {
        // Mock interpolation - just find nearest readings
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
        // Mock implementation
        Ok(vec![])
    }

    async fn detect_gaps(
        &self,
        _sensor_id: &str,
        _start_time_us: i64,
        _end_time_us: i64,
        _max_gap_us: i64,
    ) -> DatabaseResult<Vec<TimeRange>> {
        // Mock implementation
        Ok(vec![])
    }
}

#[async_trait]
impl MetadataStore for MockDatabaseBackend {
    async fn store_sensor_metadata(&mut self, metadata: &SensorMetadata) -> DatabaseResult<()> {
        let mut meta_store = self.metadata.lock().await;
        meta_store.insert(metadata.sensor_id.clone(), metadata.clone());
        Ok(())
    }

    async fn get_sensor_metadata(&self, sensor_id: &str) -> DatabaseResult<Option<SensorMetadata>> {
        let meta_store = self.metadata.lock().await;
        Ok(meta_store.get(sensor_id).cloned())
    }

    async fn list_sensor_metadata(&self) -> DatabaseResult<Vec<SensorMetadata>> {
        let meta_store = self.metadata.lock().await;
        Ok(meta_store.values().cloned().collect())
    }

    async fn update_sensor_metadata(&mut self, metadata: &SensorMetadata) -> DatabaseResult<()> {
        self.store_sensor_metadata(metadata).await
    }

    async fn delete_sensor_metadata(&mut self, sensor_id: &str) -> DatabaseResult<()> {
        let mut meta_store = self.metadata.lock().await;
        meta_store.remove(sensor_id);
        Ok(())
    }

    async fn store_config(&mut self, _key: &str, _value: &serde_json::Value) -> DatabaseResult<()> {
        Ok(())
    }

    async fn get_config(&self, _key: &str) -> DatabaseResult<Option<serde_json::Value>> {
        Ok(None)
    }

    async fn list_config_keys(&self) -> DatabaseResult<Vec<String>> {
        Ok(vec![])
    }
}

#[async_trait]
impl DatabaseInterface for MockDatabaseBackend {
    fn supported_features(&self) -> DatabaseFeatures {
        DatabaseFeatures::basic()
    }

    async fn optimize(&mut self) -> DatabaseResult<()> {
        Ok(())
    }

    async fn backup(&self, _destination: &str) -> DatabaseResult<()> {
        Ok(())
    }

    async fn restore(&mut self, _source: &str) -> DatabaseResult<()> {
        Ok(())
    }
}

impl DatabaseBackend {
    pub fn as_str(&self) -> &'static str {
        match self {
            DatabaseBackend::PostgreSQL => "postgresql",
            DatabaseBackend::InfluxDB => "influxdb",
            DatabaseBackend::Redis => "redis",
            DatabaseBackend::SQLite => "sqlite",
            DatabaseBackend::Mock => "mock",
        }
    }
}
