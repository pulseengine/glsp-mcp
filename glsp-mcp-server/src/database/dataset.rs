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

//! Dataset and sensor selection interface
//!
//! Provides high-level interface for managing multiple sensor datasets,
//! allowing users to switch between different test scenarios and sensor configurations.

use crate::database::{models::*, traits::*, DatabaseError, DatabaseResult};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{debug, info, warn};

/// A dataset represents a collection of sensor data for a specific scenario
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorDataset {
    /// Unique dataset identifier
    pub dataset_id: String,

    /// Human-readable name
    pub name: String,

    /// Description of the dataset
    pub description: Option<String>,

    /// Dataset version
    pub version: String,

    /// List of sensors included in this dataset
    pub sensors: Vec<SensorInfo>,

    /// Time range covered by this dataset
    pub time_range: TimeRange,

    /// Dataset tags for categorization
    pub tags: Vec<String>,

    /// Dataset source and origin
    pub source: DatasetSource,

    /// When this dataset was created
    pub created_at: DateTime<Utc>,

    /// Whether this dataset is currently active/loaded
    pub is_active: bool,
}

/// Information about a sensor within a dataset
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorInfo {
    /// Sensor identifier
    pub sensor_id: String,

    /// Sensor metadata
    pub metadata: SensorMetadata,

    /// Statistics for this sensor in the dataset
    pub statistics: SensorStatistics,

    /// Whether this sensor is selected for simulation
    pub is_selected: bool,
}

/// Source and origin of a dataset
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasetSource {
    /// Source type (simulation, recorded, synthetic, etc.)
    pub source_type: DatasetSourceType,

    /// Original file path or URL
    pub path: Option<String>,

    /// Import timestamp
    pub imported_at: DateTime<Utc>,

    /// Checksum for integrity verification
    pub checksum: Option<String>,

    /// Additional metadata
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Types of dataset sources
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DatasetSourceType {
    /// Real vehicle recording
    Recorded,

    /// Simulation data
    Simulation,

    /// Artificially generated test data
    Synthetic,

    /// Live sensor data
    Live,

    /// Custom/unknown source
    Custom(String),
}

/// Configuration for sensor selection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorSelection {
    /// Dataset being used
    pub dataset_id: String,

    /// List of selected sensor IDs
    pub selected_sensors: Vec<String>,

    /// Time range to use from the dataset
    pub time_range: Option<TimeRange>,

    /// Quality filter to apply
    pub min_quality: Option<f32>,

    /// Playback speed multiplier (1.0 = real-time)
    pub playback_speed: f32,

    /// Whether to loop the dataset
    pub loop_playback: bool,

    /// Custom interpolation settings
    pub interpolation: InterpolationSettings,
}

/// Settings for data interpolation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterpolationSettings {
    /// Enable interpolation for missing data
    pub enabled: bool,

    /// Maximum gap to interpolate (microseconds)
    pub max_gap_us: i64,

    /// Interpolation method
    pub method: InterpolationMethod,
}

/// Interpolation methods available
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InterpolationMethod {
    /// Use nearest neighbor
    Nearest,

    /// Linear interpolation
    Linear,

    /// Cubic spline interpolation
    CubicSpline,

    /// Hold last value
    Hold,
}

/// High-level dataset management interface
#[async_trait]
pub trait DatasetManager: Send + Sync {
    /// List all available datasets
    async fn list_datasets(&self) -> DatabaseResult<Vec<SensorDataset>>;

    /// Get detailed information about a dataset
    async fn get_dataset(&self, dataset_id: &str) -> DatabaseResult<Option<SensorDataset>>;

    /// Create a new dataset from sensor data
    async fn create_dataset(&mut self, dataset: &SensorDataset) -> DatabaseResult<()>;

    /// Delete a dataset and all its data
    async fn delete_dataset(&mut self, dataset_id: &str) -> DatabaseResult<()>;

    /// Import sensor data into a dataset
    async fn import_data(&mut self, dataset_id: &str, batch: &SensorBatch) -> DatabaseResult<()>;

    /// Export dataset to file/format
    async fn export_dataset(
        &self,
        dataset_id: &str,
        format: &str,
        destination: &str,
    ) -> DatabaseResult<()>;

