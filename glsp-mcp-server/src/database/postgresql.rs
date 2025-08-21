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

//! PostgreSQL database backend implementation with TimescaleDB support

#[cfg(feature = "postgresql")]
use crate::database::{
    config::DatabaseConfig, models::*, traits::*, DatabaseError, DatabaseResult,
};

#[cfg(feature = "postgresql")]
use async_trait::async_trait;
#[cfg(feature = "postgresql")]
use chrono::Utc;
#[cfg(feature = "postgresql")]
use sqlx::{PgPool, Row};
#[cfg(feature = "postgresql")]
use tracing::{debug, info, warn};

/// PostgreSQL database backend with TimescaleDB time-series support
#[cfg(feature = "postgresql")]
pub struct PostgreSQLBackend {
    config: DatabaseConfig,
    pool: Option<PgPool>,
}

#[cfg(feature = "postgresql")]
impl PostgreSQLBackend {
    /// Create a new PostgreSQL backend
    pub async fn new(config: DatabaseConfig) -> DatabaseResult<Self> {
        let mut backend = Self { config, pool: None };

        backend.connect().await?;
        backend.ensure_schema().await?;

        Ok(backend)
    }

    /// Ensure database schema exists with TimescaleDB optimizations
    async fn ensure_schema(&self) -> DatabaseResult<()> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        info!("Creating database schema for sensor data with time-series optimizations");

        // Enable TimescaleDB extension (ignore if already exists or not available)
        let _ = sqlx::query("CREATE EXTENSION IF NOT EXISTS timescaledb")
            .execute(pool)
            .await;

