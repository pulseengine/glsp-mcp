// Graphics Context for wasi-gfx integration
// Handles surface management and frame presentation

use crate::{frame_buffer::FrameBuffer, Color};
use std::time::Instant;

/// Render target for graphics operations
#[derive(Debug, Clone, Copy)]
pub enum RenderTarget {
    Screen,
    OffscreenBuffer,
    WebCanvas,
}

/// Graphics surface configuration
#[derive(Debug, Clone)]
struct SurfaceConfig {
    width: u32,
    height: u32,
    format: SurfaceFormat,
    vsync: bool,
    multisampling: bool,
}

/// Surface pixel format
#[derive(Debug, Clone, Copy)]
enum SurfaceFormat {
    RGBA8,
    BGRA8,
    RGB565,
}

/// Graphics context for managing rendering surface
pub struct GraphicsContext {
    width: u32,
    height: u32,
    surface_config: SurfaceConfig,
    presentation_buffer: Vec<u8>,
    render_target: RenderTarget,
    frames_presented: u64,
    last_present_time: Option<Instant>,
    vsync_enabled: bool,
}

impl GraphicsContext {
    /// Create new graphics context
    pub fn new(width: u32, height: u32) -> Result<Self, String> {
        let surface_config = SurfaceConfig {
            width,
            height,
            format: SurfaceFormat::RGBA8,
            vsync: true,
            multisampling: false,
        };

        let buffer_size = (width * height * 4) as usize; // RGBA
        let presentation_buffer = vec![0u8; buffer_size];

        println!("🖥️  Creating graphics context: {}x{}", width, height);

        Ok(Self {
            width,
            height,
            surface_config,
            presentation_buffer,
            render_target: RenderTarget::Screen,
            frames_presented: 0,
            last_present_time: None,
            vsync_enabled: true,
        })
    }

    /// Present frame buffer to graphics surface
    pub fn present(&mut self, frame_buffer: &FrameBuffer) -> Result<(), String> {
        let start_time = Instant::now();

        // Copy frame buffer data to presentation buffer
        let frame_data = frame_buffer.get_raw_data();
        let (fb_width, fb_height) = frame_buffer.dimensions();

        if frame_data.len() != self.presentation_buffer.len() {
            return Err(format!(
                "Frame buffer size mismatch: expected {}, got {}",
                self.presentation_buffer.len(),
                frame_data.len()
            ));
        }

        // Direct copy for matching sizes
        if fb_width == self.width && fb_height == self.height {
            self.presentation_buffer.copy_from_slice(frame_data);
        } else {
            // Scale frame buffer to surface size
            self.scale_frame_to_surface(frame_data, fb_width, fb_height)?;
        }

        // Simulate presentation to graphics surface
        // In real wasi-gfx implementation, this would:
        // 1. Submit to WebGPU/graphics device
        // 2. Present to surface/canvas
        // 3. Handle vsync if enabled

        if self.vsync_enabled {
            // Simulate vsync timing (60 FPS = 16.67ms)
            if let Some(last_time) = self.last_present_time {
                let elapsed = start_time.duration_since(last_time);
                let target_frame_time = std::time::Duration::from_millis(16); // ~60 FPS

                if elapsed < target_frame_time {
                    // In real implementation, would wait for vsync
                    std::thread::sleep(target_frame_time - elapsed);
                }
            }
        }

        // Update presentation statistics
        self.frames_presented += 1;
        self.last_present_time = Some(start_time);

        // Log presentation (for debugging)
        if self.frames_presented % 60 == 0 {
            let fps = self.calculate_fps();
            println!(
                "🖥️  Presented {} frames (current FPS: {:.1})",
                self.frames_presented, fps
            );
        }

        Ok(())
    }

