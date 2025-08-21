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

//! GLSP-MCP Server - A revolutionary AI-native graphical modeling platform
//!
//! This crate implements a Model Context Protocol (MCP) server that enables AI agents
//! to create, modify, and analyze diagrams through a standardized protocol. The server
//! combines WASM component execution with graphical diagram management.
//!
//! # Features
//!
//! - **MCP Protocol**: Full implementation of Model Context Protocol for AI integration
//! - **WASM Components**: Execute and manage WebAssembly components
//! - **Diagram Management**: Create, edit, and persist graphical diagrams
//! - **Real-time Collaboration**: Live diagram updates and validation
//! - **Sensor Data Integration**: Connect with sensor data streams
//! - **Security**: Sandboxed WASM execution with security analysis
//!
//! # Quick Start
//!
//! ```rust,no_run
//! use glsp_mcp_server::{GlspBackend, GlspConfig};
//! use clap::Parser;
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let config = GlspConfig::parse();
//!     let backend = GlspBackend::initialize(config).await?;
//!     // Server setup and execution...
//!     Ok(())
//! }
//! ```

/// Backend implementation and configuration
pub mod backend;
/// Database integration and sensor data management
pub mod database;
/// Model Context Protocol implementation
pub mod mcp;
/// Diagram model types and element definitions
pub mod model;
/// Diagram operations and transformations
pub mod operations;
/// Diagram persistence and file management
pub mod persistence;
/// Element selection and interaction management
pub mod selection;
/// Diagram validation and error checking
pub mod validation;
/// WebAssembly component execution and management
pub mod wasm;

// Re-export local MCP modules for easy access
pub use mcp::{prompts, protocol, resources, tools};

// Re-export core types for external users
pub use backend::*;
pub use model::*;
pub use persistence::PersistenceManager;
pub use pulseengine_mcp_protocol::{
    CallToolRequestParam, CallToolResult, Content, Error, Implementation, ListPromptsResult,
    ListResourcesResult, ListToolsResult, PaginatedRequestParam, Prompt, ProtocolVersion,
    ReadResourceRequestParam, Request, Resource, Response, ServerCapabilities, Tool,
};
pub use tools::DiagramTools;

use pulseengine_mcp_auth::config::AuthConfig;
use pulseengine_mcp_server::{McpServer, ServerConfig};
use pulseengine_mcp_transport::TransportConfig;
use tracing::info;

/// Run the MCP server with the given configuration
/// This is useful for embedding the server in other applications like Tauri
pub async fn run_server(config: GlspConfig) -> Result<(), Box<dyn std::error::Error>> {
    info!("Initializing GLSP backend...");
    let backend = GlspBackend::initialize(config.clone()).await?;

    // Create server config with memory auth
    let server_config = ServerConfig {
        auth_config: AuthConfig::memory(),
        transport_config: match config.transport.as_str() {
            "http" => TransportConfig::http(config.port),
            "http-streaming" | "streaming" => TransportConfig::streamable_http(config.port),
            "websocket" => TransportConfig::websocket(config.port),
            "stdio" => TransportConfig::stdio(),
            _ => {
                info!(
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
