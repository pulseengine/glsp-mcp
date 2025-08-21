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

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::num::NonZeroUsize;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info};

/// Graphics output types supported by the renderer
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum GraphicsOutput {
    /// PNG image data
    Image {
        format: ImageFormat,
        width: u32,
        height: u32,
        data: Vec<u8>,
    },
    /// SVG XML string (sanitized)
    Svg {
        width: u32,
        height: u32,
        content: String,
    },
    /// Canvas drawing commands (for streaming)
    CanvasCommands {
        width: u32,
        height: u32,
        commands: Vec<CanvasCommand>,
    },
    /// WebGL commands (future)
    WebGL {
        width: u32,
        height: u32,
        commands: Vec<WebGLCommand>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ImageFormat {
    Png,
    Jpeg,
    WebP,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "cmd")]
pub enum CanvasCommand {
    BeginPath,
    MoveTo {
        x: f32,
        y: f32,
    },
    LineTo {
        x: f32,
        y: f32,
    },
    Arc {
        x: f32,
        y: f32,
        radius: f32,
        start_angle: f32,
        end_angle: f32,
    },
    Fill {
        color: String,
    },
    Stroke {
        color: String,
        width: f32,
    },
    Text {
        x: f32,
        y: f32,
        text: String,
        font: String,
    },
    Clear,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WebGLCommand {
    // Future implementation
}

/// Configuration for graphics rendering
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphicsConfig {
    /// Maximum resolution allowed
    pub max_width: u32,
    pub max_height: u32,
    /// Maximum frames per second for animations
    pub max_fps: u32,
    /// Allowed output formats
    pub allowed_formats: Vec<ImageFormat>,
    /// Enable GPU acceleration (server-side)
    pub gpu_acceleration: bool,
    /// Timeout for rendering operations
    pub render_timeout_ms: u64,
}

impl Default for GraphicsConfig {
    fn default() -> Self {
        Self {
            max_width: 1920,
            max_height: 1080,
            max_fps: 30,
            allowed_formats: vec![ImageFormat::Png, ImageFormat::WebP],
            gpu_acceleration: false,
            render_timeout_ms: 5000,
        }
    }
}

/// Server-side WASM graphics renderer
pub struct WasmGraphicsRenderer {
    config: GraphicsConfig,
    render_cache: Arc<RwLock<lru::LruCache<String, GraphicsOutput>>>,
}

impl WasmGraphicsRenderer {
    pub fn new(config: GraphicsConfig) -> Self {
        Self {
            config,
            render_cache: Arc::new(RwLock::new(lru::LruCache::new(
                NonZeroUsize::new(100).unwrap(),
            ))),
        }
    }

    /// Execute a WASM component's render function
    pub async fn render_component(
        &self,
        component_id: &str,
        method: &str,
        input_data: &[u8],
    ) -> Result<GraphicsOutput> {
        // Check cache first
        let cache_key = format!(
            "{}-{}-{}",
            component_id,
            method,
            Self::hash_input(input_data)
        );

        {
            let cache = self.render_cache.read().await;
            if let Some(cached) = cache.peek(&cache_key) {
                debug!("Returning cached render for {}", component_id);
                return Ok(cached.clone());
            }
        }

        // Execute in sandboxed environment
        let output = self
            .execute_sandboxed_render(component_id, method, input_data)
            .await?;

        // Validate and sanitize output
        let sanitized = self.sanitize_output(output)?;

        // Cache the result
        {
            let mut cache = self.render_cache.write().await;
            cache.put(cache_key, sanitized.clone());
        }

        Ok(sanitized)
    }

    /// Execute rendering in sandboxed WASM environment
    async fn execute_sandboxed_render(
        &self,
        component_id: &str,
        method: &str,
        _input_data: &[u8],
    ) -> Result<GraphicsOutput> {
        // WasmEngine integration not implemented yet
        // For now, return a placeholder

        info!("Executing sandboxed render: {} -> {}", component_id, method);

        // Placeholder implementation
        Ok(GraphicsOutput::Svg {
            width: 400,
            height: 300,
            content: format!("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 400 300\">\
                <rect x=\"10\" y=\"10\" width=\"380\" height=\"280\" fill=\"#f0f0f0\" stroke=\"#333\" stroke-width=\"2\"/>\
                <text x=\"200\" y=\"150\" text-anchor=\"middle\" font-family=\"Arial\" font-size=\"16\">\
                    WASM Component Output\
                </text>\
                <text x=\"200\" y=\"170\" text-anchor=\"middle\" font-family=\"Arial\" font-size=\"12\" fill=\"#666\">\
                    Component: {component_id}\
                </text>\
            </svg>"),
        })
    }

    /// Sanitize graphics output to prevent XSS and other attacks
    fn sanitize_output(&self, output: GraphicsOutput) -> Result<GraphicsOutput> {
        match output {
            GraphicsOutput::Svg {
                width,
                height,
                content,
            } => {
                // Sanitize SVG content
                let sanitized = self.sanitize_svg(&content)?;
                Ok(GraphicsOutput::Svg {
                    width: width.min(self.config.max_width),
                    height: height.min(self.config.max_height),
                    content: sanitized,
                })
            }
            GraphicsOutput::Image {
                format,
                width,
                height,
                data,
            } => {
                // Validate image dimensions
                if width > self.config.max_width || height > self.config.max_height {
                    anyhow::bail!("Image dimensions exceed maximum allowed");
                }

                // Validate format is allowed
                if !self.config.allowed_formats.contains(&format) {
                    anyhow::bail!("Image format {:?} not allowed", format);
                }

                // Image data integrity validation not implemented yet

                Ok(GraphicsOutput::Image {
                    format,
                    width,
                    height,
                    data,
                })
            }
            GraphicsOutput::CanvasCommands {
                width,
                height,
                commands,
            } => {
                // Validate and sanitize canvas commands
                let sanitized_commands = self.sanitize_canvas_commands(commands)?;
                Ok(GraphicsOutput::CanvasCommands {
                    width: width.min(self.config.max_width),
                    height: height.min(self.config.max_height),
                    commands: sanitized_commands,
                })
            }
            GraphicsOutput::WebGL { .. } => {
                anyhow::bail!("WebGL output not yet supported");
            }
        }
    }

    /// Sanitize SVG content to prevent XSS
    fn sanitize_svg(&self, svg: &str) -> Result<String> {
        // Proper SVG sanitization not implemented yet
        // For now, basic validation

        if svg.contains("<script") || svg.contains("javascript:") {
            anyhow::bail!("SVG contains potentially malicious content");
        }

        // Remove event handlers
        let sanitized = svg
            .replace("onclick", "data-onclick")
            .replace("onload", "data-onload")
            .replace("onerror", "data-onerror");

        Ok(sanitized)
    }

    /// Sanitize canvas commands
    fn sanitize_canvas_commands(&self, commands: Vec<CanvasCommand>) -> Result<Vec<CanvasCommand>> {
        // Validate commands don't contain malicious content
        let sanitized: Result<Vec<_>> = commands
            .into_iter()
            .map(|cmd| {
                match cmd {
                    CanvasCommand::Text { x, y, text, font } => {
                        // Sanitize text content
                        if text.len() > 1000 {
                            anyhow::bail!("Text content too long");
                        }
                        Ok(CanvasCommand::Text { x, y, text, font })
                    }
                    // Other commands are generally safe
                    other => Ok(other),
                }
            })
            .collect();

        sanitized
    }

    /// Hash input data for caching
    fn hash_input(data: &[u8]) -> String {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(data);
        format!("{:x}", hasher.finalize())
    }

    /// Setup streaming for a component
    pub fn setup_streaming(&self, component_id: String, update_interval_ms: u64) -> Result<()> {
        info!(
            "Setting up graphics streaming for component '{}' with {}ms interval",
            component_id, update_interval_ms
        );

        // Validate parameters
        if update_interval_ms < 16 {
            anyhow::bail!("Update interval too small (minimum 16ms for 60fps)");
        }

        if update_interval_ms > 10000 {
            anyhow::bail!("Update interval too large (maximum 10s)");
        }

        // TODO: Store streaming configuration for later use
        // This would typically initialize a streaming server or queue
        info!(
            "Graphics streaming setup completed for component '{}'",
            component_id
        );
        Ok(())
    }

    /// Stream graphics updates via Server-Sent Events
    pub async fn stream_graphics_updates(
        &self,
        component_id: &str,
        update_interval_ms: u64,
    ) -> Result<impl futures::Stream<Item = Result<GraphicsOutput>>> {
        use futures::stream;
        use tokio::time::{interval, Duration};

        let component_id = component_id.to_string();
        let renderer = self.clone();

        Ok(stream::unfold(
            interval(Duration::from_millis(update_interval_ms)),
            move |mut interval| {
                let component_id = component_id.clone();
                let renderer = renderer.clone();
                async move {
                    interval.tick().await;

                    // Render next frame
                    match renderer
                        .render_component(&component_id, "next_frame", &[])
                        .await
                    {
                        Ok(output) => Some((Ok(output), interval)),
                        Err(e) => Some((Err(e), interval)),
                    }
                }
            },
        ))
    }
}

impl Clone for WasmGraphicsRenderer {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            render_cache: Arc::clone(&self.render_cache),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_svg_sanitization() {
        let renderer = WasmGraphicsRenderer::new(GraphicsConfig::default());

        let malicious_svg = r#"<svg onclick="alert('xss')">
            <script>alert('xss')</script>
            <a href="javascript:alert('xss')">Click</a>
        </svg>"#;

        let result = renderer.sanitize_svg(malicious_svg);
        assert!(result.is_err() || !result.unwrap().contains("script"));
    }

    #[tokio::test]
    async fn test_dimension_limits() {
        let config = GraphicsConfig {
            max_width: 100,
            max_height: 100,
            ..Default::default()
        };
        let renderer = WasmGraphicsRenderer::new(config);

        let oversized = GraphicsOutput::Image {
            format: ImageFormat::Png,
            width: 200,
            height: 200,
            data: vec![],
        };

        let result = renderer.sanitize_output(oversized);
        assert!(result.is_err());
    }
}
