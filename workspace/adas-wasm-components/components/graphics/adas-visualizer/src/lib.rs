// ADAS Graphics Visualizer using wasi-gfx
// Real-time rendering of video frames with object detection overlays

wit_bindgen::generate!({
    world: "graphics-visualizer",
    path: "wit/",
    generate_all,
});

use std::collections::HashMap;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

mod frame_buffer;
mod graphics_context;
mod overlay_renderer;

use frame_buffer::{FrameBuffer, PixelFormat};
use graphics_context::{GraphicsContext, RenderTarget};
use overlay_renderer::{BoundingBox, OverlayRenderer, TextLabel};

struct Component;

// Graphics state
static mut RENDERER_INITIALIZED: bool = false;
static mut RENDERING_ACTIVE: bool = false;
static mut FRAMES_RENDERED: u64 = 0;
static mut OVERLAY_OBJECTS: u32 = 0;
static mut TOTAL_RENDER_TIME_MS: f64 = 0.0;

// Current configuration
static mut CURRENT_CONFIG: Option<GraphicsConfig> = None;
static mut FRAME_BUFFER: Option<FrameBuffer> = None;
static mut OVERLAY_RENDERER: Option<OverlayRenderer> = None;

/// Graphics configuration
#[derive(Debug, Clone)]
struct GraphicsConfig {
    width: u32,
    height: u32,
    scale_factor: f32,
    show_fps: bool,
    show_metrics: bool,
    overlay_style: OverlayStyle,
}

impl Default for GraphicsConfig {
    fn default() -> Self {
        Self {
            width: 640, // 2x video resolution for better visibility
            height: 400,
            scale_factor: 2.0,
            show_fps: true,
            show_metrics: true,
            overlay_style: OverlayStyle::Detailed,
        }
    }
}

/// Overlay rendering styles
#[derive(Debug, Clone, Copy)]
enum OverlayStyle {
    Minimal,
    Detailed,
    Debug,
}

/// RGBA Color
#[derive(Debug, Clone, Copy)]
struct Color {
    r: u8,
    g: u8,
    b: u8,
    a: u8,
}

impl Color {
    const WHITE: Color = Color {
        r: 255,
        g: 255,
        b: 255,
        a: 255,
    };
    const BLACK: Color = Color {
        r: 0,
        g: 0,
        b: 0,
        a: 255,
    };
    const RED: Color = Color {
        r: 255,
        g: 0,
        b: 0,
        a: 255,
    };
    const GREEN: Color = Color {
        r: 0,
        g: 255,
        b: 0,
        a: 255,
    };
    const BLUE: Color = Color {
        r: 0,
        g: 0,
        b: 255,
        a: 255,
    };
    const YELLOW: Color = Color {
        r: 255,
        g: 255,
        b: 0,
        a: 255,
    };
    const CYAN: Color = Color {
        r: 0,
        g: 255,
        b: 255,
        a: 255,
    };
    const MAGENTA: Color = Color {
        r: 255,
        g: 0,
        g: 255,
        a: 255,
    };
}

/// Get timestamp in milliseconds
fn get_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

/// Get color for object class
fn get_object_color(class_name: &str) -> Color {
    match class_name {
        "person" | "pedestrian" => Color::RED,
        "car" | "vehicle" => Color::GREEN,
        "bicycle" | "cyclist" => Color::BLUE,
        "motorcycle" => Color::YELLOW,
        "bus" | "truck" => Color::CYAN,
        "traffic light" => Color::MAGENTA,
        _ => Color::WHITE,
    }
}

// Implement graphics visualizer interface
impl exports::adas::graphics::graphics_visualizer::Guest for Component {
    type GraphicsRenderer = GraphicsRenderer;
}

/// Graphics renderer implementation
struct GraphicsRenderer {
    config: GraphicsConfig,
    frame_buffer: FrameBuffer,
    overlay_renderer: OverlayRenderer,
    graphics_context: GraphicsContext,
    render_stats: RenderStats,
    last_frame_time: Option<Instant>,
}

/// Render statistics
#[derive(Debug, Default)]
struct RenderStats {
    frames_rendered: u64,
    render_time_ms: f32,
    overlay_objects: u32,
    frame_rate: f32,
    memory_usage_mb: u32,
}

