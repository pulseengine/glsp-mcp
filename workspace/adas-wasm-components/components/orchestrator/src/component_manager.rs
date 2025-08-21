// Component Manager - Handles lifecycle of ADAS components

use std::collections::HashMap;
use std::time::Instant;

/// Component information for registration
#[derive(Debug, Clone)]
pub struct ComponentInfo {
    pub id: String,
    pub component_type: String,
    pub interface_version: String,
    pub capabilities: Vec<String>,
}

/// Component state tracking
#[derive(Debug, Clone, PartialEq)]
pub enum ComponentState {
    Registered,
    Initializing,
    Ready,
    Running,
    Stopping,
    Error(String),
    Offline,
}

/// Component runtime information
#[derive(Debug)]
struct ComponentRuntime {
    info: ComponentInfo,
    state: ComponentState,
    start_time: Option<Instant>,
    last_heartbeat: Option<Instant>,
    message_count: u64,
    error_count: u32,
}

/// Manages all components in the ADAS pipeline
pub struct ComponentManager {
    components: HashMap<String, ComponentRuntime>,
    pipeline_order: Vec<String>,
}

impl ComponentManager {
    pub fn new() -> Self {
        Self {
            components: HashMap::new(),
            pipeline_order: Vec::new(),
        }
    }

    /// Initialize the 5-component pipeline
    pub fn initialize_pipeline_components(&mut self) -> Result<(), String> {
        println!("🔧 Initializing 5-component ADAS pipeline");

        // Define the pipeline execution order
        self.pipeline_order = vec![
            "video-decoder".to_string(),
            "object-detection".to_string(),
            "visualizer".to_string(),
            "safety-monitor".to_string(),
            "orchestrator".to_string(),
        ];

        // Register each component with default info
        for component_id in &self.pipeline_order {
            let info = ComponentInfo {
                id: component_id.clone(),
                component_type: self.get_component_type(component_id),
                interface_version: "0.1.0".to_string(),
                capabilities: self.get_component_capabilities(component_id),
            };

            self.register_component(info)?;
        }

        println!(
            "✅ Initialized {} components in pipeline",
            self.components.len()
        );
        Ok(())
    }

    /// Register a new component
    pub fn register_component(&mut self, info: ComponentInfo) -> Result<(), String> {
        println!(
            "📝 Registering component: {} ({})",
            info.id, info.component_type
        );

        let runtime = ComponentRuntime {
            info: info.clone(),
            state: ComponentState::Registered,
            start_time: None,
            last_heartbeat: Some(Instant::now()),
            message_count: 0,
            error_count: 0,
        };

        self.components.insert(info.id.clone(), runtime);
        Ok(())
    }

    /// Start all components in pipeline order
    pub fn start_all_components(&mut self) -> Result<(), String> {
        println!("🚀 Starting all components in pipeline order");

        for component_id in &self.pipeline_order.clone() {
            self.start_component(component_id)?;
        }

        Ok(())
    }

    /// Start a specific component
    pub fn start_component(&mut self, component_id: &str) -> Result<(), String> {
        if let Some(component) = self.components.get_mut(component_id) {
            println!("▶️  Starting component: {}", component_id);

            component.state = ComponentState::Initializing;

            // Simulate component startup based on type
            match component.info.component_type.as_str() {
                "input" => {
                    // Video decoder startup
                    component.state = ComponentState::Running;
                    component.start_time = Some(Instant::now());
                    println!("  📹 Video decoder ready");
                }
                "ai" => {
                    // AI component startup (load model, etc.)
                    component.state = ComponentState::Running;
                    component.start_time = Some(Instant::now());
                    println!("  🤖 AI component ready");
                }
                "system" => {
                    // System component startup
                    component.state = ComponentState::Running;
                    component.start_time = Some(Instant::now());
                    println!("  🛡️  System component ready");
                }
                "orchestration" => {
                    // Orchestrator itself
                    component.state = ComponentState::Running;
                    component.start_time = Some(Instant::now());
                    println!("  🎯 Orchestrator ready");
                }
                _ => {
                    component.state = ComponentState::Ready;
                    println!("  ✅ Generic component ready");
                }
            }

            Ok(())
        } else {
            Err(format!("Component not found: {}", component_id))
        }
    }