        // Create sensor_readings table with optimized schema for time-series data
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS sensor_readings (
                sensor_id VARCHAR(255) NOT NULL,
                timestamp_us BIGINT NOT NULL,
                data_type JSONB NOT NULL,
                payload BYTEA NOT NULL,
                quality REAL NOT NULL DEFAULT 1.0,
                metadata JSONB DEFAULT '{}',
                checksum VARCHAR(64),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                -- Composite primary key for TimescaleDB optimization
                PRIMARY KEY (sensor_id, timestamp_us)
            )
            "#,
        )
        .execute(pool)
        .await
        .map_err(|e| {
            DatabaseError::QueryFailed(format!("Failed to create sensor_readings table: {e}"))
        })?;

        // Create TimescaleDB hypertable with 1-day chunks for optimal performance
        let hypertable_result = sqlx::query(
            "SELECT create_hypertable('sensor_readings', 'timestamp_us',
             if_not_exists => TRUE,
             chunk_time_interval => 86400000000,
             partitioning_column => 'sensor_id',
             number_partitions => 4)",
        )
        .execute(pool)
        .await;

        match hypertable_result {
            Ok(_) => {
                info!("TimescaleDB hypertable created successfully");

                // Set up automatic compression for older data (7 days)
                let _ = sqlx::query(
                    "ALTER TABLE sensor_readings SET (
                        timescaledb.compress,
                        timescaledb.compress_segmentby = 'sensor_id',
                        timescaledb.compress_orderby = 'timestamp_us DESC'
                    )",
                )
                .execute(pool)
                .await;

                // Create compression policy
                let _ = sqlx::query(
                    "SELECT add_compression_policy('sensor_readings', INTERVAL '7 days')",
                )
                .execute(pool)
                .await;

                // Create retention policy (1 year)
                let _ = sqlx::query(
                    "SELECT add_retention_policy('sensor_readings', INTERVAL '1 year')",
                )
                .execute(pool)
                .await;

                info!("TimescaleDB compression and retention policies configured");
            }
            Err(e) => {
                warn!("TimescaleDB not available, using regular PostgreSQL: {}", e);
            }
        }

        // Create optimized indexes for time-series queries
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor_time_desc
             ON sensor_readings (sensor_id, timestamp_us DESC)",
        )
        .execute(pool)
        .await
        .map_err(|e| {
            DatabaseError::QueryFailed(format!("Failed to create sensor-time index: {e}"))
        })?;

        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_sensor_readings_timestamp_desc
             ON sensor_readings (timestamp_us DESC)",
        )
        .execute(pool)
        .await
        .map_err(|e| {
            DatabaseError::QueryFailed(format!("Failed to create timestamp index: {e}"))
        })?;

        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_sensor_readings_quality
             ON sensor_readings (sensor_id, quality) WHERE quality < 1.0",
        )
        .execute(pool)
        .await
        .map_err(|e| DatabaseError::QueryFailed(format!("Failed to create quality index: {e}")))?;

        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_sensor_readings_data_type
             ON sensor_readings USING GIN (data_type)",
        )
        .execute(pool)
        .await
        .map_err(|e| {
            DatabaseError::QueryFailed(format!("Failed to create data_type index: {e}"))
        })?;

        // Create sensor_metadata table with enhanced time-series tracking
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS sensor_metadata (
                sensor_id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                sensor_type JSONB NOT NULL,
                location VARCHAR(255),
                sampling_rate_hz REAL,
                calibration JSONB,
                first_seen TIMESTAMPTZ NOT NULL,
                last_seen TIMESTAMPTZ NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                total_readings BIGINT DEFAULT 0,
                data_size_bytes BIGINT DEFAULT 0,
                avg_quality REAL DEFAULT 1.0,
                last_quality_check TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
            "#,
        )
        .execute(pool)
        .await
        .map_err(|e| {
            DatabaseError::QueryFailed(format!("Failed to create sensor_metadata table: {e}"))
        })?;

        // Create sensor statistics materialized view for performance
        sqlx::query(
            r#"
            CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_statistics AS
            SELECT
                sensor_id,
                COUNT(*) as reading_count,
                MIN(timestamp_us) as first_reading,
                MAX(timestamp_us) as last_reading,
                AVG(quality) as avg_quality,
                MIN(quality) as min_quality,
                MAX(quality) as max_quality,
                SUM(LENGTH(payload)) as total_data_bytes,
                COUNT(DISTINCT data_type) as data_type_count
            FROM sensor_readings
            GROUP BY sensor_id
            "#,
        )
        .execute(pool)
        .await
        .map_err(|e| {
            DatabaseError::QueryFailed(format!("Failed to create sensor_statistics view: {e}"))
        })?;

        // Create index on materialized view
        sqlx::query(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_sensor_statistics_sensor_id
             ON sensor_statistics (sensor_id)",
        )
        .execute(pool)
        .await
        .map_err(|e| {
            DatabaseError::QueryFailed(format!("Failed to create statistics index: {e}"))
        })?;

        // Create time-series aggregation tables for different time buckets
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS sensor_readings_hourly (
                sensor_id VARCHAR(255) NOT NULL,
                hour_bucket TIMESTAMPTZ NOT NULL,
                reading_count BIGINT NOT NULL,
                avg_quality REAL NOT NULL,
                min_quality REAL NOT NULL,
                max_quality REAL NOT NULL,
                data_types JSONB NOT NULL,
                total_data_bytes BIGINT NOT NULL,
                PRIMARY KEY (sensor_id, hour_bucket)
            )
            "#,
        )
        .execute(pool)
        .await
        .map_err(|e| {
            DatabaseError::QueryFailed(format!("Failed to create hourly aggregation table: {e}"))
        })?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS sensor_readings_daily (
                sensor_id VARCHAR(255) NOT NULL,
                day_bucket DATE NOT NULL,
                reading_count BIGINT NOT NULL,
                avg_quality REAL NOT NULL,
                min_quality REAL NOT NULL,
                max_quality REAL NOT NULL,
                data_types JSONB NOT NULL,
                total_data_bytes BIGINT NOT NULL,
                uptime_percentage REAL,
                PRIMARY KEY (sensor_id, day_bucket)
            )
            "#,
        )
        .execute(pool)
        .await
        .map_err(|e| {
            DatabaseError::QueryFailed(format!("Failed to create daily aggregation table: {e}"))
        })?;

        // Create configuration table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS config_store (
                key VARCHAR(255) PRIMARY KEY,
                value JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
            "#,
        )
        .execute(pool)
        .await
        .map_err(|e| {
            DatabaseError::QueryFailed(format!("Failed to create config_store table: {e}"))
        })?;

        // Create dataset management tables
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS sensor_datasets (
                dataset_id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                sensor_ids TEXT[] NOT NULL,
                start_time_us BIGINT NOT NULL,
                end_time_us BIGINT NOT NULL,
                total_readings BIGINT DEFAULT 0,
                total_size_bytes BIGINT DEFAULT 0,
                quality_stats JSONB,
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
            "#,
        )
        .execute(pool)
        .await
        .map_err(|e| DatabaseError::QueryFailed(format!("Failed to create datasets table: {e}")))?;

        // Create index on dataset time range for efficient queries
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_sensor_datasets_time_range
             ON sensor_datasets (start_time_us, end_time_us)",
        )
        .execute(pool)
        .await
        .map_err(|e| {
            DatabaseError::QueryFailed(format!("Failed to create dataset time index: {e}"))
        })?;

        // Create continuous aggregates if TimescaleDB is available
        let _ = sqlx::query(
            r#"
            CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_readings_1h
            WITH (timescaledb.continuous) AS
            SELECT sensor_id,
                   time_bucket('1 hour', to_timestamp(timestamp_us / 1000000)) AS bucket,
                   COUNT(*) as reading_count,
                   AVG(quality) as avg_quality,
                   MIN(quality) as min_quality,
                   MAX(quality) as max_quality,
                   SUM(LENGTH(payload)) as total_bytes
            FROM sensor_readings
            GROUP BY sensor_id, bucket
            "#,
        )
        .execute(pool)
        .await;

        let _ = sqlx::query(
            r#"
            CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_readings_1d
            WITH (timescaledb.continuous) AS
            SELECT sensor_id,
                   time_bucket('1 day', to_timestamp(timestamp_us / 1000000)) AS bucket,
                   COUNT(*) as reading_count,
                   AVG(quality) as avg_quality,
                   MIN(quality) as min_quality,
                   MAX(quality) as max_quality,
                   SUM(LENGTH(payload)) as total_bytes
            FROM sensor_readings
            GROUP BY sensor_id, bucket
            "#,
        )
        .execute(pool)
        .await;

        // Create refresh policies for continuous aggregates
        let _ = sqlx::query(
            "SELECT add_continuous_aggregate_policy('sensor_readings_1h',
             start_offset => INTERVAL '1 day',
             end_offset => INTERVAL '1 hour',
             schedule_interval => INTERVAL '1 hour')",
        )
        .execute(pool)
        .await;

        let _ = sqlx::query(
            "SELECT add_continuous_aggregate_policy('sensor_readings_1d',
             start_offset => INTERVAL '7 days',
             end_offset => INTERVAL '1 day',
             schedule_interval => INTERVAL '1 day')",
        )
        .execute(pool)
        .await;

        info!("Database schema created successfully with time-series optimizations");
        Ok(())
    }
}