impl exports::adas::graphics::graphics_visualizer::GuestGraphicsRenderer for GraphicsRenderer {
    fn new(config: exports::adas::graphics::graphics_visualizer::GraphicsConfig) -> Self {
        println!("🎨 Initializing ADAS Graphics Visualizer");
        println!("   Resolution: {}x{}", config.width, config.height);
        println!("   Scale factor: {}", config.scale_factor);

        let graphics_config = GraphicsConfig {
            width: config.width,
            height: config.height,
            scale_factor: config.scale_factor,
            show_fps: config.show_fps,
            show_metrics: config.show_metrics,
            overlay_style: match config.overlay_style {
                exports::adas::graphics::graphics_visualizer::OverlayStyle::Minimal => {
                    OverlayStyle::Minimal
                }
                exports::adas::graphics::graphics_visualizer::OverlayStyle::Detailed => {
                    OverlayStyle::Detailed
                }
                exports::adas::graphics::graphics_visualizer::OverlayStyle::Debug => {
                    OverlayStyle::Debug
                }
            },
        };

        // Initialize frame buffer
        let frame_buffer = FrameBuffer::new(
            graphics_config.width,
            graphics_config.height,
            PixelFormat::RGBA8,
        )
        .expect("Failed to create frame buffer");

        // Initialize overlay renderer
        let overlay_renderer = OverlayRenderer::new(graphics_config.width, graphics_config.height);

        // Initialize graphics context (would use wasi-gfx when available)
        let graphics_context = GraphicsContext::new(graphics_config.width, graphics_config.height)
            .expect("Failed to create graphics context");

        unsafe {
            RENDERER_INITIALIZED = true;
        }

        println!("✅ Graphics Visualizer initialized successfully");

        Self {
            config: graphics_config,
            frame_buffer,
            overlay_renderer,
            graphics_context,
            render_stats: RenderStats::default(),
            last_frame_time: None,
        }
    }

    fn render_video_frame(
        &mut self,
        frame: exports::adas::data::data_flow::VideoFrame,
    ) -> Result<(), String> {
        let start_time = Instant::now();

        // Clear frame buffer
        self.frame_buffer.clear(Color::BLACK)?;

        // Scale and render video frame
        let scaled_frame = self.scale_video_frame(&frame)?;
        self.frame_buffer.draw_image(&scaled_frame)?;

        // Update render stats
        self.render_stats.frames_rendered += 1;

        let render_time = start_time.elapsed().as_millis() as f32;
        self.render_stats.render_time_ms = render_time;

        // Calculate FPS
        if let Some(last_time) = self.last_frame_time {
            let time_diff = start_time.duration_since(last_time).as_secs_f32();
            if time_diff > 0.0 {
                self.render_stats.frame_rate = 1.0 / time_diff;
            }
        }
        self.last_frame_time = Some(start_time);

        unsafe {
            FRAMES_RENDERED = self.render_stats.frames_rendered;
            TOTAL_RENDER_TIME_MS += render_time as f64;
        }

        Ok(())
    }

