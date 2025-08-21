// Social-LSTM core implementation
// Handles social pooling, grid-based neighbor detection, and preprocessing

use crate::trajectory::{AgentTrajectory, TrajectoryPoint, TrajectorySequence};
use crate::SocialLSTMConfig;
use ndarray::{Array2, Array3, Array4};
// Remove unused imports

/// Social pooling grid for modeling agent interactions
#[derive(Debug, Clone)]
pub struct GridMask {
    pub grid_size: (usize, usize),
    pub cell_size: f64,
    pub neighborhood_size: f64,
}

impl GridMask {
    pub fn new(grid_size: (usize, usize), neighborhood_size: f64) -> Self {
        let cell_size = (2.0 * neighborhood_size) / grid_size.0 as f64;
        Self {
            grid_size,
            cell_size,
            neighborhood_size,
        }
    }

    /// Convert world coordinates to grid coordinates
    pub fn world_to_grid(
        &self,
        x: f64,
        y: f64,
        origin_x: f64,
        origin_y: f64,
    ) -> Option<(usize, usize)> {
        let rel_x = x - origin_x + self.neighborhood_size;
        let rel_y = y - origin_y + self.neighborhood_size;

        if rel_x >= 0.0 && rel_y >= 0.0 {
            let grid_x = (rel_x / self.cell_size) as usize;
            let grid_y = (rel_y / self.cell_size) as usize;

            if grid_x < self.grid_size.0 && grid_y < self.grid_size.1 {
                Some((grid_x, grid_y))
            } else {
                None
            }
        } else {
            None
        }
    }

    /// Check if position is within neighborhood
    pub fn is_in_neighborhood(&self, x: f64, y: f64, origin_x: f64, origin_y: f64) -> bool {
        let dx = x - origin_x;
        let dy = y - origin_y;
        (dx.powi(2) + dy.powi(2)).sqrt() <= self.neighborhood_size
    }
}

/// Social pooling layer for aggregating neighbor information
pub struct SocialPooling {
    pub grid_mask: GridMask,
    pub embedding_size: usize,
}

impl SocialPooling {
    pub fn new(config: &SocialLSTMConfig) -> Self {
        Self {
            grid_mask: GridMask::new(config.grid_size, config.neighborhood_size),
            embedding_size: config.social_embedding_size,
        }
    }

    /// Compute social tensor for target agent given neighbors
    pub fn compute_social_tensor(
        &self,
        target_position: &TrajectoryPoint,
        neighbor_positions: &[TrajectoryPoint],
        neighbor_embeddings: &Array2<f64>,
    ) -> Array3<f64> {
        let (grid_h, grid_w) = self.grid_mask.grid_size;
        let mut social_tensor = Array3::zeros((grid_h, grid_w, self.embedding_size));

        // For each neighbor, add its contribution to the appropriate grid cell
        for (i, neighbor_pos) in neighbor_positions.iter().enumerate() {
            if let Some((grid_x, grid_y)) = self.grid_mask.world_to_grid(
                neighbor_pos.x,
                neighbor_pos.y,
                target_position.x,
                target_position.y,
            ) {
                // Add neighbor's embedding to the grid cell
                for j in 0..self.embedding_size {
                    social_tensor[[grid_x, grid_y, j]] += neighbor_embeddings[[i, j]];
                }
            }
        }

        social_tensor
    }

