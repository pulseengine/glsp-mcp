/// Component metadata support for ADAS WebAssembly components
///
/// This module provides functionality to embed and retrieve metadata
/// from WebAssembly components at compile time and runtime.
use serde::{Deserialize, Serialize};

/// Component metadata structure that gets embedded into WASM binaries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentMetadata {
    /// Component name from Cargo.toml
    pub name: String,
    /// Component version from Cargo.toml
    pub version: String,
    /// Component description
    pub description: Option<String>,
    /// Component type (sensor, ai, control, etc.)
    pub component_type: String,
    /// Build timestamp in ISO 8601 format
    pub build_timestamp: String,
    /// Git commit hash (if available)
    pub git_commit: Option<String>,
    /// Rust compiler version
    pub rustc_version: String,
    /// Target architecture
    pub target: String,
    /// Safety level (ASIL-A, ASIL-B, etc.)
    pub safety_level: Option<String>,
    /// Custom properties
    pub properties: std::collections::HashMap<String, String>,
}

/// Macro to embed metadata into a component
///
/// Usage in your component's lib.rs:
/// ```rust
/// component_metadata::embed_metadata!();
/// ```
#[macro_export]
macro_rules! embed_metadata {
    () => {
        // Embed metadata as a custom section
        #[link_section = "component-metadata"]
        #[used]
        static COMPONENT_METADATA: [u8; include_bytes!(concat!(
            env!("OUT_DIR"),
            "/metadata.json"
        ))
        .len()] = *include_bytes!(concat!(env!("OUT_DIR"), "/metadata.json"));

        // Also embed as a constant for runtime access
        const METADATA_JSON: &str = include_str!(concat!(env!("OUT_DIR"), "/metadata.json"));

        /// Get component metadata at runtime
        pub fn get_component_metadata() -> Result<$crate::ComponentMetadata, serde_json::Error> {
            serde_json::from_str(METADATA_JSON)
        }
    };
}

/// Macro to implement WIT interface for component info
///
/// Usage in your component after wit_bindgen::generate!:
/// ```rust
/// component_metadata::implement_component_info!(Component);
/// ```
#[macro_export]
macro_rules! implement_component_info {
    ($component_struct:ident) => {
        impl crate::exports::adas::diagnostics::component_info::Guest for $component_struct {
            fn get_version() -> String {
                get_component_metadata()
                    .map(|m| m.version)
                    .unwrap_or_else(|_| "unknown".to_string())
            }

            fn get_name() -> String {
                get_component_metadata()
                    .map(|m| m.name)
                    .unwrap_or_else(|_| "unknown".to_string())
            }

            fn get_build_info() -> crate::exports::adas::diagnostics::component_info::BuildInfo {
                let metadata =
                    get_component_metadata().unwrap_or_else(|_| $crate::ComponentMetadata {
                        name: "unknown".to_string(),
                        version: "0.0.0".to_string(),
                        description: None,
                        component_type: "unknown".to_string(),
                        build_timestamp: "unknown".to_string(),
                        git_commit: None,
                        rustc_version: "unknown".to_string(),
                        target: "unknown".to_string(),
                        safety_level: None,
                        properties: Default::default(),
                    });

                crate::exports::adas::diagnostics::component_info::BuildInfo {
                    version: metadata.version,
                    build_timestamp: metadata.build_timestamp,
                    git_commit: metadata.git_commit,
                    rustc_version: metadata.rustc_version,
                    target: metadata.target,
                }
            }

            fn get_safety_info(
            ) -> Option<crate::exports::adas::diagnostics::component_info::SafetyInfo> {
                get_component_metadata().ok().and_then(|m| {
                    m.safety_level.map(|level| {
                        crate::exports::adas::diagnostics::component_info::SafetyInfo {
                            asil_level: level,
                            certification_status: m.properties.get("certification_status").cloned(),
                            last_audit: m.properties.get("last_audit").cloned(),
                        }
                    })
                })
            }
        }
    };
}

