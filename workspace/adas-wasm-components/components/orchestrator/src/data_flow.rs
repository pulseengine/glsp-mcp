// Data Flow Manager - Handles pub/sub messaging between components

use crossbeam_channel::{bounded, unbounded, Receiver, Sender};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

/// Data event types that flow through the system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DataEvent {
    VideoFrame {
        frame_number: u64,
        width: u32,
        height: u32,
        data: Vec<u8>,
        timestamp: u64,
    },
    DetectionResult {
        frame_number: u64,
        objects: Vec<DetectedObject>,
        processing_time_ms: f32,
        timestamp: u64,
    },
    SystemEvent {
        event_type: String,
        message: String,
        timestamp: u64,
    },
}

/// Detected object from AI processing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedObject {
    pub object_id: u32,
    pub class_name: String,
    pub confidence: f32,
    pub bounding_box: BoundingBox,
}

/// 2D bounding box coordinates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundingBox {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// Message bus for inter-component communication
pub struct MessageBus {
    video_frame_tx: Sender<DataEvent>,
    video_frame_rx: Receiver<DataEvent>,
    detection_tx: Sender<DataEvent>,
    detection_rx: Receiver<DataEvent>,
    system_event_tx: Sender<DataEvent>,
    system_event_rx: Receiver<DataEvent>,
}

impl MessageBus {
    pub fn new() -> Self {
        let (video_frame_tx, video_frame_rx) = bounded(100); // Buffer 100 video frames
        let (detection_tx, detection_rx) = bounded(50); // Buffer 50 detection results
        let (system_event_tx, system_event_rx) = unbounded(); // Unlimited system events

        Self {
            video_frame_tx,
            video_frame_rx,
            detection_tx,
            detection_rx,
            system_event_tx,
            system_event_rx,
        }
    }

    /// Publish video frame to the bus
    pub fn publish_video_frame(&self, frame: DataEvent) -> Result<(), String> {
        self.video_frame_tx
            .send(frame)
            .map_err(|e| format!("Failed to publish video frame: {}", e))
    }

    /// Subscribe to video frames
    pub fn subscribe_video_frames(&self) -> Receiver<DataEvent> {
        self.video_frame_rx.clone()
    }

    /// Publish detection result to the bus
    pub fn publish_detection_result(&self, result: DataEvent) -> Result<(), String> {
        self.detection_tx
            .send(result)
            .map_err(|e| format!("Failed to publish detection result: {}", e))
    }

    /// Subscribe to detection results
    pub fn subscribe_detection_results(&self) -> Receiver<DataEvent> {
        self.detection_rx.clone()
    }

    /// Publish system event to the bus
    pub fn publish_system_event(&self, event: DataEvent) -> Result<(), String> {
        self.system_event_tx
            .send(event)
            .map_err(|e| format!("Failed to publish system event: {}", e))
    }

    /// Subscribe to system events
    pub fn subscribe_system_events(&self) -> Receiver<DataEvent> {
        self.system_event_rx.clone()
    }

    /// Get bus statistics
    pub fn get_stats(&self) -> MessageBusStats {
        MessageBusStats {
            video_frame_queue_len: self.video_frame_rx.len(),
            detection_queue_len: self.detection_rx.len(),
            system_event_queue_len: self.system_event_rx.len(),
        }
    }
}

/// Message bus statistics
#[derive(Debug)]
pub struct MessageBusStats {
    pub video_frame_queue_len: usize,
    pub detection_queue_len: usize,
    pub system_event_queue_len: usize,
}

/// Data flow manager coordinates all pub/sub messaging
pub struct DataFlowManager {
    publishers: HashMap<String, PublisherInfo>,
    subscribers: HashMap<String, SubscriberInfo>,
    message_stats: MessageStats,
}

/// Publisher information
#[derive(Debug)]
struct PublisherInfo {
    component_id: String,
    data_type: String,
    total_published: u64,
    bytes_published: u64,
    last_publish_time: u64,
}

/// Subscriber information
#[derive(Debug)]
struct SubscriberInfo {
    component_id: String,
    data_type: String,
    total_received: u64,
    bytes_received: u64,
    last_receive_time: u64,
}