    /// Compute social tensors for multiple agents in a batch
    pub fn compute_batch_social_tensors(
        &self,
        agent_positions: &[TrajectoryPoint],
        agent_embeddings: &Array2<f64>,
    ) -> Array4<f64> {
        let num_agents = agent_positions.len();
        let (grid_h, grid_w) = self.grid_mask.grid_size;
        let mut batch_social_tensors =
            Array4::zeros((num_agents, grid_h, grid_w, self.embedding_size));

        for i in 0..num_agents {
            let target_pos = &agent_positions[i];

            // Collect neighbor positions and embeddings
            let mut neighbor_positions = Vec::new();
            let mut neighbor_embeddings = Vec::new();

            for j in 0..num_agents {
                if i != j {
                    let neighbor_pos = &agent_positions[j];
                    if self.grid_mask.is_in_neighborhood(
                        neighbor_pos.x,
                        neighbor_pos.y,
                        target_pos.x,
                        target_pos.y,
                    ) {
                        neighbor_positions.push(*neighbor_pos);
                        neighbor_embeddings.push(agent_embeddings.row(j).to_owned());
                    }
                }
            }

            if !neighbor_positions.is_empty() {
                let neighbor_emb_array = Array2::from_shape_vec(
                    (neighbor_embeddings.len(), self.embedding_size),
                    neighbor_embeddings.into_iter().flatten().collect(),
                )
                .unwrap();

                let social_tensor = self.compute_social_tensor(
                    target_pos,
                    &neighbor_positions,
                    &neighbor_emb_array,
                );

                batch_social_tensors
                    .slice_mut(ndarray::s![i, .., .., ..])
                    .assign(&social_tensor);
            }
        }

        batch_social_tensors
    }
}

/// Main Social-LSTM model implementation
pub struct SocialLSTM {
    pub config: SocialLSTMConfig,
    pub social_pooling: SocialPooling,
}

impl SocialLSTM {
    pub fn new(config: SocialLSTMConfig) -> Self {
        let social_pooling = SocialPooling::new(&config);
        Self {
            config,
            social_pooling,
        }
    }

    pub fn update_config(&mut self, new_config: SocialLSTMConfig) {
        self.config = new_config;
        self.social_pooling = SocialPooling::new(&self.config);
    }

    /// Preprocess multi-agent trajectories for WASI-NN inference
    pub fn preprocess_multi_agent_trajectories(
        &self,
        agent_trajectories: &[AgentTrajectory],
    ) -> Result<(Array3<f64>, Array4<f64>), String> {
        if agent_trajectories.is_empty() {
            return Err("No trajectories provided".to_string());
        }

        let num_agents = agent_trajectories.len();
        let seq_len = self.config.sequence_length;
        let dt = 0.1; // 100ms timestep

        // Create trajectory tensor [batch_size, sequence_length, 2]
        let mut trajectory_tensor = Array3::zeros((num_agents, seq_len, 2));

        // Get current positions for social tensor computation
        let mut current_positions = Vec::new();

        for (i, trajectory) in agent_trajectories.iter().enumerate() {
            // Get input sequence for this agent
            let sequence = trajectory.get_input_sequence(seq_len, dt);
            trajectory_tensor
                .slice_mut(ndarray::s![i, .., ..])
                .assign(&sequence);

            // Get current position
            if let Some(current_pos) = trajectory.current_position() {
                current_positions.push(*current_pos);
            } else {
                return Err(format!(
                    "No current position for agent {}",
                    trajectory.agent_id
                ));
            }
        }

        // Compute agent embeddings (simplified - in real implementation would come from LSTM encoder)
        let embedding_size = self.config.embedding_size;
        let mut agent_embeddings = Array2::zeros((num_agents, embedding_size));

        // Simple embedding based on agent type and velocity
        for (i, trajectory) in agent_trajectories.iter().enumerate() {
            let mut embedding = vec![0.0; embedding_size];

            // Agent type encoding (one-hot-like)
            match trajectory.agent_type {
                crate::trajectory::AgentType::Pedestrian => embedding[0] = 1.0,
                crate::trajectory::AgentType::Cyclist => embedding[1] = 1.0,
                crate::trajectory::AgentType::Vehicle => embedding[2] = 1.0,
                crate::trajectory::AgentType::Motorcycle => embedding[3] = 1.0,
                crate::trajectory::AgentType::Emergency => embedding[4] = 1.0,
                _ => embedding[5] = 1.0,
            }

            // Velocity encoding
            if let Some((vx, vy)) = trajectory.current_velocity() {
                let speed = (vx.powi(2) + vy.powi(2)).sqrt();
                let direction = vy.atan2(vx);

                if embedding_size > 6 {
                    embedding[6] = speed.min(10.0) / 10.0; // Normalized speed
                }
                if embedding_size > 7 {
                    embedding[7] =
                        (direction + std::f64::consts::PI) / (2.0 * std::f64::consts::PI);
                    // Normalized direction
                }
            }

            // Fill remaining with random noise (simplified)
            for j in 8..embedding_size {
                embedding[j] = (i as f64 * 0.1) % 1.0; // Deterministic "random" for testing
            }

            agent_embeddings.row_mut(i).assign(&Array1::from(embedding));
        }

        // Compute social tensors
        let social_tensors = self
            .social_pooling
            .compute_batch_social_tensors(&current_positions, &agent_embeddings);

        Ok((trajectory_tensor, social_tensors))
    }