/// Helper function for build scripts to detect component type from path
pub fn detect_component_type(cargo_manifest_dir: &str) -> String {
    let path_parts: Vec<&str> = cargo_manifest_dir.split('/').collect();

    // Find "components" in the path and get the next element
    if let Some(pos) = path_parts.iter().position(|&p| p == "components") {
        if pos + 1 < path_parts.len() {
            return path_parts[pos + 1].to_string();
        }
    }

    "unknown".to_string()
}

/// Helper to determine safety level based on component type
pub fn determine_safety_level(component_type: &str, component_name: &str) -> Option<String> {
    match component_type {
        "sensors" => Some("ASIL-B".to_string()),
        "ai" => match component_name {
            "object-detection" | "behavior-prediction" => Some("ASIL-B".to_string()),
            _ => Some("ASIL-A".to_string()),
        },
        "control" => Some("ASIL-D".to_string()),
        "system" => match component_name {
            "safety-monitor" => Some("ASIL-D".to_string()),
            _ => Some("ASIL-B".to_string()),
        },
        _ => None,
    }
}

// Re-export build utilities when used as build dependency
#[cfg(any(feature = "build", doc))]
pub mod build {
    //! Build script utilities for generating component metadata

    use crate::ComponentMetadata;
    use std::env;
    use std::fs;
    use std::path::Path;
    use std::process::Command;

    /// Generate metadata and write to OUT_DIR
    /// This is the main function called by component build scripts
    pub fn generate_metadata() {
        println!("cargo:rerun-if-changed=Cargo.toml");

        let metadata = generate_default_metadata();
        let out_dir = env::var("OUT_DIR").unwrap();
        let metadata_path = Path::new(&out_dir).join("metadata.json");

        let metadata_json =
            serde_json::to_string_pretty(&metadata).expect("Failed to serialize metadata");

        fs::write(&metadata_path, metadata_json).expect("Failed to write metadata.json");

        println!(
            "cargo:rustc-env=COMPONENT_METADATA={}",
            metadata_path.display()
        );
    }

    /// Generate default metadata from Cargo.toml and environment
    pub fn generate_default_metadata() -> ComponentMetadata {
        let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
        let cargo_toml_path = Path::new(&manifest_dir).join("Cargo.toml");
        let cargo_toml_content =
            fs::read_to_string(&cargo_toml_path).expect("Failed to read Cargo.toml");

        let cargo_toml: toml::Value =
            toml::from_str(&cargo_toml_content).expect("Failed to parse Cargo.toml");

        let package = cargo_toml
            .get("package")
            .expect("No package section in Cargo.toml");
        let name = package
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        let version = package
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("0.0.0")
            .to_string();
        let description = package
            .get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        // Detect component type
        let component_type = crate::detect_component_type(&manifest_dir);
        let component_name = name.replace("adas-", "").replace("_", "-");
        let safety_level = crate::determine_safety_level(&component_type, &component_name);

        ComponentMetadata {
            name,
            version,
            description,
            component_type,
            build_timestamp: chrono::Utc::now().to_rfc3339(),
            git_commit: get_git_commit(),
            rustc_version: get_rustc_version(),
            target: env::var("TARGET").unwrap_or_else(|_| "wasm32-wasip2".to_string()),
            safety_level,
            properties: std::collections::HashMap::new(),
        }
    }

    fn get_git_commit() -> Option<String> {
        Command::new("git")
            .args(&["rev-parse", "--short", "HEAD"])
            .output()
            .ok()
            .and_then(|output| {
                if output.status.success() {
                    String::from_utf8(output.stdout)
                        .ok()
                        .map(|s| s.trim().to_string())
                } else {
                    None
                }
            })
    }

    fn get_rustc_version() -> String {
        Command::new("rustc")
            .arg("--version")
            .output()
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "unknown".to_string())
    }
}