#[async_trait]
#[cfg(feature = "postgresql")]
impl DatabaseProvider for PostgreSQLBackend {
    async fn connect(&mut self) -> DatabaseResult<()> {
        if self.pool.is_some() {
            return Ok(());
        }

        let connection_string = self.config.connection_string()?;
        debug!(
            "Connecting to PostgreSQL: {}",
            connection_string.replace(
                &self.config.connection.password.clone().unwrap_or_default(),
                "***"
            )
        );

        let pool = PgPool::connect(&connection_string).await.map_err(|e| {
            DatabaseError::ConnectionFailed(format!("PostgreSQL connection failed: {e}"))
        })?;

        // Test the connection
        sqlx::query("SELECT 1")
            .execute(&pool)
            .await
            .map_err(|e| DatabaseError::ConnectionFailed(format!("Connection test failed: {e}")))?;

        self.pool = Some(pool);
        info!("Connected to PostgreSQL database");
        Ok(())
    }

    async fn disconnect(&mut self) -> DatabaseResult<()> {
        if let Some(pool) = self.pool.take() {
            pool.close().await;
            info!("Disconnected from PostgreSQL database");
        }
        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.pool.is_some()
    }

    async fn health_check(&self) -> DatabaseResult<DatabaseHealth> {
        let pool = self
            .pool
            .as_ref()
            .ok_or_else(|| DatabaseError::DatabaseUnavailable {
                reason: "Not connected".to_string(),
            })?;

        let start = std::time::Instant::now();

        match sqlx::query("SELECT version(), current_database(), current_user")
            .fetch_one(pool)
            .await
        {
            Ok(row) => {
                let latency = start.elapsed().as_millis() as f32;
                let version: String = row.get(0);

                Ok(DatabaseHealth {
                    is_connected: true,
                    latency_ms: latency,
                    version: Some(version),
                    active_connections: None, // Would need admin privileges to get this
                    available_space_bytes: None, // Would need admin privileges to get this
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
        "postgresql"
    }

    fn connection_info(&self) -> String {
        format!(
            "postgresql://{}:{}/{}",
            self.config.connection.host,
            self.config.connection.port,
            self.config.connection.database
        )
    }
}

#[async_trait]
#[cfg(feature = "postgresql")]
impl SensorDataRepository for PostgreSQLBackend {
    async fn store_reading(&mut self, reading: &SensorReading) -> DatabaseResult<()> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        sqlx::query(
            r#"
            INSERT INTO sensor_readings
            (sensor_id, timestamp_us, data_type, payload, quality, metadata, checksum)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            "#,
        )
        .bind(&reading.sensor_id)
        .bind(reading.timestamp_us)
        .bind(
            serde_json::to_value(&reading.data_type)
                .map_err(|e| DatabaseError::SerializationError(e.to_string()))?,
        )
        .bind(&reading.payload)
        .bind(reading.quality)
        .bind(
            serde_json::to_value(&reading.metadata)
                .map_err(|e| DatabaseError::SerializationError(e.to_string()))?,
        )
        .bind(&reading.checksum)
        .execute(pool)
        .await
        .map_err(|e| DatabaseError::QueryFailed(format!("Failed to store reading: {e}")))?;

        Ok(())
    }

    async fn store_batch(&mut self, batch: &SensorBatch) -> DatabaseResult<()> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        // Use optimized batch insert with prepared statement
        if batch.readings.is_empty() {
            return Ok(());
        }

        let mut tx = pool.begin().await.map_err(|e| {
            DatabaseError::TransactionFailed(format!("Failed to start transaction: {e}"))
        })?;

        // Use individual inserts for better compatibility (can be optimized later)
        for reading in &batch.readings {
            sqlx::query(
                r#"
                INSERT INTO sensor_readings
                (sensor_id, timestamp_us, data_type, payload, quality, metadata, checksum)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (sensor_id, timestamp_us) DO UPDATE SET
                    data_type = EXCLUDED.data_type,
                    payload = EXCLUDED.payload,
                    quality = EXCLUDED.quality,
                    metadata = EXCLUDED.metadata,
                    checksum = EXCLUDED.checksum
                "#,
            )
            .bind(&reading.sensor_id)
            .bind(reading.timestamp_us)
            .bind(
                serde_json::to_value(&reading.data_type)
                    .map_err(|e| DatabaseError::SerializationError(e.to_string()))?,
            )
            .bind(&reading.payload)
            .bind(reading.quality)
            .bind(
                serde_json::to_value(&reading.metadata)
                    .map_err(|e| DatabaseError::SerializationError(e.to_string()))?,
            )
            .bind(&reading.checksum)
            .execute(&mut *tx)
            .await
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to store reading: {e}")))?;
        }

        // Update sensor metadata with batch statistics
        let unique_sensors: std::collections::HashSet<String> =
            batch.readings.iter().map(|r| r.sensor_id.clone()).collect();

        for sensor_id in unique_sensors {
            let count = batch
                .readings
                .iter()
                .filter(|r| r.sensor_id == sensor_id)
                .count() as i64;
            let total_bytes: i64 = batch
                .readings
                .iter()
                .filter(|r| r.sensor_id == sensor_id)
                .map(|r| r.payload.len() as i64)
                .sum();
            let avg_quality: f32 = batch
                .readings
                .iter()
                .filter(|r| r.sensor_id == sensor_id)
                .map(|r| r.quality)
                .sum::<f32>()
                / count as f32;

            sqlx::query(
                r#"
                INSERT INTO sensor_metadata
                (sensor_id, name, sensor_type, first_seen, last_seen, total_readings, data_size_bytes, avg_quality)
                VALUES ($1, $1, '{"type": "unknown"}', NOW(), NOW(), $2, $3, $4)
                ON CONFLICT (sensor_id) DO UPDATE SET
                    last_seen = NOW(),
                    total_readings = sensor_metadata.total_readings + $2,
                    data_size_bytes = sensor_metadata.data_size_bytes + $3,
                    avg_quality = (sensor_metadata.avg_quality * sensor_metadata.total_readings + $4 * $2) / (sensor_metadata.total_readings + $2),
                    updated_at = NOW()
                "#
            )
            .bind(&sensor_id)
            .bind(count)
            .bind(total_bytes)
            .bind(avg_quality)
            .execute(&mut *tx)
            .await
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to update metadata: {e}")))?;
        }

        tx.commit().await.map_err(|e| {
            DatabaseError::TransactionFailed(format!("Failed to commit transaction: {e}"))
        })?;

        Ok(())
    }

    async fn query_readings(&self, query: &SensorQuery) -> DatabaseResult<Vec<SensorReading>> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        // Use optimized query with TimescaleDB features when available
        let mut sql = String::from(
            r#"
            SELECT sensor_id, timestamp_us, data_type, payload, quality, metadata, checksum
            FROM sensor_readings
            WHERE timestamp_us >= $1 AND timestamp_us <= $2
            "#,
        );

        let mut bind_index = 3;

        // Sensor ID filter with optimized IN clause
        if !query.sensor_ids.is_empty() {
            sql.push_str(&format!(" AND sensor_id = ANY(${bind_index})"));
            bind_index += 1;
        }

        // Quality filter
        if query.min_quality.is_some() {
            sql.push_str(&format!(" AND quality >= ${bind_index}"));
            bind_index += 1;
        }

        // Data type filter for efficient JSONB queries
        if let Some(ref data_types) = query.data_types {
            if !data_types.is_empty() {
                sql.push_str(&format!(" AND data_type ?| ${bind_index}"));
                bind_index += 1;
            }
        }

        // Downsampling for large time ranges
        if let Some(downsample_interval_us) = query.downsample_interval_us {
            if downsample_interval_us > 0 {
                // Use time_bucket for downsampling if TimescaleDB is available
                sql = format!(
                    r#"
                    SELECT DISTINCT ON (sensor_id, time_bucket)
                           sensor_id, timestamp_us, data_type, payload, quality, metadata, checksum,
                           time_bucket(INTERVAL '{downsample_interval_us} microseconds', to_timestamp(timestamp_us / 1000000)) as time_bucket
                    FROM sensor_readings
                    WHERE timestamp_us >= $1 AND timestamp_us <= $2
                    "#
                );
            }
        }

        // Optimize ordering based on query pattern
        if query.sensor_ids.len() == 1 {
            // Single sensor: use sensor-specific index
            sql.push_str(" ORDER BY sensor_id, timestamp_us ASC");
        } else {
            // Multiple sensors: use timestamp index
            sql.push_str(" ORDER BY timestamp_us ASC, sensor_id");
        }

        // Apply limit efficiently
        if let Some(_limit) = query.limit {
            sql.push_str(&format!(" LIMIT ${bind_index}"));
        }

        // Build query with parameters
        let mut query_builder = sqlx::query(&sql)
            .bind(query.start_time_us)
            .bind(query.end_time_us);

        if !query.sensor_ids.is_empty() {
            query_builder = query_builder.bind(&query.sensor_ids);
        }

        if let Some(min_quality) = query.min_quality {
            query_builder = query_builder.bind(min_quality);
        }

        if let Some(ref data_types) = query.data_types {
            if !data_types.is_empty() {
                let type_strings: Vec<String> =
                    data_types.iter().map(|dt| format!("{dt:?}")).collect();
                query_builder = query_builder.bind(type_strings);
            }
        }

        if let Some(limit) = query.limit {
            query_builder = query_builder.bind(limit as i64);
        }

        let start_time = std::time::Instant::now();
        let rows = query_builder
            .fetch_all(pool)
            .await
            .map_err(|e| DatabaseError::QueryFailed(format!("Query failed: {e}")))?;

        let query_duration = start_time.elapsed();
        debug!(
            "Query returned {} readings in {}ms",
            rows.len(),
            query_duration.as_millis()
        );

        let mut readings = Vec::with_capacity(rows.len());
        for row in rows {
            let data_type: serde_json::Value = row.get("data_type");
            let metadata: serde_json::Value = row.get("metadata");

            readings.push(SensorReading {
                sensor_id: row.get("sensor_id"),
                timestamp_us: row.get("timestamp_us"),
                data_type: serde_json::from_value(data_type)
                    .map_err(|e| DatabaseError::SerializationError(e.to_string()))?,
                payload: row.get("payload"),
                quality: row.get("quality"),
                metadata: serde_json::from_value(metadata)
                    .map_err(|e| DatabaseError::SerializationError(e.to_string()))?,
                checksum: row.get("checksum"),
            });
        }

        debug!("Retrieved {} readings from query", readings.len());
        Ok(readings)
    }

    async fn get_reading_at_time(
        &self,
        sensor_id: &str,
        timestamp_us: i64,
    ) -> DatabaseResult<Option<SensorReading>> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        // Find the closest reading to the target timestamp
        let row = sqlx::query(
            r#"
            SELECT sensor_id, timestamp_us, data_type, payload, quality, metadata, checksum
            FROM sensor_readings
            WHERE sensor_id = $1
            ORDER BY ABS(timestamp_us - $2)
            LIMIT 1
            "#,
        )
        .bind(sensor_id)
        .bind(timestamp_us)
        .fetch_optional(pool)
        .await
        .map_err(|e| DatabaseError::QueryFailed(format!("Failed to find reading: {e}")))?;

        if let Some(row) = row {
            let data_type: serde_json::Value = row.get("data_type");
            let metadata: serde_json::Value = row.get("metadata");

            Ok(Some(SensorReading {
                sensor_id: row.get("sensor_id"),
                timestamp_us: row.get("timestamp_us"),
                data_type: serde_json::from_value(data_type)
                    .map_err(|e| DatabaseError::SerializationError(e.to_string()))?,
                payload: row.get("payload"),
                quality: row.get("quality"),
                metadata: serde_json::from_value(metadata)
                    .map_err(|e| DatabaseError::SerializationError(e.to_string()))?,
                checksum: row.get("checksum"),
            }))
        } else {
            Ok(None)
        }
    }

