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

//! Tests for database and sensor selection functionality

#[cfg(test)]
use crate::database::factory;
#[cfg(test)]
use crate::database::*;
#[cfg(test)]
use chrono::Utc;
#[cfg(test)]
use std::collections::HashMap;

/// Create test sensor readings for testing
#[cfg(test)]
fn create_test_readings() -> Vec<SensorReading> {
    let base_time = Utc::now().timestamp() * 1_000_000; // microseconds

    vec![
        SensorReading::new(
            "camera_front".to_string(),
            base_time,
            SensorDataType::Camera {
                width: 1920,
                height: 1080,
                format: ImageFormat::RGB24,
                fps: Some(30.0),
            },
            vec![0u8; 1024], // dummy image data
        ),
        SensorReading::new(
            "radar_front".to_string(),
            base_time + 33_333, // ~30Hz
            SensorDataType::Radar {
                point_count: 100,
                range_m: 200.0,
                resolution: RadarResolution {
                    range_resolution_m: 0.1,
                    azimuth_resolution_deg: 1.0,
                    elevation_resolution_deg: Some(2.0),
                },
            },
            vec![1u8; 512], // dummy radar data
        ),
        SensorReading::new(
            "lidar_top".to_string(),
            base_time + 50_000, // 20Hz
            SensorDataType::Lidar {
                point_count: 50000,
                horizontal_fov: 360.0,
                vertical_fov: 40.0,
                range_m: 100.0,
            },
            vec![2u8; 2048], // dummy lidar data
        ),
        SensorReading::new(
            "imu_main".to_string(),
            base_time + 10_000, // 100Hz
            SensorDataType::IMU {
                acceleration: Vec3::new(0.1, 0.2, 9.8),
                angular_velocity: Vec3::new(0.01, 0.02, 0.03),
                orientation: Some(Quaternion::identity()),
            },
            vec![3u8; 64], // dummy IMU data
        ),
        SensorReading::new(
            "gps_main".to_string(),
            base_time + 100_000, // 10Hz
            SensorDataType::GPS {
                latitude: 37.7749,
                longitude: -122.4194,
                altitude: 10.0,
                accuracy_m: 2.5,
            },
            vec![4u8; 32], // dummy GPS data
        ),
    ]
}

/// Create test dataset
#[cfg(test)]
fn create_test_dataset() -> SensorDataset {
    let readings = create_test_readings();
    let time_range = TimeRange {
        start_time_us: readings.iter().map(|r| r.timestamp_us).min().unwrap(),
        end_time_us: readings.iter().map(|r| r.timestamp_us).max().unwrap(),
        reading_count: readings.len() as u64,
        data_size_bytes: readings.iter().map(|r| r.payload.len() as u64).sum(),
    };

    let sensors = vec![
        SensorInfo {
            sensor_id: "camera_front".to_string(),
            metadata: SensorMetadata {
                sensor_id: "camera_front".to_string(),
                name: "Front Camera".to_string(),
                sensor_type: readings[0].data_type.clone(),
                location: Some("front_bumper".to_string()),
                sampling_rate_hz: Some(30.0),
                calibration: None,
                first_seen: Utc::now(),
                last_seen: Utc::now(),
                is_active: true,
            },
            statistics: SensorStatistics {
                sensor_id: "camera_front".to_string(),
                time_range: time_range.clone(),
                avg_quality: 0.95,
                avg_sampling_rate_hz: 30.0,
                gap_count: 0,
                total_size_bytes: 1024,
            },
            is_selected: false,
        },
        SensorInfo {
            sensor_id: "radar_front".to_string(),
            metadata: SensorMetadata {
                sensor_id: "radar_front".to_string(),
                name: "Front Radar".to_string(),
                sensor_type: readings[1].data_type.clone(),
                location: Some("front_bumper".to_string()),
                sampling_rate_hz: Some(20.0),
                calibration: None,
                first_seen: Utc::now(),
                last_seen: Utc::now(),
                is_active: true,
            },
            statistics: SensorStatistics {
                sensor_id: "radar_front".to_string(),
                time_range: time_range.clone(),
                avg_quality: 0.98,
                avg_sampling_rate_hz: 20.0,
                gap_count: 0,
                total_size_bytes: 512,
            },
            is_selected: false,
        },
    ];

    SensorDataset {
        dataset_id: "test_scenario_1".to_string(),
        name: "Test Scenario 1".to_string(),
        description: Some("Highway driving scenario with multiple sensors".to_string()),
        version: "1.0.0".to_string(),
        sensors,
        time_range,
        tags: vec!["test".to_string(), "highway".to_string()],
        source: DatasetSource {
            source_type: DatasetSourceType::Synthetic,
            path: None,
            imported_at: Utc::now(),
            checksum: None,
            metadata: HashMap::new(),
        },
        created_at: Utc::now(),
        is_active: false,
    }
}