    /// Stop all components in reverse order
    pub fn stop_all_components(&mut self) -> Result<(), String> {
        println!("🛑 Stopping all components");

        let mut reverse_order = self.pipeline_order.clone();
        reverse_order.reverse();

        for component_id in &reverse_order {
            self.stop_component(component_id)?;
        }

        Ok(())
    }

    /// Stop a specific component
    pub fn stop_component(&mut self, component_id: &str) -> Result<(), String> {
        if let Some(component) = self.components.get_mut(component_id) {
            println!("⏹️  Stopping component: {}", component_id);

            component.state = ComponentState::Stopping;

            // Simulate graceful shutdown
            std::thread::sleep(std::time::Duration::from_millis(10));

            component.state = ComponentState::Offline;
            component.start_time = None;

            Ok(())
        } else {
            Err(format!("Component not found: {}", component_id))
        }
    }

    /// Update component heartbeat
    pub fn update_heartbeat(&mut self, component_id: &str) {
        if let Some(component) = self.components.get_mut(component_id) {
            component.last_heartbeat = Some(Instant::now());
        }
    }

    /// Increment message count for component
    pub fn increment_message_count(&mut self, component_id: &str) {
        if let Some(component) = self.components.get_mut(component_id) {
            component.message_count += 1;
        }
    }

    /// Record error for component
    pub fn record_error(&mut self, component_id: &str, error: String) {
        if let Some(component) = self.components.get_mut(component_id) {
            component.error_count += 1;
            component.state = ComponentState::Error(error);
        }
    }

    /// Get component state
    pub fn get_component_state(&self, component_id: &str) -> Option<ComponentState> {
        self.components.get(component_id).map(|c| c.state.clone())
    }

    /// Get all component states
    pub fn get_all_states(&self) -> HashMap<String, ComponentState> {
        self.components
            .iter()
            .map(|(id, runtime)| (id.clone(), runtime.state.clone()))
            .collect()
    }

    /// Get pipeline health summary
    pub fn get_pipeline_health(&self) -> PipelineHealth {
        let mut healthy_count = 0;
        let mut error_count = 0;
        let mut offline_count = 0;

        for runtime in self.components.values() {
            match runtime.state {
                ComponentState::Running | ComponentState::Ready => healthy_count += 1,
                ComponentState::Error(_) => error_count += 1,
                ComponentState::Offline => offline_count += 1,
                _ => {}
            }
        }

        PipelineHealth {
            total_components: self.components.len(),
            healthy_components: healthy_count,
            error_components: error_count,
            offline_components: offline_count,
        }
    }

    /// Get component type based on ID
    fn get_component_type(&self, component_id: &str) -> String {
        match component_id {
            "video-decoder" => "input".to_string(),
            "object-detection" => "ai".to_string(),
            "visualizer" => "system".to_string(),
            "safety-monitor" => "system".to_string(),
            "orchestrator" => "orchestration".to_string(),
            _ => "unknown".to_string(),
        }
    }

    /// Get component capabilities based on ID
    fn get_component_capabilities(&self, component_id: &str) -> Vec<String> {
        match component_id {
            "video-decoder" => vec![
                "h264-decode".to_string(),
                "frame-extraction".to_string(),
                "format-conversion".to_string(),
            ],
            "object-detection" => vec![
                "yolo-inference".to_string(),
                "wasi-nn".to_string(),
                "real-time-detection".to_string(),
            ],
            "visualizer" => vec![
                "bounding-box-display".to_string(),
                "real-time-rendering".to_string(),
                "status-display".to_string(),
            ],
            "safety-monitor" => vec![
                "health-monitoring".to_string(),
                "fail-safe".to_string(),
                "diagnostics".to_string(),
            ],
            "orchestrator" => vec![
                "component-coordination".to_string(),
                "data-flow-management".to_string(),
                "pipeline-execution".to_string(),
            ],
            _ => vec!["unknown".to_string()],
        }
    }
}

/// Pipeline health summary
#[derive(Debug)]
pub struct PipelineHealth {
    pub total_components: usize,
    pub healthy_components: usize,
    pub error_components: usize,
    pub offline_components: usize,
}

impl PipelineHealth {
    pub fn is_healthy(&self) -> bool {
        self.error_components == 0 && self.healthy_components > 0
    }

    pub fn health_percentage(&self) -> f32 {
        if self.total_components == 0 {
            return 0.0;
        }
        (self.healthy_components as f32 / self.total_components as f32) * 100.0
    }
}
