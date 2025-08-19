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

use crate::database::dataset::DatasetManager;
use crate::database::traits::{MetadataStore, SensorDataRepository, TimeSeriesStore};
use crate::mcp::protocol::{Resource, ResourceContent};
use crate::mcp::tools::DiagramTools;
use crate::model::{ElementType, Position};
use anyhow::{anyhow, Result};
use serde_json::{json, Value};

pub struct DiagramResources;

impl Default for DiagramResources {
    fn default() -> Self {
        Self::new()
    }
}

impl DiagramResources {
    pub fn new() -> Self {
        Self
    }

    pub fn get_available_resources(&self, tools: &DiagramTools) -> Vec<Resource> {
        let mut resources = vec![
            Resource {
                uri: "diagram://schemas/model".to_string(),
                name: "Diagram Model Schema".to_string(),
                description: Some("JSON schema for diagram model structure".to_string()),
                mime_type: Some("application/schema+json".to_string()),
            },
            Resource {
                uri: "diagram://schemas/node".to_string(),
                name: "Node Schema".to_string(),
                description: Some("JSON schema for node elements".to_string()),
                mime_type: Some("application/schema+json".to_string()),
            },
            Resource {
                uri: "diagram://schemas/edge".to_string(),
                name: "Edge Schema".to_string(),
                description: Some("JSON schema for edge elements".to_string()),
                mime_type: Some("application/schema+json".to_string()),
            },
            Resource {
                uri: "diagram://list".to_string(),
                name: "Diagram List".to_string(),
                description: Some("List of all available diagrams".to_string()),
                mime_type: Some("application/json".to_string()),
            },
            // WASM component resources
            Resource {
                uri: "wasm://components/list".to_string(),
                name: "WASM Components List".to_string(),
                description: Some("List of all available WASM components".to_string()),
                mime_type: Some("application/json".to_string()),
            },
            Resource {
                uri: "wasm://components/missing".to_string(),
                name: "Missing WASM Components".to_string(),
                description: Some("List of components with missing files".to_string()),
                mime_type: Some("application/json".to_string()),
            },
            Resource {
                uri: "wasm://components/status".to_string(),
                name: "WASM Components Status".to_string(),
                description: Some("Overall status of WASM components".to_string()),
                mime_type: Some("application/json".to_string()),
            },
            Resource {
                uri: "wasm://wit/interfaces".to_string(),
                name: "WIT Interfaces Overview".to_string(),
                description: Some("Overview of all WIT interfaces across components".to_string()),
                mime_type: Some("application/json".to_string()),
            },
            Resource {
                uri: "wasm://wit/types".to_string(),
                name: "WIT Types Catalog".to_string(),
                description: Some("Catalog of all WIT types and their definitions".to_string()),
                mime_type: Some("application/json".to_string()),
            },
            Resource {
                uri: "wasm://wit/dependencies".to_string(),
                name: "WIT Dependencies Graph".to_string(),
                description: Some("Dependency relationships between WIT interfaces".to_string()),
                mime_type: Some("application/json".to_string()),
            },
            Resource {
                uri: "wasm://changes/recent".to_string(),
                name: "Recent Component Changes".to_string(),
                description: Some("Recent file system changes to WASM components".to_string()),
                mime_type: Some("application/json".to_string()),
            },
            Resource {
                uri: "wasm://changes/stream".to_string(),
                name: "Component Changes Stream".to_string(),
                description: Some("Real-time stream of WASM component file changes".to_string()),
                mime_type: Some("application/x-ndjson".to_string()),
            },
            Resource {
                uri: "wasm://executions/active".to_string(),
                name: "Active WASM Executions".to_string(),
                description: Some("Currently running WASM component executions".to_string()),
                mime_type: Some("application/json".to_string()),
            },
            Resource {
                uri: "wasm://security/summary".to_string(),
                name: "Security Analysis Summary".to_string(),
                description: Some("Summary of security analysis across all components".to_string()),
                mime_type: Some("application/json".to_string()),
            },
            // Selection resources
            Resource {
                uri: "selection://list".to_string(),
                name: "Selection List".to_string(),
                description: Some("List of all selections across diagrams".to_string()),
                mime_type: Some("application/json".to_string()),
            },
            // Sensor data resources (if database is enabled)
            Resource {
                uri: "sensor://list".to_string(),
                name: "Sensors List".to_string(),
                description: Some("List of all available sensors".to_string()),
                mime_type: Some("application/json".to_string()),
            },
            Resource {
                uri: "dataset://list".to_string(),
                name: "Datasets List".to_string(),
                description: Some("List of all available sensor datasets".to_string()),
                mime_type: Some("application/json".to_string()),
            },
            // WASM execution resources
            Resource {
                uri: "wasm://executions/list".to_string(),
                name: "WASM Executions List".to_string(),
                description: Some("List of all WASM component executions".to_string()),
                mime_type: Some("application/json".to_string()),
            },
            Resource {
                uri: "wasm://uploaded/list".to_string(),
                name: "Uploaded Components List".to_string(),
                description: Some("List of all uploaded WASM components".to_string()),
                mime_type: Some("application/json".to_string()),
            },
        ];

        // Add resources for individual WASM components
        let wasm_components = tools.get_wasm_components();
        for component in wasm_components {
            resources.push(Resource {
                uri: format!("wasm://component/{}", component.name),
                name: format!("WASM Component: {}", component.name),
                description: Some(format!("Details for {} component", component.name)),
                mime_type: Some("application/json".to_string()),
            });

            // Add WIT-specific resources for each component
            resources.push(Resource {
                uri: format!("wasm://component/{}/wit", component.name),
                name: format!("WIT Analysis: {}", component.name),
                description: Some(format!(
                    "WIT interface analysis for {} component",
                    component.name
                )),
                mime_type: Some("application/json".to_string()),
            });

            resources.push(Resource {
                uri: format!("wasm://component/{}/wit/raw", component.name),
                name: format!("Raw WIT: {}", component.name),
                description: Some(format!("Raw WIT content for {} component", component.name)),
                mime_type: Some("text/plain".to_string()),
            });

            resources.push(Resource {
                uri: format!("wasm://component/{}/interfaces", component.name),
                name: format!("Interfaces: {}", component.name),
                description: Some(format!("All interfaces for {} component", component.name)),
                mime_type: Some("application/json".to_string()),
            });
        }

        // Add resources for each diagram
        for diagram in tools.list_diagrams() {
            resources.push(Resource {
                uri: format!("diagram://model/{}", diagram.id),
                name: format!("Diagram: {}", diagram.diagram_type),
                description: Some(format!("Current state of {} diagram", diagram.diagram_type)),
                mime_type: Some("application/vnd.glsp-model+json".to_string()),
            });

            resources.push(Resource {
                uri: format!("diagram://elements/{}", diagram.id),
                name: format!("Elements: {}", diagram.diagram_type),
                description: Some(format!("All elements in {} diagram", diagram.diagram_type)),
                mime_type: Some("application/json".to_string()),
            });

            resources.push(Resource {
                uri: format!("diagram://metadata/{}", diagram.id),
                name: format!("Metadata: {}", diagram.diagram_type),
                description: Some(format!("Metadata for {} diagram", diagram.diagram_type)),
                mime_type: Some("application/json".to_string()),
            });

            resources.push(Resource {
                uri: format!("diagram://validation/{}", diagram.id),
                name: format!("Validation: {}", diagram.diagram_type),
                description: Some(format!(
                    "Validation results for {} diagram",
                    diagram.diagram_type
                )),
                mime_type: Some("application/json".to_string()),
            });

            // Selection resource for each diagram
            resources.push(Resource {
                uri: format!("selection://current/{}", diagram.id),
                name: format!("Selection: {}", diagram.diagram_type),
                description: Some(format!(
                    "Current selection in {} diagram",
                    diagram.diagram_type
                )),
                mime_type: Some("application/json".to_string()),
            });
        }

        resources
    }