    async fn get_time_range(&self, sensor_id: &str) -> DatabaseResult<Option<TimeRange>> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        let row = sqlx::query(
            r#"
            SELECT
                MIN(timestamp_us) as start_time,
                MAX(timestamp_us) as end_time,
                COUNT(*) as reading_count,
                SUM(LENGTH(payload)) as data_size
            FROM sensor_readings
            WHERE sensor_id = $1
            "#,
        )
        .bind(sensor_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| DatabaseError::QueryFailed(format!("Failed to get time range: {e}")))?;

        if let Some(row) = row {
            let start_time: Option<i64> = row.get("start_time");
            let end_time: Option<i64> = row.get("end_time");

            if let (Some(start), Some(end)) = (start_time, end_time) {
                Ok(Some(TimeRange {
                    start_time_us: start,
                    end_time_us: end,
                    reading_count: row.get::<i64, _>("reading_count") as u64,
                    data_size_bytes: row.get::<i64, _>("data_size") as u64,
                }))
            } else {
                Ok(None)
            }
        } else {
            Ok(None)
        }
    }

    async fn get_global_time_range(&self) -> DatabaseResult<Option<TimeRange>> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        let row = sqlx::query(
            r#"
            SELECT
                MIN(timestamp_us) as start_time,
                MAX(timestamp_us) as end_time,
                COUNT(*) as reading_count,
                SUM(LENGTH(payload)) as data_size
            FROM sensor_readings
            "#,
        )
        .fetch_optional(pool)
        .await
        .map_err(|e| DatabaseError::QueryFailed(format!("Failed to get global time range: {e}")))?;

        if let Some(row) = row {
            let start_time: Option<i64> = row.get("start_time");
            let end_time: Option<i64> = row.get("end_time");

            if let (Some(start), Some(end)) = (start_time, end_time) {
                Ok(Some(TimeRange {
                    start_time_us: start,
                    end_time_us: end,
                    reading_count: row.get::<i64, _>("reading_count") as u64,
                    data_size_bytes: row.get::<i64, _>("data_size") as u64,
                }))
            } else {
                Ok(None)
            }
        } else {
            Ok(None)
        }
    }

    async fn list_sensors(&self) -> DatabaseResult<Vec<String>> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        let rows = sqlx::query("SELECT DISTINCT sensor_id FROM sensor_readings ORDER BY sensor_id")
            .fetch_all(pool)
            .await
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to list sensors: {e}")))?;

        Ok(rows.into_iter().map(|row| row.get("sensor_id")).collect())
    }

    async fn get_sensor_statistics(&self, sensor_id: &str) -> DatabaseResult<SensorStatistics> {
        let time_range = self
            .get_time_range(sensor_id)
            .await?
            .ok_or_else(|| DatabaseError::SensorNotFound(sensor_id.to_string()))?;

        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        let row = sqlx::query(
            r#"
            SELECT
                AVG(quality) as avg_quality,
                COUNT(*) as reading_count
            FROM sensor_readings
            WHERE sensor_id = $1
            "#,
        )
        .bind(sensor_id)
        .fetch_one(pool)
        .await
        .map_err(|e| DatabaseError::QueryFailed(format!("Failed to get statistics: {e}")))?;

        let avg_quality: Option<f64> = row.get("avg_quality");
        let reading_count: i64 = row.get("reading_count");

        let duration_secs =
            (time_range.end_time_us - time_range.start_time_us) as f32 / 1_000_000.0;
        let avg_sampling_rate = if duration_secs > 0.0 {
            reading_count as f32 / duration_secs
        } else {
            0.0
        };

        let total_size_bytes = time_range.data_size_bytes;

        Ok(SensorStatistics {
            sensor_id: sensor_id.to_string(),
            time_range,
            avg_quality: avg_quality.unwrap_or(0.0) as f32,
            avg_sampling_rate_hz: avg_sampling_rate,
            gap_count: 0, // Gap detection not implemented yet
            total_size_bytes,
        })
    }

    async fn delete_readings(
        &mut self,
        sensor_id: &str,
        start_time_us: i64,
        end_time_us: i64,
    ) -> DatabaseResult<u64> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        let result = sqlx::query(
            "DELETE FROM sensor_readings WHERE sensor_id = $1 AND timestamp_us >= $2 AND timestamp_us <= $3"
        )
        .bind(sensor_id)
        .bind(start_time_us)
        .bind(end_time_us)
        .execute(pool)
        .await
        .map_err(|e| DatabaseError::QueryFailed(format!("Failed to delete readings: {e}")))?;

        Ok(result.rows_affected())
    }
}