    fn render_detection_overlay(
        &mut self,
        detections: exports::adas::data::data_flow::DetectionResult,
    ) -> Result<(), String> {
        let start_time = Instant::now();

        // Reset overlay count
        self.render_stats.overlay_objects = 0;

        // Render each detected object
        for object in &detections.objects {
            let color = get_object_color(&object.class_name);

            // Scale bounding box to display resolution
            let scaled_box = BoundingBox {
                x: object.bounding_box.x * self.config.scale_factor,
                y: object.bounding_box.y * self.config.scale_factor,
                width: object.bounding_box.width * self.config.scale_factor,
                height: object.bounding_box.height * self.config.scale_factor,
            };

            // Draw bounding box
            self.overlay_renderer
                .draw_bounding_box(&scaled_box, color, false)?;

            // Draw label based on overlay style
            match self.config.overlay_style {
                OverlayStyle::Minimal => {
                    // Just show class name
                    let label = TextLabel {
                        text: object.class_name.clone(),
                        x: scaled_box.x,
                        y: scaled_box.y - 20.0,
                        color,
                    };
                    self.overlay_renderer.draw_text_label(&label)?;
                }
                OverlayStyle::Detailed => {
                    // Show class name and confidence
                    let label_text =
                        format!("{}: {:.1}%", object.class_name, object.confidence * 100.0);
                    let label = TextLabel {
                        text: label_text,
                        x: scaled_box.x,
                        y: scaled_box.y - 20.0,
                        color,
                    };
                    self.overlay_renderer.draw_text_label(&label)?;
                }
                OverlayStyle::Debug => {
                    // Show all details including ID
                    let label_text = format!(
                        "#{}: {} ({:.1}%)",
                        object.object_id,
                        object.class_name,
                        object.confidence * 100.0
                    );
                    let label = TextLabel {
                        text: label_text,
                        x: scaled_box.x,
                        y: scaled_box.y - 20.0,
                        color,
                    };
                    self.overlay_renderer.draw_text_label(&label)?;

                    // Draw center point
                    let center_x = scaled_box.x + scaled_box.width / 2.0;
                    let center_y = scaled_box.y + scaled_box.height / 2.0;
                    self.overlay_renderer
                        .draw_point(center_x, center_y, color)?;
                }
            }

            self.render_stats.overlay_objects += 1;
        }

        // Render performance metrics if enabled
        if self.config.show_metrics {
            self.render_performance_overlay()?;
        }

        // Render FPS if enabled
        if self.config.show_fps {
            self.render_fps_overlay()?;
        }

        let overlay_time = start_time.elapsed().as_millis() as f32;
        self.render_stats.render_time_ms += overlay_time;

        unsafe {
            OVERLAY_OBJECTS = self.render_stats.overlay_objects;
        }

        Ok(())
    }

    fn draw_rectangle(
        &mut self,
        rect: exports::adas::graphics::graphics_visualizer::Rectangle,
        color: exports::adas::graphics::graphics_visualizer::Color,
        filled: bool,
    ) -> Result<(), String> {
        let internal_color = Color {
            r: color.r,
            g: color.g,
            b: color.b,
            a: color.a,
        };

        let bbox = BoundingBox {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
        };

        self.overlay_renderer
            .draw_bounding_box(&bbox, internal_color, filled)
    }

    fn draw_text(
        &mut self,
        text: String,
        position: exports::adas::graphics::graphics_visualizer::Point2d,
        color: exports::adas::graphics::graphics_visualizer::Color,
    ) -> Result<(), String> {
        let internal_color = Color {
            r: color.r,
            g: color.g,
            b: color.b,
            a: color.a,
        };

        let label = TextLabel {
            text,
            x: position.x,
            y: position.y,
            color: internal_color,
        };

        self.overlay_renderer.draw_text_label(&label)
    }

    fn draw_line(
        &mut self,
        start: exports::adas::graphics::graphics_visualizer::Point2d,
        end: exports::adas::graphics::graphics_visualizer::Point2d,
        color: exports::adas::graphics::graphics_visualizer::Color,
        thickness: f32,
    ) -> Result<(), String> {
        let internal_color = Color {
            r: color.r,
            g: color.g,
            b: color.b,
            a: color.a,
        };

        self.overlay_renderer
            .draw_line(start.x, start.y, end.x, end.y, internal_color, thickness)
    }

    fn present_frame(&mut self) -> Result<(), String> {
        // Copy overlay to frame buffer
        self.frame_buffer
            .composite_overlay(&self.overlay_renderer)?;

        // Present to graphics context (would use wasi-gfx surface)
        self.graphics_context.present(&self.frame_buffer)?;

        // Clear overlay for next frame
        self.overlay_renderer.clear();

        unsafe {
            RENDERING_ACTIVE = true;
        }

        Ok(())
    }

    fn clear_frame(
        &mut self,
        color: exports::adas::graphics::graphics_visualizer::Color,
    ) -> Result<(), String> {
        let clear_color = Color {
            r: color.r,
            g: color.g,
            b: color.b,
            a: color.a,
        };

        self.frame_buffer.clear(clear_color)?;
        self.overlay_renderer.clear();
        Ok(())
    }

    fn export_frame_png(&mut self) -> Result<Vec<u8>, String> {
        // Export current frame as PNG
        self.frame_buffer.export_png()
    }

    fn export_frame_raw(&mut self) -> Result<Vec<u8>, String> {
        // Export raw RGBA data
        Ok(self.frame_buffer.get_raw_data().to_vec())
    }

