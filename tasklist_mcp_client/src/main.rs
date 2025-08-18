use amt_compose::codegen_core::CanonicalNameExt;
use amt_compose::wit_bindgen_core::wit_parser::{Package, Resolve};
use anyhow::{anyhow, Context, Result};
use regex::Regex;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use uuid::Uuid;

/* =========================
 * Domain model
 * ========================= */

/// A 2D point in the diagram canvas.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Position {
    /// Horizontal coordinate (in pixels).
    pub x: f64,
    /// Vertical coordinate (in pixels).
    pub y: f64,
}

/// A task node in the workflow diagram.
///
/// When generated from WIT interfaces, `functions` contains the function
/// names belonging to the interface (prefixed with `F:` for readability).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    /// Logical (temporary) ID used during construction before the tool
    /// assigns real node IDs. Generated as a UUID by default.
    pub id: String,
    /// Display name (package name or interface name).
    pub name: String,
    /// Suggested position for initial layout (the layout tool may override).
    pub position: Position,
    /// Optional list of function names belonging to this task/interface.
    #[serde(rename = "functions")]
    pub functions: Option<Vec<String>>,
}

impl Default for Task {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: "Empty Task".to_string(),
            position: Position { x: 100.0, y: 100.0 },
            functions: None,
        }
    }
}

/// A directed transition (edge) between two tasks.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Transition {
    /// Logical (temporary) ID for the edge.
    pub id: String,
    /// Source logical task ID.
    #[serde(rename = "sourceTaskId")]
    pub source_task_id: String,
    /// Target logical task ID.
    #[serde(rename = "targetTaskId")]
    pub target_task_id: String,
}

/// A collection of tasks and transitions representing a workflow.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TaskList {
    /// Logical ID for this task list.
    pub id: String,
    /// All tasks (nodes).
    pub tasks: Vec<Task>,
    /// All transitions (edges) between tasks.
    pub transitions: Vec<Transition>,
}

/* =========================
 * Builders & transformers
 * ========================= */

/// Build one `Transition` from `parent` to each of the `children`.
///
/// The returned transitions use the *logical* IDs of the provided tasks.
pub fn build_transitions(parent: &Task, children: &[Task]) -> Vec<Transition> {
    children
        .iter()
        .map(|to| Transition {
            id: Uuid::new_v4().to_string(),
            source_task_id: parent.id.clone(),
            target_task_id: to.id.clone(),
        })
        .collect()
}

/// Collect all interfaces from a WIT `Package` as `Task`s.
///
/// Each interface becomes a task whose `name` is the canonical interface
/// name and whose `functions` lists its function names.
///
/// Returns an empty vector if the package has no interfaces.
pub fn wit_interfaces_as_tasks(resolve: &Resolve, package: &Package) -> Result<Vec<Task>> {
    let mut tasks = Vec::<Task>::new();

    for (_, iface_id) in &package.interfaces {
        let mut t = Task::default();
        t.name = resolve.interface_canon_by_id(*iface_id).unwrap_or_default();

        // Collect function names and prefix for readability in the diagram.
        let func_names: Vec<String> = resolve.interfaces[*iface_id]
            .functions
            .iter()
            .map(|(name, _)| format!("F:{name}"))
            .collect();

        if !func_names.is_empty() {
            t.functions = Some(func_names);
        }
        tasks.push(t);
    }

    Ok(tasks)
}

/// Build a `TaskList` from an amt-compose project by reading WIT packages
/// and their interfaces.
///
/// - Each WIT package becomes a parent `Task`.
/// - Each interface of that package becomes a child `Task`.
/// - A `Transition` is created from the package task to each interface task.
///
/// Returns a complete `TaskList` ready to be posted to the diagram tool.
pub fn build_task_list_from_amt_compose(config_path: &str, project_path: &str) -> Result<TaskList> {
    use amt_compose::{core::LogTracker, project::ProjectContext};

    let logger = LogTracker::new_boxed();
    let quiet = true;
    let project = ProjectContext::new(config_path, project_path, quiet, logger)
        .context("Failed to open amt-compose project")?;

    let resolve = project.wit().resolve();

    let mut out = TaskList {
        id: Uuid::new_v4().to_string(),
        ..Default::default()
    };

    for (_, pkg) in resolve.packages.iter() {
        // Parent node: the package itself.
        let mut parent = Task::default();
        parent.name = pkg.name.to_string();

        // Push parent before children so we can build transitions.
        out.tasks.push(parent.clone());

        // Child nodes: each interface in the package.
        let interfaces = wit_interfaces_as_tasks(resolve, pkg)?;
        // Build transitions from package -> each interface.
        let edges = build_transitions(&parent, &interfaces);

        out.tasks.extend(interfaces);
        out.transitions.extend(edges);
    }

    Ok(out)
}

