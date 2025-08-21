// Trajectory data structures for Social-LSTM behavior prediction
// Handles agent trajectories, positions, and trajectory sequences

use ndarray::{Array2, Array3};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 2D position with timestamp
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct TrajectoryPoint {
    pub x: f64,
    pub y: f64,
    pub timestamp: f64, // Time in seconds
    pub velocity_x: Option<f64>,
    pub velocity_y: Option<f64>,
}

impl TrajectoryPoint {
    pub fn new(x: f64, y: f64, timestamp: f64) -> Self {
        Self {
            x,
            y,
            timestamp,
            velocity_x: None,
            velocity_y: None,
        }
    }

    pub fn with_velocity(mut self, vx: f64, vy: f64) -> Self {
        self.velocity_x = Some(vx);
        self.velocity_y = Some(vy);
        self
    }

    /// Calculate Euclidean distance to another point
    pub fn distance_to(&self, other: &TrajectoryPoint) -> f64 {
        ((self.x - other.x).powi(2) + (self.y - other.y).powi(2)).sqrt()
    }

    /// Calculate velocity if previous point is available
    pub fn calculate_velocity(&self, previous: &TrajectoryPoint) -> (f64, f64) {
        let dt = self.timestamp - previous.timestamp;
        if dt > 0.0 {
            let vx = (self.x - previous.x) / dt;
            let vy = (self.y - previous.y) / dt;
            (vx, vy)
        } else {
            (0.0, 0.0)
        }
    }
}

/// Sequence of trajectory points for prediction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrajectorySequence {
    pub points: Vec<TrajectoryPoint>,
    pub agent_id: String,
    pub agent_type: AgentType,
    pub confidence: f64, // Prediction confidence [0.0, 1.0]
}

impl TrajectorySequence {
    pub fn new(agent_id: String, agent_type: AgentType) -> Self {
        Self {
            points: Vec::new(),
            agent_id,
            agent_type,
            confidence: 1.0,
        }
    }

    pub fn with_points(mut self, points: Vec<TrajectoryPoint>) -> Self {
        self.points = points;
        self
    }

    pub fn with_confidence(mut self, confidence: f64) -> Self {
        self.confidence = confidence.clamp(0.0, 1.0);
        self
    }

    /// Get the length of the trajectory
    pub fn len(&self) -> usize {
        self.points.len()
    }

    /// Check if trajectory is empty
    pub fn is_empty(&self) -> bool {
        self.points.is_empty()
    }

    /// Get the last point in the trajectory
    pub fn last_point(&self) -> Option<&TrajectoryPoint> {
        self.points.last()
    }

    /// Get the first point in the trajectory
    pub fn first_point(&self) -> Option<&TrajectoryPoint> {
        self.points.first()
    }

    /// Calculate total trajectory distance
    pub fn total_distance(&self) -> f64 {
        self.points
            .windows(2)
            .map(|w| w[0].distance_to(&w[1]))
            .sum()
    }

    /// Get trajectory duration in seconds
    pub fn duration(&self) -> f64 {
        if let (Some(first), Some(last)) = (self.first_point(), self.last_point()) {
            last.timestamp - first.timestamp
        } else {
            0.0
        }
    }

    /// Sample trajectory at regular intervals
    pub fn sample_at_intervals(&self, interval: f64) -> Vec<TrajectoryPoint> {
        if self.points.is_empty() {
            return Vec::new();
        }

        let mut sampled = Vec::new();
        let start_time = self.points[0].timestamp;
        let end_time = self.points.last().unwrap().timestamp;

        let mut current_time = start_time;
        while current_time <= end_time {
            if let Some(point) = self.interpolate_at_time(current_time) {
                sampled.push(point);
            }
            current_time += interval;
        }

        sampled
    }