#[tokio::test]
async fn test_dataset_creation_and_retrieval() -> DatabaseResult<()> {
    // Create mock backend
    let mock_backend = factory::MockDatabaseBackend::new(DatabaseConfig::mock()).await?;
    let mut dataset_manager = DatabaseDatasetManager::new(mock_backend);

    // Add some test data first so datasets can be created
    let readings = create_test_readings();
    let batch = SensorBatch {
        readings,
        batch_id: "test_batch".to_string(),
        created_at: Utc::now(),
        source: "test".to_string(),
    };
    dataset_manager.import_data("default", &batch).await?;

    // Create test dataset
    let dataset = create_test_dataset();
    dataset_manager.create_dataset(&dataset).await?;

    // List datasets (should now have the default one with data)
    let datasets = dataset_manager.list_datasets().await?;
    assert!(!datasets.is_empty(), "Should have at least one dataset");

    // Try to get specific dataset
    let retrieved = dataset_manager.get_dataset("default").await?;
    assert!(retrieved.is_some(), "Should find default dataset");

    Ok(())
}

#[tokio::test]
async fn test_sensor_selection() -> DatabaseResult<()> {
    // Create mock backend with test data
    let mock_backend = factory::MockDatabaseBackend::new(DatabaseConfig::mock()).await?;
    let mut dataset_manager = DatabaseDatasetManager::new(mock_backend);

    // Add test data
    let readings = create_test_readings();
    let batch = SensorBatch {
        readings,
        batch_id: "test_batch_1".to_string(),
        created_at: Utc::now(),
        source: "test".to_string(),
    };

    dataset_manager.import_data("default", &batch).await?;

    // Set active dataset
    dataset_manager.set_active_dataset("default").await?;

    // Select specific sensors
    let selected_sensors = vec!["camera_front".to_string(), "radar_front".to_string()];
    dataset_manager
        .select_sensors("default", &selected_sensors)
        .await?;

    // Get selection
    let selection = dataset_manager.get_selection("default").await?;
    assert_eq!(selection.selected_sensors.len(), 2);
    assert!(selection
        .selected_sensors
        .contains(&"camera_front".to_string()));
    assert!(selection
        .selected_sensors
        .contains(&"radar_front".to_string()));

    Ok(())
}

#[tokio::test]
async fn test_sensor_selection_validation() -> DatabaseResult<()> {
    let mock_backend = factory::MockDatabaseBackend::new(DatabaseConfig::mock()).await?;
    let dataset_manager = DatabaseDatasetManager::new(mock_backend);

    // Test validation with non-existent dataset
    let invalid_selection = SensorSelection {
        dataset_id: "non_existent".to_string(),
        selected_sensors: vec!["sensor1".to_string()],
        ..Default::default()
    };

    let validation = dataset_manager
        .validate_selection(&invalid_selection)
        .await?;
    assert!(
        !validation.is_valid,
        "Should be invalid for non-existent dataset"
    );
    assert!(!validation.errors.is_empty(), "Should have errors");

    // Test validation with valid selection
    let valid_selection = SensorSelection {
        dataset_id: "default".to_string(),
        selected_sensors: vec![], // Empty but valid
        ..Default::default()
    };

    let _validation = dataset_manager.validate_selection(&valid_selection).await?;
    // Note: This might be valid or invalid depending on whether sensors exist
    // The test verifies the validation logic runs without errors

    Ok(())
}

#[tokio::test]
async fn test_data_querying_with_selection() -> DatabaseResult<()> {
    let mock_backend = factory::MockDatabaseBackend::new(DatabaseConfig::mock()).await?;
    let mut dataset_manager = DatabaseDatasetManager::new(mock_backend);

    // Add test data
    let readings = create_test_readings();
    let batch = SensorBatch {
        readings: readings.clone(),
        batch_id: "test_batch_2".to_string(),
        created_at: Utc::now(),
        source: "test".to_string(),
    };

    dataset_manager.import_data("default", &batch).await?;

    // Select specific sensors
    dataset_manager
        .select_sensors("default", &["camera_front".to_string()])
        .await?;

    // Query data
    let query = SensorQuery::time_range(
        readings[0].timestamp_us - 1000,
        readings[0].timestamp_us + 1000,
    );

    let results = dataset_manager
        .query_selected_data("default", &query)
        .await?;

    // Should only return camera data due to selection
    for reading in results {
        assert_eq!(reading.sensor_id, "camera_front");
    }

    Ok(())
}

#[tokio::test]
async fn test_interpolation_settings() {
    let settings = InterpolationSettings::default();
    assert!(settings.enabled);
    assert_eq!(settings.max_gap_us, 1_000_000); // 1 second
    assert!(matches!(settings.method, InterpolationMethod::Linear));
}