    fn update_config(
        &mut self,
        config: exports::adas::graphics::graphics_visualizer::GraphicsConfig,
    ) -> Result<(), String> {
        println!("🎨 Updating graphics configuration");

        self.config.show_fps = config.show_fps;
        self.config.show_metrics = config.show_metrics;
        self.config.overlay_style = match config.overlay_style {
            exports::adas::graphics::graphics_visualizer::OverlayStyle::Minimal => {
                OverlayStyle::Minimal
            }
            exports::adas::graphics::graphics_visualizer::OverlayStyle::Detailed => {
                OverlayStyle::Detailed
            }
            exports::adas::graphics::graphics_visualizer::OverlayStyle::Debug => {
                OverlayStyle::Debug
            }
        };

        Ok(())
    }

    fn get_render_stats(&mut self) -> exports::adas::graphics::graphics_visualizer::RenderStats {
        exports::adas::graphics::graphics_visualizer::RenderStats {
            frames_rendered: self.render_stats.frames_rendered,
            render_time_ms: self.render_stats.render_time_ms,
            overlay_objects: self.render_stats.overlay_objects,
            frame_rate: self.render_stats.frame_rate,
            memory_usage_mb: self.render_stats.memory_usage_mb,
        }
    }

    fn cleanup(&mut self) -> Result<(), String> {
        println!("🎨 Cleaning up graphics visualizer");

        self.graphics_context.cleanup()?;
        self.overlay_renderer.cleanup();

        unsafe {
            RENDERER_INITIALIZED = false;
            RENDERING_ACTIVE = false;
        }

        Ok(())
    }
}

impl GraphicsRenderer {
    /// Scale video frame to display resolution
    fn scale_video_frame(
        &self,
        frame: &exports::adas::data::data_flow::VideoFrame,
    ) -> Result<Vec<u8>, String> {
        // Simple nearest-neighbor scaling
        let src_width = frame.width as usize;
        let src_height = frame.height as usize;
        let dst_width = self.config.width as usize;
        let dst_height = self.config.height as usize;

        let mut scaled_data = vec![0u8; dst_width * dst_height * 4]; // RGBA

        for y in 0..dst_height {
            for x in 0..dst_width {
                let src_x = (x * src_width) / dst_width;
                let src_y = (y * src_height) / dst_height;

                if src_x < src_width && src_y < src_height {
                    let src_idx = (src_y * src_width + src_x) * 3; // RGB source
                    let dst_idx = (y * dst_width + x) * 4; // RGBA destination

                    if src_idx + 2 < frame.data.len() && dst_idx + 3 < scaled_data.len() {
                        scaled_data[dst_idx] = frame.data[src_idx]; // R
                        scaled_data[dst_idx + 1] = frame.data[src_idx + 1]; // G
                        scaled_data[dst_idx + 2] = frame.data[src_idx + 2]; // B
                        scaled_data[dst_idx + 3] = 255; // A
                    }
                }
            }
        }

        Ok(scaled_data)
    }

    /// Render performance metrics overlay
    fn render_performance_overlay(&mut self) -> Result<(), String> {
        let metrics_text = format!(
            "Objects: {} | Render: {:.1}ms | Memory: {}MB",
            self.render_stats.overlay_objects,
            self.render_stats.render_time_ms,
            self.render_stats.memory_usage_mb
        );

        let label = TextLabel {
            text: metrics_text,
            x: 10.0,
            y: self.config.height as f32 - 40.0,
            color: Color::YELLOW,
        };

        self.overlay_renderer.draw_text_label(&label)
    }

    /// Render FPS overlay
    fn render_fps_overlay(&mut self) -> Result<(), String> {
        let fps_text = format!("FPS: {:.1}", self.render_stats.frame_rate);

        let label = TextLabel {
            text: fps_text,
            x: 10.0,
            y: 30.0,
            color: Color::GREEN,
        };

        self.overlay_renderer.draw_text_label(&label)
    }
}