#[async_trait]
#[cfg(feature = "postgresql")]
impl TimeSeriesStore for PostgreSQLBackend {
    async fn downsample(
        &self,
        sensor_id: &str,
        start_time_us: i64,
        end_time_us: i64,
        interval_us: i64,
    ) -> DatabaseResult<Vec<SensorReading>> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        // Use TimescaleDB time_bucket if available, otherwise fall back to simple grouping
        let rows = sqlx::query(
            r#"
            SELECT
                sensor_id,
                (timestamp_us / $4) * $4 as bucket_time,
                data_type,
                payload,
                AVG(quality) as avg_quality,
                metadata,
                checksum
            FROM sensor_readings
            WHERE sensor_id = $1 AND timestamp_us >= $2 AND timestamp_us <= $3
            GROUP BY sensor_id, bucket_time, data_type, payload, metadata, checksum
            ORDER BY bucket_time
            "#,
        )
        .bind(sensor_id)
        .bind(start_time_us)
        .bind(end_time_us)
        .bind(interval_us)
        .fetch_all(pool)
        .await
        .map_err(|e| DatabaseError::QueryFailed(format!("Downsample query failed: {e}")))?;

        let mut readings = Vec::new();
        for row in rows {
            let data_type: serde_json::Value = row.get("data_type");
            let metadata: serde_json::Value = row.get("metadata");

            readings.push(SensorReading {
                sensor_id: row.get("sensor_id"),
                timestamp_us: row.get("bucket_time"),
                data_type: serde_json::from_value(data_type)
                    .map_err(|e| DatabaseError::SerializationError(e.to_string()))?,
                payload: row.get("payload"),
                quality: row.get::<f64, _>("avg_quality") as f32,
                metadata: serde_json::from_value(metadata)
                    .map_err(|e| DatabaseError::SerializationError(e.to_string()))?,
                checksum: row.get("checksum"),
            });
        }

