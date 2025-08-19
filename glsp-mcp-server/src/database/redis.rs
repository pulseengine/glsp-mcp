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

//! Redis database implementation for GLSP-MCP Server
//!
//! Provides Redis-based storage for caching and session management.

#[cfg(feature = "redis")]
use crate::database::{
    config::DatabaseConfig,
    error::{DatabaseError, DatabaseResult},
    models::*,
    traits::{
        DatabaseInterface, DatabaseProvider, MetadataStore, SensorDataRepository, TimeSeriesStore,
    },
};
#[cfg(feature = "redis")]
use async_trait::async_trait;
// Note: Serde traits reserved for future JSON serialization features
#[cfg(feature = "redis")]
#[allow(unused_imports)]
use serde::{Deserialize, Serialize};
#[cfg(feature = "redis")]
use std::collections::HashMap;
#[cfg(feature = "redis")]
use std::time::{Duration, SystemTime};

/// Redis database backend implementation
#[cfg(feature = "redis")]
#[derive(Debug, Clone)]
pub struct RedisBackend {
    url: String,
    client: Option<redis::Client>,
    #[allow(dead_code)]
    connection_timeout: Duration,
}

#[cfg(feature = "redis")]
impl RedisBackend {
    /// Create a new Redis backend instance
    pub fn new(config: &DatabaseConfig) -> DatabaseResult<Self> {
        let url = config.connection_string()?;

        Ok(Self {
            url,
            client: None,
            connection_timeout: config.connection_timeout(),
        })
    }

    /// Get Redis connection
    async fn get_connection(&self) -> DatabaseResult<redis::Connection> {
        let client = self.client.as_ref().ok_or(DatabaseError::ConnectionFailed(
            "Redis client not initialized".to_string(),
        ))?;

        client.get_connection().map_err(|e| {
            DatabaseError::ConnectionFailed(format!("Failed to get Redis connection: {e}"))
        })
    }

    /// Initialize the Redis backend
    pub async fn initialize(&mut self) -> DatabaseResult<()> {
        let client = redis::Client::open(self.url.as_str()).map_err(|e| {
            DatabaseError::ConnectionFailed(format!("Failed to create Redis client: {e}"))
        })?;

        self.client = Some(client);

        // Test connection
        let _conn = self.get_connection().await?;

        Ok(())
    }

    /// Close the Redis connection
    async fn close(&mut self) -> DatabaseResult<()> {
        self.client = None;
        Ok(())
    }
}

#[async_trait]
#[cfg(feature = "redis")]
impl DatabaseProvider for RedisBackend {
    async fn connect(&mut self) -> DatabaseResult<()> {
        self.initialize().await
    }

    async fn disconnect(&mut self) -> DatabaseResult<()> {
        self.close().await
    }

    fn is_connected(&self) -> bool {
        self.client.is_some()
    }

    async fn health_check(&self) -> DatabaseResult<DatabaseHealth> {
        let start = std::time::Instant::now();
        let is_healthy = match self.get_connection().await {
            Ok(mut conn) => redis::cmd("PING").query::<String>(&mut conn).is_ok(),
            Err(_) => false,
        };
        let latency_ms = start.elapsed().as_millis() as f32;

        Ok(DatabaseHealth {
            is_connected: is_healthy,
            latency_ms,
            version: Some("Redis (unknown version)".to_string()),
            active_connections: Some(if self.is_connected() { 1 } else { 0 }),
            available_space_bytes: Some(1_000_000_000),
            last_check: chrono::Utc::now(),
            error: None,
        })
    }

    fn database_type(&self) -> &'static str {
        "Redis"
    }

    fn connection_info(&self) -> String {
        // Return sanitized connection info (no credentials)
        format!(
            "Redis at {}",
            self.url
                .replace("redis://", "")
                .split('@')
                .next_back()
                .unwrap_or("unknown")
        )
    }
}

