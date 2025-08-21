//! Shared WASI-NN utilities for ADAS AI components
//!
//! This library provides helper functions and utilities for using WASI-NN
//! across AI components. The actual WASI-NN implementation is provided by wasmtime.

/// Helper utilities for WASI-NN operations
pub mod utils {
    use super::Detection;
    use std::collections::HashMap;

    /// Create optimized config parameters for ONNX models
    pub fn create_onnx_config() -> HashMap<String, String> {
        let mut config = HashMap::new();

        // Standard ONNX runtime optimizations
        config.insert("optimization_level".to_string(), "all".to_string());
        config.insert("execution_mode".to_string(), "parallel".to_string());
        config.insert("inter_op_num_threads".to_string(), "0".to_string()); // Use all available
        config.insert("intra_op_num_threads".to_string(), "0".to_string()); // Use all available

        config
    }

    /// Detect available execution providers for optimal performance
    pub fn get_preferred_execution_providers() -> Vec<String> {
        let mut providers = Vec::new();

        // Always available
        providers.push("CPUExecutionProvider".to_string());

        // Platform-specific optimizations
        #[cfg(target_os = "macos")]
        {
            providers.push("CoreMLExecutionProvider".to_string());
        }

        #[cfg(target_os = "linux")]
        {
            providers.push("CUDAExecutionProvider".to_string());
        }

        providers
    }

    /// Validate tensor dimensions for common ADAS models
    pub fn validate_yolo_input_dimensions(dims: &[u32]) -> Result<(), String> {
        if dims.len() != 4 {
            return Err(
                "YOLO input must be 4D tensor [batch, channels, height, width]".to_string(),
            );
        }

        if dims[1] != 3 {
            return Err("YOLO input must have 3 channels (RGB)".to_string());
        }

        // Common YOLO input sizes
        let valid_sizes = [320, 416, 512, 608, 640];
        if !valid_sizes.contains(&dims[2]) || !valid_sizes.contains(&dims[3]) {
            return Err(format!("Unusual YOLO input size: {}x{}", dims[2], dims[3]));
        }

        Ok(())
    }

    /// Convert image data to NCHW format expected by YOLO models
    pub fn image_hwc_to_nchw(
        image_data: &[u8],
        height: u32,
        width: u32,
        normalize: bool,
    ) -> Vec<f32> {
        let mut result = Vec::with_capacity((height * width * 3) as usize);

        // Convert HWC to NCHW format
        for c in 0..3 {
            for h in 0..height {
                for w in 0..width {
                    let idx = ((h * width + w) * 3 + c) as usize;
                    let pixel = image_data[idx] as f32;

                    if normalize {
                        result.push(pixel / 255.0);
                    } else {
                        result.push(pixel);
                    }
                }
            }
        }

        result
    }

    /// Parse YOLO detection output tensor to bounding boxes
    pub fn parse_yolo_detections(
        output_data: &[f32],
        output_shape: &[u32],
        confidence_threshold: f32,
        input_width: u32,
        input_height: u32,
    ) -> Vec<Detection> {
        let mut detections = Vec::new();

        // Assuming YOLOv5 output format: [1, 25200, 85] for COCO dataset
        if output_shape.len() != 3 || output_shape[0] != 1 {
            return detections;
        }

        let num_detections = output_shape[1] as usize;
        let detection_size = output_shape[2] as usize;

        if detection_size < 85 {
            // 5 bbox params + 80 classes for COCO
            return detections;
        }

        for i in 0..num_detections {
            let offset = i * detection_size;

            let x_center = output_data[offset];
            let y_center = output_data[offset + 1];
            let width = output_data[offset + 2];
            let height = output_data[offset + 3];
            let box_confidence = output_data[offset + 4];

            // Find best class
            let mut max_class_score = 0.0;
            let mut best_class = 0;

            for class_idx in 0..80 {
                // COCO has 80 classes
                let class_score = output_data[offset + 5 + class_idx];
                if class_score > max_class_score {
                    max_class_score = class_score;
                    best_class = class_idx;
                }
            }

            let final_confidence = box_confidence * max_class_score;

            if final_confidence > confidence_threshold {
                // Convert from center format to corner format
                let x = x_center - width / 2.0;
                let y = y_center - height / 2.0;

                detections.push(Detection {
                    x: x * input_width as f32,
                    y: y * input_height as f32,
                    width: width * input_width as f32,
                    height: height * input_height as f32,
                    confidence: final_confidence,
                    class_id: best_class,
                });
            }
        }

        detections
    }
}

/// Object detection result
#[derive(Debug, Clone)]
pub struct Detection {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub confidence: f32,
    pub class_id: usize,
}

/// COCO class names for YOLO models
pub const COCO_CLASSES: &[&str] = &[
    "person",
    "bicycle",
    "car",
    "motorcycle",
    "airplane",
    "bus",
    "train",
    "truck",
    "boat",
    "traffic light",
    "fire hydrant",
    "stop sign",
    "parking meter",
    "bench",
    "bird",
    "cat",
    "dog",
    "horse",
    "sheep",
    "cow",
    "elephant",
    "bear",
    "zebra",
    "giraffe",
    "backpack",
    "umbrella",
    "handbag",
    "tie",
    "suitcase",
    "frisbee",
    "skis",
    "snowboard",
    "sports ball",
    "kite",
    "baseball bat",
    "baseball glove",
    "skateboard",
    "surfboard",
    "tennis racket",
    "bottle",
    "wine glass",
    "cup",
    "fork",
    "knife",
    "spoon",
    "bowl",
    "banana",
    "apple",
    "sandwich",
    "orange",
    "broccoli",
    "carrot",
    "hot dog",
    "pizza",
    "donut",
    "cake",
    "chair",
    "couch",
    "potted plant",
    "bed",
    "dining table",
    "toilet",
    "tv",
    "laptop",
    "mouse",
    "remote",
    "keyboard",
    "cell phone",
    "microwave",
    "oven",
    "toaster",
    "sink",
    "refrigerator",
    "book",
    "clock",
    "vase",
    "scissors",
    "teddy bear",
    "hair drier",
    "toothbrush",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_onnx_config_creation() {
        let config = utils::create_onnx_config();
        assert!(config.contains_key("optimization_level"));
        assert_eq!(config.get("optimization_level"), Some(&"all".to_string()));
    }

    #[test]
    fn test_yolo_dimension_validation() {
        // Valid YOLO input
        assert!(utils::validate_yolo_input_dimensions(&[1, 3, 640, 640]).is_ok());

        // Invalid dimensions
        assert!(utils::validate_yolo_input_dimensions(&[1, 3, 640]).is_err());
        assert!(utils::validate_yolo_input_dimensions(&[1, 1, 640, 640]).is_err());
    }

    #[test]
    fn test_image_conversion() {
        let image_data = vec![255u8; 3 * 64 * 64]; // 64x64 RGB image
        let converted = utils::image_hwc_to_nchw(&image_data, 64, 64, true);

        assert_eq!(converted.len(), 3 * 64 * 64);
        assert!(converted.iter().all(|&x| x == 1.0)); // Normalized 255 -> 1.0
    }

    #[test]
    fn test_coco_classes() {
        assert_eq!(COCO_CLASSES.len(), 80);
        assert_eq!(COCO_CLASSES[0], "person");
        assert_eq!(COCO_CLASSES[2], "car");
    }
}