    /// Post-process WASI-NN predictions into trajectory sequences
    pub fn postprocess_predictions(
        &self,
        predictions: Vec<Array2<f64>>,
        agent_trajectories: &[AgentTrajectory],
    ) -> Result<Vec<TrajectorySequence>, String> {
        if predictions.len() != agent_trajectories.len() {
            return Err("Prediction count mismatch".to_string());
        }

        let mut predicted_trajectories = Vec::new();
        let dt = 0.1; // 100ms timestep

        for (prediction, agent_traj) in predictions.iter().zip(agent_trajectories.iter()) {
            let mut trajectory_sequence =
                TrajectorySequence::new(agent_traj.agent_id.clone(), agent_traj.agent_type);

            // Get starting point from current position
            let start_point = agent_traj
                .current_position()
                .ok_or_else(|| format!("No current position for agent {}", agent_traj.agent_id))?;

            let start_time = start_point.timestamp;

            // Convert prediction array to trajectory points
            for j in 0..prediction.nrows() {
                let x = prediction[[j, 0]] + start_point.x; // Relative to absolute coordinates
                let y = prediction[[j, 1]] + start_point.y;
                let timestamp = start_time + (j + 1) as f64 * dt;

                let mut point = TrajectoryPoint::new(x, y, timestamp);

                // Calculate velocity if possible
                if j > 0 {
                    let prev_x = prediction[[j - 1, 0]] + start_point.x;
                    let prev_y = prediction[[j - 1, 1]] + start_point.y;
                    let vx = (x - prev_x) / dt;
                    let vy = (y - prev_y) / dt;
                    point = point.with_velocity(vx, vy);
                }

                trajectory_sequence.points.push(point);
            }

            // Set confidence based on prediction quality (simplified)
            let confidence = self.calculate_prediction_confidence(prediction, agent_traj);
            trajectory_sequence = trajectory_sequence.with_confidence(confidence);

            predicted_trajectories.push(trajectory_sequence);
        }

        Ok(predicted_trajectories)
    }

    /// Calculate prediction confidence based on various factors
    fn calculate_prediction_confidence(
        &self,
        prediction: &Array2<f64>,
        agent_trajectory: &AgentTrajectory,
    ) -> f64 {
        let mut confidence = 1.0;

        // Reduce confidence based on prediction length
        let prediction_length = prediction.nrows();
        if prediction_length > self.config.prediction_length {
            confidence *= 0.8;
        }

        // Reduce confidence for sharp direction changes
        if prediction.nrows() > 2 {
            let mut direction_changes = 0;
            for i in 2..prediction.nrows() {
                let v1_x = prediction[[i - 1, 0]] - prediction[[i - 2, 0]];
                let v1_y = prediction[[i - 1, 1]] - prediction[[i - 2, 1]];
                let v2_x = prediction[[i, 0]] - prediction[[i - 1, 0]];
                let v2_y = prediction[[i, 1]] - prediction[[i - 1, 1]];

                let dot_product = v1_x * v2_x + v1_y * v2_y;
                let magnitude1 = (v1_x.powi(2) + v1_y.powi(2)).sqrt();
                let magnitude2 = (v2_x.powi(2) + v2_y.powi(2)).sqrt();

                if magnitude1 > 0.1 && magnitude2 > 0.1 {
                    let cos_angle = dot_product / (magnitude1 * magnitude2);
                    if cos_angle < 0.5 {
                        // Angle > 60 degrees
                        direction_changes += 1;
                    }
                }
            }

            if direction_changes > 2 {
                confidence *= 0.7;
            }
        }

        // Adjust confidence based on agent type behavior consistency
        let speed_consistency = self.check_speed_consistency(prediction, agent_trajectory);
        confidence *= speed_consistency;

        confidence.clamp(0.1, 1.0)
    }

