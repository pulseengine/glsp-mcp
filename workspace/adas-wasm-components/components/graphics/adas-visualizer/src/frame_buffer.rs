// Frame Buffer implementation for graphics rendering
// Handles video frame storage and basic drawing operations

use crate::{overlay_renderer::OverlayRenderer, Color};

/// Pixel format for frame buffer
#[derive(Debug, Clone, Copy)]
pub enum PixelFormat {
    RGB8,
    RGBA8,
    BGR8,
    BGRA8,
}

impl PixelFormat {
    pub fn bytes_per_pixel(&self) -> usize {
        match self {
            PixelFormat::RGB8 | PixelFormat::BGR8 => 3,
            PixelFormat::RGBA8 | PixelFormat::BGRA8 => 4,
        }
    }
}

/// Frame buffer for storing and manipulating video frames
pub struct FrameBuffer {
    width: u32,
    height: u32,
    format: PixelFormat,
    data: Vec<u8>,
}

impl FrameBuffer {
    /// Create new frame buffer
    pub fn new(width: u32, height: u32, format: PixelFormat) -> Result<Self, String> {
        let size = (width * height) as usize * format.bytes_per_pixel();
        let data = vec![0u8; size];

        println!(
            "📱 Creating frame buffer: {}x{} ({} bytes)",
            width, height, size
        );

        Ok(Self {
            width,
            height,
            format,
            data,
        })
    }

    /// Clear frame buffer with color
    pub fn clear(&mut self, color: Color) -> Result<(), String> {
        let bytes_per_pixel = self.format.bytes_per_pixel();

        for chunk in self.data.chunks_mut(bytes_per_pixel) {
            match self.format {
                PixelFormat::RGB8 => {
                    if chunk.len() >= 3 {
                        chunk[0] = color.r;
                        chunk[1] = color.g;
                        chunk[2] = color.b;
                    }
                }
                PixelFormat::RGBA8 => {
                    if chunk.len() >= 4 {
                        chunk[0] = color.r;
                        chunk[1] = color.g;
                        chunk[2] = color.b;
                        chunk[3] = color.a;
                    }
                }
                PixelFormat::BGR8 => {
                    if chunk.len() >= 3 {
                        chunk[0] = color.b;
                        chunk[1] = color.g;
                        chunk[2] = color.r;
                    }
                }
                PixelFormat::BGRA8 => {
                    if chunk.len() >= 4 {
                        chunk[0] = color.b;
                        chunk[1] = color.g;
                        chunk[2] = color.r;
                        chunk[3] = color.a;
                    }
                }
            }
        }

        Ok(())
    }

    /// Draw image data to frame buffer
    pub fn draw_image(&mut self, image_data: &[u8]) -> Result<(), String> {
        if image_data.len() != self.data.len() {
            return Err(format!(
                "Image data size mismatch: expected {}, got {}",
                self.data.len(),
                image_data.len()
            ));
        }

        self.data.copy_from_slice(image_data);
        Ok(())
    }

    /// Set pixel at coordinates
    pub fn set_pixel(&mut self, x: u32, y: u32, color: Color) -> Result<(), String> {
        if x >= self.width || y >= self.height {
            return Err(format!("Pixel coordinates out of bounds: ({}, {})", x, y));
        }

        let index = ((y * self.width + x) as usize) * self.format.bytes_per_pixel();

        if index + self.format.bytes_per_pixel() > self.data.len() {
            return Err("Pixel index out of bounds".to_string());
        }

        match self.format {
            PixelFormat::RGB8 => {
                self.data[index] = color.r;
                self.data[index + 1] = color.g;
                self.data[index + 2] = color.b;
            }
            PixelFormat::RGBA8 => {
                self.data[index] = color.r;
                self.data[index + 1] = color.g;
                self.data[index + 2] = color.b;
                self.data[index + 3] = color.a;
            }
            PixelFormat::BGR8 => {
                self.data[index] = color.b;
                self.data[index + 1] = color.g;
                self.data[index + 2] = color.r;
            }
            PixelFormat::BGRA8 => {
                self.data[index] = color.b;
                self.data[index + 1] = color.g;
                self.data[index + 2] = color.r;
                self.data[index + 3] = color.a;
            }
        }

        Ok(())
    }

