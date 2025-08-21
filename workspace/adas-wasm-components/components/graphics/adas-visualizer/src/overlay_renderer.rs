// Overlay renderer for object detection bounding boxes and labels
// Handles drawing detection overlays on top of video frames

use crate::Color;
use std::collections::HashMap;

/// Bounding box for object detection
#[derive(Debug, Clone)]
pub struct BoundingBox {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// Text label for overlays
#[derive(Debug, Clone)]
pub struct TextLabel {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub color: Color,
}

/// Simple bitmap font for text rendering
struct BitmapFont {
    char_width: u32,
    char_height: u32,
    font_data: HashMap<char, Vec<u8>>,
}

impl BitmapFont {
    fn new() -> Self {
        let mut font_data = HashMap::new();

        // Simple 8x8 bitmap font for basic characters
        // Each character is represented as 8 bytes (8x8 pixels)

        // Letter 'A'
        font_data.insert(
            'A',
            vec![
                0b00111000, 0b01101100, 0b11000110, 0b11000110, 0b11111110, 0b11000110, 0b11000110,
                0b00000000,
            ],
        );

        // Letter 'B'
        font_data.insert(
            'B',
            vec![
                0b11111100, 0b11000110, 0b11000110, 0b11111100, 0b11000110, 0b11000110, 0b11111100,
                0b00000000,
            ],
        );

        // Letter 'C'
        font_data.insert(
            'C',
            vec![
                0b01111100, 0b11000110, 0b11000000, 0b11000000, 0b11000000, 0b11000110, 0b01111100,
                0b00000000,
            ],
        );

        // Add more characters as needed...
        // For brevity, we'll add a few common ones

        // Digit '0'
        font_data.insert(
            '0',
            vec![
                0b01111100, 0b11000110, 0b11001110, 0b11011110, 0b11110110, 0b11100110, 0b01111100,
                0b00000000,
            ],
        );

        // Digit '1'
        font_data.insert(
            '1',
            vec![
                0b00011000, 0b00111000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b01111110,
                0b00000000,
            ],
        );

        // Space character
        font_data.insert(
            ' ',
            vec![
                0b00000000, 0b00000000, 0b00000000, 0b00000000, 0b00000000, 0b00000000, 0b00000000,
                0b00000000,
            ],
        );

        // Colon ':'
        font_data.insert(
            ':',
            vec![
                0b00000000, 0b00011000, 0b00011000, 0b00000000, 0b00011000, 0b00011000, 0b00000000,
                0b00000000,
            ],
        );

        // Percent '%'
        font_data.insert(
            '%',
            vec![
                0b01100010, 0b01100100, 0b00001000, 0b00010000, 0b00100000, 0b01001100, 0b10001100,
                0b00000000,
            ],
        );

        Self {
            char_width: 8,
            char_height: 8,
            font_data,
        }
    }

    fn get_char_bitmap(&self, ch: char) -> Option<&Vec<u8>> {
        self.font_data.get(&ch)
    }
}

/// Overlay renderer for drawing on top of video frames
pub struct OverlayRenderer {
    width: u32,
    height: u32,
    buffer: Vec<u8>, // RGBA buffer for overlay
    font: BitmapFont,
}

impl OverlayRenderer {
    /// Create new overlay renderer
    pub fn new(width: u32, height: u32) -> Self {
        let buffer_size = (width * height * 4) as usize; // RGBA
        let buffer = vec![0u8; buffer_size]; // Transparent by default

        println!("🎭 Creating overlay renderer: {}x{}", width, height);

        Self {
            width,
            height,
            buffer,
            font: BitmapFont::new(),
        }
    }

    /// Clear overlay buffer
    pub fn clear(&mut self) {
        self.buffer.fill(0); // Make everything transparent
    }