        Ok(readings)
    }

    async fn interpolate(
        &self,
        sensor_id: &str,
        timestamps_us: &[i64],
    ) -> DatabaseResult<Vec<SensorReading>> {
        // Simple interpolation: find closest readings for each timestamp
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
        // Aggregation using TimescaleDB functions not implemented yet
        Ok(vec![])
    }

    async fn detect_gaps(
        &self,
        _sensor_id: &str,
        _start_time_us: i64,
        _end_time_us: i64,
        _max_gap_us: i64,
    ) -> DatabaseResult<Vec<TimeRange>> {
        // Gap detection not implemented yet
        Ok(vec![])
    }
}

#[async_trait]
#[cfg(feature = "postgresql")]
impl MetadataStore for PostgreSQLBackend {
    async fn store_sensor_metadata(&mut self, metadata: &SensorMetadata) -> DatabaseResult<()> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        sqlx::query(
            r#"
            INSERT INTO sensor_metadata
            (sensor_id, name, sensor_type, location, sampling_rate_hz, calibration,
             first_seen, last_seen, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (sensor_id) DO UPDATE SET
                name = EXCLUDED.name,
                sensor_type = EXCLUDED.sensor_type,
                location = EXCLUDED.location,
                sampling_rate_hz = EXCLUDED.sampling_rate_hz,
                calibration = EXCLUDED.calibration,
                last_seen = EXCLUDED.last_seen,
                is_active = EXCLUDED.is_active,
                updated_at = NOW()
            "#,
        )
        .bind(&metadata.sensor_id)
        .bind(&metadata.name)
        .bind(
            serde_json::to_value(&metadata.sensor_type)
                .map_err(|e| DatabaseError::SerializationError(e.to_string()))?,
        )
        .bind(&metadata.location)
        .bind(metadata.sampling_rate_hz)
        .bind(
            metadata
                .calibration
                .as_ref()
                .map(|c| serde_json::to_value(c).unwrap_or_default()),
        )
        .bind(metadata.first_seen)
        .bind(metadata.last_seen)
        .bind(metadata.is_active)
        .execute(pool)
        .await
        .map_err(|e| DatabaseError::QueryFailed(format!("Failed to store metadata: {e}")))?;

        Ok(())
    }

