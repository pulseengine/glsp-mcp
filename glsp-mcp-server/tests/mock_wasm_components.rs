//! Mock WASM components for testing without requiring actual WASM binaries
//! This module provides test data and mock components for unit and integration testing

use serde_json::json;

/// Get a mock WASM component binary (minimal valid WASM module)
pub fn get_mock_wasm_component() -> Vec<u8> {
    // Minimal valid WebAssembly module
    // (module) in WAT format
    vec![
        0x00, 0x61, 0x73, 0x6d, // Magic number
        0x01, 0x00, 0x00, 0x00, // Version 1
    ]
}

/// Get a mock WASM component with a simple function
pub fn get_mock_wasm_with_function() -> Vec<u8> {
    // (module
    //   (func (export "test") (result i32)
    //     i32.const 42))
    vec![
        0x00, 0x61, 0x73, 0x6d, // Magic
        0x01, 0x00, 0x00, 0x00, // Version
        0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f, // Type section
        0x03, 0x02, 0x01, 0x00, // Function section
        0x07, 0x08, 0x01, 0x04, 0x74, 0x65, 0x73, 0x74, 0x00, 0x00, // Export section
        0x0a, 0x06, 0x01, 0x04, 0x00, 0x41, 0x2a, 0x0b, // Code section
    ]
}

/// Mock diagram data for testing
pub fn get_mock_diagram_json() -> serde_json::Value {
    json!({
        "id": "test-diagram-001",
        "name": "Test Workflow Diagram",
        "type": "workflow",
        "nodes": [
            {
                "id": "node1",
                "type": "task",
                "label": "Start Task",
                "position": {"x": 100, "y": 100},
                "properties": {}
            },
            {
                "id": "node2",
                "type": "task",
                "label": "Process Task",
                "position": {"x": 300, "y": 100},
                "properties": {}
            }
        ],
        "edges": [
            {
                "id": "edge1",
                "source": "node1",
                "target": "node2",
                "type": "sequence"
            }
        ]
    })
}

/// Mock WIT interface definition
pub fn get_mock_wit_interface() -> String {
    r#"
package test:component

interface calculator {
    add: func(a: s32, b: s32) -> s32
    subtract: func(a: s32, b: s32) -> s32
}

world component {
    export calculator
}
"#
    .to_string()
}

/// Mock MCP tool call arguments
pub fn get_mock_tool_arguments(tool_name: &str) -> serde_json::Value {
    match tool_name {
        "create_diagram" => json!({
            "name": "Test Diagram",
            "diagram_type": "workflow"
        }),
        "create_node" => json!({
            "diagram_id": "test-diagram-001",
            "node_type": "task",
            "label": "Test Node",
            "x": 100,
            "y": 100
        }),
        "create_edge" => json!({
            "diagram_id": "test-diagram-001",
            "source_id": "node1",
            "target_id": "node2",
            "edge_type": "sequence"
        }),
        _ => json!({}),
    }
}

/// Mock validation results
pub fn get_mock_validation_results() -> serde_json::Value {
    json!({
        "valid": true,
        "errors": [],
        "warnings": [
            {
                "severity": "warning",
                "message": "Node 'node1' has no outgoing edges",
                "element_id": "node1"
            }
        ]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mock_wasm_component_is_valid() {
        let wasm = get_mock_wasm_component();
        assert_eq!(&wasm[0..4], &[0x00, 0x61, 0x73, 0x6d]); // Check magic number
        assert_eq!(&wasm[4..8], &[0x01, 0x00, 0x00, 0x00]); // Check version
    }

    #[test]
    fn test_mock_diagram_structure() {
        let diagram = get_mock_diagram_json();
        assert_eq!(diagram["id"], "test-diagram-001");
        assert_eq!(diagram["nodes"].as_array().unwrap().len(), 2);
        assert_eq!(diagram["edges"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn test_mock_wit_interface_valid() {
        let wit = get_mock_wit_interface();
        assert!(wit.contains("package test:component"));
        assert!(wit.contains("interface calculator"));
        assert!(wit.contains("world component"));
    }

    #[test]
    fn test_mock_tool_arguments() {
        let args = get_mock_tool_arguments("create_diagram");
        assert_eq!(args["name"], "Test Diagram");
        assert_eq!(args["diagram_type"], "workflow");
    }
}