    /// Check if predicted speeds are consistent with agent type
    fn check_speed_consistency(
        &self,
        prediction: &Array2<f64>,
        agent_trajectory: &AgentTrajectory,
    ) -> f64 {
        let (_min_speed, max_speed) = agent_trajectory.agent_type.speed_range();
        let dt = 0.1;
        let mut consistency_score = 1.0;
        let mut speed_violations = 0;

        for i in 1..prediction.nrows() {
            let dx = prediction[[i, 0]] - prediction[[i - 1, 0]];
            let dy = prediction[[i, 1]] - prediction[[i - 1, 1]];
            let speed = (dx.powi(2) + dy.powi(2)).sqrt() / dt;

            if speed > max_speed {
                speed_violations += 1;
            }
        }

        if speed_violations > 0 {
            consistency_score *= 1.0 - (speed_violations as f64 / prediction.nrows() as f64);
        }

        consistency_score.clamp(0.3, 1.0)
    }

    /// Generate simple demo predictions for testing (when no WASI-NN model available)
    pub fn generate_demo_predictions(
        &self,
        agent_trajectories: &[AgentTrajectory],
    ) -> Result<Vec<TrajectorySequence>, String> {
        let mut predicted_trajectories = Vec::new();
        let dt = 0.1;
        let prediction_steps = self.config.prediction_length;

        for agent_traj in agent_trajectories {
            let mut trajectory_sequence =
                TrajectorySequence::new(agent_traj.agent_id.clone(), agent_traj.agent_type);

            let start_point = agent_traj
                .current_position()
                .ok_or_else(|| format!("No current position for agent {}", agent_traj.agent_id))?;

            // Simple linear prediction based on current velocity
            let (vx, vy) = agent_traj.current_velocity().unwrap_or((0.0, 0.0));

            for step in 1..=prediction_steps {
                let x = start_point.x + vx * dt * step as f64;
                let y = start_point.y + vy * dt * step as f64;
                let timestamp = start_point.timestamp + dt * step as f64;

                let point = TrajectoryPoint::new(x, y, timestamp).with_velocity(vx, vy);
                trajectory_sequence.points.push(point);
            }

            trajectory_sequence = trajectory_sequence.with_confidence(0.8);
            predicted_trajectories.push(trajectory_sequence);
        }

        Ok(predicted_trajectories)
    }
}

// Import Array1 for agent embeddings
use ndarray::Array1;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::trajectory::{AgentType, TrajectoryPoint};

    #[test]
    fn test_grid_mask_conversion() {
        let grid = GridMask::new((4, 4), 2.0);

        // Test center position
        let result = grid.world_to_grid(0.0, 0.0, 0.0, 0.0);
        assert_eq!(result, Some((2, 2)));

        // Test corner position
        let result = grid.world_to_grid(1.0, 1.0, 0.0, 0.0);
        assert_eq!(result, Some((3, 3)));
    }

    #[test]
    fn test_neighborhood_check() {
        let grid = GridMask::new((4, 4), 2.0);

        assert!(grid.is_in_neighborhood(1.0, 1.0, 0.0, 0.0));
        assert!(!grid.is_in_neighborhood(3.0, 3.0, 0.0, 0.0));
    }

    #[test]
    fn test_social_lstm_creation() {
        let config = SocialLSTMConfig::default();
        let social_lstm = SocialLSTM::new(config);

        assert_eq!(social_lstm.config.sequence_length, 8);
        assert_eq!(social_lstm.config.prediction_length, 12);
    }
}
