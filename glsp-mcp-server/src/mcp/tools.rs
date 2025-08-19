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

use crate::database::dataset::{DatasetManager, SensorSelector};
use crate::database::{BoxedDatasetManager, SensorQuery};
use crate::mcp::protocol::{CallToolParams, CallToolResult, TextContent, Tool};
use crate::model::{DiagramModel, Edge, ElementType, ModelElement, Node, Position};
use crate::selection::SelectionMode;
use crate::wasm::{
    ComponentGroup, ComponentGroupInfo, ConnectionType, ExternalInterface, InterfaceConnection,
    WasmComponent, WasmComponentChange, WasmFileWatcher,
};
use anyhow::Result;
use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use sha2::Digest;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::info;

/// Core MCP tools interface for diagram and WASM component operations
///
/// Provides the primary interface for AI agents to interact with diagrams and
/// WASM components through the Model Context Protocol. Manages in-memory diagram
/// models, WASM component monitoring, and optional database integration.
///
/// # Capabilities
///
/// - **Diagram Operations**: Create, modify, delete diagram elements
/// - **WASM Management**: Monitor and execute WebAssembly components
/// - **Layout Operations**: Apply automatic layout algorithms
/// - **Validation**: Check diagram consistency and validity
/// - **Export**: Generate various output formats
/// - **Database Integration**: Optional sensor data queries
///
/// # Examples
///
/// ```rust,no_run
/// use glsp_mcp_server::DiagramTools;
///
/// let tools = DiagramTools::new();
/// let available_tools = tools.get_available_tools();
/// println!("Available MCP tools: {}", available_tools.len());
/// ```
pub struct DiagramTools {
    pub(crate) models: HashMap<String, DiagramModel>,
    pub(crate) wasm_watcher: WasmFileWatcher,
    pub(crate) dataset_manager: Option<Arc<Mutex<BoxedDatasetManager>>>,
}

impl Default for DiagramTools {
    fn default() -> Self {
        Self::new()
    }
}

#[allow(dead_code)]
impl DiagramTools {
    pub fn new() -> Self {
        // Default WASM watch path - can be configured via CLI args
        let wasm_path = std::env::args()
            .find(|arg| arg.starts_with("--wasm-path="))
            .and_then(|arg| arg.strip_prefix("--wasm-path=").map(PathBuf::from))
            .or_else(|| std::env::var("WASM_WATCH_PATH").ok().map(PathBuf::from))
            .unwrap_or_else(|| PathBuf::from("../workspace/adas-wasm-components"));

        info!("WASM watch path: {wasm_path:?}");

        // Initialize with execution engine (max 3 concurrent executions)
        let wasm_watcher = WasmFileWatcher::new(wasm_path)
            .with_execution_engine(3)
            .expect("Failed to initialize WASM execution engine");

        Self {
            models: HashMap::new(),
            wasm_watcher,
            dataset_manager: None,
        }
    }

    pub fn with_dataset_manager(
        mut self,
        dataset_manager: Arc<Mutex<BoxedDatasetManager>>,
    ) -> Self {
        self.dataset_manager = Some(dataset_manager);
        self
    }