/// Message processing statistics
#[derive(Debug, Default)]
struct MessageStats {
    total_messages: u64,
    total_bytes: u64,
    messages_per_second: f32,
    bytes_per_second: f32,
    average_latency_ms: f32,
}

impl DataFlowManager {
    pub fn new() -> Self {
        Self {
            publishers: HashMap::new(),
            subscribers: HashMap::new(),
            message_stats: MessageStats::default(),
        }
    }

    /// Initialize the message bus system
    pub fn initialize_message_bus(&mut self) -> Result<(), String> {
        println!("📡 Initializing message bus for data flow");

        // Register default publishers and subscribers for the 5-component pipeline
        self.register_publisher("video-decoder".to_string(), "video-frame".to_string())?;
        self.register_subscriber("object-detection".to_string(), "video-frame".to_string())?;

        self.register_publisher(
            "object-detection".to_string(),
            "detection-result".to_string(),
        )?;
        self.register_subscriber("visualizer".to_string(), "detection-result".to_string())?;
        self.register_subscriber("safety-monitor".to_string(), "detection-result".to_string())?;

        println!(
            "✅ Message bus initialized with {} publishers, {} subscribers",
            self.publishers.len(),
            self.subscribers.len()
        );
        Ok(())
    }

    /// Register a new publisher
    pub fn register_publisher(
        &mut self,
        component_id: String,
        data_type: String,
    ) -> Result<(), String> {
        let publisher_key = format!("{}:{}", component_id, data_type);

        let publisher_info = PublisherInfo {
            component_id: component_id.clone(),
            data_type: data_type.clone(),
            total_published: 0,
            bytes_published: 0,
            last_publish_time: 0,
        };

        self.publishers.insert(publisher_key, publisher_info);
        println!(
            "📤 Registered publisher: {} for {}",
            component_id, data_type
        );
        Ok(())
    }

    /// Register a new subscriber
    pub fn register_subscriber(
        &mut self,
        component_id: String,
        data_type: String,
    ) -> Result<(), String> {
        let subscriber_key = format!("{}:{}", component_id, data_type);

        let subscriber_info = SubscriberInfo {
            component_id: component_id.clone(),
            data_type: data_type.clone(),
            total_received: 0,
            bytes_received: 0,
            last_receive_time: 0,
        };

        self.subscribers.insert(subscriber_key, subscriber_info);
        println!(
            "📥 Registered subscriber: {} for {}",
            component_id, data_type
        );
        Ok(())
    }

    /// Update publisher statistics
    pub fn update_publisher_stats(&mut self, component_id: &str, data_type: &str, bytes: u64) {
        let publisher_key = format!("{}:{}", component_id, data_type);
        if let Some(publisher) = self.publishers.get_mut(&publisher_key) {
            publisher.total_published += 1;
            publisher.bytes_published += bytes;
            publisher.last_publish_time = crate::get_timestamp();
        }

        self.message_stats.total_messages += 1;
        self.message_stats.total_bytes += bytes;
    }

    /// Update subscriber statistics
    pub fn update_subscriber_stats(&mut self, component_id: &str, data_type: &str, bytes: u64) {
        let subscriber_key = format!("{}:{}", component_id, data_type);
        if let Some(subscriber) = self.subscribers.get_mut(&subscriber_key) {
            subscriber.total_received += 1;
            subscriber.bytes_received += bytes;
            subscriber.last_receive_time = crate::get_timestamp();
        }
    }

    /// Get data flow statistics
    pub fn get_stats(&self) -> &MessageStats {
        &self.message_stats
    }

    /// Get publisher count
    pub fn get_publisher_count(&self) -> usize {
        self.publishers.len()
    }

    /// Get subscriber count
    pub fn get_subscriber_count(&self) -> usize {
        self.subscribers.len()
    }

    /// List all registered publishers
    pub fn list_publishers(&self) -> Vec<String> {
        self.publishers.keys().cloned().collect()
    }

    /// List all registered subscribers
    pub fn list_subscribers(&self) -> Vec<String> {
        self.subscribers.keys().cloned().collect()
    }
}