    /// Set active dataset for simulation
    async fn set_active_dataset(&mut self, dataset_id: &str) -> DatabaseResult<()>;

    /// Get currently active dataset
    async fn get_active_dataset(&self) -> DatabaseResult<Option<SensorDataset>>;
}

/// Sensor selection and filtering interface
#[async_trait]
pub trait SensorSelector: Send + Sync {
    /// Get all sensors available in a dataset
    async fn list_sensors(&self, dataset_id: &str) -> DatabaseResult<Vec<SensorInfo>>;

    /// Get detailed sensor information
    async fn get_sensor_info(
        &self,
        dataset_id: &str,
        sensor_id: &str,
    ) -> DatabaseResult<Option<SensorInfo>>;

    /// Select sensors for simulation
    async fn select_sensors(
        &mut self,
        dataset_id: &str,
        sensor_ids: &[String],
    ) -> DatabaseResult<()>;

    /// Get current sensor selection
    async fn get_selection(&self, dataset_id: &str) -> DatabaseResult<SensorSelection>;

    /// Update sensor selection configuration
    async fn update_selection(&mut self, selection: &SensorSelection) -> DatabaseResult<()>;

    /// Query sensor data with current selection
    async fn query_selected_data(
        &self,
        dataset_id: &str,
        query: &SensorQuery,
    ) -> DatabaseResult<Vec<SensorReading>>;

    /// Validate sensor selection (check data availability, compatibility)
    async fn validate_selection(
        &self,
        selection: &SensorSelection,
    ) -> DatabaseResult<ValidationResult>;
}

/// Result of sensor selection validation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    /// Is the selection valid?
    pub is_valid: bool,

    /// Validation warnings
    pub warnings: Vec<String>,

    /// Validation errors
    pub errors: Vec<String>,

    /// Estimated data availability
    pub data_coverage: f32, // 0.0 to 1.0

    /// Compatible sensor types
    pub compatible_sensors: Vec<String>,

    /// Recommended optimizations
    pub recommendations: Vec<String>,
}

/// Type alias for dataset manager with boxed trait object
pub type BoxedDatasetManager = DatabaseDatasetManager<Box<dyn DatabaseInterface>>;

/// Implementation of dataset management using database backend
pub struct DatabaseDatasetManager<T: DatabaseInterface> {
    backend: T,
    active_dataset: Option<String>,
    selections: HashMap<String, SensorSelection>,
}

impl<T: DatabaseInterface> DatabaseDatasetManager<T> {
    /// Create new dataset manager
    pub fn new(backend: T) -> Self {
        Self {
            backend,
            active_dataset: None,
            selections: HashMap::new(),
        }
    }

    /// Get backend reference
    pub fn backend(&self) -> &T {
        &self.backend
    }

    /// Get mutable backend reference
    pub fn backend_mut(&mut self) -> &mut T {
        &mut self.backend
    }
}

#[async_trait]
impl<T: DatabaseInterface> DatasetManager for DatabaseDatasetManager<T> {
    async fn list_datasets(&self) -> DatabaseResult<Vec<SensorDataset>> {
        // Get all available sensor data and group by potential datasets
        let sensors = self.backend.list_sensors().await?;
        let mut datasets = Vec::new();

        // For now, create a single dataset from all available data
        // In a real implementation, this would query a datasets table
        if !sensors.is_empty() {
            let time_range = self.backend.get_global_time_range().await?;

            if let Some(range) = time_range {
                let mut sensor_infos = Vec::new();

                for sensor_id in sensors {
                    if let Ok(Some(metadata)) = self.backend.get_sensor_metadata(&sensor_id).await {
                        if let Ok(stats) = self.backend.get_sensor_statistics(&sensor_id).await {
                            sensor_infos.push(SensorInfo {
                                sensor_id: sensor_id.clone(),
                                metadata,
                                statistics: stats,
                                is_selected: false,
                            });
                        }
                    }
                }

                let dataset = SensorDataset {
                    dataset_id: "default".to_string(),
                    name: "Default Dataset".to_string(),
                    description: Some("All available sensor data".to_string()),
                    version: "1.0.0".to_string(),
                    sensors: sensor_infos,
                    time_range: range,
                    tags: vec!["default".to_string()],
                    source: DatasetSource {
                        source_type: DatasetSourceType::Custom("database".to_string()),
                        path: None,
                        imported_at: Utc::now(),
                        checksum: None,
                        metadata: HashMap::new(),
                    },
                    created_at: Utc::now(),
                    is_active: self.active_dataset.as_ref() == Some(&"default".to_string()),
                };

                datasets.push(dataset);
            }
        }

        Ok(datasets)
    }

