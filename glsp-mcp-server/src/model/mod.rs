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

use crate::selection::SelectionState;
use crate::wasm::ComponentGroup;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;
use std::str::FromStr;
use uuid::Uuid;

/// Core diagram model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagramModel {
    pub id: String,
    pub diagram_type: String,
    pub revision: u32,
    pub root: ModelElement,
    pub elements: HashMap<String, ModelElement>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selection: Option<SelectionState>,
    // Extended fields for persistence
    #[serde(default = "default_name")]
    pub name: String,
    #[serde(default = "chrono::Utc::now")]
    pub created_at: chrono::DateTime<chrono::Utc>,
    #[serde(default = "chrono::Utc::now")]
    pub updated_at: chrono::DateTime<chrono::Utc>,
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub component_groups: HashMap<String, ComponentGroup>,
}

fn default_name() -> String {
    "Untitled Diagram".to_string()
}

/// Base model element - Core building block for all diagram elements
///
/// Represents any element in a diagram including nodes, edges, containers, and other
/// graphical components. Each element has a unique ID, type, and can contain various
/// properties for styling, positioning, and behavior.
///
/// # Fields
///
/// - `id`: Unique identifier for the element
/// - `element_type`: The type of element (node, edge, container, etc.)
/// - `children`: Optional list of child element IDs for containers
/// - `bounds`: Position and size information for visual elements
/// - `properties`: Key-value pairs for element-specific data
/// - `label`: Optional text label for the element
/// - `source_id`/`target_id`: Connection points for edges
/// - `route`: Path points for edge routing
/// - `visible`: Whether the element should be displayed
/// - `z_index`: Layering order for overlapping elements
/// - `style`: Visual styling properties
///
/// # Examples
///
/// ```rust
/// use glsp_mcp_server::{ModelElement, ElementType, Bounds};
/// use std::collections::HashMap;
///
/// let mut element = ModelElement {
///     id: "node1".to_string(),
///     element_type: ElementType::Node,
///     children: None,
///     bounds: Some(Bounds { x: 100.0, y: 50.0, width: 120.0, height: 80.0 }),
///     layout_options: None,
///     properties: HashMap::new(),
///     label: Some("Process Step".to_string()),
///     source_id: None,
///     target_id: None,
///     route: None,
///     visible: true,
///     z_index: Some(1),
///     style: HashMap::new(),
/// };
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelElement {
    pub id: String,
    #[serde(rename = "type", with = "element_type_serde")]
    pub element_type: ElementType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bounds: Option<Bounds>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout_options: Option<HashMap<String, serde_json::Value>>,
    pub properties: HashMap<String, serde_json::Value>,
    // Extended fields for backend operations
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<Vec<Position>>,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub z_index: Option<i32>,
    #[serde(default)]
    pub style: HashMap<String, serde_json::Value>,
}

fn default_true() -> bool {
    true
}

/// Element bounds/position
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Position coordinate
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

/// Node element
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    #[serde(flatten)]
    pub base: ModelElement,
    pub position: Position,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<Size>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// Size dimensions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

/// Edge element
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    #[serde(flatten)]
    pub base: ModelElement,
    #[serde(rename = "sourceId")]
    pub source_id: String,
    #[serde(rename = "targetId")]
    pub target_id: String,
    #[serde(rename = "routingPoints", skip_serializing_if = "Option::is_none")]
    pub routing_points: Option<Vec<Position>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// Validation marker
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Marker {
    pub label: String,
    pub description: String,
    #[serde(rename = "elementId")]
    pub element_id: String,
    pub kind: String,
    pub severity: MarkerSeverity,
}

/// Marker severity levels
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MarkerSeverity {
    Error,
    Warning,
    Info,
    Hint,
}

/// Element types in the diagram
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ElementType {
    Graph,
    Node,
    Task,
    Edge,
    Workflow,
    Component,
    Port,
    #[serde(untagged)]
    Custom(String),
}

impl ElementType {
    pub fn as_str(&self) -> &str {
        match self {
            ElementType::Graph => "graph",
            ElementType::Node => "node",
            ElementType::Task => "task",
            ElementType::Edge => "edge",
            ElementType::Workflow => "workflow",
            ElementType::Component => "component",
            ElementType::Port => "port",
            ElementType::Custom(s) => s,
        }
    }

    pub fn is_node_like(&self) -> bool {
        matches!(
            self,
            ElementType::Node | ElementType::Task | ElementType::Component
        )
    }

    pub fn is_edge_like(&self) -> bool {
        matches!(self, ElementType::Edge)
    }
}

impl fmt::Display for ElementType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for ElementType {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(match s {
            "graph" => ElementType::Graph,
            "node" => ElementType::Node,
            "task" => ElementType::Task,
            "edge" => ElementType::Edge,
            "workflow" => ElementType::Workflow,
            "component" => ElementType::Component,
            "port" => ElementType::Port,
            other => ElementType::Custom(other.to_string()),
        })
    }
}

impl From<String> for ElementType {
    fn from(s: String) -> Self {
        s.parse().unwrap_or(ElementType::Custom(s))
    }
}

