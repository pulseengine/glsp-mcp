use reqwest::blocking::Client;
use serde_json::json;
use serde_json::Value;
use crate::utils::{extract_diagram_id, extract_node_id};

/// Sample function to create a UML class diagram with two classes and an association edge
pub fn sample_uml_diagram() {
    let client = Client::new();
    let url = "http://127.0.0.1:3000/messages";

    // Step 0: Remove the previous sample diagram if it exists
    let delete_prev = json!({
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "delete_diagram",
            "arguments": {
                "diagramId": "9abb0ddb-4026-4a19-926e-0b63b1d395ea"
            }
        },
        "id": 0
    });
    let resp_delete_prev = client.post(url).header("Content-Type", "application/json").json(&delete_prev).send().expect("Failed to send delete_diagram request");
    let result_delete_prev: Value = resp_delete_prev.json().expect("Invalid JSON response");
    if let Some(error) = result_delete_prev.get("error") {
        println!("Failed to delete previous diagram: {:?}", error);
    } else {
        println!("✅ Previous diagram deleted successfully");
    }

    // Remove the empty sample diagram
    let delete_empty = json!({
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "delete_diagram",
            "arguments": {
                "diagramId": "2b7c78b0-96e5-4ecc-b1da-de9ca391ce17"
            }
        },
        "id": 0.5
    });
    let resp_delete_empty = client.post(url).header("Content-Type", "application/json").json(&delete_empty).send().expect("Failed to send delete_diagram request");
    let result_delete_empty: Value = resp_delete_empty.json().expect("Invalid JSON response");
    if let Some(error) = result_delete_empty.get("error") {
        println!("Failed to delete empty sample diagram: {:?}", error);
    } else {
        println!("✅ Empty sample diagram deleted successfully");
    }

    // Step 1: Create UML diagram
    let create_diagram = json!({
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "create_diagram",
            "arguments": {
                "diagramType": "uml",
                "name": "Sample UML Diagram"
            }
        },
        "id": 1
    });
    let response = client
        .post(url)
        .header("Content-Type", "application/json")
        .json(&create_diagram)
        .send()
        .expect("Failed to send create_diagram request");
    let result: Value = response.json().expect("Invalid JSON response");
    let text_msg = result
        .get("result")
        .and_then(|r| r.get("content"))
        .and_then(|c| c.get(0))
        .and_then(|item| item.get("text"))
        .and_then(|t| t.as_str())
        .unwrap_or_else(|| panic!("No diagram creation text found"));
    let diagram_id = extract_diagram_id(text_msg)
        .unwrap_or_else(|| panic!("Failed to extract diagramId from text"));
    println!("✅ UML Diagram ID: {}", diagram_id);

    // Step 2: Add two UML class nodes
    let class1 = json!({
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "add_uml_class",
            "arguments": {
                "diagramId": diagram_id,
                "name": "Person",
                "attributes": [
                    {"name": "id", "type": "int", "visibility": "private"},
                    {"name": "name", "type": "String", "visibility": "private"},
                    {"name": "age", "type": "int", "visibility": "private"},
                    {"name": "email", "type": "String", "visibility": "private"}
                ],
                "methods": [
                    {"name": "getName", "returnType": "String", "visibility": "public"},
                    {"name": "setAge", "returnType": "void", "visibility": "public", "parameters": [{"name": "age", "type": "int"}]},
                    {"name": "getEmail", "returnType": "String", "visibility": "public"}
                ],
                "position": {"x": 100.0, "y": 100.0}
            }
        },
        "id": 2
    });
    let class2 = json!({
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "add_uml_class",
            "arguments": {
                "diagramId": diagram_id,
                "name": "Car",
                "attributes": [
                    {"name": "model", "type": "String", "visibility": "private"},
                    {"name": "year", "type": "int", "visibility": "private"},
                    {"name": "color", "type": "String", "visibility": "private"}
                ],
                "methods": [
                    {"name": "getModel", "returnType": "String", "visibility": "public"},
                    {"name": "setYear", "returnType": "void", "visibility": "public", "parameters": [{"name": "year", "type": "int"}]}
                ],
                "position": {"x": 350.0, "y": 100.0}
            }
        },
        "id": 3
    });
    let resp1 = client.post(url).header("Content-Type", "application/json").json(&class1).send().expect("Failed to add class1");
    let result1: Value = resp1.json().expect("Invalid JSON response");
    
    // Check if there's an error in the response
    if let Some(error) = result1.get("error") {
        println!("Server error: {:?}", error);
        panic!("Server returned error for add_uml_class");
    }
    
    let text = result1["result"]["content"][0]["text"].as_str().unwrap_or_else(|| {
        println!("Full response: {:?}", result1);
        panic!("No text found in response");
    });
    
    let class1_id = extract_node_id(text).unwrap_or_else(|| {
        println!("Response text: {}", text);
        panic!("Failed to extract node ID from: {}", text);
    });
    let resp2 = client.post(url).header("Content-Type", "application/json").json(&class2).send().expect("Failed to add class2");
    let result2: Value = resp2.json().expect("Invalid JSON response");
    
    // Check if there's an error in the response
    if let Some(error) = result2.get("error") {
        println!("Server error: {:?}", error);
        panic!("Server returned error for add_uml_class");
    }
    
    let text2 = result2["result"]["content"][0]["text"].as_str().unwrap_or_else(|| {
        println!("Full response: {:?}", result2);
        panic!("No text found in response");
    });
    
    let class2_id = extract_node_id(text2).unwrap_or_else(|| {
        println!("Response text: {}", text2);
        panic!("Failed to extract node ID from: {}", text2);
    });
    println!("Class1 ID: {}  Class2 ID: {}", class1_id, class2_id);

    // Step 3: Add an association edge between the classes
    let edge = json!({
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "create_edge",
            "arguments": {
                "diagramId": diagram_id,
                "edgeType": "association",
                "sourceId": class1_id,
                "targetId": class2_id,
                "label": "owns"
            }
        },
        "id": 4
    });
    let resp3 = client.post(url).header("Content-Type", "application/json").json(&edge).send().expect("Failed to add edge");
    let result3: Value = resp3.json().expect("Invalid JSON response");
    
    if let Some(error) = result3.get("error") {
        println!("Server error: {:?}", error);
        panic!("Server returned error for create_edge");
    }
    
    println!("✅ Association edge added between Person and Car");
}
