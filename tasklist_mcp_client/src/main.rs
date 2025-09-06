mod sample_uml;
mod utils;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub name: String,
    pub position: Position,
    #[serde(rename = "functions")]
    pub functions: Option<Vec<String>>,
}
impl Default for Task {
    fn default() -> Self {
        self::Task {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Empty Task".to_string(),
            position: Position { x: 100.0, y: 100.0 },
            functions: None,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Transition {
    pub id: String,
    #[serde(rename = "sourceTaskId")]
    pub source_task_id: String,
    #[serde(rename = "targetTaskId")]
    pub target_task_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TaskList {
    pub id: String,
    pub tasks: Vec<Task>,
    pub transitions: Vec<Transition>,
}

/// this function collects data from the amt compose
/// returns a tasklist to be displayed
//----
///
fn main() {
    sample_uml::sample_uml_diagram();
}