    /// Draw bounding box
    pub fn draw_bounding_box(
        &mut self,
        bbox: &BoundingBox,
        color: Color,
        filled: bool,
    ) -> Result<(), String> {
        let x = bbox.x.max(0.0) as u32;
        let y = bbox.y.max(0.0) as u32;
        let width = bbox.width.max(0.0) as u32;
        let height = bbox.height.max(0.0) as u32;

        if filled {
            self.fill_rectangle(x, y, width, height, color)?;
        } else {
            // Draw outline with 2-pixel thickness for visibility
            self.draw_thick_rectangle(x, y, width, height, color, 2)?;
        }

        Ok(())
    }

    /// Draw text label
    pub fn draw_text_label(&mut self, label: &TextLabel) -> Result<(), String> {
        let x = label.x.max(0.0) as u32;
        let y = label.y.max(0.0) as u32;

        // Draw text background for better visibility
        let text_width = label.text.len() as u32 * self.font.char_width;
        let text_height = self.font.char_height;

        let bg_color = Color {
            r: 0,
            g: 0,
            b: 0,
            a: 180,
        }; // Semi-transparent black
        self.fill_rectangle(x, y, text_width + 4, text_height + 2, bg_color)?;

        // Draw text
        self.draw_text(&label.text, x + 2, y + 1, label.color)?;

        Ok(())
    }

    /// Draw a point (small circle)
    pub fn draw_point(&mut self, x: f32, y: f32, color: Color) -> Result<(), String> {
        let center_x = x as i32;
        let center_y = y as i32;
        let radius = 3;

        for dy in -radius..=radius {
            for dx in -radius..=radius {
                if dx * dx + dy * dy <= radius * radius {
                    let px = center_x + dx;
                    let py = center_y + dy;

                    if px >= 0 && py >= 0 && px < self.width as i32 && py < self.height as i32 {
                        self.set_pixel(px as u32, py as u32, color)?;
                    }
                }
            }
        }

        Ok(())
    }

    /// Draw line with thickness
    pub fn draw_line(
        &mut self,
        x0: f32,
        y0: f32,
        x1: f32,
        y1: f32,
        color: Color,
        thickness: f32,
    ) -> Result<(), String> {
        let thickness = thickness.max(1.0) as i32;

        // Draw multiple parallel lines for thickness
        for offset in -(thickness / 2)..=(thickness / 2) {
            self.draw_line_internal(
                x0 as i32,
                y0 as i32 + offset,
                x1 as i32,
                y1 as i32 + offset,
                color,
            )?;
            self.draw_line_internal(
                x0 as i32 + offset,
                y0 as i32,
                x1 as i32 + offset,
                y1 as i32,
                color,
            )?;
        }

        Ok(())
    }

    /// Set pixel in overlay buffer
    fn set_pixel(&mut self, x: u32, y: u32, color: Color) -> Result<(), String> {
        if x >= self.width || y >= self.height {
            return Ok(()); // Silently ignore out-of-bounds pixels
        }

        let index = ((y * self.width + x) as usize) * 4;

        if index + 3 < self.buffer.len() {
            self.buffer[index] = color.r;
            self.buffer[index + 1] = color.g;
            self.buffer[index + 2] = color.b;
            self.buffer[index + 3] = color.a;
        }

        Ok(())
    }

    /// Get pixel from overlay buffer
    pub fn get_pixel(&self, x: u32, y: u32) -> Result<Color, String> {
        if x >= self.width || y >= self.height {
            return Ok(Color {
                r: 0,
                g: 0,
                b: 0,
                a: 0,
            }); // Transparent for out-of-bounds
        }

        let index = ((y * self.width + x) as usize) * 4;

        if index + 3 < self.buffer.len() {
            Ok(Color {
                r: self.buffer[index],
                g: self.buffer[index + 1],
                b: self.buffer[index + 2],
                a: self.buffer[index + 3],
            })
        } else {
            Ok(Color {
                r: 0,
                g: 0,
                b: 0,
                a: 0,
            })
        }
    }

