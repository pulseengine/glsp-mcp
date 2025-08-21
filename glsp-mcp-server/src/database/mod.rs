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

//! Database abstraction layer for GLSP-MCP Server
//!
//! Provides exchangeable database backends for sensor data, simulation state,
//! and other time-series data through a unified SDK interface.

pub mod config;
pub mod dataset;
pub mod error;
pub mod factory;
pub mod models;
pub mod traits;

#[cfg(test)]
pub mod tests;

#[cfg(test)]
pub mod factory_tests;

// Concrete implementations
#[cfg(feature = "postgresql")]
pub mod postgresql;

#[cfg(feature = "influxdb")]
pub mod influxdb;

#[cfg(feature = "redis")]
pub mod redis;

// Ensure modules exist even when features disabled to avoid compilation issues
#[cfg(not(feature = "postgresql"))]
pub mod postgresql {
    //! Stub PostgreSQL module when feature is disabled

    use crate::database::{config::DatabaseConfig, DatabaseError, DatabaseResult};

    pub struct PostgreSQLBackend;

    impl PostgreSQLBackend {
        pub async fn new(_config: DatabaseConfig) -> DatabaseResult<Self> {
            Err(DatabaseError::FeatureNotSupported {
                feature: "PostgreSQL backend not compiled in".to_string(),
            })
        }
    }
}

#[cfg(not(feature = "influxdb"))]
pub mod influxdb {
    //! Stub InfluxDB module when feature is disabled

    use crate::database::{config::DatabaseConfig, DatabaseError, DatabaseResult};

    pub struct InfluxDBBackend;

    impl InfluxDBBackend {
        pub async fn new(_config: DatabaseConfig) -> DatabaseResult<Self> {
            Err(DatabaseError::FeatureNotSupported {
                feature: "InfluxDB backend not compiled in".to_string(),
            })
        }
    }
}

#[cfg(not(feature = "redis"))]
pub mod redis {
    //! Stub Redis module when feature is disabled

    use crate::database::{config::DatabaseConfig, DatabaseError, DatabaseResult};

    pub struct RedisBackend;

    impl RedisBackend {
        pub fn new(_config: &DatabaseConfig) -> DatabaseResult<Self> {
            Err(DatabaseError::FeatureNotSupported {
                feature: "Redis backend not compiled in".to_string(),
            })
        }

        pub async fn initialize(&mut self) -> DatabaseResult<()> {
            Ok(())
        }
    }
}

// Re-exports for convenience
pub use config::DatabaseConfig;
pub use dataset::*;
pub use error::{DatabaseError, DatabaseResult};
pub use factory::DatabaseFactory;
pub use models::*;
pub use traits::*;

/// Version of the database schema/API
pub const DATABASE_API_VERSION: &str = "1.0.0";

/// Default connection timeout in seconds
pub const DEFAULT_CONNECTION_TIMEOUT_SECS: u64 = 30;

/// Default query timeout in seconds
pub const DEFAULT_QUERY_TIMEOUT_SECS: u64 = 60;