    /// Resize graphics surface
    pub fn resize(&mut self, width: u32, height: u32) -> Result<(), String> {
        println!(
            "🖥️  Resizing graphics surface: {}x{} -> {}x{}",
            self.width, self.height, width, height
        );

        self.width = width;
        self.height = height;
        self.surface_config.width = width;
        self.surface_config.height = height;

        // Reallocate presentation buffer
        let buffer_size = (width * height * 4) as usize;
        self.presentation_buffer = vec![0u8; buffer_size];

        Ok(())
    }

    /// Set render target
    pub fn set_render_target(&mut self, target: RenderTarget) -> Result<(), String> {
        self.render_target = target;

        match target {
            RenderTarget::Screen => {
                println!("🖥️  Render target: Screen");
            }
            RenderTarget::OffscreenBuffer => {
                println!("🖥️  Render target: Offscreen Buffer");
            }
            RenderTarget::WebCanvas => {
                println!("🖥️  Render target: Web Canvas");
            }
        }

        Ok(())
    }

    /// Enable/disable vsync
    pub fn set_vsync(&mut self, enabled: bool) -> Result<(), String> {
        self.vsync_enabled = enabled;
        self.surface_config.vsync = enabled;

        println!(
            "🖥️  VSync: {}",
            if enabled { "Enabled" } else { "Disabled" }
        );
        Ok(())
    }

    /// Get current surface configuration
    pub fn get_surface_config(&self) -> (u32, u32, bool) {
        (self.width, self.height, self.vsync_enabled)
    }

    /// Get presentation statistics
    pub fn get_presentation_stats(&self) -> (u64, f32) {
        let fps = self.calculate_fps();
        (self.frames_presented, fps)
    }

    /// Clear surface with color
    pub fn clear_surface(&mut self, color: Color) -> Result<(), String> {
        // Fill presentation buffer with clear color
        for chunk in self.presentation_buffer.chunks_mut(4) {
            if chunk.len() >= 4 {
                chunk[0] = color.r;
                chunk[1] = color.g;
                chunk[2] = color.b;
                chunk[3] = color.a;
            }
        }

        Ok(())
    }

    /// Export current surface as image data
    pub fn export_surface(&self) -> Result<Vec<u8>, String> {
        // Return copy of presentation buffer
        Ok(self.presentation_buffer.clone())
    }

    /// Cleanup graphics context
    pub fn cleanup(&mut self) -> Result<(), String> {
        println!("🖥️  Cleaning up graphics context");
        println!("    Total frames presented: {}", self.frames_presented);

        // In real implementation, would:
        // 1. Destroy graphics resources
        // 2. Release surface
        // 3. Clean up WebGPU context

        self.presentation_buffer.clear();
        self.frames_presented = 0;
        self.last_present_time = None;

        Ok(())
    }

    /// Scale frame buffer to surface size
    fn scale_frame_to_surface(
        &mut self,
        frame_data: &[u8],
        src_width: u32,
        src_height: u32,
    ) -> Result<(), String> {
        let dst_width = self.width;
        let dst_height = self.height;

        // Simple nearest-neighbor scaling
        for y in 0..dst_height {
            for x in 0..dst_width {
                let src_x = (x * src_width) / dst_width;
                let src_y = (y * src_height) / dst_height;

                if src_x < src_width && src_y < src_height {
                    let src_idx = ((src_y * src_width + src_x) * 4) as usize;
                    let dst_idx = ((y * dst_width + x) * 4) as usize;

                    if src_idx + 3 < frame_data.len()
                        && dst_idx + 3 < self.presentation_buffer.len()
                    {
                        self.presentation_buffer[dst_idx..dst_idx + 4]
                            .copy_from_slice(&frame_data[src_idx..src_idx + 4]);
                    }
                }
            }
        }

        Ok(())
    }

    /// Calculate current FPS
    fn calculate_fps(&self) -> f32 {
        if let Some(last_time) = self.last_present_time {
            let elapsed = last_time.elapsed().as_secs_f32();
            if elapsed > 0.0 {
                return 1.0 / elapsed;
            }
        }
        0.0
    }
}

/// Graphics context factory
pub struct GraphicsContextFactory;