    /// Draw thick rectangle outline
    fn draw_thick_rectangle(
        &mut self,
        x: u32,
        y: u32,
        width: u32,
        height: u32,
        color: Color,
        thickness: u32,
    ) -> Result<(), String> {
        for t in 0..thickness {
            // Top edge
            if y + t < self.height {
                for px in x..x.saturating_add(width).min(self.width) {
                    self.set_pixel(px, y + t, color)?;
                }
            }

            // Bottom edge
            if y + height > t && y + height - t - 1 < self.height {
                for px in x..x.saturating_add(width).min(self.width) {
                    self.set_pixel(px, y + height - t - 1, color)?;
                }
            }

            // Left edge
            if x + t < self.width {
                for py in y..y.saturating_add(height).min(self.height) {
                    self.set_pixel(x + t, py, color)?;
                }
            }

            // Right edge
            if x + width > t && x + width - t - 1 < self.width {
                for py in y..y.saturating_add(height).min(self.height) {
                    self.set_pixel(x + width - t - 1, py, color)?;
                }
            }
        }

        Ok(())
    }

    /// Fill rectangle
    fn fill_rectangle(
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

    /// Draw text using bitmap font
    fn draw_text(&mut self, text: &str, x: u32, y: u32, color: Color) -> Result<(), String> {
        let mut current_x = x;

        for ch in text.chars() {
            if let Some(char_bitmap) = self.font.get_char_bitmap(ch) {
                self.draw_char_bitmap(char_bitmap, current_x, y, color)?;
            }
            current_x += self.font.char_width;

            // Stop if we exceed the overlay width
            if current_x >= self.width {
                break;
            }
        }

        Ok(())
    }

    /// Draw character bitmap
    fn draw_char_bitmap(
        &mut self,
        bitmap: &[u8],
        x: u32,
        y: u32,
        color: Color,
    ) -> Result<(), String> {
        for (row, &byte) in bitmap.iter().enumerate() {
            for col in 0..8 {
                if byte & (1 << (7 - col)) != 0 {
                    let px = x + col;
                    let py = y + row as u32;

                    if px < self.width && py < self.height {
                        self.set_pixel(px, py, color)?;
                    }
                }
            }
        }

        Ok(())
    }

    /// Draw line using Bresenham's algorithm
    fn draw_line_internal(
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

    /// Get overlay buffer
    pub fn get_buffer(&self) -> &[u8] {
        &self.buffer
    }

    /// Get overlay dimensions
    pub fn dimensions(&self) -> (u32, u32) {
        (self.width, self.height)
    }

    /// Cleanup overlay renderer
    pub fn cleanup(&mut self) {
        self.clear();
        println!("🎭 Overlay renderer cleaned up");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_overlay_creation() {
        let overlay = OverlayRenderer::new(640, 480);
        assert_eq!(overlay.dimensions(), (640, 480));
        assert_eq!(overlay.buffer.len(), 640 * 480 * 4);
    }

    #[test]
    fn test_bounding_box_drawing() {
        let mut overlay = OverlayRenderer::new(100, 100);
        let bbox = BoundingBox {
            x: 10.0,
            y: 10.0,
            width: 50.0,
            height: 30.0,
        };
        let red = Color {
            r: 255,
            g: 0,
            b: 0,
            a: 255,
        };

        overlay.draw_bounding_box(&bbox, red, false).unwrap();

        // Check that corner pixels are red
        let pixel = overlay.get_pixel(10, 10).unwrap();
        assert_eq!(pixel.r, 255);
    }

    #[test]
    fn test_text_drawing() {
        let mut overlay = OverlayRenderer::new(200, 100);
        let label = TextLabel {
            text: "Test".to_string(),
            x: 10.0,
            y: 10.0,
            color: Color {
                r: 255,
                g: 255,
                b: 255,
                a: 255,
            },
        };

        overlay.draw_text_label(&label).unwrap();

        // Text should create some non-transparent pixels
        let mut has_text = false;
        for x in 10..50 {
            for y in 10..20 {
                if overlay.get_pixel(x, y).unwrap().a > 0 {
                    has_text = true;
                    break;
                }
            }
        }
        assert!(has_text);
    }
}
