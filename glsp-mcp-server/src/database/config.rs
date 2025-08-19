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

//! Database configuration and connection settings

use crate::database::DatabaseError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

/// Database configuration that can be used with any backend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    /// Database backend type
    pub backend: DatabaseBackend,

    /// Connection configuration
    pub connection: ConnectionConfig,

    /// Pool configuration
    pub pool: PoolConfig,

    /// Timeout configuration
    pub timeouts: TimeoutConfig,

    /// Feature configuration
    pub features: FeatureConfig,

    /// Backend-specific settings
    pub backend_specific: HashMap<String, serde_json::Value>,
}

/// Supported database backend types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseBackend {
    /// PostgreSQL with TimescaleDB extension
    PostgreSQL,

    /// InfluxDB time-series database
    InfluxDB,

    /// Redis in-memory database
    Redis,

    /// SQLite file-based database
    SQLite,

    /// Mock database for testing
    Mock,
}

/// Connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    /// Hostname or IP address
    pub host: String,

    /// Port number
    pub port: u16,

    /// Database name
    pub database: String,

    /// Username
    pub username: Option<String>,

    /// Password (will be loaded from environment or keyring in practice)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,

    /// SSL/TLS configuration
    pub ssl: SslConfig,

    /// Additional connection parameters
    pub params: HashMap<String, String>,
}

/// SSL/TLS configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SslConfig {
    /// Enable SSL/TLS
    pub enabled: bool,

    /// Require SSL/TLS
    pub required: bool,

    /// Certificate file path
    pub cert_file: Option<String>,

    /// Private key file path
    pub key_file: Option<String>,

    /// CA certificate file path
    pub ca_file: Option<String>,

    /// Verify certificate
    pub verify_cert: bool,
}

/// Connection pool configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolConfig {
    /// Minimum number of connections in pool
    pub min_connections: u32,

    /// Maximum number of connections in pool
    pub max_connections: u32,

    /// Maximum lifetime of a connection
    pub max_lifetime_secs: u64,

    /// Maximum idle time for a connection
    pub max_idle_secs: u64,

    /// Connection acquisition timeout
    pub acquire_timeout_secs: u64,
}

/// Timeout configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeoutConfig {
    /// Connection timeout
    pub connection_secs: u64,

    /// Query timeout
    pub query_secs: u64,

    /// Transaction timeout
    pub transaction_secs: u64,

    /// Health check timeout
    pub health_check_secs: u64,
}

/// Feature configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureConfig {
    /// Enable time-series optimizations
    pub enable_time_series: bool,

    /// Enable streaming/pub-sub
    pub enable_streaming: bool,

    /// Enable transactions
    pub enable_transactions: bool,

    /// Enable automatic data compression
    pub enable_compression: bool,

    /// Enable data retention policies
    pub enable_retention: bool,

    /// Default retention period in days
    pub default_retention_days: Option<u32>,

    /// Enable automatic indexing
    pub enable_auto_indexing: bool,

    /// Maximum batch size for bulk operations
    pub max_batch_size: usize,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            backend: DatabaseBackend::PostgreSQL,
            connection: ConnectionConfig::default(),
            pool: PoolConfig::default(),
            timeouts: TimeoutConfig::default(),
            features: FeatureConfig::default(),
            backend_specific: HashMap::new(),
        }
    }
}

impl Default for ConnectionConfig {
    fn default() -> Self {
        Self {
            host: "localhost".to_string(),
            port: 5432,
            database: "glsp_sensors".to_string(),
            username: Some("glsp".to_string()),
            password: None,
            ssl: SslConfig::default(),
            params: HashMap::new(),
        }
    }
}

impl Default for SslConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            required: false,
            cert_file: None,
            key_file: None,
            ca_file: None,
            verify_cert: true,
        }
    }
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            min_connections: 2,
            max_connections: 10,
            max_lifetime_secs: 3600, // 1 hour
            max_idle_secs: 600,      // 10 minutes
            acquire_timeout_secs: 30,
        }
    }
}

impl Default for TimeoutConfig {
    fn default() -> Self {
        Self {
            connection_secs: 30,
            query_secs: 60,
            transaction_secs: 300, // 5 minutes
            health_check_secs: 10,
        }
    }
}

impl Default for FeatureConfig {
    fn default() -> Self {
        Self {
            enable_time_series: true,
            enable_streaming: false,
            enable_transactions: false,
            enable_compression: true,
            enable_retention: false,
            default_retention_days: None,
            enable_auto_indexing: true,
            max_batch_size: 1000,
        }
    }
}

impl DatabaseConfig {
    /// Create a PostgreSQL configuration
    pub fn postgresql(host: &str, port: u16, database: &str) -> Self {
        Self {
            backend: DatabaseBackend::PostgreSQL,
            connection: ConnectionConfig {
                host: host.to_string(),
                port,
                database: database.to_string(),
                ..Default::default()
            },
            ..Default::default()
        }
    }

    /// Create an InfluxDB configuration
    pub fn influxdb(host: &str, port: u16, database: &str) -> Self {
        Self {
            backend: DatabaseBackend::InfluxDB,
            connection: ConnectionConfig {
                host: host.to_string(),
                port,
                database: database.to_string(),
                ..Default::default()
            },
            features: FeatureConfig {
                enable_time_series: true,
                enable_streaming: true,
                ..Default::default()
            },
            ..Default::default()
        }
    }

    /// Create a Redis configuration
    pub fn redis(host: &str, port: u16) -> Self {
        Self {
            backend: DatabaseBackend::Redis,
            connection: ConnectionConfig {
                host: host.to_string(),
                port,
                database: "0".to_string(), // Redis database number
                ..Default::default()
            },
            features: FeatureConfig {
                enable_streaming: true,
                enable_transactions: false,
                ..Default::default()
            },
            ..Default::default()
        }
    }