    async fn get_sensor_metadata(&self, sensor_id: &str) -> DatabaseResult<Option<SensorMetadata>> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        let row = sqlx::query(
            r#"
            SELECT sensor_id, name, sensor_type, location, sampling_rate_hz,
                   calibration, first_seen, last_seen, is_active
            FROM sensor_metadata
            WHERE sensor_id = $1
            "#,
        )
        .bind(sensor_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| DatabaseError::QueryFailed(format!("Failed to get metadata: {e}")))?;

        if let Some(row) = row {
            let sensor_type: serde_json::Value = row.get("sensor_type");
            let calibration: Option<serde_json::Value> = row.get("calibration");

            Ok(Some(SensorMetadata {
                sensor_id: row.get("sensor_id"),
                name: row.get("name"),
                sensor_type: serde_json::from_value(sensor_type)
                    .map_err(|e| DatabaseError::SerializationError(e.to_string()))?,
                location: row.get("location"),
                sampling_rate_hz: row.get("sampling_rate_hz"),
                calibration: calibration.map(|v| serde_json::from_value(v).unwrap_or_default()),
                first_seen: row.get("first_seen"),
                last_seen: row.get("last_seen"),
                is_active: row.get("is_active"),
            }))
        } else {
            Ok(None)
        }
    }

    async fn list_sensor_metadata(&self) -> DatabaseResult<Vec<SensorMetadata>> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        let rows = sqlx::query(
            r#"
            SELECT sensor_id, name, sensor_type, location, sampling_rate_hz,
                   calibration, first_seen, last_seen, is_active
            FROM sensor_metadata
            ORDER BY sensor_id
            "#,
        )
        .fetch_all(pool)
        .await
        .map_err(|e| DatabaseError::QueryFailed(format!("Failed to list metadata: {e}")))?;

        let mut metadata_list = Vec::new();
        for row in rows {
            let sensor_type: serde_json::Value = row.get("sensor_type");
            let calibration: Option<serde_json::Value> = row.get("calibration");

            metadata_list.push(SensorMetadata {
                sensor_id: row.get("sensor_id"),
                name: row.get("name"),
                sensor_type: serde_json::from_value(sensor_type)
                    .map_err(|e| DatabaseError::SerializationError(e.to_string()))?,
                location: row.get("location"),
                sampling_rate_hz: row.get("sampling_rate_hz"),
                calibration: calibration.map(|v| serde_json::from_value(v).unwrap_or_default()),
                first_seen: row.get("first_seen"),
                last_seen: row.get("last_seen"),
                is_active: row.get("is_active"),
            });
        }

        Ok(metadata_list)
    }

    async fn update_sensor_metadata(&mut self, metadata: &SensorMetadata) -> DatabaseResult<()> {
        self.store_sensor_metadata(metadata).await
    }

    async fn delete_sensor_metadata(&mut self, sensor_id: &str) -> DatabaseResult<()> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        sqlx::query("DELETE FROM sensor_metadata WHERE sensor_id = $1")
            .bind(sensor_id)
            .execute(pool)
            .await
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to delete metadata: {e}")))?;

        Ok(())
    }

    async fn store_config(&mut self, key: &str, value: &serde_json::Value) -> DatabaseResult<()> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        sqlx::query(
            r#"
            INSERT INTO config_store (key, value)
            VALUES ($1, $2)
            ON CONFLICT (key) DO UPDATE SET
                value = EXCLUDED.value,
                updated_at = NOW()
            "#,
        )
        .bind(key)
        .bind(value)
        .execute(pool)
        .await
        .map_err(|e| DatabaseError::QueryFailed(format!("Failed to store config: {e}")))?;

        Ok(())
    }

    async fn get_config(&self, key: &str) -> DatabaseResult<Option<serde_json::Value>> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        let row = sqlx::query("SELECT value FROM config_store WHERE key = $1")
            .bind(key)
            .fetch_optional(pool)
            .await
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to get config: {e}")))?;

        Ok(row.map(|r| r.get("value")))
    }

    async fn list_config_keys(&self) -> DatabaseResult<Vec<String>> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        let rows = sqlx::query("SELECT key FROM config_store ORDER BY key")
            .fetch_all(pool)
            .await
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to list config keys: {e}")))?;

        Ok(rows.into_iter().map(|row| row.get("key")).collect())
    }
}