    /// Get pixel at coordinates
    pub fn get_pixel(&self, x: u32, y: u32) -> Result<Color, String> {
        if x >= self.width || y >= self.height {
            return Err(format!("Pixel coordinates out of bounds: ({}, {})", x, y));
        }

        let index = ((y * self.width + x) as usize) * self.format.bytes_per_pixel();

        if index + self.format.bytes_per_pixel() > self.data.len() {
            return Err("Pixel index out of bounds".to_string());
        }

        let color = match self.format {
            PixelFormat::RGB8 => Color {
                r: self.data[index],
                g: self.data[index + 1],
                b: self.data[index + 2],
                a: 255,
            },
            PixelFormat::RGBA8 => Color {
                r: self.data[index],
                g: self.data[index + 1],
                b: self.data[index + 2],
                a: self.data[index + 3],
            },
            PixelFormat::BGR8 => Color {
                r: self.data[index + 2],
                g: self.data[index + 1],
                b: self.data[index],
                a: 255,
            },
            PixelFormat::BGRA8 => Color {
                r: self.data[index + 2],
                g: self.data[index + 1],
                b: self.data[index],
                a: self.data[index + 3],
            },
        };

        Ok(color)
    }

    /// Draw line using Bresenham's algorithm
    pub fn draw_line(
        &mut self,
        x0: i32,
        y0: i32,
        x1: i32,
        y1: i32,
        color: Color,
    ) -> Result<(), String> {
        let mut x0 = x0;
        let mut y0 = y0;
        let dx = (x1 - x0).abs();
        let dy = -(y1 - y0).abs();
        let sx = if x0 < x1 { 1 } else { -1 };
        let sy = if y0 < y1 { 1 } else { -1 };
        let mut err = dx + dy;

        loop {
            if x0 >= 0 && y0 >= 0 && x0 < self.width as i32 && y0 < self.height as i32 {
                self.set_pixel(x0 as u32, y0 as u32, color)?;
            }

            if x0 == x1 && y0 == y1 {
                break;
            }

            let e2 = 2 * err;
            if e2 >= dy {
                err += dy;
                x0 += sx;
            }
            if e2 <= dx {
                err += dx;
                y0 += sy;
            }
        }

        Ok(())
    }

    /// Draw rectangle outline
    pub fn draw_rectangle(
        &mut self,
        x: u32,
        y: u32,
        width: u32,
        height: u32,
        color: Color,
    ) -> Result<(), String> {
        // Top edge
        self.draw_line(x as i32, y as i32, (x + width) as i32, y as i32, color)?;
        // Bottom edge
        self.draw_line(
            x as i32,
            (y + height) as i32,
            (x + width) as i32,
            (y + height) as i32,
            color,
        )?;
        // Left edge
        self.draw_line(x as i32, y as i32, x as i32, (y + height) as i32, color)?;
        // Right edge
        self.draw_line(
            (x + width) as i32,
            y as i32,
            (x + width) as i32,
            (y + height) as i32,
            color,
        )?;

        Ok(())
    }

    /// Fill rectangle
    pub fn fill_rectangle(
        &mut self,
        x: u32,
        y: u32,
        width: u32,
        height: u32,
        color: Color,
    ) -> Result<(), String> {
        for py in y..y.saturating_add(height).min(self.height) {
            for px in x..x.saturating_add(width).min(self.width) {
                self.set_pixel(px, py, color)?;
            }
        }
        Ok(())
    }