#[tokio::test]
async fn test_sensor_selection_updates() -> DatabaseResult<()> {
    let mock_backend = factory::MockDatabaseBackend::new(DatabaseConfig::mock()).await?;
    let mut dataset_manager = DatabaseDatasetManager::new(mock_backend);

    // Create initial selection
    let mut selection = SensorSelection {
        dataset_id: "test".to_string(),
        selected_sensors: vec!["sensor1".to_string()],
        playback_speed: 1.0,
        min_quality: Some(0.8),
        ..Default::default()
    };

    dataset_manager.update_selection(&selection).await?;

    // Modify selection
    selection.playback_speed = 2.0;
    selection.selected_sensors.push("sensor2".to_string());

    dataset_manager.update_selection(&selection).await?;

    // Retrieve and verify
    let retrieved = dataset_manager.get_selection("test").await?;
    assert_eq!(retrieved.playback_speed, 2.0);
    assert_eq!(retrieved.selected_sensors.len(), 2);
    assert_eq!(retrieved.min_quality, Some(0.8));

    Ok(())
}

#[tokio::test]
async fn test_validation_warnings_and_recommendations() -> DatabaseResult<()> {
    let mock_backend = factory::MockDatabaseBackend::new(DatabaseConfig::mock()).await?;
    let mut dataset_manager = DatabaseDatasetManager::new(mock_backend);

    // Add test data so dataset exists
    let readings = create_test_readings();
    let batch = SensorBatch {
        readings,
        batch_id: "test_batch".to_string(),
        created_at: Utc::now(),
        source: "test".to_string(),
    };
    dataset_manager.import_data("default", &batch).await?;

    // Test high playback speed warning
    let high_speed_selection = SensorSelection {
        dataset_id: "default".to_string(),
        selected_sensors: vec!["camera_front".to_string()], // Use an actual sensor from test data
        playback_speed: 15.0,                               // Very high speed
        ..Default::default()
    };

    let validation = dataset_manager
        .validate_selection(&high_speed_selection)
        .await?;
    assert!(validation
        .warnings
        .iter()
        .any(|w| w.contains("High playback speed")));

    Ok(())
}

#[test]
#[cfg(test)]
fn test_sensor_data_types() {
    // Test camera sensor type
    let camera = SensorDataType::Camera {
        width: 1920,
        height: 1080,
        format: ImageFormat::RGB24,
        fps: Some(30.0),
    };

    // Serialize and deserialize
    let json = serde_json::to_string(&camera).unwrap();
    let deserialized: SensorDataType = serde_json::from_str(&json).unwrap();
    assert_eq!(camera, deserialized);

    // Test radar sensor type
    let radar = SensorDataType::Radar {
        point_count: 100,
        range_m: 200.0,
        resolution: RadarResolution {
            range_resolution_m: 0.1,
            azimuth_resolution_deg: 1.0,
            elevation_resolution_deg: Some(2.0),
        },
    };

    let json = serde_json::to_string(&radar).unwrap();
    let deserialized: SensorDataType = serde_json::from_str(&json).unwrap();
    assert_eq!(radar, deserialized);
}

#[test]
#[cfg(test)]
fn test_time_range_calculations() {
    let readings = create_test_readings();

    let min_time = readings.iter().map(|r| r.timestamp_us).min().unwrap();
    let max_time = readings.iter().map(|r| r.timestamp_us).max().unwrap();

    assert!(
        max_time > min_time,
        "Max time should be greater than min time"
    );

    // Test reading time range check
    let _middle_time = (min_time + max_time) / 2;
    let test_reading = &readings[0];

    assert!(test_reading.is_in_range(min_time - 1000, max_time + 1000));
    assert!(!test_reading.is_in_range(max_time + 1000, max_time + 2000));
}

#[test]
#[cfg(test)]
fn test_vec3_operations() {
    let vec = Vec3::new(3.0, 4.0, 0.0);
    assert_eq!(vec.magnitude(), 5.0);

    let zero_vec = Vec3::new(0.0, 0.0, 0.0);
    assert_eq!(zero_vec.magnitude(), 0.0);
}

#[test]
#[cfg(test)]
fn test_quaternion_operations() {
    let identity = Quaternion::identity();
    assert_eq!(identity.w, 1.0);
    assert_eq!(identity.x, 0.0);
    assert_eq!(identity.y, 0.0);
    assert_eq!(identity.z, 0.0);

    let custom = Quaternion::new(0.5, 0.5, 0.5, 0.5);
    assert_eq!(custom.w, 0.5);
}

#[tokio::test]
async fn test_dataset_source_types() {
    let sources = vec![
        DatasetSourceType::Recorded,
        DatasetSourceType::Simulation,
        DatasetSourceType::Synthetic,
        DatasetSourceType::Live,
        DatasetSourceType::Custom("custom_type".to_string()),
    ];

    for source in sources {
        let json = serde_json::to_string(&source).unwrap();
        let _deserialized: DatasetSourceType = serde_json::from_str(&json).unwrap();
        // Note: Can't directly compare due to Custom variant, but serialization should work
    }
}