#[async_trait]
#[cfg(feature = "postgresql")]
impl DatabaseInterface for PostgreSQLBackend {
    fn supported_features(&self) -> DatabaseFeatures {
        let mut features = DatabaseFeatures::full();
        features.streaming = false; // PostgreSQL doesn't have built-in pub/sub
        features.max_batch_size = 10000;
        features.supported_data_types = vec![
            "camera".to_string(),
            "radar".to_string(),
            "lidar".to_string(),
            "imu".to_string(),
            "gps".to_string(),
            "can".to_string(),
            "ultrasonic".to_string(),
            "generic".to_string(),
        ];
        features
    }

    async fn optimize(&mut self) -> DatabaseResult<()> {
        let pool = self.pool.as_ref().ok_or_else(|| {
            DatabaseError::ConnectionFailed("Not connected to database".to_string())
        })?;

        // Analyze tables for better query planning
        sqlx::query("ANALYZE sensor_readings")
            .execute(pool)
            .await
            .map_err(|e| {
                DatabaseError::QueryFailed(format!("Failed to analyze sensor_readings: {e}"))
            })?;

        sqlx::query("ANALYZE sensor_metadata")
            .execute(pool)
            .await
            .map_err(|e| {
                DatabaseError::QueryFailed(format!("Failed to analyze sensor_metadata: {e}"))
            })?;

        info!("Database optimization completed");
        Ok(())
    }

    async fn backup(&self, destination: &str) -> DatabaseResult<()> {
        warn!(
            "PostgreSQL backup not implemented - use pg_dump manually: pg_dump {} > {}",
            self.config.connection.database, destination
        );
        Err(DatabaseError::FeatureNotSupported {
            feature: "Automatic backup not implemented".to_string(),
        })
    }

    async fn restore(&mut self, source: &str) -> DatabaseResult<()> {
        warn!(
            "PostgreSQL restore not implemented - use psql manually: psql {} < {}",
            self.config.connection.database, source
        );
        Err(DatabaseError::FeatureNotSupported {
            feature: "Automatic restore not implemented".to_string(),
        })
    }
}