    async fn get_dataset(&self, dataset_id: &str) -> DatabaseResult<Option<SensorDataset>> {
        let datasets = self.list_datasets().await?;
        Ok(datasets.into_iter().find(|d| d.dataset_id == dataset_id))
    }

    async fn create_dataset(&mut self, dataset: &SensorDataset) -> DatabaseResult<()> {
        // In a full implementation, this would store dataset metadata in a dedicated table
        info!("Created dataset: {} ({})", dataset.name, dataset.dataset_id);
        Ok(())
    }

    async fn delete_dataset(&mut self, dataset_id: &str) -> DatabaseResult<()> {
        warn!("Dataset deletion not fully implemented for: {}", dataset_id);
        Ok(())
    }

    async fn import_data(&mut self, dataset_id: &str, batch: &SensorBatch) -> DatabaseResult<()> {
        info!(
            "Importing {} readings into dataset {}",
            batch.readings.len(),
            dataset_id
        );
        self.backend.store_batch(batch).await
    }

    async fn export_dataset(
        &self,
        dataset_id: &str,
        _format: &str,
        _destination: &str,
    ) -> DatabaseResult<()> {
        warn!("Dataset export not implemented for: {}", dataset_id);
        Err(DatabaseError::FeatureNotSupported {
            feature: "Dataset export".to_string(),
        })
    }

    async fn set_active_dataset(&mut self, dataset_id: &str) -> DatabaseResult<()> {
        // Verify dataset exists
        if self.get_dataset(dataset_id).await?.is_some() {
            self.active_dataset = Some(dataset_id.to_string());
            info!("Set active dataset to: {}", dataset_id);
            Ok(())
        } else {
            Err(DatabaseError::SensorNotFound(format!(
                "Dataset not found: {dataset_id}"
            )))
        }
    }

    async fn get_active_dataset(&self) -> DatabaseResult<Option<SensorDataset>> {
        if let Some(dataset_id) = &self.active_dataset {
            self.get_dataset(dataset_id).await
        } else {
            Ok(None)
        }
    }
}

#[async_trait]
impl<T: DatabaseInterface> SensorSelector for DatabaseDatasetManager<T> {
    async fn list_sensors(&self, dataset_id: &str) -> DatabaseResult<Vec<SensorInfo>> {
        if let Some(dataset) = self.get_dataset(dataset_id).await? {
            Ok(dataset.sensors)
        } else {
            Err(DatabaseError::SensorNotFound(format!(
                "Dataset not found: {dataset_id}"
            )))
        }
    }

    async fn get_sensor_info(
        &self,
        dataset_id: &str,
        sensor_id: &str,
    ) -> DatabaseResult<Option<SensorInfo>> {
        let sensors = self.list_sensors(dataset_id).await?;
        Ok(sensors.into_iter().find(|s| s.sensor_id == sensor_id))
    }

    async fn select_sensors(
        &mut self,
        dataset_id: &str,
        sensor_ids: &[String],
    ) -> DatabaseResult<()> {
        let selection = SensorSelection {
            dataset_id: dataset_id.to_string(),
            selected_sensors: sensor_ids.to_vec(),
            time_range: None,
            min_quality: None,
            playback_speed: 1.0,
            loop_playback: false,
            interpolation: InterpolationSettings {
                enabled: true,
                max_gap_us: 1_000_000, // 1 second
                method: InterpolationMethod::Linear,
            },
        };

        self.selections.insert(dataset_id.to_string(), selection);
        info!(
            "Selected {} sensors for dataset {}",
            sensor_ids.len(),
            dataset_id
        );
        Ok(())
    }