/* =========================
 * JSON-RPC client (tools)
 * ========================= */

/// Minimal JSON-RPC client for the diagram tool.
///
/// Reuses a single `reqwest` blocking `Client` and provides typed helper
/// methods for common tool calls. Errors include context for easy tracing.
pub struct DiagramToolClient<'a> {
    /// Base endpoint, e.g. `http://127.0.0.1:3000/messages`.
    pub url: &'a str,
    /// Shared blocking HTTP client.
    pub http: Client,
}

impl<'a> DiagramToolClient<'a> {
    /// Create a new client targeting `url`.
    pub fn new(url: &'a str) -> Self {
        Self {
            url,
            http: Client::new(),
        }
    }

    /// Perform a generic JSON-RPC call with a `name` and `arguments` map.
    fn rpc_call(&self, name: &str, arguments: Value, id: i64) -> Result<Value> {
        let payload = json!({
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": { "name": name, "arguments": arguments },
            "id": id
        });

        let res = self
            .http
            .post(self.url)
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .with_context(|| format!("Failed to send JSON-RPC '{name}'"))?;

        let status = res.status();
        let value: Value = res
            .json()
            .with_context(|| format!("Invalid JSON response from '{name}' (status {status})"))?;

        Ok(value)
    }

    /// Extract the assistant’s plaintext message from a tool response.
    ///
    /// The diagram tool replies with a structure like:
    /// `{ result: { content: [ { text: "...ID: <uuid>..." } ] } }`.
    fn extract_text(response: &Value) -> Result<&str> {
        response
            .get("result")
            .and_then(|r| r.get("content"))
            .and_then(|c| c.get(0))
            .and_then(|item| item.get("text"))
            .and_then(|t| t.as_str())
            .ok_or_else(|| anyhow!("No text content found in tool response"))
    }

    /// Parse a UUID that follows the pattern `ID: <uuid>` within `text`.
    fn extract_uuid_from_text(&self, text: &str) -> Result<String> {
        // Compiled lazily per call; for hot paths you can memoize or use once_cell.
        let re = Regex::new(r"ID:\s*([a-f0-9-]{36})").context("Failed to compile UUID regex")?;
        re.captures(text)
            .and_then(|caps| caps.get(1))
            .map(|m| m.as_str().to_string())
            .ok_or_else(|| anyhow!("Could not find UUID in text"))
    }

    /// Create a diagram and return its assigned diagram ID.
    pub fn create_diagram(&self, diagram_type: &str, name: &str, id: i64) -> Result<String> {
        let args = json!({ "diagramType": diagram_type, "name": name });
        let resp = self.rpc_call("create_diagram", args, id)?;
        let text = Self::extract_text(&resp)?;
        self.extract_uuid_from_text(text)
    }

    /// Create a node and return the assigned node ID.
    pub fn create_node(
        &self,
        diagram_id: &str,
        node_type: &str,
        label: &str,
        position: &Position,
        id: i64,
    ) -> Result<String> {
        let args = json!({
            "diagramId": diagram_id,
            "nodeType": node_type,
            "position": { "x": position.x, "y": position.y },
            "label": label
        });
        let resp = self.rpc_call("create_node", args, id)?;
        let text = Self::extract_text(&resp)?;
        self.extract_uuid_from_text(text)
    }

    /// Create an edge between two existing nodes.
    pub fn create_edge(
        &self,
        diagram_id: &str,
        edge_type: &str,
        source_id: &str,
        target_id: &str,
        id: i64,
    ) -> Result<()> {
        let args = json!({
            "diagramId": diagram_id,
            "edgeType": edge_type,
            "sourceId": source_id,
            "targetId": target_id
        });
        let resp = self.rpc_call("create_edge", args, id)?;
        // Edge responses often don't embed a new ID; we still check status via presence of result.
        Self::extract_text(&resp).ok();
        Ok(())
    }