    /// Create a SQLite configuration
    pub fn sqlite(path: &str) -> Self {
        Self {
            backend: DatabaseBackend::SQLite,
            connection: ConnectionConfig {
                host: "localhost".to_string(),
                port: 0,
                database: path.to_string(),
                ..Default::default()
            },
            pool: PoolConfig {
                max_connections: 1, // SQLite is single-threaded
                ..Default::default()
            },
            ..Default::default()
        }
    }

    /// Create a mock configuration for testing
    pub fn mock() -> Self {
        Self {
            backend: DatabaseBackend::Mock,
            connection: ConnectionConfig {
                host: "mock".to_string(),
                port: 0,
                database: "mock".to_string(),
                ..Default::default()
            },
            ..Default::default()
        }
    }

    /// Build connection string for the configured backend
    pub fn connection_string(&self) -> Result<String, DatabaseError> {
        match self.backend {
            DatabaseBackend::PostgreSQL => {
                let mut parts = vec![
                    format!("host={}", self.connection.host),
                    format!("port={}", self.connection.port),
                    format!("dbname={}", self.connection.database),
                ];

                if let Some(username) = &self.connection.username {
                    parts.push(format!("user={username}"));
                }

                if let Some(password) = &self.connection.password {
                    parts.push(format!("password={password}"));
                }

                if self.connection.ssl.enabled {
                    parts.push("sslmode=require".to_string());
                } else {
                    parts.push("sslmode=disable".to_string());
                }

                Ok(parts.join(" "))
            }

            DatabaseBackend::InfluxDB => {
                let protocol = if self.connection.ssl.enabled {
                    "https"
                } else {
                    "http"
                };
                Ok(format!(
                    "{}://{}:{}",
                    protocol, self.connection.host, self.connection.port
                ))
            }

            DatabaseBackend::Redis => {
                let protocol = if self.connection.ssl.enabled {
                    "rediss"
                } else {
                    "redis"
                };
                let mut url = format!(
                    "{}://{}:{}",
                    protocol, self.connection.host, self.connection.port
                );

                if !self.connection.database.is_empty() && self.connection.database != "0" {
                    url.push_str(&format!("/{}", self.connection.database));
                }

                Ok(url)
            }

            DatabaseBackend::SQLite => Ok(format!("sqlite:{}", self.connection.database)),

            DatabaseBackend::Mock => Ok("mock://localhost/test".to_string()),
        }
    }

    /// Get connection timeout as Duration
    pub fn connection_timeout(&self) -> Duration {
        Duration::from_secs(self.timeouts.connection_secs)
    }

    /// Get query timeout as Duration
    pub fn query_timeout(&self) -> Duration {
        Duration::from_secs(self.timeouts.query_secs)
    }

    /// Get transaction timeout as Duration
    pub fn transaction_timeout(&self) -> Duration {
        Duration::from_secs(self.timeouts.transaction_secs)
    }

    /// Validate configuration
    pub fn validate(&self) -> Result<(), DatabaseError> {
        if self.connection.host.is_empty() {
            return Err(DatabaseError::ConfigurationError(
                "Host cannot be empty".to_string(),
            ));
        }

        if self.connection.database.is_empty() && self.backend != DatabaseBackend::Redis {
            return Err(DatabaseError::ConfigurationError(
                "Database name cannot be empty".to_string(),
            ));
        }

        if self.pool.min_connections > self.pool.max_connections {
            return Err(DatabaseError::ConfigurationError(
                "Minimum connections cannot exceed maximum connections".to_string(),
            ));
        }

        if self.features.max_batch_size == 0 {
            return Err(DatabaseError::ConfigurationError(
                "Batch size must be greater than 0".to_string(),
            ));
        }

        Ok(())
    }

    /// Load configuration from environment variables
    pub fn from_env() -> Result<Self, DatabaseError> {
        let mut config = Self::default();

        // Database backend
        if let Ok(backend) = std::env::var("GLSP_DB_BACKEND") {
            config.backend = match backend.to_lowercase().as_str() {
                "postgresql" | "postgres" => DatabaseBackend::PostgreSQL,
                "influxdb" | "influx" => DatabaseBackend::InfluxDB,
                "redis" => DatabaseBackend::Redis,
                "sqlite" => DatabaseBackend::SQLite,
                "mock" => DatabaseBackend::Mock,
                _ => {
                    return Err(DatabaseError::ConfigurationError(format!(
                        "Unknown database backend: {backend}"
                    )))
                }
            };
        }

        // Connection settings
        if let Ok(host) = std::env::var("GLSP_DB_HOST") {
            config.connection.host = host;
        }

        if let Ok(port) = std::env::var("GLSP_DB_PORT") {
            config.connection.port = port.parse().map_err(|_| {
                DatabaseError::ConfigurationError("Invalid port number".to_string())
            })?;
        }

        if let Ok(database) = std::env::var("GLSP_DB_NAME") {
            config.connection.database = database;
        }

        if let Ok(username) = std::env::var("GLSP_DB_USER") {
            config.connection.username = Some(username);
        }

        if let Ok(password) = std::env::var("GLSP_DB_PASSWORD") {
            config.connection.password = Some(password);
        }

        // SSL settings
        if let Ok(ssl) = std::env::var("GLSP_DB_SSL") {
            config.connection.ssl.enabled = ssl.to_lowercase() == "true";
        }

        config.validate()?;
        Ok(config)
    }
}