    /// Composite overlay onto frame buffer (alpha blending)
    pub fn composite_overlay(&mut self, overlay: &OverlayRenderer) -> Result<(), String> {
        let overlay_data = overlay.get_buffer();

        for y in 0..self.height {
            for x in 0..self.width {
                let overlay_pixel = overlay.get_pixel(x, y)?;

                // Skip transparent pixels
                if overlay_pixel.a == 0 {
                    continue;
                }

                // Alpha blending
                if overlay_pixel.a == 255 {
                    // Fully opaque - replace pixel
                    self.set_pixel(x, y, overlay_pixel)?;
                } else {
                    // Semi-transparent - blend
                    let background = self.get_pixel(x, y)?;
                    let alpha = overlay_pixel.a as f32 / 255.0;
                    let inv_alpha = 1.0 - alpha;

                    let blended = Color {
                        r: ((overlay_pixel.r as f32 * alpha) + (background.r as f32 * inv_alpha))
                            as u8,
                        g: ((overlay_pixel.g as f32 * alpha) + (background.g as f32 * inv_alpha))
                            as u8,
                        b: ((overlay_pixel.b as f32 * alpha) + (background.b as f32 * inv_alpha))
                            as u8,
                        a: 255,
                    };

                    self.set_pixel(x, y, blended)?;
                }
            }
        }

        Ok(())
    }

    /// Export frame buffer as PNG
    pub fn export_png(&self) -> Result<Vec<u8>, String> {
        // Simple PNG export (would use image crate in real implementation)
        // For now, return raw data with PNG header indication
        let mut png_data = Vec::new();

        // PNG signature
        png_data.extend_from_slice(&[137, 80, 78, 71, 13, 10, 26, 10]);

        // For actual implementation, would use proper PNG encoding
        // For now, just return raw RGBA data prefixed with dimensions
        png_data.extend_from_slice(&self.width.to_be_bytes());
        png_data.extend_from_slice(&self.height.to_be_bytes());
        png_data.extend_from_slice(&self.data);

        Ok(png_data)
    }

    /// Get raw frame buffer data
    pub fn get_raw_data(&self) -> &[u8] {
        &self.data
    }

    /// Get frame buffer dimensions
    pub fn dimensions(&self) -> (u32, u32) {
        (self.width, self.height)
    }

    /// Get pixel format
    pub fn pixel_format(&self) -> PixelFormat {
        self.format
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frame_buffer_creation() {
        let fb = FrameBuffer::new(640, 480, PixelFormat::RGBA8).unwrap();
        assert_eq!(fb.dimensions(), (640, 480));
        assert_eq!(fb.data.len(), 640 * 480 * 4);
    }

    #[test]
    fn test_pixel_operations() {
        let mut fb = FrameBuffer::new(10, 10, PixelFormat::RGBA8).unwrap();
        let red = Color {
            r: 255,
            g: 0,
            b: 0,
            a: 255,
        };

        fb.set_pixel(5, 5, red).unwrap();
        let pixel = fb.get_pixel(5, 5).unwrap();

        assert_eq!(pixel.r, 255);
        assert_eq!(pixel.g, 0);
        assert_eq!(pixel.b, 0);
        assert_eq!(pixel.a, 255);
    }

    #[test]
    fn test_clear_buffer() {
        let mut fb = FrameBuffer::new(10, 10, PixelFormat::RGBA8).unwrap();
        let blue = Color {
            r: 0,
            g: 0,
            b: 255,
            a: 255,
        };

        fb.clear(blue).unwrap();
        let pixel = fb.get_pixel(3, 7).unwrap();

        assert_eq!(pixel.b, 255);
    }

    #[test]
    fn test_draw_line() {
        let mut fb = FrameBuffer::new(100, 100, PixelFormat::RGBA8).unwrap();
        let white = Color {
            r: 255,
            g: 255,
            b: 255,
            a: 255,
        };

        fb.draw_line(10, 10, 50, 50, white).unwrap();

        // Check that some pixels along the line are white
        let pixel = fb.get_pixel(20, 20).unwrap();
        assert_eq!(pixel.r, 255);
    }
}