    /// Interpolate trajectory at specific time
    pub fn interpolate_at_time(&self, target_time: f64) -> Option<TrajectoryPoint> {
        if self.points.is_empty() {
            return None;
        }

        // Find the two points to interpolate between
        let mut before_idx = None;
        let mut after_idx = None;

        for (i, point) in self.points.iter().enumerate() {
            if point.timestamp <= target_time {
                before_idx = Some(i);
            }
            if point.timestamp >= target_time && after_idx.is_none() {
                after_idx = Some(i);
                break;
            }
        }

        match (before_idx, after_idx) {
            (Some(before), Some(after)) if before == after => Some(self.points[before]),
            (Some(before), Some(after)) => {
                let p1 = &self.points[before];
                let p2 = &self.points[after];
                let t = (target_time - p1.timestamp) / (p2.timestamp - p1.timestamp);

                Some(TrajectoryPoint {
                    x: p1.x + t * (p2.x - p1.x),
                    y: p1.y + t * (p2.y - p1.y),
                    timestamp: target_time,
                    velocity_x: match (p1.velocity_x, p2.velocity_x) {
                        (Some(v1), Some(v2)) => Some(v1 + t * (v2 - v1)),
                        _ => None,
                    },
                    velocity_y: match (p1.velocity_y, p2.velocity_y) {
                        (Some(v1), Some(v2)) => Some(v1 + t * (v2 - v1)),
                        _ => None,
                    },
                })
            }
            (Some(before), None) => Some(self.points[before]),
            (None, Some(after)) => Some(self.points[after]),
            _ => None,
        }
    }
}

/// Agent type classification for behavior modeling
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AgentType {
    Pedestrian,
    Cyclist,
    Vehicle,
    Motorcycle,
    Emergency,
    Unknown,
}

impl AgentType {
    /// Get typical speed range for agent type (m/s)
    pub fn speed_range(&self) -> (f64, f64) {
        match self {
            AgentType::Pedestrian => (0.0, 3.0),  // 0-11 km/h
            AgentType::Cyclist => (0.0, 8.0),     // 0-29 km/h
            AgentType::Vehicle => (0.0, 25.0),    // 0-90 km/h
            AgentType::Motorcycle => (0.0, 30.0), // 0-108 km/h
            AgentType::Emergency => (0.0, 35.0),  // 0-126 km/h
            AgentType::Unknown => (0.0, 15.0),    // Conservative estimate
        }
    }

    /// Get typical agent dimensions (length, width) in meters
    pub fn dimensions(&self) -> (f64, f64) {
        match self {
            AgentType::Pedestrian => (0.6, 0.6),
            AgentType::Cyclist => (1.8, 0.7),
            AgentType::Vehicle => (4.5, 1.8),
            AgentType::Motorcycle => (2.2, 0.8),
            AgentType::Emergency => (5.5, 2.0),
            AgentType::Unknown => (2.0, 1.0),
        }
    }
}

/// Complete agent trajectory with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTrajectory {
    pub agent_id: String,
    pub agent_type: AgentType,
    pub historical_sequence: TrajectorySequence,
    pub predicted_sequence: Option<TrajectorySequence>,
    pub last_observed_time: f64,
    pub metadata: HashMap<String, String>,
}

impl AgentTrajectory {
    pub fn new(agent_id: String, agent_type: AgentType) -> Self {
        Self {
            agent_id: agent_id.clone(),
            agent_type,
            historical_sequence: TrajectorySequence::new(agent_id.clone(), agent_type),
            predicted_sequence: None,
            last_observed_time: 0.0,
            metadata: HashMap::new(),
        }
    }

    pub fn add_observation(&mut self, point: TrajectoryPoint) {
        self.historical_sequence.points.push(point);
        self.last_observed_time = point.timestamp;
    }

    pub fn set_prediction(&mut self, prediction: TrajectorySequence) {
        self.predicted_sequence = Some(prediction);
    }

    /// Get current position (last observed point)
    pub fn current_position(&self) -> Option<&TrajectoryPoint> {
        self.historical_sequence.last_point()
    }

    /// Get current velocity estimate
    pub fn current_velocity(&self) -> Option<(f64, f64)> {
        let points = &self.historical_sequence.points;
        if points.len() >= 2 {
            let last = &points[points.len() - 1];
            let prev = &points[points.len() - 2];
            Some(last.calculate_velocity(prev))
        } else {
            None
        }
    }

    /// Check if agent is currently moving
    pub fn is_moving(&self, velocity_threshold: f64) -> bool {
        if let Some((vx, vy)) = self.current_velocity() {
            (vx.powi(2) + vy.powi(2)).sqrt() > velocity_threshold
        } else {
            false
        }
    }

    /// Get standardized historical sequence for model input
    pub fn get_input_sequence(&self, sequence_length: usize, dt: f64) -> Array2<f64> {
        let mut sequence = Array2::zeros((sequence_length, 2));

        if let Some(current_point) = self.current_position() {
            let start_time = current_point.timestamp - (sequence_length as f64 - 1.0) * dt;

            for i in 0..sequence_length {
                let target_time = start_time + i as f64 * dt;
                if let Some(point) = self.historical_sequence.interpolate_at_time(target_time) {
                    sequence[[i, 0]] = point.x;
                    sequence[[i, 1]] = point.y;
                } else if let Some(first_point) = self.historical_sequence.first_point() {
                    // Use first known position for times before trajectory start
                    sequence[[i, 0]] = first_point.x;
                    sequence[[i, 1]] = first_point.y;
                }
            }
        }

        sequence
    }