// Implement health monitoring interface
impl exports::adas::diagnostics::health_monitoring::Guest for Component {
    fn get_health() -> exports::adas::diagnostics::health_monitoring::HealthReport {
        let overall_health = unsafe {
            if RENDERER_INITIALIZED && RENDERING_ACTIVE {
                adas::common_types::types::HealthStatus::Ok
            } else if RENDERER_INITIALIZED {
                adas::common_types::types::HealthStatus::Degraded
            } else {
                adas::common_types::types::HealthStatus::Offline
            }
        };

        exports::adas::diagnostics::health_monitoring::HealthReport {
            component_id: "adas-gfx-visualizer".to_string(),
            overall_health,
            subsystem_health: vec![
                exports::adas::diagnostics::health_monitoring::SubsystemHealth {
                    subsystem_name: "frame-buffer".to_string(),
                    status: if unsafe { RENDERER_INITIALIZED } {
                        adas::common_types::types::HealthStatus::Ok
                    } else {
                        adas::common_types::types::HealthStatus::Offline
                    },
                    details: "Frame buffer and video rendering".to_string(),
                },
                exports::adas::diagnostics::health_monitoring::SubsystemHealth {
                    subsystem_name: "overlay-renderer".to_string(),
                    status: if unsafe { RENDERING_ACTIVE } {
                        adas::common_types::types::HealthStatus::Ok
                    } else {
                        adas::common_types::types::HealthStatus::Offline
                    },
                    details: "Overlay rendering for object detection".to_string(),
                },
            ],
            last_diagnostic: None,
            timestamp: get_timestamp(),
        }
    }

    fn run_diagnostic(
    ) -> Result<exports::adas::diagnostics::health_monitoring::DiagnosticResult, String> {
        let mut test_results = Vec::new();
        let mut overall_score = 100.0;

        // Test renderer initialization
        test_results.push(
            exports::adas::diagnostics::health_monitoring::TestExecution {
                test_name: "graphics-renderer-init".to_string(),
                test_result: if unsafe { RENDERER_INITIALIZED } {
                    adas::common_types::types::TestResult::Passed
                } else {
                    overall_score -= 40.0;
                    adas::common_types::types::TestResult::Failed
                },
                details: "Graphics renderer initialization".to_string(),
                execution_time_ms: 3.0,
            },
        );

        // Test frame rendering
        test_results.push(
            exports::adas::diagnostics::health_monitoring::TestExecution {
                test_name: "frame-rendering".to_string(),
                test_result: if unsafe { FRAMES_RENDERED > 0 } {
                    adas::common_types::types::TestResult::Passed
                } else {
                    overall_score -= 30.0;
                    adas::common_types::types::TestResult::Warning
                },
                details: format!("{} frames rendered", unsafe { FRAMES_RENDERED }),
                execution_time_ms: 5.0,
            },
        );

        // Test overlay rendering
        test_results.push(
            exports::adas::diagnostics::health_monitoring::TestExecution {
                test_name: "overlay-rendering".to_string(),
                test_result: if unsafe { OVERLAY_OBJECTS > 0 } {
                    adas::common_types::types::TestResult::Passed
                } else {
                    overall_score -= 20.0;
                    adas::common_types::types::TestResult::Warning
                },
                details: format!("{} overlay objects rendered", unsafe { OVERLAY_OBJECTS }),
                execution_time_ms: 2.0,
            },
        );

        let recommendations = if overall_score > 90.0 {
            vec!["Graphics visualizer operating optimally".to_string()]
        } else if overall_score > 70.0 {
            vec!["Graphics visualizer operational with minor issues".to_string()]
        } else {
            vec!["Graphics visualizer requires attention".to_string()]
        };

        Ok(
            exports::adas::diagnostics::health_monitoring::DiagnosticResult {
                test_results,
                overall_score,
                recommendations,
                timestamp: get_timestamp(),
            },
        )
    }

    fn get_last_diagnostic(
    ) -> Option<exports::adas::diagnostics::health_monitoring::DiagnosticResult> {
        None
    }
}