    async fn get_selection(&self, dataset_id: &str) -> DatabaseResult<SensorSelection> {
        if let Some(selection) = self.selections.get(dataset_id) {
            Ok(selection.clone())
        } else {
            // Return default selection with all sensors
            let sensors = self.list_sensors(dataset_id).await?;
            let sensor_ids: Vec<String> = sensors.iter().map(|s| s.sensor_id.clone()).collect();

            Ok(SensorSelection {
                dataset_id: dataset_id.to_string(),
                selected_sensors: sensor_ids,
                time_range: None,
                min_quality: None,
                playback_speed: 1.0,
                loop_playback: false,
                interpolation: InterpolationSettings {
                    enabled: true,
                    max_gap_us: 1_000_000,
                    method: InterpolationMethod::Linear,
                },
            })
        }
    }

    async fn update_selection(&mut self, selection: &SensorSelection) -> DatabaseResult<()> {
        self.selections
            .insert(selection.dataset_id.clone(), selection.clone());
        debug!(
            "Updated sensor selection for dataset: {}",
            selection.dataset_id
        );
        Ok(())
    }

    async fn query_selected_data(
        &self,
        dataset_id: &str,
        query: &SensorQuery,
    ) -> DatabaseResult<Vec<SensorReading>> {
        let selection = self.get_selection(dataset_id).await?;

        // Create modified query with selected sensors
        let mut modified_query = query.clone();
        if !selection.selected_sensors.is_empty() {
            modified_query.sensor_ids = selection.selected_sensors;
        }

        // Apply selection filters
        if let Some(min_quality) = selection.min_quality {
            modified_query.min_quality = Some(min_quality);
        }

        if let Some(time_range) = &selection.time_range {
            // Intersect with selection time range
            modified_query.start_time_us =
                modified_query.start_time_us.max(time_range.start_time_us);
            modified_query.end_time_us = modified_query.end_time_us.min(time_range.end_time_us);
        }

        self.backend.query_readings(&modified_query).await
    }

    async fn validate_selection(
        &self,
        selection: &SensorSelection,
    ) -> DatabaseResult<ValidationResult> {
        let mut warnings = Vec::new();
        let mut errors = Vec::new();
        let mut recommendations = Vec::new();

        // Check if dataset exists
        if self.get_dataset(&selection.dataset_id).await?.is_none() {
            errors.push(format!("Dataset not found: {}", selection.dataset_id));
            return Ok(ValidationResult {
                is_valid: false,
                warnings,
                errors,
                data_coverage: 0.0,
                compatible_sensors: vec![],
                recommendations,
            });
        }

        // Check if selected sensors exist
        let available_sensors = self.list_sensors(&selection.dataset_id).await?;
        let available_ids: Vec<String> = available_sensors
            .iter()
            .map(|s| s.sensor_id.clone())
            .collect();

        let mut compatible_sensors = Vec::new();
        for sensor_id in &selection.selected_sensors {
            if available_ids.contains(sensor_id) {
                compatible_sensors.push(sensor_id.clone());
            } else {
                warnings.push(format!("Sensor not found in dataset: {sensor_id}"));
            }
        }

        // Calculate data coverage
        let total_sensors = available_sensors.len();
        let selected_count = compatible_sensors.len();
        let data_coverage = if total_sensors > 0 {
            selected_count as f32 / total_sensors as f32
        } else {
            0.0
        };

        // Generate recommendations
        if selected_count == 0 {
            recommendations.push("Select at least one sensor for simulation".to_string());
        }

        if selection.playback_speed > 10.0 {
            warnings.push("High playback speed may cause timing issues".to_string());
        }

        if data_coverage < 0.5 {
            recommendations
                .push("Consider selecting more sensors for better simulation coverage".to_string());
        }

        Ok(ValidationResult {
            is_valid: errors.is_empty() && selected_count > 0,
            warnings,
            errors,
            data_coverage,
            compatible_sensors,
            recommendations,
        })
    }
}

impl Default for InterpolationSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            max_gap_us: 1_000_000, // 1 second
            method: InterpolationMethod::Linear,
        }
    }
}

impl Default for SensorSelection {
    fn default() -> Self {
        Self {
            dataset_id: "default".to_string(),
            selected_sensors: vec![],
            time_range: None,
            min_quality: None,
            playback_speed: 1.0,
            loop_playback: false,
            interpolation: InterpolationSettings::default(),
        }
    }
}
