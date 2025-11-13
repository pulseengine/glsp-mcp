//! Simple integration tests for GLSP MCP Server
//! These tests verify basic functionality without requiring full server setup

mod mock_wasm_components;

use mock_wasm_components::*;

#[test]
fn test_mock_components_available() {
    // Verify mock components work
    let wasm = get_mock_wasm_component();
    assert!(!wasm.is_empty(), "Mock WASM component should not be empty");
    assert_eq!(
        &wasm[0..4],
        &[0x00, 0x61, 0x73, 0x6d],
        "Should have WASM magic number"
    );
}

#[test]
fn test_mock_wasm_with_function() {
    let wasm = get_mock_wasm_with_function();
    assert!(!wasm.is_empty());
    assert_eq!(&wasm[0..4], &[0x00, 0x61, 0x73, 0x6d]);
}

#[test]
fn test_mock_diagram_data() {
    let diagram = get_mock_diagram_json();
    assert!(diagram.is_object());
    assert!(diagram["nodes"].is_array());
    assert!(diagram["edges"].is_array());
    assert_eq!(diagram["id"], "test-diagram-001");
}

#[test]
fn test_mock_wit_interface_parsing() {
    let wit = get_mock_wit_interface();
    assert!(!wit.is_empty());
    assert!(wit.contains("package"));
    assert!(wit.contains("interface"));
    assert!(wit.contains("func"));
}

#[test]
fn test_tool_arguments_generation() {
    let args = get_mock_tool_arguments("create_diagram");
    assert!(args.is_object());
    assert!(args["name"].is_string());

    let node_args = get_mock_tool_arguments("create_node");
    assert!(node_args["diagram_id"].is_string());
    assert!(node_args["x"].is_number());
}

#[test]
fn test_validation_results_format() {
    let validation = get_mock_validation_results();
    assert!(validation.is_object());
    assert!(validation["valid"].is_boolean());
    assert!(validation["errors"].is_array());
    assert!(validation["warnings"].is_array());
}

#[test]
fn test_wasm_magic_number_validation() {
    let wasm = get_mock_wasm_component();
    // Verify WASM magic number: 0x00 0x61 0x73 0x6d
    assert_eq!(wasm[0], 0x00);
    assert_eq!(wasm[1], 0x61);
    assert_eq!(wasm[2], 0x73);
    assert_eq!(wasm[3], 0x6d);
}

#[test]
fn test_wasm_version() {
    let wasm = get_mock_wasm_component();
    // Verify WASM version: 1 (0x01 0x00 0x00 0x00)
    assert_eq!(wasm[4], 0x01);
    assert_eq!(wasm[5], 0x00);
    assert_eq!(wasm[6], 0x00);
    assert_eq!(wasm[7], 0x00);
}

#[test]
fn test_diagram_structure_validity() {
    let diagram = get_mock_diagram_json();

    // Verify required fields exist
    assert!(diagram.get("id").is_some());
    assert!(diagram.get("name").is_some());
    assert!(diagram.get("type").is_some());
    assert!(diagram.get("nodes").is_some());
    assert!(diagram.get("edges").is_some());
}

#[test]
fn test_node_structure() {
    let diagram = get_mock_diagram_json();
    let nodes = diagram["nodes"].as_array().unwrap();

    for node in nodes {
        assert!(node.get("id").is_some());
        assert!(node.get("type").is_some());
        assert!(node.get("label").is_some());
        assert!(node.get("position").is_some());

        let position = &node["position"];
        assert!(position.get("x").is_some());
        assert!(position.get("y").is_some());
    }
}

#[test]
fn test_edge_structure() {
    let diagram = get_mock_diagram_json();
    let edges = diagram["edges"].as_array().unwrap();

    for edge in edges {
        assert!(edge.get("id").is_some());
        assert!(edge.get("source").is_some());
        assert!(edge.get("target").is_some());
        assert!(edge.get("type").is_some());
    }
}

#[test]
fn test_wit_interface_components() {
    let wit = get_mock_wit_interface();

    // Verify package declaration
    assert!(wit.contains("package test:component"));

    // Verify interface declaration
    assert!(wit.contains("interface calculator"));

    // Verify function signatures
    assert!(wit.contains("add: func"));
    assert!(wit.contains("subtract: func"));

    // Verify world declaration
    assert!(wit.contains("world component"));
}
