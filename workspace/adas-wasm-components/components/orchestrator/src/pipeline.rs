// Pipeline - Main execution engine for the 5-component ADAS system

use crate::data_flow::{DataEvent, MessageBus};
use std::thread;
use std::time::{Duration, Instant};

/// Pipeline configuration
#[derive(Debug, Clone)]
pub struct PipelineConfig {
    pub target_fps: f32,
    pub max_latency_ms: u32,
    pub enable_diagnostics: bool,
}

impl Default for PipelineConfig {
    fn default() -> Self {
        Self {
            target_fps: 30.0,
            max_latency_ms: 33, // 33ms for 30 FPS
            enable_diagnostics: true,
        }
    }
}

/// Pipeline execution result
#[derive(Debug)]
pub struct PipelineStepResult {
    pub step_number: u64,
    pub messages_processed: u32,
    pub components_updated: u32,
    pub execution_time_ms: f32,
}

/// Main pipeline execution engine
pub struct Pipeline {
    config: PipelineConfig,
    step_number: u64,
    is_running: bool,
    last_step_time: Option<Instant>,
    total_frames_processed: u64,
    total_detections: u64,
}

impl Pipeline {
    pub fn new(config: PipelineConfig) -> Self {
        Self {
            config,
            step_number: 0,
            is_running: false,
            last_step_time: None,
            total_frames_processed: 0,
            total_detections: 0,
        }
    }

    /// Start the pipeline
    pub fn start(&mut self) -> Result<(), String> {
        println!("🚀 Starting ADAS pipeline");
        println!("  Target FPS: {:.1}", self.config.target_fps);
        println!("  Max latency: {}ms", self.config.max_latency_ms);

        self.is_running = true;
        self.step_number = 0;
        self.last_step_time = Some(Instant::now());

        println!("✅ Pipeline started successfully");
        Ok(())
    }

    /// Stop the pipeline
    pub fn stop(&mut self) -> Result<(), String> {
        println!("🛑 Stopping ADAS pipeline");

        self.is_running = false;

        println!("📊 Pipeline statistics:");
        println!("  Total steps: {}", self.step_number);
        println!("  Frames processed: {}", self.total_frames_processed);
        println!("  Detections made: {}", self.total_detections);

        println!("✅ Pipeline stopped");
        Ok(())
    }

    /// Execute one pipeline step
    pub fn execute_step(&self) -> Result<PipelineStepResult, String> {
        if !self.is_running {
            return Err("Pipeline not running".to_string());
        }

        let step_start = Instant::now();
        let mut messages_processed = 0;
        let mut components_updated = 0;

        // Simulate pipeline execution for the 5-component system

        // Step 1: Video Decoder - Generate/decode video frame
        if let Some(video_frame) = self.simulate_video_decoder_step() {
            messages_processed += 1;
            components_updated += 1;

            // Step 2: Object Detection - Process video frame
            if let Some(detection_result) = self.simulate_object_detection_step(&video_frame) {
                messages_processed += 1;
                components_updated += 1;

                // Step 3: Visualizer - Display results
                self.simulate_visualizer_step(&detection_result);
                components_updated += 1;

                // Step 4: Safety Monitor - Check system health
                self.simulate_safety_monitor_step();
                components_updated += 1;
            }
        }

        let execution_time = step_start.elapsed().as_millis() as f32;

        // Check if we're maintaining target FPS
        let target_frame_time_ms = 1000.0 / self.config.target_fps;
        if execution_time > target_frame_time_ms {
            println!(
                "⚠️  Pipeline step took {}ms (target: {:.1}ms)",
                execution_time, target_frame_time_ms
            );
        }

        Ok(PipelineStepResult {
            step_number: self.step_number + 1,
            messages_processed,
            components_updated,
            execution_time_ms: execution_time,
        })
    }

    /// Simulate video decoder step
    fn simulate_video_decoder_step(&self) -> Option<DataEvent> {
        // Simulate generating a video frame
        let frame_data = vec![128u8; 320 * 200 * 3]; // 320x200 RGB frame

        Some(DataEvent::VideoFrame {
            frame_number: self.step_number + 1,
            width: 320,
            height: 200,
            data: frame_data,
            timestamp: crate::get_timestamp(),
        })
    }