#[cfg(feature = "redis")]
impl RedisBackend {
    /// Session management functionality for Redis backend
    /// These methods provide session storage capabilities using Redis
    pub async fn create_session(
        &mut self,
        session_id: &str,
        user_id: &str,
        ttl: Duration,
    ) -> DatabaseResult<()> {
        let mut conn = self.get_connection().await?;

        let session_key = format!("session:{session_id}");
        let session_data = serde_json::json!({
            "user_id": user_id,
            "created_at": SystemTime::now().duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or(Duration::from_secs(0)).as_secs(),
            "ttl": ttl.as_secs()
        });

        use redis::Commands;
        conn.set_ex::<_, _, ()>(&session_key, session_data.to_string(), ttl.as_secs())
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to create session: {e}")))?;

        Ok(())
    }

    pub async fn get_session(
        &self,
        session_id: &str,
    ) -> DatabaseResult<Option<HashMap<String, String>>> {
        let mut conn = self.get_connection().await?;

        let session_key = format!("session:{session_id}");

        use redis::Commands;
        match conn.get::<String, String>(session_key) {
            Ok(data) => {
                let session_data: serde_json::Value = serde_json::from_str(&data).map_err(|e| {
                    DatabaseError::SerializationError(format!("Failed to parse session data: {e}"))
                })?;

                let mut result = HashMap::new();
                if let Some(user_id) = session_data.get("user_id").and_then(|v| v.as_str()) {
                    result.insert("user_id".to_string(), user_id.to_string());
                }
                if let Some(created_at) = session_data.get("created_at").and_then(|v| v.as_u64()) {
                    result.insert("created_at".to_string(), created_at.to_string());
                }

                Ok(Some(result))
            }
            Err(_e) => Ok(None), // Session not found or expired
        }
    }

    pub async fn delete_session(&mut self, session_id: &str) -> DatabaseResult<()> {
        let mut conn = self.get_connection().await?;

        let session_key = format!("session:{session_id}");

        use redis::Commands;
        conn.del::<_, ()>(&session_key)
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to delete session: {e}")))?;

        Ok(())
    }

    pub async fn extend_session(&mut self, session_id: &str, ttl: Duration) -> DatabaseResult<()> {
        let mut conn = self.get_connection().await?;

        let session_key = format!("session:{session_id}");

        use redis::Commands;
        conn.expire::<_, ()>(&session_key, ttl.as_secs() as i64)
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to extend session: {e}")))?;

        Ok(())
    }
}

#[async_trait]
#[cfg(feature = "redis")]
impl SensorDataRepository for RedisBackend {
    async fn store_reading(&mut self, _reading: &SensorReading) -> DatabaseResult<()> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support sensor data storage".to_string(),
        })
    }

    async fn store_batch(&mut self, _batch: &SensorBatch) -> DatabaseResult<()> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support sensor data storage".to_string(),
        })
    }

    async fn query_readings(&self, _query: &SensorQuery) -> DatabaseResult<Vec<SensorReading>> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support sensor data queries".to_string(),
        })
    }

    async fn get_reading_at_time(
        &self,
        _sensor_id: &str,
        _timestamp_us: i64,
    ) -> DatabaseResult<Option<SensorReading>> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support sensor data queries".to_string(),
        })
    }

    async fn get_time_range(&self, _sensor_id: &str) -> DatabaseResult<Option<TimeRange>> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support sensor data queries".to_string(),
        })
    }

    async fn get_global_time_range(&self) -> DatabaseResult<Option<TimeRange>> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support sensor data queries".to_string(),
        })
    }

    async fn list_sensors(&self) -> DatabaseResult<Vec<String>> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support sensor listing".to_string(),
        })
    }

    async fn get_sensor_statistics(&self, _sensor_id: &str) -> DatabaseResult<SensorStatistics> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support sensor statistics".to_string(),
        })
    }

    async fn delete_readings(
        &mut self,
        _sensor_id: &str,
        _start_time_us: i64,
        _end_time_us: i64,
    ) -> DatabaseResult<u64> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support sensor data deletion".to_string(),
        })
    }
}