    pub async fn read_resource(&self, uri: &str, tools: &DiagramTools) -> Result<ResourceContent> {
        match uri {
            "diagram://schemas/model" => Ok(ResourceContent {
                uri: uri.to_string(),
                mime_type: Some("application/schema+json".to_string()),
                text: Some(self.get_model_schema()),
                blob: None,
            }),
            "diagram://schemas/node" => Ok(ResourceContent {
                uri: uri.to_string(),
                mime_type: Some("application/schema+json".to_string()),
                text: Some(self.get_node_schema()),
                blob: None,
            }),
            "diagram://schemas/edge" => Ok(ResourceContent {
                uri: uri.to_string(),
                mime_type: Some("application/schema+json".to_string()),
                text: Some(self.get_edge_schema()),
                blob: None,
            }),
            "diagram://list" => Ok(ResourceContent {
                uri: uri.to_string(),
                mime_type: Some("application/json".to_string()),
                text: Some(self.get_diagram_list(tools)),
                blob: None,
            }),
            "wasm://components/list" => Ok(ResourceContent {
                uri: uri.to_string(),
                mime_type: Some("application/json".to_string()),
                text: Some(self.get_wasm_components_list(tools)),
                blob: None,
            }),
            "wasm://components/missing" => Ok(ResourceContent {
                uri: uri.to_string(),
                mime_type: Some("application/json".to_string()),
                text: Some(self.get_missing_components(tools)),
                blob: None,
            }),
            "wasm://components/status" => Ok(ResourceContent {
                uri: uri.to_string(),
                mime_type: Some("application/json".to_string()),
                text: Some(self.get_wasm_status(tools)),
                blob: None,
            }),
            "wasm://wit/interfaces" => Ok(ResourceContent {
                uri: uri.to_string(),
                mime_type: Some("application/json".to_string()),
                text: Some(self.get_wit_interfaces_overview(tools)),
                blob: None,
            }),
            "wasm://wit/types" => Ok(ResourceContent {
                uri: uri.to_string(),
                mime_type: Some("application/json".to_string()),
                text: Some(self.get_wit_types_catalog(tools)),
                blob: None,
            }),
            "wasm://wit/dependencies" => Ok(ResourceContent {
                uri: uri.to_string(),
                mime_type: Some("application/json".to_string()),
                text: Some(self.get_wit_dependencies_graph(tools)),
                blob: None,
            }),
            "selection://list" => Ok(ResourceContent {
                uri: uri.to_string(),
                mime_type: Some("application/json".to_string()),
                text: Some(self.get_selection_list(tools)),
                blob: None,
            }),
            "sensor://list" => Ok(ResourceContent {
                uri: uri.to_string(),
                mime_type: Some("application/json".to_string()),
                text: Some(self.get_sensors_list(tools).await?),
                blob: None,
            }),
            "dataset://list" => Ok(ResourceContent {
                uri: uri.to_string(),
                mime_type: Some("application/json".to_string()),
                text: Some(self.get_datasets_list(tools).await?),
                blob: None,
            }),
            "wasm://executions/list" => Ok(ResourceContent {
                uri: uri.to_string(),
                mime_type: Some("application/json".to_string()),
                text: Some(self.get_executions_list(tools)),
                blob: None,
            }),
            "wasm://uploaded/list" => Ok(ResourceContent {
                uri: uri.to_string(),
                mime_type: Some("application/json".to_string()),
                text: Some(self.get_uploaded_components_list(tools)),
                blob: None,
            }),
            _ => {
                if uri.starts_with("diagram://model/") {
                    let diagram_id = uri
                        .strip_prefix("diagram://model/")
                        .ok_or_else(|| anyhow!("Invalid diagram model URI: {}", uri))?;
                    self.get_diagram_model(diagram_id, tools)
                } else if uri.starts_with("diagram://elements/") {
                    let diagram_id = uri
                        .strip_prefix("diagram://elements/")
                        .ok_or_else(|| anyhow!("Invalid diagram elements URI: {}", uri))?;
                    self.get_diagram_elements(diagram_id, tools)
                } else if uri.starts_with("diagram://metadata/") {
                    let diagram_id = uri
                        .strip_prefix("diagram://metadata/")
                        .ok_or_else(|| anyhow!("Invalid diagram metadata URI: {}", uri))?;
                    self.get_diagram_metadata(diagram_id, tools)
                } else if uri.starts_with("diagram://validation/") {
                    let diagram_id = uri
                        .strip_prefix("diagram://validation/")
                        .ok_or_else(|| anyhow!("Invalid diagram validation URI: {}", uri))?;
                    self.get_validation_results(diagram_id, tools)
                } else if uri.starts_with("wasm://component/") {
                    let path = uri
                        .strip_prefix("wasm://component/")
                        .ok_or_else(|| anyhow!("Invalid WASM component URI: {}", uri))?;
                    if let Some((component_name, suffix)) = path.split_once('/') {
                        match suffix {
                            "wit" => self.get_component_wit_analysis(component_name, tools),
                            "wit/raw" => self.get_component_raw_wit(component_name, tools),
                            "interfaces" => self.get_component_interfaces(component_name, tools),
                            _ => Err(anyhow::anyhow!("Unknown component resource: {}", uri)),
                        }
                    } else {
                        self.get_wasm_component_details(path, tools)
                    }
                } else if uri.starts_with("selection://current/") {
                    let diagram_id = uri
                        .strip_prefix("selection://current/")
                        .ok_or_else(|| anyhow!("Invalid selection URI: {}", uri))?;
                    self.get_current_selection(diagram_id, tools)
                } else if uri.starts_with("selection://element-at/") {
                    // Parse URI like: selection://element-at/{diagramId}?x={x}&y={y}
                    let path = uri
                        .strip_prefix("selection://element-at/")
                        .ok_or_else(|| anyhow!("Invalid element-at URI: {}", uri))?;
                    self.get_element_at_position_from_uri(path, tools)
                } else if uri.starts_with("sensor://metadata/") {
                    let sensor_id = uri
                        .strip_prefix("sensor://metadata/")
                        .ok_or_else(|| anyhow!("Invalid sensor metadata URI: {}", uri))?;
                    self.get_sensor_metadata(sensor_id, tools).await
                } else if uri.starts_with("sensor://statistics/") {
                    let sensor_id = uri
                        .strip_prefix("sensor://statistics/")
                        .ok_or_else(|| anyhow!("Invalid sensor statistics URI: {}", uri))?;
                    self.get_sensor_statistics(sensor_id, tools).await
                } else if uri.starts_with("sensor://time-range/") {
                    let sensor_id = uri
                        .strip_prefix("sensor://time-range/")
                        .ok_or_else(|| anyhow!("Invalid sensor time-range URI: {}", uri))?;
                    self.get_sensor_time_range(sensor_id, tools).await
                } else if uri.starts_with("sensor://data?") {
                    // Parse query parameters from URI
                    self.query_sensor_data_from_uri(uri, tools).await
                } else if uri.starts_with("sensor://gaps/") {
                    let sensor_id = uri
                        .strip_prefix("sensor://gaps/")
                        .ok_or_else(|| anyhow!("Invalid sensor gaps URI: {}", uri))?;
                    self.detect_sensor_gaps(sensor_id, tools).await
                } else if uri.starts_with("sensor://visualization/") {
                    let path = uri
                        .strip_prefix("sensor://visualization/")
                        .ok_or_else(|| anyhow!("Invalid sensor visualization URI: {}", uri))?;
                    self.visualize_sensor_data_from_uri(path, tools).await
                } else if uri.starts_with("dataset://info/") {
                    let dataset_id = uri
                        .strip_prefix("dataset://info/")
                        .ok_or_else(|| anyhow!("Invalid dataset info URI: {}", uri))?;
                    self.get_dataset_info(dataset_id, tools).await
                } else if uri.starts_with("wasm://executions/") {
                    let path = uri
                        .strip_prefix("wasm://executions/")
                        .ok_or_else(|| anyhow!("Invalid executions URI: {}", uri))?;
                    if let Some((execution_id, suffix)) = path.split_once('/') {
                        match suffix {
                            "progress" => self.get_execution_progress(execution_id, tools),
                            "result" => self.get_execution_result(execution_id, tools),
                            _ => Err(anyhow::anyhow!("Unknown execution resource: {}", uri)),
                        }
                    } else {
                        Err(anyhow::anyhow!("Invalid execution resource: {}", uri))
                    }
                } else {
                    Err(anyhow::anyhow!("Resource not found: {}", uri))
                }
            }
        }
    }