impl GraphicsContextFactory {
    /// Create graphics context for web canvas
    pub fn create_web_context(
        canvas_id: &str,
        width: u32,
        height: u32,
    ) -> Result<GraphicsContext, String> {
        println!(
            "🖥️  Creating web graphics context for canvas: {}",
            canvas_id
        );

        let mut context = GraphicsContext::new(width, height)?;
        context.set_render_target(RenderTarget::WebCanvas)?;

        Ok(context)
    }

    /// Create graphics context for offscreen rendering
    pub fn create_offscreen_context(width: u32, height: u32) -> Result<GraphicsContext, String> {
        println!("🖥️  Creating offscreen graphics context");

        let mut context = GraphicsContext::new(width, height)?;
        context.set_render_target(RenderTarget::OffscreenBuffer)?;

        Ok(context)
    }

    /// Create graphics context with custom configuration
    pub fn create_custom_context(
        width: u32,
        height: u32,
        vsync: bool,
        target: RenderTarget,
    ) -> Result<GraphicsContext, String> {
        println!(
            "🖥️  Creating custom graphics context: {}x{}, vsync: {}",
            width, height, vsync
        );

        let mut context = GraphicsContext::new(width, height)?;
        context.set_vsync(vsync)?;
        context.set_render_target(target)?;

        Ok(context)
    }
}

/// Surface capabilities detection
pub struct SurfaceCapabilities;

impl SurfaceCapabilities {
    /// Check if wasi-gfx is available
    pub fn is_wasi_gfx_available() -> bool {
        // In real implementation, would check for wasi-gfx support
        // For now, simulate availability
        false
    }

    /// Get supported surface formats
    pub fn get_supported_formats() -> Vec<String> {
        vec![
            "RGBA8".to_string(),
            "BGRA8".to_string(),
            "RGB565".to_string(),
        ]
    }

    /// Get maximum surface dimensions
    pub fn get_max_dimensions() -> (u32, u32) {
        (4096, 4096) // Typical GPU limit
    }

    /// Check multisampling support
    pub fn supports_multisampling() -> bool {
        true
    }

    /// Check vsync support
    pub fn supports_vsync() -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::frame_buffer::{FrameBuffer, PixelFormat};

    #[test]
    fn test_graphics_context_creation() {
        let context = GraphicsContext::new(640, 480).unwrap();
        assert_eq!(context.width, 640);
        assert_eq!(context.height, 480);
        assert_eq!(context.frames_presented, 0);
    }

    #[test]
    fn test_surface_clearing() {
        let mut context = GraphicsContext::new(100, 100).unwrap();
        let red = Color {
            r: 255,
            g: 0,
            b: 0,
            a: 255,
        };

        context.clear_surface(red).unwrap();

        // Check that surface is filled with red
        assert_eq!(context.presentation_buffer[0], 255); // R
        assert_eq!(context.presentation_buffer[1], 0); // G
        assert_eq!(context.presentation_buffer[2], 0); // B
        assert_eq!(context.presentation_buffer[3], 255); // A
    }

    #[test]
    fn test_frame_presentation() {
        let mut context = GraphicsContext::new(100, 100).unwrap();
        let frame_buffer = FrameBuffer::new(100, 100, PixelFormat::RGBA8).unwrap();

        context.present(&frame_buffer).unwrap();
        assert_eq!(context.frames_presented, 1);
    }

    #[test]
    fn test_context_resize() {
        let mut context = GraphicsContext::new(640, 480).unwrap();

        context.resize(1280, 720).unwrap();
        assert_eq!(context.width, 1280);
        assert_eq!(context.height, 720);
    }

    #[test]
    fn test_vsync_control() {
        let mut context = GraphicsContext::new(640, 480).unwrap();

        context.set_vsync(false).unwrap();
        assert!(!context.vsync_enabled);

        context.set_vsync(true).unwrap();
        assert!(context.vsync_enabled);
    }
}