    /// Convert relative coordinates to absolute
    pub fn to_absolute_coordinates(&self, origin: &TrajectoryPoint) -> Self {
        let mut absolute_trajectory = self.clone();

        // Convert historical sequence
        for point in &mut absolute_trajectory.historical_sequence.points {
            point.x += origin.x;
            point.y += origin.y;
        }

        // Convert predicted sequence if exists
        if let Some(ref mut predicted) = absolute_trajectory.predicted_sequence {
            for point in &mut predicted.points {
                point.x += origin.x;
                point.y += origin.y;
            }
        }

        absolute_trajectory
    }

    /// Convert absolute coordinates to relative
    pub fn to_relative_coordinates(&self, origin: &TrajectoryPoint) -> Self {
        let mut relative_trajectory = self.clone();

        // Convert historical sequence
        for point in &mut relative_trajectory.historical_sequence.points {
            point.x -= origin.x;
            point.y -= origin.y;
        }

        // Convert predicted sequence if exists
        if let Some(ref mut predicted) = relative_trajectory.predicted_sequence {
            for point in &mut predicted.points {
                point.x -= origin.x;
                point.y -= origin.y;
            }
        }

        relative_trajectory
    }
}

/// Batch trajectory processing utilities
pub struct TrajectoryBatch {
    pub trajectories: Vec<AgentTrajectory>,
    pub batch_timestamp: f64,
}

impl TrajectoryBatch {
    pub fn new(trajectories: Vec<AgentTrajectory>) -> Self {
        let batch_timestamp = trajectories
            .iter()
            .map(|t| t.last_observed_time)
            .fold(0.0, f64::max);

        Self {
            trajectories,
            batch_timestamp,
        }
    }

    /// Get all agent positions at the batch timestamp
    pub fn get_synchronized_positions(&self) -> Vec<TrajectoryPoint> {
        self.trajectories
            .iter()
            .filter_map(|traj| {
                traj.historical_sequence
                    .interpolate_at_time(self.batch_timestamp)
            })
            .collect()
    }

    /// Create input tensor for Social-LSTM model
    pub fn to_model_input(&self, sequence_length: usize, dt: f64) -> Array3<f64> {
        let num_agents = self.trajectories.len();
        let mut input_tensor = Array3::zeros((num_agents, sequence_length, 2));

        for (i, trajectory) in self.trajectories.iter().enumerate() {
            let sequence = trajectory.get_input_sequence(sequence_length, dt);
            input_tensor.slice_mut(s![i, .., ..]).assign(&sequence);
        }

        input_tensor
    }

    /// Filter trajectories by agent type
    pub fn filter_by_type(&self, agent_type: AgentType) -> Vec<&AgentTrajectory> {
        self.trajectories
            .iter()
            .filter(|traj| traj.agent_type == agent_type)
            .collect()
    }

    /// Get agent IDs in batch
    pub fn agent_ids(&self) -> Vec<&str> {
        self.trajectories
            .iter()
            .map(|traj| traj.agent_id.as_str())
            .collect()
    }
}

// Import ndarray slice macro
use ndarray::s;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trajectory_point_distance() {
        let p1 = TrajectoryPoint::new(0.0, 0.0, 0.0);
        let p2 = TrajectoryPoint::new(3.0, 4.0, 1.0);
        assert_eq!(p1.distance_to(&p2), 5.0);
    }

    #[test]
    fn test_trajectory_interpolation() {
        let mut sequence = TrajectorySequence::new("test".to_string(), AgentType::Pedestrian);
        sequence.points = vec![
            TrajectoryPoint::new(0.0, 0.0, 0.0),
            TrajectoryPoint::new(2.0, 2.0, 2.0),
        ];

        let interpolated = sequence.interpolate_at_time(1.0).unwrap();
        assert_eq!(interpolated.x, 1.0);
        assert_eq!(interpolated.y, 1.0);
    }

    #[test]
    fn test_agent_type_properties() {
        assert_eq!(AgentType::Pedestrian.speed_range(), (0.0, 3.0));
        assert_eq!(AgentType::Vehicle.dimensions(), (4.5, 1.8));
    }
}