impl From<&str> for ElementType {
    fn from(s: &str) -> Self {
        s.parse().unwrap_or(ElementType::Custom(s.to_string()))
    }
}

/// Serde helper for element_type field
mod element_type_serde {
    use super::ElementType;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S>(element_type: &ElementType, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        element_type.as_str().serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<ElementType, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Ok(ElementType::from(s))
    }
}

impl DiagramModel {
    pub fn new(diagram_type: &str) -> Self {
        let id = Uuid::new_v4().to_string();
        let root_id = format!("{id}_root");

        let root = ModelElement {
            id: root_id.clone(),
            element_type: ElementType::Graph,
            children: Some(Vec::new()),
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

        Self {
            id,
            diagram_type: diagram_type.to_string(),
            revision: 0,
            root,
            elements,
            selection: Some(SelectionState::new()),
            name: default_name(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            metadata: HashMap::new(),
            component_groups: HashMap::new(),
        }
    }

    pub fn add_element(&mut self, element: ModelElement) {
        self.elements.insert(element.id.clone(), element);
        self.revision += 1;
    }

    pub fn remove_element(&mut self, element_id: &str) -> Option<ModelElement> {
        let removed = self.elements.remove(element_id);
        if removed.is_some() {
            self.revision += 1;
        }
        removed
    }

    pub fn get_element(&self, element_id: &str) -> Option<&ModelElement> {
        self.elements.get(element_id)
    }

    pub fn get_element_mut(&mut self, element_id: &str) -> Option<&mut ModelElement> {
        self.elements.get_mut(element_id)
    }

    pub fn add_child_to_root(&mut self, child_id: &str) {
        if let Some(children) = &mut self.root.children {
            if !children.contains(&child_id.to_string()) {
                children.push(child_id.to_string());
            }
        } else {
            self.root.children = Some(vec![child_id.to_string()]);
        }
        self.revision += 1;
    }

    pub fn get_all_element_ids(&self) -> Vec<String> {
        self.elements
            .keys()
            .filter(|id| *id != &self.root.id)
            .cloned()
            .collect()
    }

    pub fn get_element_at_position(&self, x: f64, y: f64, tolerance: f64) -> Option<String> {
        for (id, element) in &self.elements {
            if let Some(bounds) = &element.bounds {
                if x >= bounds.x - tolerance
                    && x <= bounds.x + bounds.width + tolerance
                    && y >= bounds.y - tolerance
                    && y <= bounds.y + bounds.height + tolerance
                {
                    return Some(id.clone());
                }
            }
        }
        None
    }

    pub fn add_component_group(&mut self, group: ComponentGroup) {
        self.component_groups.insert(group.id.clone(), group);
        self.revision += 1;
        self.updated_at = chrono::Utc::now();
    }

    pub fn remove_component_group(&mut self, group_id: &str) -> Option<ComponentGroup> {
        let removed = self.component_groups.remove(group_id);
        if removed.is_some() {
            self.revision += 1;
            self.updated_at = chrono::Utc::now();
        }
        removed
    }

    pub fn get_component_group(&self, group_id: &str) -> Option<&ComponentGroup> {
        self.component_groups.get(group_id)
    }

    pub fn get_component_group_mut(&mut self, group_id: &str) -> Option<&mut ComponentGroup> {
        self.component_groups.get_mut(group_id)
    }

    pub fn list_component_groups(&self) -> Vec<&ComponentGroup> {
        self.component_groups.values().collect()
    }
}

impl Node {
    pub fn new(node_type: &str, position: Position, label: Option<String>) -> Self {
        let id = Uuid::new_v4().to_string();
        let mut properties = HashMap::new();

        if let Some(ref label_text) = label {
            properties.insert(
                "label".to_string(),
                serde_json::Value::String(label_text.clone()),
            );
        }

        Self {
            base: ModelElement {
                id: id.clone(),
                element_type: ElementType::from(node_type),
                children: None,
                bounds: Some(Bounds {
                    x: position.x,
                    y: position.y,
                    width: 100.0,
                    height: 50.0,
                }),
                layout_options: None,
                properties,
                label: label.clone(),
                source_id: None,
                target_id: None,
                route: None,
                visible: true,
                z_index: None,
                style: HashMap::new(),
            },
            position,
            size: Some(Size {
                width: 100.0,
                height: 50.0,
            }),
            label,
        }
    }
}

impl Edge {
    pub fn new(
        edge_type: &str,
        source_id: String,
        target_id: String,
        label: Option<String>,
    ) -> Self {
        let id = Uuid::new_v4().to_string();
        let mut properties = HashMap::new();

        if let Some(ref label_text) = label {
            properties.insert(
                "label".to_string(),
                serde_json::Value::String(label_text.clone()),
            );
        }

        Self {
            base: ModelElement {
                id: id.clone(),
                element_type: ElementType::from(edge_type),
                children: None,
                bounds: None,
                layout_options: None,
                properties,
                label: label.clone(),
                source_id: Some(source_id.clone()),
                target_id: Some(target_id.clone()),
                route: None,
                visible: true,
                z_index: None,
                style: HashMap::new(),
            },
            source_id,
            target_id,
            routing_points: None,
            label,
        }
    }
}