    pub fn get_available_tools(&self) -> Vec<Tool> {
        let mut tools = vec![
            Tool {
                name: "create_diagram".to_string(),
                description: Some("Create a new diagram model".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramType": {
                            "type": "string",
                            "description": "Type of diagram to create (e.g., 'workflow', 'bpmn', 'uml')"
                        },
                        "name": {
                            "type": "string",
                            "description": "Name for the new diagram"
                        }
                    },
                    "required": ["diagramType"]
                }),
            },
            Tool {
                name: "delete_diagram".to_string(),
                description: Some("Delete a diagram and its associated files".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram to delete"
                        }
                    },
                    "required": ["diagramId"]
                }),
            },
            Tool {
                name: "create_node".to_string(),
                description: Some("Create a new node in the diagram".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram to add the node to"
                        },
                        "nodeType": {
                            "type": "string",
                            "description": "Type of node (e.g., 'task', 'gateway', 'event', 'decision')"
                        },
                        "position": {
                            "type": "object",
                            "properties": {
                                "x": {"type": "number"},
                                "y": {"type": "number"}
                            },
                            "required": ["x", "y"]
                        },
                        "label": {
                            "type": "string",
                            "description": "Label text for the node"
                        },
                        "properties": {
                            "type": "object",
                            "description": "Additional properties for the node"
                        }
                    },
                    "required": ["diagramId", "nodeType", "position"]
                }),
            },
            Tool {
                name: "create_edge".to_string(),
                description: Some("Create a new edge connecting two nodes".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram to add the edge to"
                        },
                        "edgeType": {
                            "type": "string",
                            "description": "Type of edge (e.g., 'flow', 'association', 'dependency')"
                        },
                        "sourceId": {
                            "type": "string",
                            "description": "ID of the source node"
                        },
                        "targetId": {
                            "type": "string",
                            "description": "ID of the target node"
                        },
                        "label": {
                            "type": "string",
                            "description": "Label text for the edge"
                        },
                        "properties": {
                            "type": "object",
                            "description": "Additional properties for the edge"
                        }
                    },
                    "required": ["diagramId", "edgeType", "sourceId", "targetId"]
                }),
            },
            Tool {
                name: "delete_element".to_string(),
                description: Some("Delete an element from the diagram".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram"
                        },
                        "elementId": {
                            "type": "string",
                            "description": "ID of the element to delete"
                        }
                    },
                    "required": ["diagramId", "elementId"]
                }),
            },
            Tool {
                name: "update_element".to_string(),
                description: Some("Update properties of an existing element".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram"
                        },
                        "elementId": {
                            "type": "string",
                            "description": "ID of the element to update"
                        },
                        "properties": {
                            "type": "object",
                            "description": "Properties to update"
                        },
                        "position": {
                            "type": "object",
                            "properties": {
                                "x": {"type": "number"},
                                "y": {"type": "number"}
                            },
                            "description": "New position for the element"
                        }
                    },
                    "required": ["diagramId", "elementId"]
                }),
            },
            Tool {
                name: "apply_layout".to_string(),
                description: Some("Apply automatic layout to the diagram".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram"
                        },
                        "algorithm": {
                            "type": "string",
                            "enum": ["hierarchical", "force", "circular", "grid"],
                            "description": "Layout algorithm to apply"
                        },
                        "direction": {
                            "type": "string",
                            "enum": ["top-bottom", "left-right", "bottom-top", "right-left"],
                            "description": "Direction for hierarchical layout"
                        }
                    },
                    "required": ["diagramId", "algorithm"]
                }),
            },
            Tool {
                name: "export_diagram".to_string(),
                description: Some("Export diagram in various formats".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram to export"
                        },
                        "format": {
                            "type": "string",
                            "enum": ["svg", "png", "json", "dot"],
                            "description": "Export format"
                        }
                    },
                    "required": ["diagramId", "format"]
                }),
            },
            // Selection tools
            Tool {
                name: "select_elements".to_string(),
                description: Some("Select one or more elements in the diagram".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram"
                        },
                        "elementIds": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "IDs of elements to select"
                        },
                        "mode": {
                            "type": "string",
                            "enum": ["single", "multiple", "range"],
                            "description": "Selection mode",
                            "default": "single"
                        },
                        "append": {
                            "type": "boolean",
                            "description": "Whether to append to current selection",
                            "default": false
                        }
                    },
                    "required": ["diagramId", "elementIds"]
                }),
            },
            Tool {
                name: "select_all".to_string(),
                description: Some("Select all elements in the diagram".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram"
                        }
                    },
                    "required": ["diagramId"]
                }),
            },
            Tool {
                name: "clear_selection".to_string(),
                description: Some("Clear the current selection".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram"
                        }
                    },
                    "required": ["diagramId"]
                }),
            },
            Tool {
                name: "get_selection".to_string(),
                description: Some("Get the currently selected elements".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram"
                        }
                    },
                    "required": ["diagramId"]
                }),
            },
            Tool {
                name: "hover_element".to_string(),
                description: Some("Set the hover state for an element".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram"
                        },
                        "elementId": {
                            "type": "string",
                            "description": "ID of element to hover (null to clear)",
                            "nullable": true
                        }
                    },
                    "required": ["diagramId"]
                }),
            },
            Tool {
                name: "get_element_at_position".to_string(),
                description: Some("Find element at given canvas position".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram"
                        },
                        "x": {
                            "type": "number",
                            "description": "X coordinate"
                        },
                        "y": {
                            "type": "number",
                            "description": "Y coordinate"
                        },
                        "tolerance": {
                            "type": "number",
                            "description": "Hit detection tolerance in pixels",
                            "default": 5.0
                        },
                        "includeEdges": {
                            "type": "boolean",
                            "description": "Whether to include edges in hit detection",
                            "default": true
                        }
                    },
                    "required": ["diagramId", "x", "y"]
                }),
            },
            // WASM component tools
            Tool {
                name: "scan_wasm_components".to_string(),
                description: Some("Scan for WASM components in the watch directory".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {},
                    "additionalProperties": false
                }),
            },
            Tool {
                name: "check_wasm_component_status".to_string(),
                description: Some("Check the status of a specific WASM component".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "componentName": {
                            "type": "string",
                            "description": "Name of the WASM component to check"
                        }
                    },
                    "required": ["componentName"]
                }),
            },
            Tool {
                name: "remove_missing_component".to_string(),
                description: Some(
                    "Permanently remove a missing WASM component from tracking".to_string(),
                ),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "componentName": {
                            "type": "string",
                            "description": "Name of the missing component to remove"
                        }
                    },
                    "required": ["componentName"]
                }),
            },
            Tool {
                name: "load_wasm_component".to_string(),
                description: Some("Load a WASM component into a diagram".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram to load the component into"
                        },
                        "componentName": {
                            "type": "string",
                            "description": "Name of the WASM component to load"
                        },
                        "position": {
                            "type": "object",
                            "properties": {
                                "x": {"type": "number"},
                                "y": {"type": "number"}
                            },
                            "required": ["x", "y"]
                        }
                    },
                    "required": ["diagramId", "componentName", "position"]
                }),
            },
            Tool {
                name: "execute_wasm_component".to_string(),
                description: Some(
                    "Execute a method on a WASM component with sandboxing".to_string(),
                ),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "componentName": {
                            "type": "string",
                            "description": "Name of the WASM component to execute"
                        },
                        "method": {
                            "type": "string",
                            "description": "Method name to execute",
                            "default": "main"
                        },
                        "args": {
                            "type": "object",
                            "description": "Arguments to pass to the method",
                            "default": {}
                        },
                        "timeout_ms": {
                            "type": "number",
                            "description": "Execution timeout in milliseconds",
                            "default": 30000
                        },
                        "max_memory_mb": {
                            "type": "number",
                            "description": "Maximum memory limit in MB",
                            "default": 64
                        }
                    },
                    "required": ["componentName"]
                }),
            },
            Tool {
                name: "get_execution_progress".to_string(),
                description: Some("Get progress of a WASM component execution".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "executionId": {
                            "type": "string",
                            "description": "ID of the execution to check"
                        }
                    },
                    "required": ["executionId"]
                }),
            },
            Tool {
                name: "get_execution_result".to_string(),
                description: Some("Get result of a completed WASM component execution".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "executionId": {
                            "type": "string",
                            "description": "ID of the execution to get result for"
                        }
                    },
                    "required": ["executionId"]
                }),
            },
            Tool {
                name: "list_wasm_executions".to_string(),
                description: Some(
                    "List all active and recent WASM component executions".to_string(),
                ),
                input_schema: json!({
                    "type": "object",
                    "properties": {},
                    "additionalProperties": false
                }),
            },
            Tool {
                name: "cancel_execution".to_string(),
                description: Some("Cancel a running WASM component execution".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "executionId": {
                            "type": "string",
                            "description": "ID of the execution to cancel"
                        }
                    },
                    "required": ["executionId"]
                }),
            },
            // Sensor Data Tools
            Tool {
                name: "query_sensor_data".to_string(),
                description: Some("Query sensor data with time range and filters".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "sensorIds": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Sensor IDs to query (empty = all sensors)"
                        },
                        "startTime": {
                            "type": "string",
                            "format": "date-time",
                            "description": "Start time (ISO 8601 format)"
                        },
                        "endTime": {
                            "type": "string",
                            "format": "date-time",
                            "description": "End time (ISO 8601 format)"
                        },
                        "dataTypes": {
                            "type": "array",
                            "items": {"type": "string"},
                            "enum": ["Camera", "Radar", "Lidar", "IMU", "GPS", "CAN", "Ultrasonic", "Generic"],
                            "description": "Filter by sensor data types"
                        },
                        "minQuality": {
                            "type": "number",
                            "minimum": 0.0,
                            "maximum": 1.0,
                            "description": "Minimum quality threshold (0.0-1.0)"
                        },
                        "limit": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 10000,
                            "description": "Maximum number of readings to return"
                        },
                        "downsampleIntervalMs": {
                            "type": "integer",
                            "minimum": 1,
                            "description": "Downsample interval in milliseconds"
                        }
                    },
                    "required": ["startTime", "endTime"]
                }),
            },
            Tool {
                name: "list_sensors".to_string(),
                description: Some("List all available sensors in the database".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {},
                    "additionalProperties": false
                }),
            },
            Tool {
                name: "get_sensor_metadata".to_string(),
                description: Some("Get metadata for a specific sensor".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "sensorId": {
                            "type": "string",
                            "description": "Sensor ID to get metadata for"
                        }
                    },
                    "required": ["sensorId"]
                }),
            },
            Tool {
                name: "get_sensor_statistics".to_string(),
                description: Some(
                    "Get statistics for a sensor including time range and quality metrics"
                        .to_string(),
                ),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "sensorId": {
                            "type": "string",
                            "description": "Sensor ID to get statistics for"
                        }
                    },
                    "required": ["sensorId"]
                }),
            },
            Tool {
                name: "get_sensor_time_range".to_string(),
                description: Some("Get the time range of available data for a sensor".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "sensorId": {
                            "type": "string",
                            "description": "Sensor ID to get time range for (empty for global range)"
                        }
                    }
                }),
            },
            Tool {
                name: "list_sensor_datasets".to_string(),
                description: Some("List available sensor datasets".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "includeMetadata": {
                            "type": "boolean",
                            "description": "Include dataset metadata in response",
                            "default": true
                        }
                    }
                }),
            },
            Tool {
                name: "get_dataset_info".to_string(),
                description: Some("Get detailed information about a sensor dataset".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "datasetId": {
                            "type": "string",
                            "description": "Dataset ID to get information for"
                        }
                    },
                    "required": ["datasetId"]
                }),
            },
            Tool {
                name: "set_active_dataset".to_string(),
                description: Some("Set the active sensor dataset for queries".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "datasetId": {
                            "type": "string",
                            "description": "Dataset ID to activate"
                        }
                    },
                    "required": ["datasetId"]
                }),
            },
            Tool {
                name: "visualize_sensor_data".to_string(),
                description: Some("Generate visualization of sensor data over time".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "sensorId": {
                            "type": "string",
                            "description": "Sensor ID to visualize"
                        },
                        "startTime": {
                            "type": "string",
                            "format": "date-time",
                            "description": "Start time (ISO 8601 format)"
                        },
                        "endTime": {
                            "type": "string",
                            "format": "date-time",
                            "description": "End time (ISO 8601 format)"
                        },
                        "visualizationType": {
                            "type": "string",
                            "enum": ["timeline", "quality", "frequency", "gaps"],
                            "description": "Type of visualization to generate",
                            "default": "timeline"
                        },
                        "width": {
                            "type": "integer",
                            "minimum": 100,
                            "maximum": 2000,
                            "description": "Width of visualization in pixels",
                            "default": 800
                        },
                        "height": {
                            "type": "integer",
                            "minimum": 100,
                            "maximum": 1000,
                            "description": "Height of visualization in pixels",
                            "default": 400
                        }
                    },
                    "required": ["sensorId", "startTime", "endTime"]
                }),
            },
            Tool {
                name: "detect_sensor_gaps".to_string(),
                description: Some("Detect gaps in sensor data".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "sensorId": {
                            "type": "string",
                            "description": "Sensor ID to analyze"
                        },
                        "startTime": {
                            "type": "string",
                            "format": "date-time",
                            "description": "Start time (ISO 8601 format)"
                        },
                        "endTime": {
                            "type": "string",
                            "format": "date-time",
                            "description": "End time (ISO 8601 format)"
                        },
                        "maxGapMs": {
                            "type": "integer",
                            "minimum": 1,
                            "description": "Maximum gap size in milliseconds to report",
                            "default": 1000
                        }
                    },
                    "required": ["sensorId", "startTime", "endTime"]
                }),
            },
            // Component upload tools
            Tool {
                name: "upload_wasm_component".to_string(),
                description: Some("Upload a WASM component file to the server".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "componentName": {
                            "type": "string",
                            "description": "Name for the component"
                        },
                        "wasmBase64": {
                            "type": "string",
                            "description": "Base64 encoded WASM file content"
                        },
                        "description": {
                            "type": "string",
                            "description": "Optional description of the component"
                        },
                        "version": {
                            "type": "string",
                            "description": "Component version",
                            "default": "1.0.0"
                        }
                    },
                    "required": ["componentName", "wasmBase64"]
                }),
            },
            Tool {
                name: "validate_wasm_component".to_string(),
                description: Some("Validate a WASM component before upload".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "wasmBase64": {
                            "type": "string",
                            "description": "Base64 encoded WASM file content to validate"
                        }
                    },
                    "required": ["wasmBase64"]
                }),
            },
            Tool {
                name: "list_uploaded_components".to_string(),
                description: Some("List all uploaded WASM components".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "includeMetadata": {
                            "type": "boolean",
                            "description": "Include component metadata in response",
                            "default": true
                        }
                    }
                }),
            },
            Tool {
                name: "delete_uploaded_component".to_string(),
                description: Some("Delete an uploaded WASM component".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "componentName": {
                            "type": "string",
                            "description": "Name of the component to delete"
                        }
                    },
                    "required": ["componentName"]
                }),
            },
            // Component Group Management Tools
            Tool {
                name: "create_component_group".to_string(),
                description: Some(
                    "Create a new component group from selected WASM components".to_string(),
                ),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram to add the component group to"
                        },
                        "name": {
                            "type": "string",
                            "description": "Name for the component group"
                        },
                        "description": {
                            "type": "string",
                            "description": "Description of the component group"
                        },
                        "componentIds": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of component IDs to include in the group"
                        }
                    },
                    "required": ["diagramId", "name", "componentIds"]
                }),
            },
            Tool {
                name: "update_component_group".to_string(),
                description: Some(
                    "Update a component group with new connections or components".to_string(),
                ),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram containing the component group"
                        },
                        "groupId": {
                            "type": "string",
                            "description": "ID of the component group to update"
                        },
                        "name": {
                            "type": "string",
                            "description": "New name for the component group"
                        },
                        "description": {
                            "type": "string",
                            "description": "New description for the component group"
                        },
                        "componentIds": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Updated list of component IDs"
                        },
                        "internalConnections": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "sourceComponent": {"type": "string"},
                                    "sourceInterface": {"type": "string"},
                                    "targetComponent": {"type": "string"},
                                    "targetInterface": {"type": "string"},
                                    "connectionType": {"type": "string"}
                                }
                            },
                            "description": "Internal connections between components"
                        },
                        "externalInterfaces": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string"},
                                    "interfaceType": {"type": "string"},
                                    "sourceComponent": {"type": "string"},
                                    "sourceInterface": {"type": "string"}
                                }
                            },
                            "description": "External interfaces exposed by the group"
                        }
                    },
                    "required": ["diagramId", "groupId"]
                }),
            },
            Tool {
                name: "get_component_group_interfaces".to_string(),
                description: Some(
                    "Get external interfaces available for a component group".to_string(),
                ),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram containing the component group"
                        },
                        "groupId": {
                            "type": "string",
                            "description": "ID of the component group"
                        }
                    },
                    "required": ["diagramId", "groupId"]
                }),
            },
            Tool {
                name: "delete_component_group".to_string(),
                description: Some("Delete a component group".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram containing the component group"
                        },
                        "groupId": {
                            "type": "string",
                            "description": "ID of the component group to delete"
                        }
                    },
                    "required": ["diagramId", "groupId"]
                }),
            },
            Tool {
                name: "generate_bazel_composition".to_string(),
                description: Some(
                    "Generate Bazel configuration for component group composition".to_string(),
                ),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram containing the component group"
                        },
                        "groupId": {
                            "type": "string",
                            "description": "ID of the component group"
                        },
                        "format": {
                            "type": "string",
                            "enum": ["bazel", "wac", "both"],
                            "default": "both",
                            "description": "Format of the generated configuration"
                        }
                    },
                    "required": ["diagramId", "groupId"]
                }),
            },
            Tool {
                name: "validate_component_group".to_string(),
                description: Some(
                    "Validate a component group for interface compatibility".to_string(),
                ),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram containing the component group"
                        },
                        "groupId": {
                            "type": "string",
                            "description": "ID of the component group to validate"
                        }
                    },
                    "required": ["diagramId", "groupId"]
                }),
            },
            Tool {
                name: "list_component_groups".to_string(),
                description: Some("List all component groups in a diagram".to_string()),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram to list component groups from"
                        }
                    },
                    "required": ["diagramId"]
                }),
            },
            Tool {
                name: "deploy_component_group".to_string(),
                description: Some(
                    "Deploy component group to workspace with BUILD.bazel and WAC files"
                        .to_string(),
                ),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "diagramId": {
                            "type": "string",
                            "description": "ID of the diagram containing the component group"
                        },
                        "groupId": {
                            "type": "string",
                            "description": "ID of the component group to deploy"
                        },
                        "workspacePath": {
                            "type": "string",
                            "description": "Path to the workspace directory"
                        },
                        "config": {
                            "type": "object",
                            "properties": {
                                "profile": {
                                    "type": "string",
                                    "default": "release",
                                    "description": "Build profile (debug, release, production)"
                                },
                                "targetName": {
                                    "type": "string",
                                    "description": "Target name for the composition"
                                },
                                "packageName": {
                                    "type": "string",
                                    "description": "Package name for the composition"
                                },
                                "generateWacFile": {
                                    "type": "boolean",
                                    "default": true,
                                    "description": "Generate WAC configuration file"
                                },
                                "generateBuildFile": {
                                    "type": "boolean",
                                    "default": true,
                                    "description": "Generate BUILD.bazel file"
                                },
                                "optimizations": {
                                    "type": "object",
                                    "properties": {
                                        "enableOptimizations": {
                                            "type": "boolean",
                                            "default": true,
                                            "description": "Enable build optimizations"
                                        },
                                        "stripDebugInfo": {
                                            "type": "boolean",
                                            "default": false,
                                            "description": "Strip debug information"
                                        },
                                        "useSymlinks": {
                                            "type": "boolean",
                                            "default": false,
                                            "description": "Use symlinks for dependencies"
                                        }
                                    }
                                },
                                "validation": {
                                    "type": "object",
                                    "properties": {
                                        "validateComponents": {
                                            "type": "boolean",
                                            "default": true,
                                            "description": "Validate components during build"
                                        },
                                        "validateConnections": {
                                            "type": "boolean",
                                            "default": true,
                                            "description": "Validate interface connections"
                                        },
                                        "lintWit": {
                                            "type": "boolean",
                                            "default": true,
                                            "description": "Lint WIT interfaces"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "required": ["diagramId", "groupId", "workspacePath"]
                }),
            },
        ];

        // Filter out tools that have been converted to resources
        let converted_to_resources = [
            "get_selection",
            "get_element_at_position",
            "check_wasm_component_status",
            "get_execution_progress",
            "get_execution_result",
            "list_wasm_executions",
            "list_uploaded_components",
            "query_sensor_data",
            "list_sensors",
            "get_sensor_metadata",
            "get_sensor_statistics",
            "get_sensor_time_range",
            "list_sensor_datasets",
            "get_dataset_info",
            "visualize_sensor_data",
            "detect_sensor_gaps",
        ];

        // Add graphics rendering tools
        tools.push(Tool {
            name: "render_wasm_graphics".to_string(),
            description: Some("Render graphics output from a WASM component".to_string()),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "componentId": {
                        "type": "string",
                        "description": "ID of the WASM component to render graphics from"
                    },
                    "method": {
                        "type": "string",
                        "description": "Method name to call for rendering (default: 'render')",
                        "default": "render"
                    },
                    "width": {
                        "type": "number",
                        "description": "Canvas width in pixels",
                        "minimum": 1,
                        "maximum": 1920
                    },
                    "height": {
                        "type": "number",
                        "description": "Canvas height in pixels",
                        "minimum": 1,
                        "maximum": 1080
                    },
                    "inputData": {
                        "type": "object",
                        "description": "Input data to pass to the graphics component"
                    },
                    "outputFormat": {
                        "type": "string",
                        "enum": ["svg", "png", "canvas_commands"],
                        "default": "svg",
                        "description": "Desired output format"
                    }
                },
                "required": ["componentId", "width", "height"]
            }),
        });

        tools.push(Tool {
            name: "stream_wasm_graphics".to_string(),
            description: Some(
                "Stream real-time graphics updates from a WASM component".to_string(),
            ),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "componentId": {
                        "type": "string",
                        "description": "ID of the WASM component to stream graphics from"
                    },
                    "updateIntervalMs": {
                        "type": "number",
                        "description": "Update interval in milliseconds",
                        "minimum": 16,
                        "maximum": 1000,
                        "default": 33
                    },
                    "width": {
                        "type": "number",
                        "description": "Canvas width in pixels",
                        "minimum": 1,
                        "maximum": 1920
                    },
                    "height": {
                        "type": "number",
                        "description": "Canvas height in pixels",
                        "minimum": 1,
                        "maximum": 1080
                    }
                },
                "required": ["componentId", "width", "height"]
            }),
        });

        tools.retain(|tool| !converted_to_resources.contains(&tool.name.as_str()));
        tools
    }

    pub async fn call_tool(&mut self, params: CallToolParams) -> Result<CallToolResult> {
        match params.name.as_str() {
            "create_diagram" => self.create_diagram(params.arguments).await,
            "create_node" => self.create_node(params.arguments).await,
            "create_edge" => self.create_edge(params.arguments).await,
            "delete_element" => self.delete_element(params.arguments).await,
            "update_element" => self.update_element(params.arguments).await,
            "apply_layout" => self.apply_layout(params.arguments).await,
            "export_diagram" => self.export_diagram(params.arguments).await,
            // Selection tools
            "select_elements" => self.select_elements(params.arguments).await,
            "select_all" => self.select_all(params.arguments).await,
            "clear_selection" => self.clear_selection(params.arguments).await,
            // "get_selection" => self.get_selection(params.arguments).await, // Converted to resource
            "hover_element" => self.hover_element(params.arguments).await,
            // "get_element_at_position" => self.get_element_at_position(params.arguments).await, // Converted to resource
            // WASM component tools
            "scan_wasm_components" => self.scan_wasm_components().await,
            // "check_wasm_component_status" => {
            //     self.check_wasm_component_status(params.arguments).await
            // } // Converted to resource
            "remove_missing_component" => self.remove_missing_component(params.arguments).await,
            "load_wasm_component" => self.load_wasm_component(params.arguments).await,
            // WASM execution tools
            "execute_wasm_component" => self.execute_wasm_component(params.arguments).await,
            // "get_execution_progress" => self.get_execution_progress(params.arguments).await, // Converted to resource
            // "get_execution_result" => self.get_execution_result(params.arguments).await, // Converted to resource
            // "list_wasm_executions" => self.list_wasm_executions().await, // Converted to resource
            "cancel_execution" => self.cancel_execution(params.arguments).await,
            // Sensor data tools
            // "query_sensor_data" => self.query_sensor_data(params.arguments).await, // Converted to resource
            // "list_sensors" => self.list_sensors().await, // Converted to resource
            // "get_sensor_metadata" => self.get_sensor_metadata(params.arguments).await, // Converted to resource
            // "get_sensor_statistics" => self.get_sensor_statistics(params.arguments).await, // Converted to resource
            // "get_sensor_time_range" => self.get_sensor_time_range(params.arguments).await, // Converted to resource
            // "list_sensor_datasets" => self.list_sensor_datasets(params.arguments).await, // Converted to resource
            // "get_dataset_info" => self.get_dataset_info(params.arguments).await, // Converted to resource
            "set_active_dataset" => self.set_active_dataset(params.arguments).await, // This modifies state, keep as tool
            // "visualize_sensor_data" => self.visualize_sensor_data(params.arguments).await, // Converted to resource
            // "detect_sensor_gaps" => self.detect_sensor_gaps(params.arguments).await, // Converted to resource
            // Component upload tools
            "upload_wasm_component" => self.upload_wasm_component(params.arguments).await,
            "validate_wasm_component" => self.validate_wasm_component(params.arguments).await,
            // "list_uploaded_components" => self.list_uploaded_components(params.arguments).await, // Converted to resource
            "delete_uploaded_component" => self.delete_uploaded_component(params.arguments).await,
            // Component group tools
            "create_component_group" => self.create_component_group(params.arguments).await,
            "update_component_group" => self.update_component_group(params.arguments).await,
            "get_component_group_interfaces" => {
                self.get_component_group_interfaces(params.arguments).await
            }
            "delete_component_group" => self.delete_component_group(params.arguments).await,
            "generate_bazel_composition" => self.generate_bazel_composition(params.arguments).await,
            "validate_component_group" => self.validate_component_group(params.arguments).await,
            "list_component_groups" => self.list_component_groups(params.arguments).await,
            "deploy_component_group" => self.deploy_component_group(params.arguments).await,
            // Graphics rendering tools
            "render_wasm_graphics" => self.render_wasm_graphics(params.arguments).await,
            "stream_wasm_graphics" => self.stream_wasm_graphics(params.arguments).await,
            _ => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Unknown tool: {}", params.name),
                }],
                is_error: Some(true),
            }),
        }
    }

    async fn create_diagram(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let diagram_type = args["diagramType"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing diagramType"))?;

        let diagram = DiagramModel::new(diagram_type);
        let diagram_id = diagram.id.clone();
        self.models.insert(diagram_id.clone(), diagram);

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: format!("Created diagram '{diagram_type}' with ID: {diagram_id}"),
            }],
            is_error: None,
        })
    }

    async fn create_node(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing diagramId"))?;
        let node_type = args["nodeType"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing nodeType"))?;

        let position = Position {
            x: args["position"]["x"]
                .as_f64()
                .ok_or_else(|| anyhow::anyhow!("Missing position.x"))?,
            y: args["position"]["y"]
                .as_f64()
                .ok_or_else(|| anyhow::anyhow!("Missing position.y"))?,
        };

        let label = args["label"].as_str().map(|s| s.to_string());

        let diagram = self
            .models
            .get_mut(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        let node = Node::new(node_type, position, label);
        let node_id = node.base.id.clone();

        diagram.add_element(node.base);
        diagram.add_child_to_root(&node_id);

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: format!("Created {node_type} node with ID: {node_id}"),
            }],
            is_error: None,
        })
    }

    async fn create_edge(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing diagramId"))?;
        let edge_type = args["edgeType"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing edgeType"))?;
        let source_id = args["sourceId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing sourceId"))?;
        let target_id = args["targetId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing targetId"))?;

        let label = args["label"].as_str().map(|s| s.to_string());

        let diagram = self
            .models
            .get_mut(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        // Verify source and target exist
        if !diagram.elements.contains_key(source_id) {
            return Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Source element {source_id} not found"),
                }],
                is_error: Some(true),
            });
        }

        if !diagram.elements.contains_key(target_id) {
            return Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Target element {target_id} not found"),
                }],
                is_error: Some(true),
            });
        }

        let edge = Edge::new(
            edge_type,
            source_id.to_string(),
            target_id.to_string(),
            label,
        );
        let edge_id = edge.base.id.clone();

        // Convert Edge to ModelElement with sourceId and targetId in properties
        let mut edge_element = edge.base;
        edge_element.properties.insert(
            "sourceId".to_string(),
            serde_json::Value::String(source_id.to_string()),
        );
        edge_element.properties.insert(
            "targetId".to_string(),
            serde_json::Value::String(target_id.to_string()),
        );

        diagram.add_element(edge_element);
        diagram.add_child_to_root(&edge_id);

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: format!("Created {edge_type} edge with ID: {edge_id}"),
            }],
            is_error: None,
        })
    }

    async fn delete_element(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing diagramId"))?;
        let element_id = args["elementId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing elementId"))?;

        let diagram = self
            .models
            .get_mut(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        match diagram.remove_element(element_id) {
            Some(_) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Deleted element with ID: {element_id}"),
                }],
                is_error: None,
            }),
            None => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Element {element_id} not found"),
                }],
                is_error: Some(true),
            }),
        }
    }

    async fn update_element(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing diagramId"))?;
        let element_id = args["elementId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing elementId"))?;

        let diagram = self
            .models
            .get_mut(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        let element = diagram
            .get_element_mut(element_id)
            .ok_or_else(|| anyhow::anyhow!("Element not found"))?;

        if let Some(properties) = args["properties"].as_object() {
            for (key, value) in properties {
                element.properties.insert(key.clone(), value.clone());
            }
        }

        if let Some(position) = args["position"].as_object() {
            if let (Some(x), Some(y)) = (position["x"].as_f64(), position["y"].as_f64()) {
                if let Some(bounds) = &mut element.bounds {
                    bounds.x = x;
                    bounds.y = y;
                }
            }
        }

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: format!("Updated element with ID: {element_id}"),
            }],
            is_error: None,
        })
    }

    async fn apply_layout(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing diagramId"))?;
        let algorithm = args["algorithm"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing algorithm"))?;

        let diagram = self
            .models
            .get_mut(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        // Simple layout implementation - in practice, this would use a proper layout engine
        match algorithm {
            "grid" => Self::apply_grid_layout(diagram),
            "hierarchical" => Self::apply_hierarchical_layout(diagram),
            _ => {
                return Ok(CallToolResult {
                    content: vec![TextContent {
                        content_type: "text".to_string(),
                        text: format!("Layout algorithm '{algorithm}' not implemented yet"),
                    }],
                    is_error: Some(true),
                });
            }
        }

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: format!("Applied {algorithm} layout to diagram {diagram_id}"),
            }],
            is_error: None,
        })
    }

    async fn export_diagram(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing diagramId"))?;
        let format = args["format"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing format"))?;

        let diagram = self
            .models
            .get(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        match format {
            "json" => {
                let json_str = serde_json::to_string_pretty(diagram)?;
                Ok(CallToolResult {
                    content: vec![TextContent {
                        content_type: "text".to_string(),
                        text: format!("Exported diagram as JSON:\n{json_str}"),
                    }],
                    is_error: None,
                })
            }
            "svg" => {
                let svg = self.generate_svg(diagram);
                Ok(CallToolResult {
                    content: vec![TextContent {
                        content_type: "text".to_string(),
                        text: format!("Exported diagram as SVG:\n{svg}"),
                    }],
                    is_error: None,
                })
            }
            _ => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Export format '{format}' not supported yet"),
                }],
                is_error: Some(true),
            }),
        }
    }

    fn apply_grid_layout(diagram: &mut DiagramModel) {
        let mut x = 50.0;
        let mut y = 50.0;
        let spacing_x = 150.0;
        let _spacing_y = 100.0;
        let cols = 4;
        let mut col = 0;

        for (_, element) in diagram.elements.iter_mut() {
            if element.element_type != ElementType::Graph && element.bounds.is_some() {
                if let Some(bounds) = &mut element.bounds {
                    bounds.x = x;
                    bounds.y = y;
                }

                col += 1;
                if col >= cols {
                    col = 0;
                    x = 50.0;
                    y += 100.0;
                } else {
                    x += spacing_x;
                }
            }
        }
        diagram.revision += 1;
    }

    fn apply_hierarchical_layout(diagram: &mut DiagramModel) {
        // Simple top-down hierarchical layout
        let y = 50.0;
        let mut x = 50.0;
        let spacing_x = 150.0;

        for (_, element) in diagram.elements.iter_mut() {
            if element.element_type != ElementType::Graph && element.bounds.is_some() {
                if let Some(bounds) = &mut element.bounds {
                    bounds.x = x;
                    bounds.y = y;
                }
                x += spacing_x;
            }
        }
        diagram.revision += 1;
    }

    fn generate_svg(&self, diagram: &DiagramModel) -> String {
        let mut svg =
            String::from(r#"<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">"#);

        // Add elements
        for element in diagram.elements.values() {
            if element.element_type != ElementType::Graph {
                if let Some(bounds) = &element.bounds {
                    if element.element_type.is_node_like() {
                        svg.push_str(&format!(
                            r#"<rect x="{}" y="{}" width="{}" height="{}" fill="lightblue" stroke="black" stroke-width="1"/>"#,
                            bounds.x, bounds.y, bounds.width, bounds.height
                        ));

                        if let Some(label) = element.properties.get("label") {
                            if let Some(label_text) = label.as_str() {
                                svg.push_str(&format!(
                                    r#"<text x="{}" y="{}" text-anchor="middle" dominant-baseline="middle">{}</text>"#,
                                    bounds.x + bounds.width / 2.0,
                                    bounds.y + bounds.height / 2.0,
                                    label_text
                                ));
                            }
                        }
                    }
                }
            }
        }

        svg.push_str("</svg>");
        svg
    }

    pub fn get_diagram(&self, diagram_id: &str) -> Option<&DiagramModel> {
        self.models.get(diagram_id)
    }

    pub fn list_diagrams(&self) -> Vec<&DiagramModel> {
        self.models.values().collect()
    }

    pub fn get_diagrams_path(&self) -> &std::path::Path {
        std::path::Path::new("./diagrams") // Default path
    }

    // Selection tool implementations
    async fn select_elements(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing diagramId"))?;
        let element_ids = args["elementIds"]
            .as_array()
            .ok_or_else(|| anyhow::anyhow!("Missing elementIds"))?;
        let mode = args["mode"].as_str().unwrap_or("single");
        let append = args["append"].as_bool().unwrap_or(false);

        let diagram = self
            .models
            .get_mut(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        if let Some(selection) = &mut diagram.selection {
            let ids: Vec<String> = element_ids
                .iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.to_string())
                .collect();

            let mode = match mode {
                "multiple" => SelectionMode::Multiple,
                "range" => SelectionMode::Range,
                _ => SelectionMode::Single,
            };

            if ids.len() == 1 && !append {
                selection.select_element(ids[0].clone(), mode);
            } else {
                selection.select_multiple(ids, append);
            }

            let selected_count = selection.get_selected_count();
            let selected_ids = selection.get_selected_ids();

            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Selected {selected_count} element(s): {selected_ids:?}"),
                }],
                is_error: None,
            })
        } else {
            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: "Selection state not initialized".to_string(),
                }],
                is_error: Some(true),
            })
        }
    }

    async fn select_all(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing diagramId"))?;

        let diagram = self
            .models
            .get_mut(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        let all_ids = diagram.get_all_element_ids();
        let count = all_ids.len();

        if let Some(selection) = &mut diagram.selection {
            selection.select_all(all_ids);

            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Selected all {count} elements"),
                }],
                is_error: None,
            })
        } else {
            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: "Selection state not initialized".to_string(),
                }],
                is_error: Some(true),
            })
        }
    }

    async fn clear_selection(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing diagramId"))?;

        let diagram = self
            .models
            .get_mut(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        if let Some(selection) = &mut diagram.selection {
            selection.clear_selection();

            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: "Selection cleared".to_string(),
                }],
                is_error: None,
            })
        } else {
            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: "Selection state not initialized".to_string(),
                }],
                is_error: Some(true),
            })
        }
    }

    async fn get_selection(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing diagramId"))?;

        let diagram = self
            .models
            .get(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        if let Some(selection) = &diagram.selection {
            let selected_ids = selection.get_selected_ids();
            let response = json!({
                "selectedElements": selected_ids,
                "count": selected_ids.len(),
                "hoveredElement": selection.hovered_element,
                "lastSelected": selection.last_selected,
                "selectionMode": selection.selection_mode
            });

            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: serde_json::to_string_pretty(&response)?,
                }],
                is_error: None,
            })
        } else {
            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: "Selection state not initialized".to_string(),
                }],
                is_error: Some(true),
            })
        }
    }

    async fn hover_element(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing diagramId"))?;
        let element_id = args["elementId"].as_str().map(|s| s.to_string());

        let diagram = self
            .models
            .get_mut(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        if let Some(selection) = &mut diagram.selection {
            selection.set_hover(element_id.clone());

            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: match element_id {
                        Some(id) => format!("Hovering element: {id}"),
                        None => "Hover cleared".to_string(),
                    },
                }],
                is_error: None,
            })
        } else {
            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: "Selection state not initialized".to_string(),
                }],
                is_error: Some(true),
            })
        }
    }

    async fn get_element_at_position(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing diagramId"))?;
        let x = args["x"]
            .as_f64()
            .ok_or_else(|| anyhow::anyhow!("Missing x coordinate"))?;
        let y = args["y"]
            .as_f64()
            .ok_or_else(|| anyhow::anyhow!("Missing y coordinate"))?;
        let tolerance = args["tolerance"].as_f64().unwrap_or(5.0);

        let diagram = self
            .models
            .get(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        match diagram.get_element_at_position(x, y, tolerance) {
            Some(element_id) => {
                let element = diagram.get_element(&element_id);
                let response = json!({
                    "found": true,
                    "elementId": element_id,
                    "elementType": element.map(|e| &e.element_type),
                    "position": { "x": x, "y": y }
                });

                Ok(CallToolResult {
                    content: vec![TextContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&response)?,
                    }],
                    is_error: None,
                })
            }
            None => {
                let response = json!({
                    "found": false,
                    "position": { "x": x, "y": y }
                });

                Ok(CallToolResult {
                    content: vec![TextContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&response)?,
                    }],
                    is_error: None,
                })
            }
        }
    }

    // WASM component methods
    pub fn get_wasm_components(&self) -> Vec<&WasmComponent> {
        self.wasm_watcher.get_components()
    }

    pub async fn get_recent_wasm_changes(&self) -> Vec<WasmComponentChange> {
        self.wasm_watcher.get_recent_changes().await
    }

    pub fn get_wasm_component(&self, name: &str) -> Option<&WasmComponent> {
        self.wasm_watcher.get_component(name)
    }

    pub fn get_wasm_watch_path(&self) -> String {
        self.wasm_watcher
            .get_watch_path()
            .to_string_lossy()
            .to_string()
    }

    pub fn get_last_wasm_scan_time(&self) -> DateTime<Utc> {
        self.wasm_watcher.get_last_scan_time()
    }

    pub async fn scan_wasm_components_internal(&mut self) -> Result<()> {
        self.wasm_watcher.scan_components().await
    }

    pub fn remove_missing_wasm_component(&mut self, name: &str) -> bool {
        self.wasm_watcher.remove_missing_component(name)
    }

    // Selection helper methods for resources
    pub fn get_selected_elements(&self, diagram_id: &str) -> Vec<String> {
        self.models
            .get(diagram_id)
            .and_then(|model| model.selection.as_ref())
            .map(|selection| selection.selected_elements.iter().cloned().collect())
            .unwrap_or_default()
    }

    pub fn get_hovered_element(&self, diagram_id: &str) -> Option<String> {
        self.models
            .get(diagram_id)
            .and_then(|model| model.selection.as_ref())
            .and_then(|selection| selection.hovered_element.clone())
    }

    pub fn find_element_at_position(&self, diagram_id: &str, position: Position) -> Option<String> {
        let diagram = self.models.get(diagram_id)?;

        // Search elements in reverse z-order (highest z-index first)
        let mut elements_with_z: Vec<(&String, &ModelElement, i32)> = diagram
            .elements
            .iter()
            .filter(|(_, element)| element.visible)
            .map(|(id, element)| (id, element, element.z_index.unwrap_or(0)))
            .collect();

        elements_with_z.sort_by(|a, b| b.2.cmp(&a.2));

        for (id, element, _) in elements_with_z {
            if let Some(bounds) = &element.bounds {
                if position.x >= bounds.x
                    && position.x <= bounds.x + bounds.width
                    && position.y >= bounds.y
                    && position.y <= bounds.y + bounds.height
                {
                    return Some(id.clone());
                }
            }
        }

        None
    }

    // WASM execution helper methods for resources
    pub fn list_wasm_executions_for_resource(&self) -> Vec<serde_json::Value> {
        self.wasm_watcher
            .list_executions()
            .into_iter()
            .map(|exec| {
                json!({
                    "executionId": exec.execution_id,
                    "success": exec.success,
                    "result": exec.result,
                    "error": exec.error,
                    "executionTimeMs": exec.execution_time_ms,
                    "memoryUsageMb": exec.memory_usage_mb,
                    "completedAt": exec.completed_at,
                    "graphicsOutput": exec.graphics_output,
                    "outputData": exec.output_data.map(|d| {
                        use base64::prelude::*;
                        BASE64_STANDARD.encode(&d)
                    })
                })
            })
            .collect()
    }

    pub fn list_uploaded_components_for_resource(&self) -> Vec<serde_json::Value> {
        // TODO: Implement proper uploaded components tracking
        // For now, return components that were dynamically added
        vec![]
    }

    pub fn get_execution_progress_for_resource(
        &self,
        execution_id: &str,
    ) -> Option<serde_json::Value> {
        self.wasm_watcher
            .get_execution_progress(execution_id)
            .map(|progress| {
                json!({
                    "executionId": execution_id,
                    "progress": progress.progress,
                    "message": progress.message,
                    "stage": progress.stage,
                    "timestamp": progress.timestamp
                })
            })
    }

    pub fn get_execution_result_for_resource(
        &self,
        execution_id: &str,
    ) -> Option<serde_json::Value> {
        self.wasm_watcher
            .get_execution_result(execution_id)
            .map(|result| {
                json!({
                    "executionId": result.execution_id,
                    "success": result.success,
                    "result": result.result,
                    "error": result.error,
                    "executionTimeMs": result.execution_time_ms,
                    "memoryUsageMb": result.memory_usage_mb,
                    "completedAt": result.completed_at,
                    "graphicsOutput": result.graphics_output,
                    "outputData": result.output_data.map(|d| {
                        use base64::prelude::*;
                        BASE64_STANDARD.encode(&d)
                    })
                })
            })
    }

    // WASM tool handlers
    async fn scan_wasm_components(&mut self) -> Result<CallToolResult> {
        match self.wasm_watcher.scan_components().await {
            Ok(()) => {
                let components = self.wasm_watcher.get_components();
                let available = components.iter().filter(|c| c.file_exists).count();
                let missing = components.len() - available;

                // Convert components to JSON format expected by the client
                let components_json: Vec<_> = components
                    .iter()
                    .map(|c| {
                        json!({
                            "name": c.name,
                            "path": c.path,
                            "fileExists": c.file_exists,
                            "lastSeen": c.last_seen.map(|dt| dt.to_rfc3339()),
                            "metadata": c.metadata,
                            "interfaces": c.interfaces
                        })
                    })
                    .collect();

                let result = json!({
                    "components": components_json,
                    "summary": {
                        "total": components.len(),
                        "available": available,
                        "missing": missing
                    }
                });

                Ok(CallToolResult {
                    content: vec![TextContent {
                        content_type: "application/json".to_string(),
                        text: result.to_string(),
                    }],
                    is_error: None,
                })
            }
            Err(err) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Failed to scan WASM components: {err}"),
                }],
                is_error: Some(true),
            }),
        }
    }

    async fn check_wasm_component_status(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let component_name = args["componentName"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing componentName"))?;

        match self.wasm_watcher.get_component(component_name) {
            Some(component) => {
                let status = json!({
                    "name": component.name,
                    "path": component.path,
                    "fileExists": component.file_exists,
                    "status": if component.file_exists { "available" } else { "missing" },
                    "lastSeen": component.last_seen,
                    "removedAt": component.removed_at,
                    "interfaces": component.interfaces.len(),
                    "description": component.description
                });

                Ok(CallToolResult {
                    content: vec![TextContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&status)?,
                    }],
                    is_error: None,
                })
            }
            None => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("WASM component '{component_name}' not found"),
                }],
                is_error: Some(true),
            }),
        }
    }

    async fn remove_missing_component(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let component_name = args["componentName"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing componentName"))?;

        if self.wasm_watcher.remove_missing_component(component_name) {
            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Successfully removed missing component: {component_name}"),
                }],
                is_error: None,
            })
        } else {
            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Component '{component_name}' not found or not missing"),
                }],
                is_error: Some(true),
            })
        }
    }

    async fn load_wasm_component(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let diagram_id = args["diagramId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing diagramId"))?;
        let component_name = args["componentName"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing componentName"))?;

        let position = Position {
            x: args["position"]["x"].as_f64().unwrap_or(100.0),
            y: args["position"]["y"].as_f64().unwrap_or(100.0),
        };

        // Check if component exists and is available
        let component = self
            .wasm_watcher
            .get_component(component_name)
            .ok_or_else(|| anyhow::anyhow!("WASM component '{}' not found", component_name))?;

        if !component.file_exists {
            return Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!(
                        "Cannot load component '{component_name}': file is missing at {}",
                        component.path
                    ),
                }],
                is_error: Some(true),
            });
        }

        // Get the diagram
        let diagram = self
            .models
            .get_mut(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram '{}' not found", diagram_id))?;

        // Create a WASM component node with appropriate size for metadata and interfaces
        let pos_x = position.x;
        let pos_y = position.y;
        let mut node = Node::new("wasm-component", position, Some(component.name.clone()));

        // Calculate dynamic size based on content
        let interface_count = component.interfaces.len() as f64;
        let description_lines = component.description.len() as f64 / 50.0; // Rough estimate

        // Base size + space for interfaces + metadata
        let width = 220.0_f64.max(component.name.len() as f64 * 8.0); // Minimum width based on name
        let height = 120.0_f64.max(80.0 + (interface_count * 25.0) + (description_lines * 15.0));

        // Update the bounds and size for proper rendering
        node.base.bounds = Some(crate::model::Bounds {
            x: pos_x,
            y: pos_y,
            width,
            height,
        });
        node.size = Some(crate::model::Size { width, height });

        // Add component-specific properties
        node.base
            .properties
            .insert("componentName".to_string(), json!(component.name));
        node.base
            .properties
            .insert("componentPath".to_string(), json!(component.path));
        node.base
            .properties
            .insert("description".to_string(), json!(component.description));
        node.base
            .properties
            .insert("interfaces".to_string(), json!(component.interfaces));

        let node_id = node.base.id.clone();
        diagram.add_element(node.base);
        diagram.add_child_to_root(&node_id);

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: format!(
                    "Loaded WASM component '{component_name}' into diagram with ID: {node_id}"
                ),
            }],
            is_error: None,
        })
    }

    // WASM execution methods
    async fn execute_wasm_component(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let component_name = args["componentName"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing componentName"))?;

        let method = args["method"].as_str().unwrap_or("main");
        let timeout_ms = args["timeout_ms"].as_u64().unwrap_or(30000);
        let max_memory_mb = args["max_memory_mb"].as_u64().unwrap_or(64) as u32;
        let method_args = args.get("args").cloned().unwrap_or(json!({}));

        match self
            .wasm_watcher
            .execute_component(
                component_name,
                method,
                method_args,
                timeout_ms,
                max_memory_mb,
            )
            .await
        {
            Ok(execution_id) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!(
                        "Started execution of {component_name}::{method} with ID: {execution_id}"
                    ),
                }],
                is_error: None,
            }),
            Err(e) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Failed to execute component: {e}"),
                }],
                is_error: Some(true),
            }),
        }
    }

    async fn get_execution_progress(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let execution_id = args["executionId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing executionId"))?;

        if let Some(progress) = self.wasm_watcher.get_execution_progress(execution_id) {
            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: serde_json::to_string_pretty(&progress)
                        .unwrap_or_else(|_| "Failed to serialize progress".to_string()),
                }],
                is_error: None,
            })
        } else {
            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Execution {execution_id} not found"),
                }],
                is_error: Some(true),
            })
        }
    }

    async fn get_execution_result(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let execution_id = args["executionId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing executionId"))?;

        if let Some(result) = self.wasm_watcher.get_execution_result(execution_id) {
            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: serde_json::to_string_pretty(&result)
                        .unwrap_or_else(|_| "Failed to serialize result".to_string()),
                }],
                is_error: None,
            })
        } else {
            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Execution {execution_id} not found or not completed"),
                }],
                is_error: Some(true),
            })
        }
    }

    async fn list_wasm_executions(&self) -> Result<CallToolResult> {
        let executions = self.wasm_watcher.list_executions();

        if executions.is_empty() {
            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: "No active or recent executions".to_string(),
                }],
                is_error: None,
            })
        } else {
            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: serde_json::to_string_pretty(&executions)
                        .unwrap_or_else(|_| "Failed to serialize executions".to_string()),
                }],
                is_error: None,
            })
        }
    }

    async fn cancel_execution(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let execution_id = args["executionId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing executionId"))?;

        let cancelled = self.wasm_watcher.cancel_execution(execution_id);

        if cancelled {
            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Cancelled execution {execution_id}"),
                }],
                is_error: None,
            })
        } else {
            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Execution {execution_id} not found or could not be cancelled"),
                }],
                is_error: Some(true),
            })
        }
    }

    // Sensor data tool implementations
    async fn query_sensor_data(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;

        let dataset_manager = self
            .dataset_manager
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No dataset manager configured"))?;

        let sensor_ids: Vec<String> = args["sensorIds"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect();

        let start_time = args["startTime"]
            .as_str()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc).timestamp_micros())
            .ok_or_else(|| anyhow::anyhow!("Invalid or missing startTime"))?;

        let end_time = args["endTime"]
            .as_str()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc).timestamp_micros())
            .ok_or_else(|| anyhow::anyhow!("Invalid or missing endTime"))?;

        let limit = args["limit"].as_u64().map(|v| v as usize);
        let min_quality = args["minQuality"].as_f64().map(|v| v as f32);
        let downsample_interval_ms = args["downsampleIntervalMs"].as_u64().map(|ms| ms * 1000); // Convert to microseconds

        let query = SensorQuery {
            sensor_ids,
            start_time_us: start_time,
            end_time_us: end_time,
            limit,
            min_quality,
            downsample_interval_us: downsample_interval_ms.map(|v| v as i64),
            data_types: None, // Could be extended to filter by data types
        };

        let manager = dataset_manager.lock().await;
        let active_dataset = manager
            .get_active_dataset()
            .await?
            .ok_or_else(|| anyhow::anyhow!("No active dataset"))?;

        match manager
            .query_selected_data(&active_dataset.dataset_id, &query)
            .await
        {
            Ok(readings) => {
                let result = json!({
                    "readingCount": readings.len(),
                    "readings": readings.iter().take(100).collect::<Vec<_>>(), // Limit response size
                    "truncated": readings.len() > 100
                });

                Ok(CallToolResult {
                    content: vec![TextContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&result)?,
                    }],
                    is_error: None,
                })
            }
            Err(e) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Failed to query sensor data: {e}"),
                }],
                is_error: Some(true),
            }),
        }
    }

    async fn list_sensors(&self) -> Result<CallToolResult> {
        let dataset_manager = self
            .dataset_manager
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No dataset manager configured"))?;

        let manager = dataset_manager.lock().await;
        let active_dataset = manager
            .get_active_dataset()
            .await?
            .ok_or_else(|| anyhow::anyhow!("No active dataset"))?;

        match manager.list_sensors(&active_dataset.dataset_id).await {
            Ok(sensor_infos) => {
                let result = json!({
                    "sensorCount": sensor_infos.len(),
                    "sensors": sensor_infos.iter().map(|si| &si.sensor_id).collect::<Vec<_>>()
                });

                Ok(CallToolResult {
                    content: vec![TextContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&result)?,
                    }],
                    is_error: None,
                })
            }
            Err(e) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Failed to list sensors: {e}"),
                }],
                is_error: Some(true),
            }),
        }
    }

    async fn get_sensor_metadata(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let sensor_id = args["sensorId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing sensorId"))?;

        let dataset_manager = self
            .dataset_manager
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No dataset manager configured"))?;

        let manager = dataset_manager.lock().await;
        let active_dataset = manager
            .get_active_dataset()
            .await?
            .ok_or_else(|| anyhow::anyhow!("No active dataset"))?;

        match manager
            .get_sensor_info(&active_dataset.dataset_id, sensor_id)
            .await
        {
            Ok(Some(sensor_info)) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: serde_json::to_string_pretty(&sensor_info.metadata)?,
                }],
                is_error: None,
            }),
            Ok(None) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("No metadata found for sensor: {sensor_id}"),
                }],
                is_error: Some(true),
            }),
            Err(e) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Failed to get sensor metadata: {e}"),
                }],
                is_error: Some(true),
            }),
        }
    }

    async fn get_sensor_statistics(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let sensor_id = args["sensorId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing sensorId"))?;

        let dataset_manager = self
            .dataset_manager
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No dataset manager configured"))?;

        let manager = dataset_manager.lock().await;
        let active_dataset = manager
            .get_active_dataset()
            .await?
            .ok_or_else(|| anyhow::anyhow!("No active dataset"))?;

        match manager
            .get_sensor_info(&active_dataset.dataset_id, sensor_id)
            .await
        {
            Ok(Some(sensor_info)) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: serde_json::to_string_pretty(&sensor_info.statistics)?,
                }],
                is_error: None,
            }),
            Ok(None) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("No statistics found for sensor: {sensor_id}"),
                }],
                is_error: Some(true),
            }),
            Err(e) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Failed to get sensor statistics: {e}"),
                }],
                is_error: Some(true),
            }),
        }
    }

    async fn get_sensor_time_range(&self, args: Option<Value>) -> Result<CallToolResult> {
        let dataset_manager = self
            .dataset_manager
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No dataset manager configured"))?;

        let sensor_id = args.as_ref().and_then(|a| a["sensorId"].as_str());

        let manager = dataset_manager.lock().await;
        let active_dataset = manager
            .get_active_dataset()
            .await?
            .ok_or_else(|| anyhow::anyhow!("No active dataset"))?;

        let result: Result<Option<crate::database::TimeRange>> = if let Some(id) = sensor_id {
            // Get sensor-specific time range from sensor info
            match manager
                .get_sensor_info(&active_dataset.dataset_id, id)
                .await?
            {
                Some(sensor_info) => Ok(Some(sensor_info.statistics.time_range)),
                None => Ok(None),
            }
        } else {
            // Get dataset's global time range
            Ok(Some(active_dataset.time_range))
        };

        match result {
            Ok(Some(range)) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: serde_json::to_string_pretty(&range)?,
                }],
                is_error: None,
            }),
            Ok(None) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: "No time range data available".to_string(),
                }],
                is_error: Some(true),
            }),
            Err(e) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Failed to get time range: {e}"),
                }],
                is_error: Some(true),
            }),
        }
    }

    async fn list_sensor_datasets(&self, args: Option<Value>) -> Result<CallToolResult> {
        let include_metadata = args
            .and_then(|a| a["includeMetadata"].as_bool())
            .unwrap_or(true);

        let dataset_manager = self
            .dataset_manager
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No dataset manager configured"))?;

        let manager = dataset_manager.lock().await;
        let datasets = manager.list_datasets().await?;
        let active_dataset = manager
            .get_active_dataset()
            .await?
            .map(|d| d.dataset_id.clone());

        let result = if include_metadata {
            json!({
                "datasetCount": datasets.len(),
                "activeDataset": active_dataset,
                "datasets": datasets.clone()
            })
        } else {
            let ids: Vec<String> = datasets.into_iter().map(|d| d.dataset_id).collect();
            json!({
                "datasetCount": ids.len(),
                "activeDataset": active_dataset,
                "datasetIds": ids
            })
        };

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: serde_json::to_string_pretty(&result)?,
            }],
            is_error: None,
        })
    }

    async fn get_dataset_info(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let dataset_id = args["datasetId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing datasetId"))?;

        let dataset_manager = self
            .dataset_manager
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No dataset manager configured"))?;

        let manager = dataset_manager.lock().await;
        if let Some(dataset) = manager.get_dataset(dataset_id).await? {
            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: serde_json::to_string_pretty(&dataset)?,
                }],
                is_error: None,
            })
        } else {
            Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Dataset '{dataset_id}' not found"),
                }],
                is_error: Some(true),
            })
        }
    }

    async fn set_active_dataset(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let dataset_id = args["datasetId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing datasetId"))?;

        let dataset_manager = self
            .dataset_manager
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No dataset manager configured"))?;

        let mut manager = dataset_manager.lock().await;
        match manager.set_active_dataset(dataset_id).await {
            Ok(()) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Successfully activated dataset: {dataset_id}"),
                }],
                is_error: None,
            }),
            Err(e) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Failed to activate dataset: {e}"),
                }],
                is_error: Some(true),
            }),
        }
    }

    async fn visualize_sensor_data(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;

        let sensor_id = args["sensorId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing sensorId"))?;
        let visualization_type = args["visualizationType"].as_str().unwrap_or("timeline");
        let width = args["width"].as_u64().unwrap_or(800) as u32;
        let height = args["height"].as_u64().unwrap_or(400) as u32;

        // For now, return a placeholder response
        // In a full implementation, this would generate actual visualizations
        let result = json!({
            "visualizationType": visualization_type,
            "sensorId": sensor_id,
            "width": width,
            "height": height,
            "status": "Visualization generation not yet implemented",
            "placeholder": format!("Would generate {} visualization for sensor {} at {}x{}",
                visualization_type, sensor_id, width, height)
        });

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: serde_json::to_string_pretty(&result)?,
            }],
            is_error: None,
        })
    }

    async fn detect_sensor_gaps(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;

        let sensor_id = args["sensorId"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing sensorId"))?;

        let start_time = args["startTime"]
            .as_str()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc).timestamp_micros())
            .ok_or_else(|| anyhow::anyhow!("Invalid or missing startTime"))?;

        let end_time = args["endTime"]
            .as_str()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc).timestamp_micros())
            .ok_or_else(|| anyhow::anyhow!("Invalid or missing endTime"))?;

        let max_gap_ms = args["maxGapMs"].as_u64().unwrap_or(1000);
        let max_gap_us = max_gap_ms * 1000; // Convert to microseconds

        let dataset_manager = self
            .dataset_manager
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No dataset manager configured"))?;

        let manager = dataset_manager.lock().await;
        let backend = manager.backend();
        match backend
            .detect_gaps(sensor_id, start_time, end_time, max_gap_us as i64)
            .await
        {
            Ok(gaps) => {
                let result = json!({
                    "sensorId": sensor_id,
                    "gapCount": gaps.len(),
                    "maxGapMs": max_gap_ms,
                    "gaps": gaps
                });

                Ok(CallToolResult {
                    content: vec![TextContent {
                        content_type: "text".to_string(),
                        text: serde_json::to_string_pretty(&result)?,
                    }],
                    is_error: None,
                })
            }
            Err(e) => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Failed to detect sensor gaps: {e}"),
                }],
                is_error: Some(true),
            }),
        }
    }

    // Component upload tool implementations
    async fn upload_wasm_component(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;

        let component_name = args["componentName"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing componentName"))?;
        let wasm_base64 = args["wasmBase64"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing wasmBase64"))?;
        let description = args["description"].as_str();
        let version = args["version"].as_str().unwrap_or("1.0.0");

        // Decode base64 WASM content
        use base64::Engine as _;
        let wasm_bytes = base64::engine::general_purpose::STANDARD
            .decode(wasm_base64)
            .map_err(|e| anyhow::anyhow!("Failed to decode base64: {}", e))?;

        // Validate size
        if wasm_bytes.len() > 50 * 1024 * 1024 {
            return Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: "Component file too large. Maximum size is 50MB".to_string(),
                }],
                is_error: Some(true),
            });
        }

        // Save component to file system
        let wasm_path = self.wasm_watcher.get_watch_path();
        let component_filename = format!("{component_name}.wasm");
        let component_path = wasm_path.join(&component_filename);

        // Check if component already exists
        if component_path.exists() {
            return Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!(
                        "Component '{component_name}' already exists. Delete it first to re-upload."
                    ),
                }],
                is_error: Some(true),
            });
        }

        // Write WASM file
        use std::fs;
        fs::write(&component_path, &wasm_bytes)
            .map_err(|e| anyhow::anyhow!("Failed to write WASM file: {}", e))?;

        // Create metadata file
        let metadata = json!({
            "name": component_name,
            "version": version,
            "description": description,
            "uploadedAt": chrono::Utc::now().to_rfc3339(),
            "size": wasm_bytes.len(),
            "checksum": format!("{:x}", sha2::Sha256::digest(&wasm_bytes)),
        });

        let metadata_path = wasm_path.join(format!("{component_name}.json"));
        fs::write(&metadata_path, serde_json::to_string_pretty(&metadata)?)
            .map_err(|e| anyhow::anyhow!("Failed to write metadata: {}", e))?;

        // Trigger component scan to pick up the new component
        self.wasm_watcher.scan_components().await?;

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: format!(
                    "Successfully uploaded WASM component '{}' (version: {}, size: {} bytes)",
                    component_name,
                    version,
                    wasm_bytes.len()
                ),
            }],
            is_error: None,
        })
    }

    async fn validate_wasm_component(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let wasm_base64 = args["wasmBase64"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing wasmBase64"))?;

        // Decode base64
        use base64::Engine as _;
        let wasm_bytes = base64::engine::general_purpose::STANDARD
            .decode(wasm_base64)
            .map_err(|e| anyhow::anyhow!("Failed to decode base64: {}", e))?;

        // Basic validation
        let mut validation_result = json!({
            "isValid": true,
            "errors": [],
            "warnings": [],
            "metadata": {
                "size": wasm_bytes.len(),
                "checksum": format!("{:x}", sha2::Sha256::digest(&wasm_bytes)),
            }
        });

        // Check size
        if wasm_bytes.len() > 50 * 1024 * 1024 {
            validation_result["isValid"] = json!(false);
            validation_result["errors"]
                .as_array_mut()
                .unwrap()
                .push(json!("File size exceeds 50MB limit"));
        }

        // Validate WASM format using wasmparser
        use wasmparser::Validator;
        let mut validator = Validator::new();
        match validator.validate_all(&wasm_bytes) {
            Ok(_) => {
                validation_result["metadata"]["format"] = json!("Valid WebAssembly module");

                // Try to parse as component
                use wit_component::decode;
                match decode(&wasm_bytes) {
                    Ok(decoded) => {
                        validation_result["metadata"]["type"] = json!("WebAssembly Component");

                        match decoded {
                            wit_component::DecodedWasm::WitPackage(resolve, pkg) => {
                                validation_result["metadata"]["packageId"] =
                                    json!(format!("{:?}", pkg));

                                // Extract interface information
                                let interfaces: Vec<String> = resolve
                                    .interfaces
                                    .iter()
                                    .filter_map(|(_, iface)| iface.name.clone())
                                    .collect();

                                validation_result["metadata"]["interfaces"] = json!(interfaces);
                            }
                            wit_component::DecodedWasm::Component(resolve, world) => {
                                validation_result["metadata"]["worldId"] =
                                    json!(format!("{:?}", world));

                                // Extract interface information
                                let interfaces: Vec<String> = resolve
                                    .interfaces
                                    .iter()
                                    .filter_map(|(_, iface)| iface.name.clone())
                                    .collect();

                                validation_result["metadata"]["interfaces"] = json!(interfaces);
                            }
                        }
                    }
                    Err(_) => {
                        validation_result["metadata"]["type"] = json!("WebAssembly Module");
                        validation_result["warnings"]
                            .as_array_mut()
                            .unwrap()
                            .push(json!(
                                "Not a WebAssembly component (missing component metadata)"
                            ));
                    }
                }
            }
            Err(e) => {
                validation_result["isValid"] = json!(false);
                validation_result["errors"]
                    .as_array_mut()
                    .unwrap()
                    .push(json!(format!("Invalid WebAssembly format: {e}")));
            }
        }

        // Security checks
        if wasm_bytes.len() < 8 {
            validation_result["warnings"]
                .as_array_mut()
                .unwrap()
                .push(json!("Suspiciously small file size"));
        }

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: serde_json::to_string_pretty(&validation_result)?,
            }],
            is_error: None,
        })
    }

    async fn list_uploaded_components(&self, args: Option<Value>) -> Result<CallToolResult> {
        let include_metadata = args
            .and_then(|a| a["includeMetadata"].as_bool())
            .unwrap_or(true);

        let wasm_path = self.wasm_watcher.get_watch_path();
        let mut components = Vec::new();

        // Read all .json metadata files
        use std::fs;
        if let Ok(entries) = fs::read_dir(wasm_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("json") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(metadata) = serde_json::from_str::<Value>(&content) {
                            if metadata.get("uploadedAt").is_some() {
                                // This is an uploaded component metadata file
                                if include_metadata {
                                    components.push(metadata);
                                } else {
                                    components.push(json!({
                                        "name": metadata["name"],
                                        "version": metadata["version"]
                                    }));
                                }
                            }
                        }
                    }
                }
            }
        }

        let result = json!({
            "componentCount": components.len(),
            "components": components
        });

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: serde_json::to_string_pretty(&result)?,
            }],
            is_error: None,
        })
    }

    async fn delete_uploaded_component(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;
        let component_name = args["componentName"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing componentName"))?;

        let wasm_path = self.wasm_watcher.get_watch_path();
        let component_path = wasm_path.join(format!("{component_name}.wasm"));
        let metadata_path = wasm_path.join(format!("{component_name}.json"));

        // Check if component exists
        if !component_path.exists() && !metadata_path.exists() {
            return Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("Component '{component_name}' not found"),
                }],
                is_error: Some(true),
            });
        }

        // Delete files
        use std::fs;
        let mut deleted = Vec::new();

        if component_path.exists() {
            fs::remove_file(&component_path)
                .map_err(|e| anyhow::anyhow!("Failed to delete WASM file: {}", e))?;
            deleted.push("WASM file");
        }

        if metadata_path.exists() {
            fs::remove_file(&metadata_path)
                .map_err(|e| anyhow::anyhow!("Failed to delete metadata file: {}", e))?;
            deleted.push("metadata file");
        }

        // Remove from watcher if present
        self.wasm_watcher.remove_missing_component(component_name);

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: format!(
                    "Successfully deleted component '{}' (removed: {})",
                    component_name,
                    deleted.join(", ")
                ),
            }],
            is_error: None,
        })
    }

    // Component Group Management Methods

    async fn create_component_group(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;

        let diagram_id = args
            .get("diagramId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'diagramId' parameter"))?;

        let name = args
            .get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'name' parameter"))?;

        let description = args.get("description").and_then(|v| v.as_str());

        let component_ids: Vec<String> = args
            .get("componentIds")
            .and_then(|v| v.as_array())
            .ok_or_else(|| anyhow::anyhow!("Missing 'componentIds' parameter"))?
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();

        if component_ids.is_empty() {
            return Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: "At least one component ID is required".to_string(),
                }],
                is_error: Some(true),
            });
        }

        // Get the diagram
        let diagram = self
            .models
            .get_mut(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        // Validate that all component IDs exist
        for component_id in &component_ids {
            if self.wasm_watcher.get_component(component_id).is_none() {
                return Ok(CallToolResult {
                    content: vec![TextContent {
                        content_type: "text".to_string(),
                        text: format!("Component '{component_id}' not found"),
                    }],
                    is_error: Some(true),
                });
            }
        }

        let mut group = ComponentGroup::new(name.to_string(), description.map(|s| s.to_string()));

        // Add all components to the group
        for component_id in component_ids {
            group.add_component(component_id);
        }

        let group_id = group.id.clone();
        diagram.add_component_group(group);

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: format!(
                    "Created component group '{name}' with ID: {group_id} in diagram '{diagram_id}'"
                ),
            }],
            is_error: None,
        })
    }

    async fn update_component_group(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;

        let diagram_id = args
            .get("diagramId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'diagramId' parameter"))?;

        let group_id = args
            .get("groupId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'groupId' parameter"))?;

        // Get the diagram
        let diagram = self
            .models
            .get_mut(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        let group = diagram
            .get_component_group_mut(group_id)
            .ok_or_else(|| anyhow::anyhow!("Component group not found"))?;

        // Update name if provided
        if let Some(name) = args.get("name").and_then(|v| v.as_str()) {
            group.name = name.to_string();
        }

        // Update description if provided
        if let Some(description) = args.get("description").and_then(|v| v.as_str()) {
            group.description = Some(description.to_string());
        }

        // Update component IDs if provided
        if let Some(component_ids_value) = args.get("componentIds") {
            let component_ids: Vec<String> = component_ids_value
                .as_array()
                .ok_or_else(|| anyhow::anyhow!("Invalid 'componentIds' parameter"))?
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect();

            // Clear existing components and add new ones
            group.component_ids.clear();
            for component_id in component_ids {
                group.add_component(component_id);
            }
        }

        // Update internal connections if provided
        if let Some(connections_value) = args.get("internalConnections") {
            let connections = connections_value
                .as_array()
                .ok_or_else(|| anyhow::anyhow!("Invalid 'internalConnections' parameter"))?;

            group.internal_connections.clear();
            for connection_value in connections {
                let source_component = connection_value
                    .get("sourceComponent")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'sourceComponent' in connection"))?;
                let source_interface = connection_value
                    .get("sourceInterface")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'sourceInterface' in connection"))?;
                let target_component = connection_value
                    .get("targetComponent")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'targetComponent' in connection"))?;
                let target_interface = connection_value
                    .get("targetInterface")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'targetInterface' in connection"))?;
                let connection_type = connection_value
                    .get("connectionType")
                    .and_then(|v| v.as_str())
                    .unwrap_or("direct");

                let conn_type = match connection_type {
                    "shared" => ConnectionType::Shared,
                    "adapter" => ConnectionType::Adapter,
                    _ => ConnectionType::Direct,
                };

                let connection = InterfaceConnection::new(
                    source_component.to_string(),
                    source_interface.to_string(),
                    target_component.to_string(),
                    target_interface.to_string(),
                    conn_type,
                );

                group.add_connection(connection);
            }
        }

        // Update external interfaces if provided
        if let Some(interfaces_value) = args.get("externalInterfaces") {
            let interfaces = interfaces_value
                .as_array()
                .ok_or_else(|| anyhow::anyhow!("Invalid 'externalInterfaces' parameter"))?;

            group.external_interfaces.clear();
            for interface_value in interfaces {
                let name = interface_value
                    .get("name")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'name' in external interface"))?;
                let interface_type = interface_value
                    .get("interfaceType")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        anyhow::anyhow!("Missing 'interfaceType' in external interface")
                    })?;
                let source_component = interface_value
                    .get("sourceComponent")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        anyhow::anyhow!("Missing 'sourceComponent' in external interface")
                    })?;
                let source_interface = interface_value
                    .get("sourceInterface")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        anyhow::anyhow!("Missing 'sourceInterface' in external interface")
                    })?;

                let external_interface = ExternalInterface::from_component_interface(
                    name.to_string(),
                    interface_type.to_string(),
                    source_component.to_string(),
                    source_interface.to_string(),
                    Vec::new(), // TODO: Extract functions from component interface
                );

                group.add_external_interface(external_interface);
            }
        }

        group.updated_at = chrono::Utc::now();

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: format!("Updated component group '{}'", group.name),
            }],
            is_error: None,
        })
    }

    async fn get_component_group_interfaces(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;

        let diagram_id = args
            .get("diagramId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'diagramId' parameter"))?;

        let group_id = args
            .get("groupId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'groupId' parameter"))?;

        // Get the diagram
        let diagram = self
            .models
            .get(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        let group = diagram
            .get_component_group(group_id)
            .ok_or_else(|| anyhow::anyhow!("Component group not found"))?;

        let interfaces_json = serde_json::to_string_pretty(&group.external_interfaces)
            .map_err(|e| anyhow::anyhow!("Failed to serialize interfaces: {}", e))?;

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: format!(
                    "External interfaces for group '{}':\n{}",
                    group.name, interfaces_json
                ),
            }],
            is_error: None,
        })
    }

    async fn delete_component_group(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;

        let diagram_id = args
            .get("diagramId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'diagramId' parameter"))?;

        let group_id = args
            .get("groupId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'groupId' parameter"))?;

        // Get the diagram
        let diagram = self
            .models
            .get_mut(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        let group = diagram
            .remove_component_group(group_id)
            .ok_or_else(|| anyhow::anyhow!("Component group not found"))?;

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: format!("Deleted component group '{}'", group.name),
            }],
            is_error: None,
        })
    }

    async fn generate_bazel_composition(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;

        let diagram_id = args
            .get("diagramId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'diagramId' parameter"))?;

        let group_id = args
            .get("groupId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'groupId' parameter"))?;

        let format = args
            .get("format")
            .and_then(|v| v.as_str())
            .unwrap_or("both");

        // Get the diagram
        let diagram = self
            .models
            .get(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        let group = diagram
            .get_component_group(group_id)
            .ok_or_else(|| anyhow::anyhow!("Component group not found"))?;

        // Get components from wasm watcher and convert to HashMap for ComponentGroupInfo
        let components_vec = self.wasm_watcher.get_components();
        let available_components: HashMap<String, WasmComponent> = components_vec
            .into_iter()
            .map(|comp| (comp.name.clone(), comp.clone()))
            .collect();
        let group_info = ComponentGroupInfo::from_group(group.clone(), &available_components);

        let mut result = String::new();

        match format {
            "bazel" => {
                result.push_str(&group_info.generate_bazel_config());
            }
            "wac" => {
                result.push_str(&group_info.generate_wac_config());
            }
            "both" => {
                result.push_str("# Bazel Configuration\n");
                result.push_str(&group_info.generate_bazel_config());
                result.push_str("\n\n# WAC Configuration\n");
                result.push_str(&group_info.generate_wac_config());
            }
            _ => {
                result.push_str("# Bazel Configuration\n");
                result.push_str(&group_info.generate_bazel_config());
                result.push_str("\n\n# WAC Configuration\n");
                result.push_str(&group_info.generate_wac_config());
            }
        }

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: result,
            }],
            is_error: None,
        })
    }

    async fn validate_component_group(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;

        let diagram_id = args
            .get("diagramId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'diagramId' parameter"))?;

        let group_id = args
            .get("groupId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'groupId' parameter"))?;

        // Get the diagram
        let diagram = self
            .models
            .get(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        let group = diagram
            .get_component_group(group_id)
            .ok_or_else(|| anyhow::anyhow!("Component group not found"))?;

        // Get components from wasm watcher and convert to HashMap
        let components_vec = self.wasm_watcher.get_components();
        let available_components: HashMap<String, WasmComponent> = components_vec
            .into_iter()
            .map(|comp| (comp.name.clone(), comp.clone()))
            .collect();
        let validation_status = group.validate(&available_components);

        let status_json = serde_json::to_string_pretty(&validation_status)
            .map_err(|e| anyhow::anyhow!("Failed to serialize validation status: {}", e))?;

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: format!(
                    "Validation status for group '{}':\n{}",
                    group.name, status_json
                ),
            }],
            is_error: Some(!validation_status.is_valid),
        })
    }

    async fn list_component_groups(&self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;

        let diagram_id = args
            .get("diagramId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'diagramId' parameter"))?;

        // Get the diagram
        let diagram = self
            .models
            .get(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        if diagram.component_groups.is_empty() {
            return Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "text".to_string(),
                    text: format!("No component groups found in diagram '{diagram_id}'"),
                }],
                is_error: None,
            });
        }

        let mut result = String::new();
        result.push_str(&format!("Component Groups in diagram '{diagram_id}':\n"));

        for (id, group) in &diagram.component_groups {
            result.push_str(&format!(
                "- {} ({}): {} components\n",
                group.name,
                id,
                group.component_ids.len()
            ));

            if !group.component_ids.is_empty() {
                result.push_str(&format!(
                    "  Components: {}\n",
                    group.component_ids.join(", ")
                ));
            }

            if !group.internal_connections.is_empty() {
                result.push_str(&format!(
                    "  Internal connections: {}\n",
                    group.internal_connections.len()
                ));
            }

            if !group.external_interfaces.is_empty() {
                result.push_str(&format!(
                    "  External interfaces: {}\n",
                    group.external_interfaces.len()
                ));
            }

            result.push('\n');
        }

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: result,
            }],
            is_error: None,
        })
    }

    async fn deploy_component_group(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;

        let diagram_id = args
            .get("diagramId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'diagramId' parameter"))?;

        let group_id = args
            .get("groupId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'groupId' parameter"))?;

        let workspace_path = args
            .get("workspacePath")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing 'workspacePath' parameter"))?;

        // Get the diagram
        let diagram = self
            .models
            .get(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found"))?;

        let group = diagram
            .get_component_group(group_id)
            .ok_or_else(|| anyhow::anyhow!("Component group not found"))?;

        // Get components from wasm watcher
        let components_vec = self.wasm_watcher.get_components();
        let available_components: HashMap<String, WasmComponent> = components_vec
            .into_iter()
            .map(|comp| (comp.name.clone(), comp.clone()))
            .collect();

        // Create ComponentGroupInfo
        let group_info = ComponentGroupInfo::from_group(group.clone(), &available_components);

        // Parse config or use defaults
        let config = if let Some(config_value) = args.get("config") {
            let profile = config_value
                .get("profile")
                .and_then(|v| v.as_str())
                .unwrap_or("release")
                .to_string();

            let target_name = config_value
                .get("targetName")
                .and_then(|v| v.as_str())
                .unwrap_or(&group.name.replace(' ', "_").to_lowercase())
                .to_string();

            let package_name = config_value
                .get("packageName")
                .and_then(|v| v.as_str())
                .unwrap_or(&group.name.replace(' ', "-").to_lowercase())
                .to_string();

            let generate_wac_file = config_value
                .get("generateWacFile")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

            let generate_build_file = config_value
                .get("generateBuildFile")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

            // Parse optimization config
            let optimizations = if let Some(opt_config) = config_value.get("optimizations") {
                crate::wasm::OptimizationConfig {
                    enable_optimizations: opt_config
                        .get("enableOptimizations")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true),
                    strip_debug_info: opt_config
                        .get("stripDebugInfo")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false),
                    use_symlinks: opt_config
                        .get("useSymlinks")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false),
                }
            } else {
                crate::wasm::OptimizationConfig {
                    enable_optimizations: true,
                    strip_debug_info: false,
                    use_symlinks: false,
                }
            };

            // Parse validation config
            let validation = if let Some(val_config) = config_value.get("validation") {
                crate::wasm::ValidationConfig {
                    validate_components: val_config
                        .get("validateComponents")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true),
                    validate_connections: val_config
                        .get("validateConnections")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true),
                    lint_wit: val_config
                        .get("lintWit")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true),
                }
            } else {
                crate::wasm::ValidationConfig {
                    validate_components: true,
                    validate_connections: true,
                    lint_wit: true,
                }
            };

            crate::wasm::DeploymentConfig {
                group_id: group_id.to_string(),
                group_name: group.name.clone(),
                profile,
                target_name,
                package_name,
                generate_wac_file,
                generate_build_file,
                optimizations,
                validation,
            }
        } else {
            // Default config
            crate::wasm::DeploymentConfig {
                group_id: group_id.to_string(),
                group_name: group.name.clone(),
                profile: "release".to_string(),
                target_name: group.name.replace(' ', "_").to_lowercase(),
                package_name: group.name.replace(' ', "-").to_lowercase(),
                generate_wac_file: true,
                generate_build_file: true,
                optimizations: crate::wasm::OptimizationConfig {
                    enable_optimizations: true,
                    strip_debug_info: false,
                    use_symlinks: false,
                },
                validation: crate::wasm::ValidationConfig {
                    validate_components: true,
                    validate_connections: true,
                    lint_wit: true,
                },
            }
        };

        // Deploy to workspace
        let workspace_path = std::path::Path::new(workspace_path);
        let result = group_info
            .deploy_to_workspace(workspace_path, &config)
            .await?;

        // Format response
        let mut response = format!(
            "Deployment {} for component group '{}' ({})\n\n",
            if result.success {
                "succeeded"
            } else {
                "failed"
            },
            group.name,
            group_id
        );

        if !result.files_written.is_empty() {
            response.push_str("Files written:\n");
            for file_path in &result.files_written {
                response.push_str(&format!("  - {}\n", file_path.display()));
            }
            response.push('\n');
        }

        if !result.errors.is_empty() {
            response.push_str("Errors:\n");
            for error in &result.errors {
                response.push_str(&format!("  - {error}\n"));
            }
            response.push('\n');
        }

        response.push_str("Deployment configuration:\n");
        response.push_str(&format!("  - Profile: {}\n", config.profile));
        response.push_str(&format!("  - Target name: {}\n", config.target_name));
        response.push_str(&format!("  - Package name: {}\n", config.package_name));
        response.push_str(&format!(
            "  - Generate WAC file: {}\n",
            config.generate_wac_file
        ));
        response.push_str(&format!(
            "  - Generate BUILD file: {}\n",
            config.generate_build_file
        ));
        response.push_str(&format!(
            "  - Optimizations enabled: {}\n",
            config.optimizations.enable_optimizations
        ));
        response.push_str(&format!(
            "  - Validation enabled: {}\n",
            config.validation.validate_components
        ));

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: response,
            }],
            is_error: Some(!result.success),
        })
    }

    /// Render graphics output from a WASM component
    async fn render_wasm_graphics(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;

        let component_id = args
            .get("componentId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing componentId"))?;

        let method = args
            .get("method")
            .and_then(|v| v.as_str())
            .unwrap_or("render");

        let width = args
            .get("width")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| anyhow::anyhow!("Missing width"))? as u32;

        let height = args
            .get("height")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| anyhow::anyhow!("Missing height"))? as u32;

        let output_format = args
            .get("outputFormat")
            .and_then(|v| v.as_str())
            .unwrap_or("svg");

        // Initialize graphics renderer with proper configuration
        let graphics_config = crate::wasm::graphics_renderer::GraphicsConfig {
            max_width: width.max(1920),
            max_height: height.max(1080),
            max_fps: 30,
            allowed_formats: vec![
                crate::wasm::graphics_renderer::ImageFormat::Png,
                crate::wasm::graphics_renderer::ImageFormat::WebP,
            ],
            gpu_acceleration: false,
            render_timeout_ms: 5000,
        };

        let renderer = crate::wasm::graphics_renderer::WasmGraphicsRenderer::new(graphics_config);

        // Render the graphics
        let input_data = args
            .get("inputData")
            .map(|v| serde_json::to_vec(v).unwrap_or_default())
            .unwrap_or_default();

        let graphics_output = renderer
            .render_component(component_id, method, &input_data)
            .await?;

        // Convert to requested format and return
        match output_format {
            "svg" => {
                if let crate::wasm::graphics_renderer::GraphicsOutput::Svg { content, .. } =
                    graphics_output
                {
                    Ok(CallToolResult {
                        content: vec![TextContent {
                            content_type: "image/svg+xml".to_string(),
                            text: content,
                        }],
                        is_error: Some(false),
                    })
                } else {
                    Ok(CallToolResult {
                        content: vec![TextContent {
                            content_type: "application/json".to_string(),
                            text: serde_json::to_string(&graphics_output)?,
                        }],
                        is_error: Some(false),
                    })
                }
            }
            "canvas_commands" => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "application/json".to_string(),
                    text: serde_json::to_string(&graphics_output)?,
                }],
                is_error: Some(false),
            }),
            _ => Ok(CallToolResult {
                content: vec![TextContent {
                    content_type: "application/json".to_string(),
                    text: serde_json::to_string(&graphics_output)?,
                }],
                is_error: Some(false),
            }),
        }
    }

    /// Stream real-time graphics updates from a WASM component
    async fn stream_wasm_graphics(&mut self, args: Option<Value>) -> Result<CallToolResult> {
        let args = args.ok_or_else(|| anyhow::anyhow!("Missing arguments"))?;

        let component_id = args
            .get("componentId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing componentId"))?;

        let update_interval_ms = args
            .get("updateIntervalMs")
            .and_then(|v| v.as_u64())
            .unwrap_or(33); // ~30 FPS default

        let width = args
            .get("width")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| anyhow::anyhow!("Missing width"))? as u32;

        let height = args
            .get("height")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| anyhow::anyhow!("Missing height"))? as u32;

        // Initialize graphics renderer
        let graphics_config = crate::wasm::graphics_renderer::GraphicsConfig {
            max_width: width.max(1920),
            max_height: height.max(1080),
            max_fps: (1000.0 / update_interval_ms as f64).min(60.0) as u32,
            allowed_formats: vec![
                crate::wasm::graphics_renderer::ImageFormat::Png,
                crate::wasm::graphics_renderer::ImageFormat::WebP,
            ],
            gpu_acceleration: false,
            render_timeout_ms: update_interval_ms.min(1000),
        };

        let renderer = crate::wasm::graphics_renderer::WasmGraphicsRenderer::new(graphics_config);

        // Initialize streaming graphics renderer
        let streaming_result =
            renderer.setup_streaming(component_id.to_string(), update_interval_ms);

        let response = match streaming_result {
            Ok(_) => format!(
                "Graphics streaming initialized for component '{}' at {}x{} resolution, updating every {}ms",
                component_id, width, height, update_interval_ms
            ),
            Err(e) => format!(
                "Failed to initialize graphics streaming for component '{}': {}",
                component_id, e
            ),
        };

        Ok(CallToolResult {
            content: vec![TextContent {
                content_type: "text".to_string(),
                text: response,
            }],
            is_error: Some(false),
        })
    }
}