    /// Simulate object detection step
    fn simulate_object_detection_step(&self, video_frame: &DataEvent) -> Option<DataEvent> {
        if let DataEvent::VideoFrame { frame_number, .. } = video_frame {
            // Simulate AI processing delay
            thread::sleep(Duration::from_millis(5));

            // Simulate detection results
            let objects = vec![
                crate::data_flow::DetectedObject {
                    object_id: 1,
                    class_name: "car".to_string(),
                    confidence: 0.85,
                    bounding_box: crate::data_flow::BoundingBox {
                        x: 50.0,
                        y: 80.0,
                        width: 120.0,
                        height: 80.0,
                    },
                },
                crate::data_flow::DetectedObject {
                    object_id: 2,
                    class_name: "person".to_string(),
                    confidence: 0.92,
                    bounding_box: crate::data_flow::BoundingBox {
                        x: 200.0,
                        y: 100.0,
                        width: 40.0,
                        height: 80.0,
                    },
                },
            ];

            Some(DataEvent::DetectionResult {
                frame_number: *frame_number,
                objects,
                processing_time_ms: 5.0,
                timestamp: crate::get_timestamp(),
            })
        } else {
            None
        }
    }

    /// Simulate visualizer step
    fn simulate_visualizer_step(&self, detection_result: &DataEvent) {
        if let DataEvent::DetectionResult {
            objects,
            frame_number,
            ..
        } = detection_result
        {
            // Simulate rendering detection results
            if self.config.enable_diagnostics && self.step_number % 30 == 0 {
                println!(
                    "🎨 Frame {}: Rendered {} objects",
                    frame_number,
                    objects.len()
                );
                for (i, obj) in objects.iter().enumerate() {
                    println!(
                        "   Object {}: {} ({:.1}% confidence)",
                        i + 1,
                        obj.class_name,
                        obj.confidence * 100.0
                    );
                }
            }

            // For graphics visualizer integration:
            // 1. The visualizer component would receive the video frame via data subscriber
            // 2. It would render the frame using wasi-gfx
            // 3. It would overlay detection results
            // 4. It would present the final frame to the graphics surface

            // Simulate graphics rendering delay
            thread::sleep(Duration::from_millis(2)); // ~2ms for graphics operations
        }
    }

    /// Simulate safety monitor step
    fn simulate_safety_monitor_step(&self) {
        // Simulate safety checks
        if self.step_number % 100 == 0 && self.config.enable_diagnostics {
            println!("🛡️  Safety check: All systems operational");
        }
    }

    /// Get pipeline statistics
    pub fn get_statistics(&self) -> PipelineStatistics {
        let runtime = if let Some(start_time) = self.last_step_time {
            start_time.elapsed().as_secs_f32()
        } else {
            0.0
        };

        let effective_fps = if runtime > 0.0 {
            self.step_number as f32 / runtime
        } else {
            0.0
        };

        PipelineStatistics {
            step_number: self.step_number,
            is_running: self.is_running,
            effective_fps,
            target_fps: self.config.target_fps,
            total_frames_processed: self.total_frames_processed,
            total_detections: self.total_detections,
            runtime_seconds: runtime,
        }
    }

    /// Check if pipeline is healthy
    pub fn is_healthy(&self) -> bool {
        self.is_running
    }

    /// Get target frame time in milliseconds
    pub fn get_target_frame_time_ms(&self) -> f32 {
        1000.0 / self.config.target_fps
    }
}

/// Pipeline runtime statistics
#[derive(Debug)]
pub struct PipelineStatistics {
    pub step_number: u64,
    pub is_running: bool,
    pub effective_fps: f32,
    pub target_fps: f32,
    pub total_frames_processed: u64,
    pub total_detections: u64,
    pub runtime_seconds: f32,
}

impl PipelineStatistics {
    /// Check if pipeline is meeting performance targets
    pub fn is_meeting_targets(&self) -> bool {
        if !self.is_running {
            return false;
        }

        // Allow 10% tolerance below target FPS
        let min_acceptable_fps = self.target_fps * 0.9;
        self.effective_fps >= min_acceptable_fps
    }

    /// Get performance efficiency as percentage
    pub fn get_efficiency(&self) -> f32 {
        if self.target_fps <= 0.0 {
            return 0.0;
        }

        (self.effective_fps / self.target_fps * 100.0).min(100.0)
    }
}