    fn get_model_schema(&self) -> String {
        json!({
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "title": "Diagram Model",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "Unique identifier for the diagram"
                },
                "diagramType": {
                    "type": "string",
                    "description": "Type of diagram (e.g., 'workflow', 'bpmn', 'uml')"
                },
                "revision": {
                    "type": "integer",
                    "description": "Current revision number of the model"
                },
                "root": {
                    "$ref": "#/definitions/ModelElement"
                },
                "elements": {
                    "type": "object",
                    "additionalProperties": {
                        "$ref": "#/definitions/ModelElement"
                    }
                }
            },
            "definitions": {
                "ModelElement": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "type": {"type": "string"},
                        "children": {
                            "type": "array",
                            "items": {"type": "string"}
                        },
                        "bounds": {
                            "$ref": "#/definitions/Bounds"
                        },
                        "layoutOptions": {"type": "object"},
                        "properties": {"type": "object"}
                    },
                    "required": ["id", "type"]
                },
                "Bounds": {
                    "type": "object",
                    "properties": {
                        "x": {"type": "number"},
                        "y": {"type": "number"},
                        "width": {"type": "number"},
                        "height": {"type": "number"}
                    },
                    "required": ["x", "y", "width", "height"]
                }
            },
            "required": ["id", "diagramType", "revision", "root", "elements"]
        })
        .to_string()
    }

    fn get_node_schema(&self) -> String {
        json!({
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "title": "Node Element",
            "properties": {
                "id": {"type": "string"},
                "type": {"type": "string"},
                "position": {
                    "type": "object",
                    "properties": {
                        "x": {"type": "number"},
                        "y": {"type": "number"}
                    },
                    "required": ["x", "y"]
                },
                "size": {
                    "type": "object",
                    "properties": {
                        "width": {"type": "number"},
                        "height": {"type": "number"}
                    }
                },
                "label": {"type": "string"},
                "properties": {"type": "object"}
            },
            "required": ["id", "type", "position"]
        })
        .to_string()
    }

    fn get_edge_schema(&self) -> String {
        json!({
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "title": "Edge Element",
            "properties": {
                "id": {"type": "string"},
                "type": {"type": "string"},
                "sourceId": {"type": "string"},
                "targetId": {"type": "string"},
                "routingPoints": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "x": {"type": "number"},
                            "y": {"type": "number"}
                        },
                        "required": ["x", "y"]
                    }
                },
                "label": {"type": "string"},
                "properties": {"type": "object"}
            },
            "required": ["id", "type", "sourceId", "targetId"]
        })
        .to_string()
    }

    fn get_diagram_list(&self, tools: &DiagramTools) -> String {
        // Get diagrams from memory (already loaded)
        let mut diagrams: Vec<Value> = tools
            .list_diagrams()
            .iter()
            .map(|diagram| {
                json!({
                    "id": diagram.id,
                    "name": diagram.name,
                    "type": diagram.diagram_type,
                    "revision": diagram.revision,
                    "elementCount": diagram.elements.len(),
                    "uri": format!("diagram://model/{}", diagram.id)
                })
            })
            .collect();

        // Also check for diagrams on disk that might not be loaded yet
        // This is a simple synchronous check - just list the files
        if let Ok(entries) = std::fs::read_dir(tools.get_diagrams_path()) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(file_name) = path.file_name() {
                    let name = file_name.to_string_lossy();
                    if name.ends_with(".glsp.json") {
                        // Try to read just the basic info
                        if let Ok(content) = std::fs::read_to_string(&path) {
                            if let Ok(json_value) =
                                serde_json::from_str::<serde_json::Value>(&content)
                            {
                                let id = json_value["id"].as_str().unwrap_or("");
                                let diagram_name = json_value["name"].as_str().unwrap_or("");
                                let diagram_type =
                                    json_value["diagram_type"].as_str().unwrap_or("unknown");

                                // Check if this diagram is already in the list
                                let already_loaded = diagrams.iter().any(|d| d["id"] == id);

                                if !already_loaded && !id.is_empty() {
                                    diagrams.push(json!({
                                        "id": id,
                                        "name": diagram_name,
                                        "type": diagram_type,
                                        "revision": json_value["revision"].as_u64().unwrap_or(0),
                                        "elementCount": 0, // We don't know without fully loading
                                        "uri": format!("diagram://model/{}", id)
                                    }));
                                }
                            }
                        }
                    }
                }
            }
        }

        json!({
            "diagrams": diagrams,
            "total": diagrams.len()
        })
        .to_string()
    }

    fn get_diagram_model(&self, diagram_id: &str, tools: &DiagramTools) -> Result<ResourceContent> {
        let diagram = tools
            .get_diagram(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found: {}", diagram_id))?;

        Ok(ResourceContent {
            uri: format!("diagram://model/{diagram_id}"),
            mime_type: Some("application/vnd.glsp-model+json".to_string()),
            text: Some(serde_json::to_string_pretty(diagram)?),
            blob: None,
        })
    }

    fn get_diagram_elements(
        &self,
        diagram_id: &str,
        tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        let diagram = tools
            .get_diagram(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found: {}", diagram_id))?;

        let elements: Vec<Value> = diagram
            .elements
            .values()
            .filter(|element| element.element_type != ElementType::Graph)
            .map(|element| {
                let mut elem_json = json!({
                    "id": element.id,
                    "type": element.element_type,
                    "properties": element.properties
                });

                if let Some(bounds) = &element.bounds {
                    elem_json["bounds"] = json!({
                        "x": bounds.x,
                        "y": bounds.y,
                        "width": bounds.width,
                        "height": bounds.height
                    });
                }

                if let Some(children) = &element.children {
                    elem_json["children"] = json!(children);
                }

                elem_json
            })
            .collect();

        Ok(ResourceContent {
            uri: format!("diagram://elements/{diagram_id}"),
            mime_type: Some("application/json".to_string()),
            text: Some(
                json!({
                    "elements": elements,
                    "count": elements.len()
                })
                .to_string(),
            ),
            blob: None,
        })
    }

    fn get_diagram_metadata(
        &self,
        diagram_id: &str,
        tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        let diagram = tools
            .get_diagram(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found: {}", diagram_id))?;

        let node_count = diagram
            .elements
            .values()
            .filter(|e| e.element_type.is_node_like())
            .count();

        let edge_count = diagram
            .elements
            .values()
            .filter(|e| e.element_type.is_edge_like())
            .count();

        let element_types: std::collections::HashMap<String, usize> = diagram
            .elements
            .values()
            .filter(|e| e.element_type != ElementType::Graph)
            .fold(std::collections::HashMap::new(), |mut acc, element| {
                *acc.entry(element.element_type.to_string()).or_insert(0) += 1;
                acc
            });

        Ok(ResourceContent {
            uri: format!("diagram://metadata/{diagram_id}"),
            mime_type: Some("application/json".to_string()),
            text: Some(
                json!({
                    "id": diagram.id,
                    "type": diagram.diagram_type,
                    "revision": diagram.revision,
                    "statistics": {
                        "totalElements": diagram.elements.len() - 1, // exclude root
                        "nodes": node_count,
                        "edges": edge_count,
                        "elementTypes": element_types
                    },
                    "lastModified": chrono::Utc::now().to_rfc3339()
                })
                .to_string(),
            ),
            blob: None,
        })
    }

    fn get_validation_results(
        &self,
        diagram_id: &str,
        tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        let diagram = tools
            .get_diagram(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found: {}", diagram_id))?;

        // Simple validation - check for disconnected nodes
        let mut issues = Vec::new();

        for (element_id, element) in &diagram.elements {
            if element.element_type.is_node_like() {
                // Check if node has any connections
                let has_connections = diagram.elements.values().any(|e| {
                    e.element_type.is_edge_like()
                        && (e.source_id.as_ref() == Some(element_id)
                            || e.target_id.as_ref() == Some(element_id))
                });

                if !has_connections && diagram.elements.len() > 2 {
                    // more than just root and this element
                    issues.push(json!({
                        "elementId": element_id,
                        "severity": "warning",
                        "message": "Node has no connections",
                        "description": "This node is not connected to any other elements in the diagram"
                    }));
                }
            }
        }

        Ok(ResourceContent {
            uri: format!("diagram://validation/{diagram_id}"),
            mime_type: Some("application/json".to_string()),
            text: Some(
                json!({
                    "diagramId": diagram_id,
                    "isValid": issues.is_empty(),
                    "issues": issues,
                    "summary": {
                        "errors": issues.iter().filter(|i| i["severity"] == "error").count(),
                        "warnings": issues.iter().filter(|i| i["severity"] == "warning").count(),
                        "info": issues.iter().filter(|i| i["severity"] == "info").count()
                    }
                })
                .to_string(),
            ),
            blob: None,
        })
    }

    fn get_wasm_components_list(&self, tools: &DiagramTools) -> String {
        let components = tools.get_wasm_components();

        let component_list: Vec<Value> = components
            .iter()
            .map(|component| {
                json!({
                    "name": component.name,
                    "path": component.path,
                    "description": component.description,
                    "status": if component.file_exists { "available" } else { "missing" },
                    "interfaces": component.interfaces.len(),
                    "uri": format!("wasm://component/{}", component.name)
                })
            })
            .collect();

        json!({
            "components": component_list,
            "total": component_list.len(),
            "available": components.iter().filter(|c| c.file_exists).count(),
            "missing": components.iter().filter(|c| !c.file_exists).count()
        })
        .to_string()
    }

    fn get_missing_components(&self, tools: &DiagramTools) -> String {
        let components = tools.get_wasm_components();
        let missing: Vec<Value> = components
            .iter()
            .filter(|c| !c.file_exists)
            .map(|component| {
                json!({
                    "name": component.name,
                    "path": component.path,
                    "description": component.description,
                    "lastSeen": component.last_seen,
                    "removedAt": component.removed_at
                })
            })
            .collect();

        json!({
            "missingComponents": missing,
            "count": missing.len()
        })
        .to_string()
    }

    fn get_wasm_status(&self, tools: &DiagramTools) -> String {
        let components = tools.get_wasm_components();
        let total = components.len();
        let available = components.iter().filter(|c| c.file_exists).count();
        let missing = total - available;

        json!({
            "watchPath": tools.get_wasm_watch_path(),
            "totalComponents": total,
            "availableComponents": available,
            "missingComponents": missing,
            "healthPercentage": if total > 0 { (available as f64 / total as f64) * 100.0 } else { 100.0 },
            "lastScan": tools.get_last_wasm_scan_time(),
            "status": if missing == 0 { "healthy" } else if missing < total / 2 { "degraded" } else { "critical" }
        }).to_string()
    }

    fn get_wasm_component_details(
        &self,
        component_name: &str,
        tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        let component = tools
            .get_wasm_component(component_name)
            .ok_or_else(|| anyhow::anyhow!("WASM component not found: {}", component_name))?;

        Ok(ResourceContent {
            uri: format!("wasm://component/{component_name}"),
            mime_type: Some("application/json".to_string()),
            text: Some(
                json!({
                    "name": component.name,
                    "path": component.path,
                    "description": component.description,
                    "fileExists": component.file_exists,
                    "lastSeen": component.last_seen,
                    "removedAt": component.removed_at,
                    "interfaces": component.interfaces,
                    "metadata": component.metadata,
                    "witInterfaces": component.wit_interfaces,
                    "dependencies": component.dependencies
                })
                .to_string(),
            ),
            blob: None,
        })
    }

    // WIT Analysis Methods
    fn get_wit_interfaces_overview(&self, tools: &DiagramTools) -> String {
        let components = tools.get_wasm_components();
        let mut interface_summary = std::collections::HashMap::new();
        let mut total_imports = 0;
        let mut total_exports = 0;

        for component in &components {
            for interface in &component.interfaces {
                let entry = interface_summary
                    .entry(interface.name.clone())
                    .or_insert_with(|| {
                        json!({
                            "name": interface.name,
                            "type": interface.interface_type,
                            "functions": interface.functions.len(),
                            "components": Vec::<String>::new()
                        })
                    });

                if let Some(components_array) = entry["components"].as_array_mut() {
                    components_array.push(json!(component.name));
                }

                match interface.interface_type.as_str() {
                    "import" => total_imports += 1,
                    "export" => total_exports += 1,
                    _ => {}
                }
            }
        }

        json!({
            "summary": {
                "totalInterfaces": interface_summary.len(),
                "totalImports": total_imports,
                "totalExports": total_exports,
                "componentsAnalyzed": components.len()
            },
            "interfaces": interface_summary.values().collect::<Vec<_>>()
        })
        .to_string()
    }

    fn get_wit_types_catalog(&self, tools: &DiagramTools) -> String {
        let components = tools.get_wasm_components();
        let mut type_definitions = std::collections::HashMap::new();

        for component in &components {
            for interface in &component.interfaces {
                for function in &interface.functions {
                    // Collect parameter types
                    for param in &function.params {
                        type_definitions.insert(
                            param.param_type.clone(),
                            json!({
                                "type": param.param_type,
                                "usedIn": "parameter",
                                "components": [component.name.clone()],
                                "interfaces": [interface.name.clone()]
                            }),
                        );
                    }

                    // Collect return types
                    for ret in &function.returns {
                        type_definitions.insert(
                            ret.param_type.clone(),
                            json!({
                                "type": ret.param_type,
                                "usedIn": "return",
                                "components": [component.name.clone()],
                                "interfaces": [interface.name.clone()]
                            }),
                        );
                    }
                }
            }
        }

        json!({
            "types": type_definitions.values().collect::<Vec<_>>(),
            "totalTypes": type_definitions.len()
        })
        .to_string()
    }

    fn get_wit_dependencies_graph(&self, tools: &DiagramTools) -> String {
        let components = tools.get_wasm_components();
        let mut dependencies = Vec::new();
        let mut nodes = std::collections::HashMap::new();

        for component in &components {
            nodes.insert(
                component.name.clone(),
                json!({
                    "id": component.name,
                    "type": "component",
                    "interfaces": component.interfaces.len(),
                    "dependencies": component.dependencies.len()
                }),
            );

            for dep in &component.dependencies {
                dependencies.push(json!({
                    "source": component.name,
                    "target": dep,
                    "type": "dependency"
                }));
            }
        }

        json!({
            "nodes": nodes.values().collect::<Vec<_>>(),
            "edges": dependencies,
            "statistics": {
                "totalNodes": nodes.len(),
                "totalEdges": dependencies.len()
            }
        })
        .to_string()
    }

    fn get_component_wit_analysis(
        &self,
        component_name: &str,
        tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        let component = tools
            .get_wasm_component(component_name)
            .ok_or_else(|| anyhow::anyhow!("WASM component not found: {}", component_name))?;

        // Analyze WIT interfaces specifically
        let mut imports = Vec::new();
        let mut exports = Vec::new();

        for interface in &component.interfaces {
            let interface_data = json!({
                "name": interface.name,
                "functions": interface.functions.iter().map(|f| json!({
                    "name": f.name,
                    "parameters": f.params.iter().map(|p| json!({
                        "name": p.name,
                        "type": p.param_type
                    })).collect::<Vec<_>>(),
                    "returns": f.returns.iter().map(|r| json!({
                        "name": r.name,
                        "type": r.param_type
                    })).collect::<Vec<_>>()
                })).collect::<Vec<_>>()
            });

            match interface.interface_type.as_str() {
                "import" => imports.push(interface_data),
                "export" => exports.push(interface_data),
                _ => {}
            }
        }

        Ok(ResourceContent {
            uri: format!("wasm://component/{component_name}/wit"),
            mime_type: Some("application/json".to_string()),
            text: Some(
                json!({
                    "componentName": component.name,
                    "witAnalysis": {
                        "imports": imports,
                        "exports": exports,
                        "summary": {
                            "totalImports": imports.len(),
                            "totalExports": exports.len(),
                            "totalFunctions": component.interfaces.iter()
                                .map(|i| i.functions.len())
                                .sum::<usize>()
                        }
                    },
                    "metadata": component.metadata,
                    "dependencies": component.dependencies
                })
                .to_string(),
            ),
            blob: None,
        })
    }

    fn get_component_raw_wit(
        &self,
        component_name: &str,
        tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        let component = tools
            .get_wasm_component(component_name)
            .ok_or_else(|| anyhow::anyhow!("WASM component not found: {}", component_name))?;

        let wit_content = component
            .wit_interfaces
            .clone()
            .unwrap_or_else(|| "// No WIT content available for this component".to_string());

        Ok(ResourceContent {
            uri: format!("wasm://component/{component_name}/wit/raw"),
            mime_type: Some("text/plain".to_string()),
            text: Some(wit_content),
            blob: None,
        })
    }

    fn get_component_interfaces(
        &self,
        component_name: &str,
        tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        let component = tools
            .get_wasm_component(component_name)
            .ok_or_else(|| anyhow::anyhow!("WASM component not found: {}", component_name))?;

        Ok(ResourceContent {
            uri: format!("wasm://component/{component_name}/interfaces"),
            mime_type: Some("application/json".to_string()),
            text: Some(
                json!({
                    "componentName": component.name,
                    "interfaces": component.interfaces,
                    "totalInterfaces": component.interfaces.len()
                })
                .to_string(),
            ),
            blob: None,
        })
    }

    // Selection resource methods
    fn get_selection_list(&self, tools: &DiagramTools) -> String {
        let diagrams = tools.list_diagrams();
        let selections: Vec<Value> = diagrams
            .iter()
            .map(|diagram| {
                let selected_count = tools.get_selected_elements(&diagram.id).len();
                json!({
                    "diagramId": diagram.id,
                    "diagramType": diagram.diagram_type,
                    "selectedCount": selected_count,
                    "uri": format!("selection://current/{}", diagram.id)
                })
            })
            .collect();

        json!({
            "selections": selections,
            "total": selections.len()
        })
        .to_string()
    }

    fn get_current_selection(
        &self,
        diagram_id: &str,
        tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        let diagram = tools
            .get_diagram(diagram_id)
            .ok_or_else(|| anyhow::anyhow!("Diagram not found: {}", diagram_id))?;

        let selected_elements = tools.get_selected_elements(diagram_id);
        let hovered_element = tools.get_hovered_element(diagram_id);

        let selected_details: Vec<Value> = selected_elements
            .iter()
            .filter_map(|id| diagram.elements.get(id))
            .map(|element| {
                json!({
                    "id": element.id,
                    "type": element.element_type,
                    "label": element.properties.get("label").cloned().unwrap_or_default(),
                    "bounds": element.bounds.as_ref().map(|b| json!({
                        "x": b.x,
                        "y": b.y,
                        "width": b.width,
                        "height": b.height
                    }))
                })
            })
            .collect();

        Ok(ResourceContent {
            uri: format!("selection://current/{diagram_id}"),
            mime_type: Some("application/json".to_string()),
            text: Some(
                json!({
                    "diagramId": diagram_id,
                    "selectedIds": selected_elements,
                    "selectedElements": selected_details,
                    "selectedCount": selected_elements.len(),
                    "hoveredId": hovered_element
                })
                .to_string(),
            ),
            blob: None,
        })
    }

    fn get_element_at_position_from_uri(
        &self,
        path: &str,
        tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        // Parse path like: {diagramId}?x={x}&y={y}
        let (diagram_id, query) = if let Some(pos) = path.find('?') {
            (&path[..pos], &path[pos + 1..])
        } else {
            return Err(anyhow!("Missing query parameters for element-at position"));
        };

        // Parse query parameters
        let mut x = None;
        let mut y = None;
        for param in query.split('&') {
            if let Some((key, value)) = param.split_once('=') {
                match key {
                    "x" => x = value.parse::<f64>().ok(),
                    "y" => y = value.parse::<f64>().ok(),
                    _ => {}
                }
            }
        }

        let x = x.ok_or_else(|| anyhow!("Missing x parameter"))?;
        let y = y.ok_or_else(|| anyhow!("Missing y parameter"))?;

        let element_id = tools.find_element_at_position(diagram_id, Position { x, y });

        Ok(ResourceContent {
            uri: format!("selection://element-at/{path}"),
            mime_type: Some("application/json".to_string()),
            text: Some(
                json!({
                    "diagramId": diagram_id,
                    "position": { "x": x, "y": y },
                    "elementId": element_id,
                    "found": element_id.is_some()
                })
                .to_string(),
            ),
            blob: None,
        })
    }

    // Sensor data resource methods
    async fn get_sensors_list(&self, tools: &DiagramTools) -> Result<String> {
        if let Some(dataset_manager) = &tools.dataset_manager {
            let manager = dataset_manager.lock().await;
            // Get the database backend
            let db = manager.backend();
            let sensors = db.list_sensors().await?;

            Ok(json!({
                "sensors": sensors,
                "total": sensors.len()
            })
            .to_string())
        } else {
            Ok(json!({
                "error": "Database not configured",
                "sensors": [],
                "total": 0
            })
            .to_string())
        }
    }

    async fn get_sensor_metadata(
        &self,
        sensor_id: &str,
        tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        if let Some(dataset_manager) = &tools.dataset_manager {
            let manager = dataset_manager.lock().await;
            let db = manager.backend();
            let metadata = db.get_sensor_metadata(sensor_id).await?;

            Ok(ResourceContent {
                uri: format!("sensor://metadata/{sensor_id}"),
                mime_type: Some("application/json".to_string()),
                text: Some(serde_json::to_string_pretty(&metadata)?),
                blob: None,
            })
        } else {
            Err(anyhow!("Database not configured"))
        }
    }

    async fn get_sensor_statistics(
        &self,
        sensor_id: &str,
        tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        if let Some(dataset_manager) = &tools.dataset_manager {
            let manager = dataset_manager.lock().await;
            let db = manager.backend();
            let stats = db.get_sensor_statistics(sensor_id).await?;

            Ok(ResourceContent {
                uri: format!("sensor://statistics/{sensor_id}"),
                mime_type: Some("application/json".to_string()),
                text: Some(serde_json::to_string_pretty(&stats)?),
                blob: None,
            })
        } else {
            Err(anyhow!("Database not configured"))
        }
    }

    async fn get_sensor_time_range(
        &self,
        sensor_id: &str,
        tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        if let Some(dataset_manager) = &tools.dataset_manager {
            let manager = dataset_manager.lock().await;
            let db = manager.backend();
            let time_range = db.get_time_range(sensor_id).await?;

            Ok(ResourceContent {
                uri: format!("sensor://time-range/{sensor_id}"),
                mime_type: Some("application/json".to_string()),
                text: Some(
                    json!({
                        "sensorId": sensor_id,
                        "timeRange": time_range
                    })
                    .to_string(),
                ),
                blob: None,
            })
        } else {
            Err(anyhow!("Database not configured"))
        }
    }

    async fn query_sensor_data_from_uri(
        &self,
        uri: &str,
        _tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        // Parse query parameters from URI
        let _query_str = uri
            .strip_prefix("sensor://data?")
            .ok_or_else(|| anyhow!("Invalid sensor data URI"))?;

        // TODO: Implement query parameter parsing and sensor data query
        // This would parse parameters like sensorIds, startTime, endTime

        Ok(ResourceContent {
            uri: uri.to_string(),
            mime_type: Some("application/json".to_string()),
            text: Some(
                json!({
                    "error": "Query parameter parsing not yet implemented",
                    "uri": uri
                })
                .to_string(),
            ),
            blob: None,
        })
    }

    async fn detect_sensor_gaps(
        &self,
        sensor_id: &str,
        tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        if let Some(dataset_manager) = &tools.dataset_manager {
            let manager = dataset_manager.lock().await;
            let db = manager.backend();
            // Get time range first
            let time_range = db.get_time_range(sensor_id).await?;
            if let Some(range) = time_range {
                // Detect gaps with 60 second threshold (60 * 1_000_000 microseconds)
                let gaps = db
                    .detect_gaps(
                        sensor_id,
                        range.start_time_us,
                        range.end_time_us,
                        60_000_000,
                    )
                    .await?;

                Ok(ResourceContent {
                    uri: format!("sensor://gaps/{sensor_id}"),
                    mime_type: Some("application/json".to_string()),
                    text: Some(
                        json!({
                            "sensorId": sensor_id,
                            "gaps": gaps,
                            "totalGaps": gaps.len()
                        })
                        .to_string(),
                    ),
                    blob: None,
                })
            } else {
                Ok(ResourceContent {
                    uri: format!("sensor://gaps/{sensor_id}"),
                    mime_type: Some("application/json".to_string()),
                    text: Some(
                        json!({
                            "sensorId": sensor_id,
                            "error": "No data available for sensor",
                            "gaps": [],
                            "totalGaps": 0
                        })
                        .to_string(),
                    ),
                    blob: None,
                })
            }
        } else {
            Err(anyhow!("Database not configured"))
        }
    }

    async fn visualize_sensor_data_from_uri(
        &self,
        path: &str,
        _tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        // Parse path like: {sensorId}?type={visualizationType}
        let (sensor_id, _query) = if let Some(pos) = path.find('?') {
            (&path[..pos], &path[pos + 1..])
        } else {
            (path, "")
        };

        // TODO: Implement visualization generation based on type parameter

        Ok(ResourceContent {
            uri: format!("sensor://visualization/{path}"),
            mime_type: Some("application/json".to_string()),
            text: Some(
                json!({
                    "sensorId": sensor_id,
                    "visualization": "Visualization generation not yet implemented"
                })
                .to_string(),
            ),
            blob: None,
        })
    }

    // Dataset resource methods
    async fn get_datasets_list(&self, tools: &DiagramTools) -> Result<String> {
        if let Some(dataset_manager) = &tools.dataset_manager {
            let manager = dataset_manager.lock().await;
            let datasets = manager.list_datasets().await?;

            Ok(json!({
                "datasets": datasets,
                "total": datasets.len()
            })
            .to_string())
        } else {
            Ok(json!({
                "error": "Database not configured",
                "datasets": [],
                "total": 0
            })
            .to_string())
        }
    }

    async fn get_dataset_info(
        &self,
        dataset_id: &str,
        tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        if let Some(dataset_manager) = &tools.dataset_manager {
            let manager = dataset_manager.lock().await;
            let dataset = manager.get_dataset(dataset_id).await?;

            Ok(ResourceContent {
                uri: format!("dataset://info/{dataset_id}"),
                mime_type: Some("application/json".to_string()),
                text: Some(serde_json::to_string_pretty(&dataset)?),
                blob: None,
            })
        } else {
            Err(anyhow!("Database not configured"))
        }
    }

    // WASM execution resource methods
    fn get_executions_list(&self, tools: &DiagramTools) -> String {
        let executions = tools.list_wasm_executions_for_resource();

        json!({
            "executions": executions,
            "total": executions.len()
        })
        .to_string()
    }

    fn get_execution_progress(
        &self,
        execution_id: &str,
        tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        let progress = tools
            .get_execution_progress_for_resource(execution_id)
            .ok_or_else(|| anyhow!("Execution not found: {}", execution_id))?;

        Ok(ResourceContent {
            uri: format!("wasm://executions/{execution_id}/progress"),
            mime_type: Some("application/json".to_string()),
            text: Some(serde_json::to_string_pretty(&progress)?),
            blob: None,
        })
    }

    fn get_execution_result(
        &self,
        execution_id: &str,
        tools: &DiagramTools,
    ) -> Result<ResourceContent> {
        let result = tools
            .get_execution_result_for_resource(execution_id)
            .ok_or_else(|| anyhow!("Execution result not found: {}", execution_id))?;

        Ok(ResourceContent {
            uri: format!("wasm://executions/{execution_id}/result"),
            mime_type: Some("application/json".to_string()),
            text: Some(serde_json::to_string_pretty(&result)?),
            blob: None,
        })
    }

    fn get_uploaded_components_list(&self, tools: &DiagramTools) -> String {
        let uploaded = tools.list_uploaded_components_for_resource();

        json!({
            "components": uploaded,
            "total": uploaded.len()
        })
        .to_string()
    }
}