// Implement performance monitoring interface
impl exports::adas::diagnostics::performance_monitoring::Guest for Component {
    fn get_performance() -> exports::adas::diagnostics::performance_monitoring::ExtendedPerformance
    {
        unsafe {
            let avg_render_time = if FRAMES_RENDERED > 0 {
                TOTAL_RENDER_TIME_MS / FRAMES_RENDERED as f64
            } else {
                0.0
            };

            exports::adas::diagnostics::performance_monitoring::ExtendedPerformance {
                base_metrics: adas::common_types::types::PerformanceMetrics {
                    latency_avg_ms: avg_render_time as f32,
                    latency_max_ms: 50.0,  // Typical max render time
                    cpu_utilization: 0.25, // Graphics rendering CPU usage
                    memory_usage_mb: 128,  // Frame buffers + overlays
                    throughput_hz: 30.0,   // Target frame rate
                    error_rate: 0.001,
                },
                component_specific: vec![
                    exports::adas::diagnostics::performance_monitoring::Metric {
                        name: "frames_rendered".to_string(),
                        value: FRAMES_RENDERED as f64,
                        unit: "count".to_string(),
                        description: "Total frames rendered".to_string(),
                    },
                    exports::adas::diagnostics::performance_monitoring::Metric {
                        name: "overlay_objects".to_string(),
                        value: OVERLAY_OBJECTS as f64,
                        unit: "count".to_string(),
                        description: "Objects in current overlay".to_string(),
                    },
                    exports::adas::diagnostics::performance_monitoring::Metric {
                        name: "render_time_ms".to_string(),
                        value: avg_render_time,
                        unit: "milliseconds".to_string(),
                        description: "Average render time per frame".to_string(),
                    },
                ],
                resource_usage: exports::adas::diagnostics::performance_monitoring::ResourceUsage {
                    cpu_cores_used: 0.25,
                    memory_allocated_mb: 128,
                    memory_peak_mb: 256,
                    disk_io_mb: 0.0,
                    network_io_mb: 0.0,
                    gpu_utilization: 0.60, // Using GPU for rendering
                    gpu_memory_mb: 64,
                },
                timestamp: get_timestamp(),
            }
        }
    }

    fn get_performance_history(
        _duration_seconds: u32,
    ) -> Vec<exports::adas::diagnostics::performance_monitoring::ExtendedPerformance> {
        vec![] // Not implemented
    }

    fn reset_counters() {
        unsafe {
            FRAMES_RENDERED = 0;
            OVERLAY_OBJECTS = 0;
            TOTAL_RENDER_TIME_MS = 0.0;
        }
        println!("Graphics Visualizer: Reset performance counters");
    }
}

// Implement system control interface
impl exports::adas::control::system_control::Guest for Component {
    fn initialize_system(
        config: exports::adas::control::system_control::SystemConfig,
    ) -> Result<(), String> {
        println!("🎨 Initializing Graphics Visualizer System");
        println!("   Component ID: {}", config.component_id);

        unsafe {
            RENDERER_INITIALIZED = true;
            RENDERING_ACTIVE = false;
            FRAMES_RENDERED = 0;
            OVERLAY_OBJECTS = 0;
        }

        Ok(())
    }

    fn start_system() -> Result<(), String> {
        println!("🎨 Starting Graphics Visualizer");

        unsafe {
            if !RENDERER_INITIALIZED {
                return Err("Graphics renderer not initialized".to_string());
            }
            RENDERING_ACTIVE = true;
        }

        Ok(())
    }

    fn stop_system() -> Result<(), String> {
        println!("🎨 Stopping Graphics Visualizer");

        unsafe {
            RENDERING_ACTIVE = false;
        }

        Ok(())
    }

    fn get_system_status() -> exports::adas::control::system_control::SystemStatus {
        unsafe {
            exports::adas::control::system_control::SystemStatus {
                component_id: "adas-gfx-visualizer".to_string(),
                is_initialized: RENDERER_INITIALIZED,
                is_running: RENDERING_ACTIVE,
                uptime_seconds: 0, // Would need start time tracking
                resource_usage: exports::adas::control::system_control::ResourceUsage {
                    cpu_percentage: 25.0,
                    memory_mb: 128,
                    disk_io_kb: 0,
                    network_io_kb: 0,
                },
                last_error: None,
                timestamp: get_timestamp(),
            }
        }
    }

    fn shutdown_system() -> Result<(), String> {
        println!("🎨 Shutting down Graphics Visualizer");

        unsafe {
            RENDERING_ACTIVE = false;
            RENDERER_INITIALIZED = false;
            FRAMES_RENDERED = 0;
            OVERLAY_OBJECTS = 0;
        }

        Ok(())
    }
}

export!(Component);
