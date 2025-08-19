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

//! Main entry point for GLSP MCP Server using the PulseEngine MCP framework 0.3.0

use clap::Parser;
use glsp_mcp_server::{GlspBackend, GlspConfig};
use pulseengine_mcp_auth::config::AuthConfig;
use pulseengine_mcp_server::{McpServer, ServerConfig};
use std::fs;
use std::path::Path;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    // Initialize logging first
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            EnvFilter::new(
                "glsp_mcp_server=info,pulseengine_mcp_server=info,pulseengine_mcp_transport=info",
            )
        }))
        .init();

    // Parse configuration using CLI framework
    let config = GlspConfig::parse();

    info!("Starting GLSP MCP Server...");

    // Create directories if they don't exist (when force flag is used)
    if config.force {
        if !Path::new(&config.wasm_path).exists() {
            info!("Creating WASM components directory: {}", config.wasm_path);
            fs::create_dir_all(&config.wasm_path)?;
        }
        if !Path::new(&config.diagrams_path).exists() {
            info!("Creating diagrams directory: {}", config.diagrams_path);
            fs::create_dir_all(&config.diagrams_path)?;
        }
    } else {
        // Verify paths exist when not forcing
        if !Path::new(&config.wasm_path).exists() {
            warn!(
                "WASM components directory does not exist: {}. Use --force flag to create it automatically",
                config.wasm_path
            );
        }
        if !Path::new(&config.diagrams_path).exists() {
            warn!(
                "Diagrams directory does not exist: {}. Use --force flag to create it automatically",
                config.diagrams_path
            );
        }
    }

    info!(
        "Starting GLSP MCP Server with {} transport on port {}...",
        config.transport, config.port
    );

    // Initialize backend
    info!("Initializing GLSP backend...");
    let backend = GlspBackend::initialize(config.clone()).await?;

    // Configure server with framework based on our config
    // Use memory-only authentication (no persistent storage)
    use pulseengine_mcp_transport::TransportConfig;
    let server_config = ServerConfig {
        auth_config: AuthConfig::memory(),
        transport_config: match config.transport.as_str() {
            "http" => TransportConfig::http(config.port),
            "http-streaming" | "streaming" => TransportConfig::streamable_http(config.port),
            "websocket" => TransportConfig::websocket(config.port),
            "stdio" => TransportConfig::stdio(),
            _ => {
                warn!(
                    "Unknown transport type: {}, defaulting to HTTP streaming",
                    config.transport
                );
                TransportConfig::streamable_http(config.port)
            }
        },
        ..Default::default()
    };

    // Create and run server using framework
    let mut server = McpServer::new(backend, server_config).await?;

    info!("GLSP MCP Server listening on port {}", config.port);
    server.run().await?;

    info!("GLSP MCP Server shutdown complete");
    Ok(())
}