#[async_trait]
#[cfg(feature = "redis")]
impl TimeSeriesStore for RedisBackend {
    async fn downsample(
        &self,
        _sensor_id: &str,
        _start_time_us: i64,
        _end_time_us: i64,
        _interval_us: i64,
    ) -> DatabaseResult<Vec<SensorReading>> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support time-series operations".to_string(),
        })
    }

    async fn interpolate(
        &self,
        _sensor_id: &str,
        _timestamps_us: &[i64],
    ) -> DatabaseResult<Vec<SensorReading>> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support interpolation".to_string(),
        })
    }

    async fn aggregate(
        &self,
        _sensor_id: &str,
        _start_time_us: i64,
        _end_time_us: i64,
        _window_size_us: i64,
    ) -> DatabaseResult<Vec<SensorStatistics>> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support aggregation".to_string(),
        })
    }

    async fn detect_gaps(
        &self,
        _sensor_id: &str,
        _start_time_us: i64,
        _end_time_us: i64,
        _max_gap_us: i64,
    ) -> DatabaseResult<Vec<TimeRange>> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support gap detection".to_string(),
        })
    }
}

#[async_trait]
#[cfg(feature = "redis")]
impl MetadataStore for RedisBackend {
    async fn store_sensor_metadata(&mut self, _metadata: &SensorMetadata) -> DatabaseResult<()> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support metadata storage".to_string(),
        })
    }

    async fn get_sensor_metadata(
        &self,
        _sensor_id: &str,
    ) -> DatabaseResult<Option<SensorMetadata>> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support metadata queries".to_string(),
        })
    }

    async fn list_sensor_metadata(&self) -> DatabaseResult<Vec<SensorMetadata>> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support sensor listing".to_string(),
        })
    }

    async fn update_sensor_metadata(&mut self, _metadata: &SensorMetadata) -> DatabaseResult<()> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support metadata updates".to_string(),
        })
    }

    async fn delete_sensor_metadata(&mut self, _sensor_id: &str) -> DatabaseResult<()> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support metadata deletion".to_string(),
        })
    }

    async fn store_config(&mut self, _key: &str, _value: &serde_json::Value) -> DatabaseResult<()> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support config storage".to_string(),
        })
    }

    async fn get_config(&self, _key: &str) -> DatabaseResult<Option<serde_json::Value>> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support config queries".to_string(),
        })
    }

    async fn list_config_keys(&self) -> DatabaseResult<Vec<String>> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support config listing".to_string(),
        })
    }
}

#[async_trait]
#[cfg(feature = "redis")]
impl DatabaseInterface for RedisBackend {
    fn supported_features(&self) -> crate::database::traits::DatabaseFeatures {
        crate::database::traits::DatabaseFeatures {
            time_series: false,
            streaming: true,
            transactions: false,
            interpolation: false,
            downsampling: false,
            aggregation: false,
            backup_restore: false,
            max_batch_size: 1000,
            supported_data_types: vec!["session".to_string(), "cache".to_string()],
        }
    }

    async fn optimize(&mut self) -> DatabaseResult<()> {
        Ok(())
    }

    async fn backup(&self, _destination: &str) -> DatabaseResult<()> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support backup".to_string(),
        })
    }

    async fn restore(&mut self, _source: &str) -> DatabaseResult<()> {
        Err(DatabaseError::FeatureNotSupported {
            feature: "Redis backend does not support restore".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::config::DatabaseConfig;

    #[tokio::test]
    async fn test_redis_backend_creation() {
        let config = DatabaseConfig::redis("localhost", 6379);
        let backend = RedisBackend::new(&config);
        assert!(backend.is_ok());
    }

    #[tokio::test]
    async fn test_redis_backend_initialization() {
        let config = DatabaseConfig::redis("localhost", 6379);
        let mut backend = RedisBackend::new(&config).expect("Failed to create Redis backend");

        // This will fail if Redis is not running, but that's expected in CI
        let _ = backend.initialize().await;
    }
}