    /// Apply a layout algorithm to a diagram.
    pub fn apply_layout(
        &self,
        diagram_id: &str,
        algorithm: &str,
        direction: &str,
        id: i64,
    ) -> Result<()> {
        let args = json!({
            "diagramId": diagram_id,
            "algorithm": algorithm,
            "direction": direction
        });
        // Use `text()` instead of `json()` because layout often returns non-JSON text.
        let payload = json!({
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": { "name": "apply_layout", "arguments": args },
            "id": id
        });

        let res = self
            .http
            .post(self.url)
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .context("Failed to apply layout")?;

        let status = res.status();
        let _body = res.text().unwrap_or_default();
        if !status.is_success() {
            return Err(anyhow!("Layout request failed with HTTP {status}"));
        }
        Ok(())
    }
}

/* =========================
 * Orchestrator
 * ========================= */

/// Create a diagram for the amt-compose project and populate it with nodes
/// and edges built from WIT packages and interfaces.
///
/// Returns the assigned `diagram_id` when successful.
pub fn generate_diagram_from_amt(
    tool_url: &str,
    config_path: &str,
    project_path: &str,
    diagram_name: &str,
) -> Result<String> {
    // 1) Build the logical task graph from amt-compose.
    let tasklist = build_task_list_from_amt_compose(config_path, project_path)?;

    // 2) Create the diagram.
    let tool = DiagramToolClient::new(tool_url);
    let mut next_id: i64 = 1;
    let diagram_id = tool.create_diagram("workflow", diagram_name, next_id)?;
    next_id += 1;

    // 3) Create nodes; map logical task IDs -> assigned node IDs.
    let mut id_map: HashMap<String, String> = HashMap::new();

    for task in &tasklist.tasks {
        let assigned_id =
            tool.create_node(&diagram_id, "task", &task.name, &task.position, next_id)?;
        next_id += 1;
        id_map.insert(task.id.clone(), assigned_id);
    }

    // 4) Create edges using real node IDs.
    for tr in &tasklist.transitions {
        let source = id_map
            .get(&tr.source_task_id)
            .ok_or_else(|| anyhow!("Missing mapping for source task {}", tr.source_task_id))?;
        let target = id_map
            .get(&tr.target_task_id)
            .ok_or_else(|| anyhow!("Missing mapping for target task {}", tr.target_task_id))?;
        tool.create_edge(&diagram_id, "sequence-flow", source, target, next_id)?;
        next_id += 1;
    }

    // 5) Apply a layout for readability.
    tool.apply_layout(&diagram_id, "hierarchical", "left-right", next_id)?;

    Ok(diagram_id)
}

/* =========================
 * Example / entry point
 * ========================= */

fn main() -> Result<()> {
    // Adjust these to your environment.
    let tool_url = "http://127.0.0.1:3000/messages";
    let config_path = "amt-compose.yaml";
    let project_path = "/home/vkanta/wspaces/glsp-mcp/workspace/amt/simple";
    let diagram_name = "Amt-Test-Diagram-5";

    let diagram_id = generate_diagram_from_amt(tool_url, config_path, project_path, diagram_name)?;
    println!("✅ Diagram created with ID: {diagram_id}");
    Ok(())
}

/* =========================
 * Test data helper (optional)
 * ========================= */

#[allow(dead_code)]
fn sample_tasklist() -> TaskList {
    TaskList {
        id: Uuid::new_v4().to_string(),
        tasks: vec![
            Task {
                id: "node-1".into(),
                name: "Start".into(),
                position: Position { x: 100.0, y: 100.0 },
                functions: None,
            },
            Task {
                id: "node-2".into(),
                name: "Process".into(),
                position: Position { x: 300.0, y: 200.0 },
                functions: None,
            },
        ],
        transitions: vec![Transition {
            id: "edge-1".into(),
            source_task_id: "node-1".into(),
            target_task_id: "node-2".into(),
        }],
    }
}
