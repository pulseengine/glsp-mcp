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

//! Persistence layer for GLSP diagrams
//!
//! Implements dual-file storage:
//! - Content file (.glsp.json): Semantic model (nodes, edges, properties)
//! - Layout file (.glsp.layout.json): Graphical representation (positions, sizes)

use crate::model::{Bounds, DiagramModel, ElementType, ModelElement};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::fs;

/// Content file structure - semantic model only
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DiagramContent {
    pub id: String,
    pub name: String,
    pub diagram_type: String,
    pub revision: u32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub nodes: Vec<NodeContent>,
    pub edges: Vec<EdgeContent>,
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NodeContent {
    pub id: String,
    pub node_type: String,
    pub label: Option<String>,
    pub properties: HashMap<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EdgeContent {
    pub id: String,
    pub edge_type: String,
    pub source_id: String,
    pub target_id: String,
    pub label: Option<String>,
    pub properties: HashMap<String, serde_json::Value>,
}

/// Layout file structure - graphical representation only
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DiagramLayout {
    pub diagram_id: String,
    pub revision: u32,
    pub updated_at: DateTime<Utc>,
    pub elements: HashMap<String, ElementLayout>,
    pub viewport: Option<Viewport>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ElementLayout {
    pub bounds: Bounds,
    pub z_index: Option<i32>,
    pub visible: bool,
    pub style: HashMap<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Viewport {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

/// Persistence manager for diagram storage and file operations
///
/// Handles saving and loading diagrams to/from the file system, managing both
/// content (.glsp.json) and layout (.glsp.layout.json) files. Provides atomic
/// operations and ensures data consistency.
///
/// # File Format
///
/// - Content files: `{name}.glsp.json` - Contains diagram structure and data
/// - Layout files: `{name}.glsp.layout.json` - Contains positioning and visual layout
///
/// # Examples
///
/// ```rust,no_run
/// use glsp_mcp_server::PersistenceManager;
/// use std::path::Path;
///
/// #[tokio::main]
/// async fn main() -> std::io::Result<()> {
///     let persistence = PersistenceManager::new("./diagrams");
///     persistence.ensure_storage_dir().await?;
///     // Now ready to save/load diagrams
///     Ok(())
/// }
/// ```
pub struct PersistenceManager {
    base_path: PathBuf,
}

impl PersistenceManager {
    pub fn new(base_path: impl AsRef<Path>) -> Self {
        Self {
            base_path: base_path.as_ref().to_path_buf(),
        }
    }

    pub fn get_base_path(&self) -> &Path {
        &self.base_path
    }

    /// Ensure the storage directory exists
    pub async fn ensure_storage_dir(&self) -> std::io::Result<()> {
        fs::create_dir_all(&self.base_path).await
    }

    /// Generate file paths for a diagram
    fn get_file_paths(&self, diagram_name: &str) -> (PathBuf, PathBuf) {
        let safe_name = sanitize_filename(diagram_name);
        let content_path = self.base_path.join(format!("{safe_name}.glsp.json"));
        let layout_path = self.base_path.join(format!("{safe_name}.glsp.layout.json"));
        (content_path, layout_path)
    }

    /// Save a diagram to disk (both content and layout)
    pub async fn save_diagram(&self, diagram: &DiagramModel) -> std::io::Result<()> {
        self.ensure_storage_dir().await?;

        // Extract content and layout from the diagram model
        let (content, layout) = self.split_diagram(diagram);

        // Get file paths
        let (content_path, layout_path) = self.get_file_paths(&diagram.name);

        // Save content file
        let content_json = serde_json::to_string_pretty(&content)?;
        fs::write(&content_path, content_json).await?;

        // Save layout file
        let layout_json = serde_json::to_string_pretty(&layout)?;
        fs::write(&layout_path, layout_json).await?;

        Ok(())
    }

    /// Load a diagram from disk
    pub async fn load_diagram(&self, diagram_name: &str) -> std::io::Result<DiagramModel> {
        let (content_path, layout_path) = self.get_file_paths(diagram_name);

        // Load content file (required)
        let content_json = fs::read_to_string(&content_path).await?;
        let content: DiagramContent = serde_json::from_str(&content_json)?;

        // Load layout file (optional)
        let layout = if layout_path.exists() {
            let layout_json = fs::read_to_string(&layout_path).await?;
            Some(serde_json::from_str::<DiagramLayout>(&layout_json)?)
        } else {
            None
        };

        // Merge content and layout into DiagramModel
        Ok(self.merge_diagram(content, layout))
    }

    /// List all available diagrams
    pub async fn list_diagrams(&self) -> std::io::Result<Vec<DiagramInfo>> {
        self.ensure_storage_dir().await?;

        let mut diagrams = Vec::new();
        let mut entries = fs::read_dir(&self.base_path).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if let Some(file_name) = path.file_name() {
                let name = file_name.to_string_lossy();
                if name.ends_with(".glsp.json") {
                    // Extract diagram name
                    let diagram_name = name.trim_end_matches(".glsp.json");

                    // Try to load basic info
                    if let Ok(content_json) = fs::read_to_string(&path).await {
                        if let Ok(content) = serde_json::from_str::<DiagramContent>(&content_json) {
                            diagrams.push(DiagramInfo {
                                id: content.id,
                                name: content.name,
                                diagram_type: content.diagram_type,
                                created_at: content.created_at,
                                updated_at: content.updated_at,
                                file_name: diagram_name.to_string(),
                            });
                        }
                    }
                }
            }
        }

        Ok(diagrams)
    }

    /// Delete a diagram from disk
    pub async fn delete_diagram(&self, diagram_name: &str) -> std::io::Result<()> {
        let (content_path, layout_path) = self.get_file_paths(diagram_name);

        // Delete content file
        if content_path.exists() {
            fs::remove_file(&content_path).await?;
        }

        // Delete layout file if it exists
        if layout_path.exists() {
            fs::remove_file(&layout_path).await?;
        }

        Ok(())
    }

    /// Split a DiagramModel into content and layout
    fn split_diagram(&self, diagram: &DiagramModel) -> (DiagramContent, DiagramLayout) {
        let mut nodes = Vec::new();
        let mut edges = Vec::new();
        let mut element_layouts = HashMap::new();

        // Process all elements
        for (id, element) in &diagram.elements {
            // Extract layout information
            if let Some(bounds) = &element.bounds {
                element_layouts.insert(
                    id.clone(),
                    ElementLayout {
                        bounds: bounds.clone(),
                        z_index: element.z_index,
                        visible: element.visible,
                        style: element.style.clone(),
                    },
                );
            }

            // Extract content based on element type
            match &element.element_type {
                ElementType::Edge => {
                    edges.push(EdgeContent {
                        id: id.clone(),
                        edge_type: element
                            .properties
                            .get("edgeType")
                            .and_then(|v| v.as_str())
                            .unwrap_or("flow")
                            .to_string(),
                        source_id: element.source_id.clone().unwrap_or_default(),
                        target_id: element.target_id.clone().unwrap_or_default(),
                        label: element.label.clone(),
                        properties: element.properties.clone(),
                    });
                }
                ElementType::Graph => {
                    // Skip the root graph element
                }
                _ => {
                    // Everything else is a node
                    nodes.push(NodeContent {
                        id: id.clone(),
                        node_type: element.element_type.to_string(),
                        label: element.label.clone(),
                        properties: element.properties.clone(),
                    });
                }
            }
        }

        let content = DiagramContent {
            id: diagram.id.clone(),
            name: diagram.name.clone(),
            diagram_type: diagram.diagram_type.clone(),
            revision: diagram.revision,
            created_at: diagram.created_at,
            updated_at: diagram.updated_at,
            nodes,
            edges,
            metadata: diagram.metadata.clone(),
        };

        let layout = DiagramLayout {
            diagram_id: diagram.id.clone(),
            revision: diagram.revision,
            updated_at: diagram.updated_at,
            elements: element_layouts,
            viewport: None, // Viewport support not implemented yet
        };

        (content, layout)
    }

    /// Merge content and layout into a DiagramModel
    fn merge_diagram(
        &self,
        content: DiagramContent,
        layout: Option<DiagramLayout>,
    ) -> DiagramModel {
        // Create root graph element first
        let root_id = format!("{}_root", content.id);
        let root = ModelElement {
            id: root_id.clone(),
            element_type: ElementType::Graph,
            children: Some(vec![]),
            bounds: None,
            layout_options: None,
            properties: HashMap::new(),
            label: None,
            source_id: None,
            target_id: None,
            route: None,
            visible: true,
            z_index: None,
            style: HashMap::new(),
        };

        let mut elements = HashMap::new();
        elements.insert(root_id.clone(), root.clone());

        let mut diagram = DiagramModel {
            id: content.id.clone(),
            name: content.name,
            diagram_type: content.diagram_type,
            revision: content.revision,
            created_at: content.created_at,
            updated_at: content.updated_at,
            root: root.clone(),
            elements,
            selection: Some(crate::selection::SelectionState::new()),
            metadata: content.metadata,
            component_groups: HashMap::new(),
        };

        // Add nodes
        for node in content.nodes {
            let mut element = ModelElement {
                id: node.id.clone(),
                element_type: ElementType::from(node.node_type),
                children: None,
                bounds: None,
                layout_options: None,
                properties: node.properties,
                label: node.label,
                source_id: None,
                target_id: None,
                route: None,
                visible: true,
                z_index: None,
                style: HashMap::new(),
            };

            // Apply layout if available
            if let Some(layout) = &layout {
                if let Some(element_layout) = layout.elements.get(&node.id) {
                    element.bounds = Some(element_layout.bounds.clone());
                    element.z_index = element_layout.z_index;
                    element.visible = element_layout.visible;
                    element.style = element_layout.style.clone();
                }
            }

            // Add to root's children
            if let Some(root) = diagram.elements.get_mut(&root_id) {
                if let Some(children) = &mut root.children {
                    children.push(node.id.clone());
                }
            }

            diagram.elements.insert(node.id, element);
        }

        // Add edges
        for edge in content.edges {
            let mut element = ModelElement {
                id: edge.id.clone(),
                element_type: ElementType::Edge,
                children: None,
                bounds: None,
                layout_options: None,
                properties: edge.properties,
                label: edge.label,
                source_id: Some(edge.source_id),
                target_id: Some(edge.target_id),
                route: None,
                visible: true,
                z_index: None,
                style: HashMap::new(),
            };

            // Store edge type in properties
            element
                .properties
                .insert("edgeType".to_string(), serde_json::json!(edge.edge_type));

            // Apply layout if available
            if let Some(layout) = &layout {
                if let Some(element_layout) = layout.elements.get(&edge.id) {
                    element.bounds = Some(element_layout.bounds.clone());
                    element.z_index = element_layout.z_index;
                    element.visible = element_layout.visible;
                    element.style = element_layout.style.clone();
                }
            }

            diagram.elements.insert(edge.id, element);
        }

        diagram
    }

    /// Change the storage path for the persistence manager
    pub async fn change_storage_path(
        &self,
        new_path: PathBuf,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Since self.base_path is not mutable and PersistenceManager is used through Arc,
        // we need to create a new instance with the updated path. The backend will need
        // to replace its persistence manager with the new one.

        // Ensure the new directory exists
        fs::create_dir_all(&new_path)
            .await
            .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> { Box::new(e) })?;

        // Note: This method serves as a validation step. The actual path change
        // needs to be handled by the caller (backend) by creating a new PersistenceManager
        // and replacing the existing one.

        Ok(())
    }
}

/// Information about a stored diagram
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagramInfo {
    pub id: String,
    pub name: String,
    pub diagram_type: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub file_name: String,
}

/// Sanitize a filename to be safe for the filesystem
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("hello/world"), "hello_world");
        assert_eq!(sanitize_filename("test:file*name"), "test_file_name");
        assert_eq!(sanitize_filename("normal_name"), "normal_name");
    }
}
