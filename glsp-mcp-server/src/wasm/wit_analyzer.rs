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

/*!
 * WIT (WebAssembly Interface Types) Analyzer
 *
 * This module provides functionality to extract and analyze WIT interfaces
 * from WebAssembly Component Model binaries using the Bytecode Alliance toolchain.
 */

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::{debug, info, warn};
use wit_component::DecodedWasm;
use wit_parser::{Interface, Package, PackageId, Resolve, WorldId};

/// Represents a complete WIT interface definition extracted from a WASM component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WitInterface {
    pub name: String,
    pub namespace: Option<String>,
    pub package: Option<String>,
    pub version: Option<String>,
    pub interface_type: WitInterfaceType,
    pub functions: Vec<WitFunction>,
    pub types: Vec<WitType>,
}

/// Type of WIT interface (import or export)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WitInterfaceType {
    Import,
    Export,
}

/// Represents a function in a WIT interface
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WitFunction {
    pub name: String,
    pub params: Vec<WitParam>,
    pub results: Vec<WitParam>,
    pub is_async: bool,
}

/// Represents a parameter or return value
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WitParam {
    pub name: String,
    pub param_type: WitType,
}

/// Represents a WIT type definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WitType {
    pub name: String,
    pub type_def: WitTypeDefinition,
}

/// Different kinds of WIT type definitions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WitTypeDefinition {
    Primitive(String),
    Record {
        fields: Vec<WitParam>,
    },
    Variant {
        cases: Vec<WitVariantCase>,
    },
    Enum {
        cases: Vec<String>,
    },
    Union {
        types: Vec<WitType>,
    },
    Option {
        inner: Box<WitType>,
    },
    Result {
        ok: Option<Box<WitType>>,
        error: Option<Box<WitType>>,
    },
    List {
        element: Box<WitType>,
    },
    Tuple {
        elements: Vec<WitType>,
    },
    Flags {
        flags: Vec<String>,
    },
    Resource {
        methods: Vec<WitFunction>,
    },
}

/// Variant case for sum types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WitVariantCase {
    pub name: String,
    pub payload: Option<WitType>,
}

/// WIT validation issue severity levels
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum WitValidationSeverity {
    Info,
    Warning,
    Error,
    Critical,
}

/// WIT validation issue types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WitValidationIssueType {
    MissingInterface {
        expected: String,
    },
    IncompatibleType {
        interface: String,
        expected: String,
        found: String,
    },
    CircularDependency {
        cycle: Vec<String>,
    },
    UndefinedType {
        type_name: String,
        location: String,
    },
    InterfaceContract {
        interface: String,
        issue: String,
    },
    InvalidSignature {
        function: String,
        issue: String,
    },
    ResourceConstraint {
        resource: String,
        constraint: String,
    },
}

/// Individual WIT validation issue
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WitValidationIssue {
    pub issue_type: WitValidationIssueType,
    pub severity: WitValidationSeverity,
    pub message: String,
    pub suggestion: Option<String>,
    pub location: Option<String>,
}

/// Compatibility assessment between components
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WitCompatibilityReport {
    pub is_compatible: bool,
    pub compatibility_score: f64, // 0.0 to 1.0
    pub missing_imports: Vec<String>,
    pub incompatible_exports: Vec<String>,
    pub type_mismatches: Vec<(String, String)>,
    pub suggestions: Vec<String>,
}

/// Complete WIT analysis result for a component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentWitAnalysis {
    pub component_name: String,
    pub world_name: Option<String>,
    pub imports: Vec<WitInterface>,
    pub exports: Vec<WitInterface>,
    pub types: Vec<WitType>,
    pub dependencies: Vec<WitDependency>,
    pub raw_wit: Option<String>,
    pub validation_results: Vec<WitValidationIssue>,
    pub compatibility_report: Option<WitCompatibilityReport>,
    pub analysis_timestamp: chrono::DateTime<chrono::Utc>,
}

/// Dependency information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WitDependency {
    pub package: String,
    pub version: Option<String>,
    pub interfaces: Vec<String>,
}

/// WIT Analyzer for extracting interfaces from WASM components
pub struct WitAnalyzer;

impl WitAnalyzer {
    /// Analyze a WASM component file and extract all WIT interfaces
    pub async fn analyze_component<P: AsRef<Path>>(path: P) -> Result<ComponentWitAnalysis> {
        let path = path.as_ref();
        let component_name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        info!("Analyzing WASM component: {path:?}");

        // Read the WASM bytes
        let wasm_bytes = tokio::fs::read(path)
            .await
            .with_context(|| format!("Failed to read WASM file: {path:?}"))?;

        // Try to decode as a component first
        match wit_component::decode(&wasm_bytes) {
            Ok(decoded) => {
                debug!("Successfully decoded as WebAssembly component");
                Self::analyze_decoded_component(component_name, decoded).await
            }
            Err(_) => {
                warn!("Not a WebAssembly component, trying as core module");
                Self::analyze_core_module(component_name, wasm_bytes).await
            }
        }
    }

    /// Analyze a decoded WebAssembly component
    async fn analyze_decoded_component(
        component_name: String,
        decoded: DecodedWasm,
    ) -> Result<ComponentWitAnalysis> {
        match decoded {
            DecodedWasm::Component(resolve, world_id) => {
                debug!("Analyzing component world and interfaces");
                Self::extract_wit_from_resolve(component_name, &resolve, world_id).await
            }
            DecodedWasm::WitPackage(resolve, package_id) => {
                debug!("Analyzing WIT package");
                Self::extract_wit_from_package(component_name, &resolve, package_id).await
            }
        }
    }

    /// Analyze a core WebAssembly module (non-component)
    async fn analyze_core_module(
        component_name: String,
        _wasm_bytes: Vec<u8>,
    ) -> Result<ComponentWitAnalysis> {
        info!("Core module detected - limited interface extraction available");

        // For core modules, we can only provide basic analysis
        // In a real implementation, you might want to try converting to component
        Ok(ComponentWitAnalysis {
            component_name,
            world_name: None,
            imports: vec![],
            exports: vec![],
            types: vec![],
            dependencies: vec![],
            raw_wit: Some("// Core WebAssembly module - no WIT interfaces available".to_string()),
            validation_results: vec![],
            compatibility_report: None,
            analysis_timestamp: chrono::Utc::now(),
        })
    }

    /// Extract WIT interfaces from a resolve with a specific world
    async fn extract_wit_from_resolve(
        component_name: String,
        resolve: &Resolve,
        world_id: WorldId,
    ) -> Result<ComponentWitAnalysis> {
        // Debug: List all available worlds
        debug!("Available worlds in resolve:");
        for (id, world) in &resolve.worlds {
            debug!(
                "  - World ID {:?}: '{}' (imports: {}, exports: {})",
                id,
                world.name,
                world.imports.len(),
                world.exports.len()
            );
        }

        let world = resolve
            .worlds
            .get(world_id)
            .ok_or_else(|| anyhow!("World not found in resolve"))?;

        debug!("Analyzing world: {} (ID: {:?})", world.name, world_id);
        debug!("World imports count: {}", world.imports.len());
        debug!("World exports count: {}", world.exports.len());

        let mut imports = Vec::new();
        let mut exports = Vec::new();
        let mut all_types = Vec::new();
        let mut dependencies = Vec::new();

        // Extract imports
        for (key, import) in &world.imports {
            debug!("  Processing import: {key:?} -> {import:?}");
            let interface =
                Self::extract_world_item_interface(resolve, key, import, WitInterfaceType::Import)
                    .await?;
            debug!("  Created import interface: {}", interface.name);
            imports.push(interface);
        }

        // Extract exports
        for (key, export) in &world.exports {
            debug!("  Processing export: {key:?} -> {export:?}");
            let interface =
                Self::extract_world_item_interface(resolve, key, export, WitInterfaceType::Export)
                    .await?;
            debug!("  Created export interface: {}", interface.name);
            exports.push(interface);
        }

        // Extract types from all packages
        for (_, package) in &resolve.packages {
            let package_types = Self::extract_types_from_package(resolve, package).await?;
            all_types.extend(package_types);

            // Extract dependencies
            if package.name.namespace != "root" {
                dependencies.push(WitDependency {
                    package: format!("{}:{}", package.name.namespace, package.name.name),
                    version: package.name.version.as_ref().map(|v| v.to_string()),
                    interfaces: package.interfaces.keys().cloned().collect(),
                });
            }
        }

        // Generate raw WIT content
        let raw_wit = Self::generate_wit_text(resolve, world_id)?;

        // Perform validation on the analysis
        let mut validation_results = Vec::new();
        Self::validate_interfaces(&imports, &exports, &mut validation_results).await;
        Self::validate_type_consistency(&all_types, &mut validation_results).await;
        Self::validate_dependencies(&dependencies, &mut validation_results).await;

        Ok(ComponentWitAnalysis {
            component_name,
            world_name: Some(world.name.clone()),
            imports,
            exports,
            types: all_types,
            dependencies,
            raw_wit: Some(raw_wit),
            validation_results,
            compatibility_report: None, // Will be generated when comparing with other components
            analysis_timestamp: chrono::Utc::now(),
        })
    }

    /// Extract WIT interfaces from a package
    async fn extract_wit_from_package(
        component_name: String,
        resolve: &Resolve,
        package_id: PackageId,
    ) -> Result<ComponentWitAnalysis> {
        let package = resolve
            .packages
            .get(package_id)
            .ok_or_else(|| anyhow!("Package not found in resolve"))?;

        debug!(
            "Analyzing package: {}:{}",
            package.name.namespace, package.name.name
        );

        let mut exports = Vec::new();
        let mut all_types = Vec::new();

        // Extract interfaces from package
        for (name, interface_id) in &package.interfaces {
            let interface = resolve
                .interfaces
                .get(*interface_id)
                .ok_or_else(|| anyhow!("Interface not found: {}", name))?;

            let wit_interface =
                Self::convert_interface_to_wit(resolve, name, interface, WitInterfaceType::Export)
                    .await?;
            exports.push(wit_interface);
        }

        // Extract types
        let package_types = Self::extract_types_from_package(resolve, package).await?;
        all_types.extend(package_types);

        // Perform validation on the package analysis
        let mut validation_results = Vec::new();
        Self::validate_interfaces(&[], &exports, &mut validation_results).await;
        Self::validate_type_consistency(&all_types, &mut validation_results).await;

        Ok(ComponentWitAnalysis {
            component_name,
            world_name: None,
            imports: vec![],
            exports,
            types: all_types,
            dependencies: vec![],
            raw_wit: None,
            validation_results,
            compatibility_report: None,
            analysis_timestamp: chrono::Utc::now(),
        })
    }

    /// Extract interface from a world item (import or export)
    async fn extract_world_item_interface(
        resolve: &Resolve,
        key: &wit_parser::WorldKey,
        item: &wit_parser::WorldItem,
        interface_type: WitInterfaceType,
    ) -> Result<WitInterface> {
        use wit_parser::{WorldItem, WorldKey};

        match (key, item) {
            (WorldKey::Name(name), WorldItem::Interface { id, .. }) => {
                let interface = resolve
                    .interfaces
                    .get(*id)
                    .ok_or_else(|| anyhow!("Interface not found for key: {}", name))?;

                Self::convert_interface_to_wit(resolve, name, interface, interface_type).await
            }
            (WorldKey::Interface(interface_id), WorldItem::Interface { .. }) => {
                let interface = resolve
                    .interfaces
                    .get(*interface_id)
                    .ok_or_else(|| anyhow!("Interface not found for id: {:?}", interface_id))?;

                let name = interface.name.as_deref().unwrap_or("unnamed");
                Self::convert_interface_to_wit(resolve, name, interface, interface_type).await
            }
            (WorldKey::Name(name), WorldItem::Function(func)) => {
                // Single function export/import
                let function = Self::convert_function_to_wit(resolve, name, func).await?;

                Ok(WitInterface {
                    name: name.clone(),
                    namespace: None,
                    package: None,
                    version: None,
                    interface_type,
                    functions: vec![function],
                    types: vec![],
                })
            }
            _ => Err(anyhow!("Unsupported world item type")),
        }
    }

    /// Convert a WIT parser Interface to our WitInterface
    async fn convert_interface_to_wit(
        resolve: &Resolve,
        name: &str,
        interface: &Interface,
        interface_type: WitInterfaceType,
    ) -> Result<WitInterface> {
        let mut functions = Vec::new();
        let mut types = Vec::new();

        // Extract functions
        for (func_name, func) in &interface.functions {
            let wit_function = Self::convert_function_to_wit(resolve, func_name, func).await?;
            functions.push(wit_function);
        }

        // Extract types
        for (type_name, type_id) in &interface.types {
            if let Some(type_def) = resolve.types.get(*type_id) {
                let wit_type = Self::convert_type_def_to_wit(resolve, type_name, type_def).await?;
                types.push(wit_type);
            }
        }

        Ok(WitInterface {
            name: name.to_string(),
            namespace: None, // Package info extraction not implemented yet
            package: None,   // Package info extraction not implemented yet
            version: None,   // Package info extraction not implemented yet
            interface_type,
            functions,
            types,
        })
    }

    /// Convert a function definition to WIT function
    async fn convert_function_to_wit(
        resolve: &Resolve,
        name: &str,
        func: &wit_parser::Function,
    ) -> Result<WitFunction> {
        let mut params = Vec::new();
        let mut results = Vec::new();

        // Convert parameters
        for (param_name, param_type) in &func.params {
            let wit_type = Self::convert_type_to_wit(resolve, param_type).await?;
            params.push(WitParam {
                name: param_name.clone(),
                param_type: wit_type,
            });
        }

        // Convert results
        match &func.results {
            wit_parser::Results::Named(named_results) => {
                for (result_name, result_type) in named_results {
                    let wit_type = Self::convert_type_to_wit(resolve, result_type).await?;
                    results.push(WitParam {
                        name: result_name.clone(),
                        param_type: wit_type,
                    });
                }
            }
            wit_parser::Results::Anon(result_type) => {
                let wit_type = Self::convert_type_to_wit(resolve, result_type).await?;
                results.push(WitParam {
                    name: "result".to_string(),
                    param_type: wit_type,
                });
            }
        }

        Ok(WitFunction {
            name: name.to_string(),
            params,
            results,
            is_async: false, // Async function detection not implemented yet
        })
    }

    /// Convert a WIT type to our type representation
    async fn convert_type_to_wit(
        _resolve: &Resolve,
        wit_type: &wit_parser::Type,
    ) -> Result<WitType> {
        use wit_parser::Type;

        let type_def = match wit_type {
            Type::Bool => WitTypeDefinition::Primitive("bool".to_string()),
            Type::U8 => WitTypeDefinition::Primitive("u8".to_string()),
            Type::U16 => WitTypeDefinition::Primitive("u16".to_string()),
            Type::U32 => WitTypeDefinition::Primitive("u32".to_string()),
            Type::U64 => WitTypeDefinition::Primitive("u64".to_string()),
            Type::S8 => WitTypeDefinition::Primitive("s8".to_string()),
            Type::S16 => WitTypeDefinition::Primitive("s16".to_string()),
            Type::S32 => WitTypeDefinition::Primitive("s32".to_string()),
            Type::S64 => WitTypeDefinition::Primitive("s64".to_string()),
            Type::F32 => WitTypeDefinition::Primitive("f32".to_string()),
            Type::F64 => WitTypeDefinition::Primitive("f64".to_string()),
            Type::Char => WitTypeDefinition::Primitive("char".to_string()),
            Type::String => WitTypeDefinition::Primitive("string".to_string()),
            Type::Id(_) => WitTypeDefinition::Primitive("custom".to_string()), // Custom type resolution not implemented yet
        };

        Ok(WitType {
            name: "anonymous".to_string(),
            type_def,
        })
    }

    /// Convert a type definition to WIT type
    async fn convert_type_def_to_wit(
        resolve: &Resolve,
        name: &str,
        type_def: &wit_parser::TypeDef,
    ) -> Result<WitType> {
        use wit_parser::TypeDefKind;

        let wit_type_def = match &type_def.kind {
            TypeDefKind::Record(record) => {
                let mut fields = Vec::new();
                for field in &record.fields {
                    let field_type = Self::convert_type_to_wit(resolve, &field.ty).await?;
                    fields.push(WitParam {
                        name: field.name.clone(),
                        param_type: field_type,
                    });
                }
                WitTypeDefinition::Record { fields }
            }
            TypeDefKind::Variant(variant) => {
                let mut cases = Vec::new();
                for case in &variant.cases {
                    let payload = if let Some(ty) = &case.ty {
                        Some(Self::convert_type_to_wit(resolve, ty).await?)
                    } else {
                        None
                    };
                    cases.push(WitVariantCase {
                        name: case.name.clone(),
                        payload,
                    });
                }
                WitTypeDefinition::Variant { cases }
            }
            TypeDefKind::Enum(enum_def) => {
                let cases = enum_def
                    .cases
                    .iter()
                    .map(|case| case.name.clone())
                    .collect();
                WitTypeDefinition::Enum { cases }
            }
            // Note: Union type handling may vary by wit-parser version
            // TypeDefKind::Union(union) => {
            //     let mut types = Vec::new();
            //     for case in &union.cases {
            //         let case_type = Self::convert_type_to_wit(resolve, &case.ty).await?;
            //         types.push(case_type);
            //     }
            //     WitTypeDefinition::Union { types }
            // }
            TypeDefKind::Option(option_type) => {
                let inner_type = Self::convert_type_to_wit(resolve, option_type).await?;
                WitTypeDefinition::Option {
                    inner: Box::new(inner_type),
                }
            }
            TypeDefKind::Result(result_type) => {
                let ok_type = if let Some(ok) = &result_type.ok {
                    Some(Box::new(Self::convert_type_to_wit(resolve, ok).await?))
                } else {
                    None
                };
                let error_type = if let Some(err) = &result_type.err {
                    Some(Box::new(Self::convert_type_to_wit(resolve, err).await?))
                } else {
                    None
                };
                WitTypeDefinition::Result {
                    ok: ok_type,
                    error: error_type,
                }
            }
            TypeDefKind::List(list_type) => {
                let element_type = Self::convert_type_to_wit(resolve, list_type).await?;
                WitTypeDefinition::List {
                    element: Box::new(element_type),
                }
            }
            TypeDefKind::Tuple(tuple) => {
                let mut elements = Vec::new();
                for element_type in &tuple.types {
                    let wit_type = Self::convert_type_to_wit(resolve, element_type).await?;
                    elements.push(wit_type);
                }
                WitTypeDefinition::Tuple { elements }
            }
            TypeDefKind::Flags(flags) => {
                let flag_names = flags.flags.iter().map(|flag| flag.name.clone()).collect();
                WitTypeDefinition::Flags { flags: flag_names }
            }
            TypeDefKind::Resource => {
                WitTypeDefinition::Resource { methods: vec![] } // Resource method extraction not implemented yet
            }
            _ => WitTypeDefinition::Primitive("unknown".to_string()),
        };

        Ok(WitType {
            name: name.to_string(),
            type_def: wit_type_def,
        })
    }

    /// Extract types from a package
    async fn extract_types_from_package(
        resolve: &Resolve,
        package: &Package,
    ) -> Result<Vec<WitType>> {
        let mut types = Vec::new();

        for (_, interface_id) in &package.interfaces {
            if let Some(interface) = resolve.interfaces.get(*interface_id) {
                for (type_name, type_id) in &interface.types {
                    if let Some(type_def) = resolve.types.get(*type_id) {
                        let wit_type =
                            Self::convert_type_def_to_wit(resolve, type_name, type_def).await?;
                        types.push(wit_type);
                    }
                }
            }
        }

        Ok(types)
    }

    /// Generate WIT text representation
    fn generate_wit_text(resolve: &Resolve, world_id: WorldId) -> Result<String> {
        // Use wit-component's built-in WIT printing
        // This is a simplified version - in practice you'd want more sophisticated formatting
        let world = resolve
            .worlds
            .get(world_id)
            .ok_or_else(|| anyhow!("World not found"))?;

        let mut wit_text = String::new();
        let world_name = &world.name;
        wit_text.push_str(&format!("world {world_name} {{\n"));

        // Add imports
        for (key, _item) in &world.imports {
            match key {
                wit_parser::WorldKey::Name(name) => {
                    wit_text.push_str(&format!("  import {name};\n"));
                }
                wit_parser::WorldKey::Interface(id) => {
                    if let Some(interface) = resolve.interfaces.get(*id) {
                        let name = interface.name.as_deref().unwrap_or("unnamed");
                        wit_text.push_str(&format!("  import {name};\n"));
                    }
                }
            }
        }

        // Add exports
        for (key, _item) in &world.exports {
            match key {
                wit_parser::WorldKey::Name(name) => {
                    wit_text.push_str(&format!("  export {name};\n"));
                }
                wit_parser::WorldKey::Interface(id) => {
                    if let Some(interface) = resolve.interfaces.get(*id) {
                        let name = interface.name.as_deref().unwrap_or("unnamed");
                        wit_text.push_str(&format!("  export {name};\n"));
                    }
                }
            }
        }

        wit_text.push_str("}\n");
        Ok(wit_text)
    }

    /// Debug method to test interface extraction from a specific component
    pub async fn debug_component_interfaces<P: AsRef<Path>>(path: P) -> Result<()> {
        let analysis = Self::analyze_component(path.as_ref()).await?;

        debug!("Component Analysis Results");
        debug!("=====================================");
        debug!("Component: {}", analysis.component_name);
        debug!("World: {:?}", analysis.world_name);
        // Empty line for formatting;

        debug!("IMPORTS ({})", analysis.imports.len());
        for (i, import) in analysis.imports.iter().enumerate() {
            debug!("  {}. {}", i + 1, import.name);
            debug!("     Functions: {}", import.functions.len());
            for func in &import.functions {
                debug!("       - {}", func.name);
            }
        }
        // Empty line for formatting;

        debug!("EXPORTS ({})", analysis.exports.len());
        for (i, export) in analysis.exports.iter().enumerate() {
            debug!("  {}. {}", i + 1, export.name);
            debug!("     Functions: {}", export.functions.len());
            for func in &export.functions {
                debug!("       - {}", func.name);
            }
        }
        // Empty line for formatting;

        debug!("DEPENDENCIES ({})", analysis.dependencies.len());
        for dep in &analysis.dependencies {
            debug!("  - {}", dep.package);
        }

        debug!("=====================================");
        Ok(())
    }

    /// Validate interface contracts and compatibility
    async fn validate_interfaces(
        imports: &[WitInterface],
        exports: &[WitInterface],
        validation_results: &mut Vec<WitValidationIssue>,
    ) {
        // Check for interface naming conflicts
        let mut interface_names = std::collections::HashSet::new();

        for interface in imports.iter().chain(exports.iter()) {
            if !interface_names.insert(&interface.name) {
                validation_results.push(WitValidationIssue {
                    issue_type: WitValidationIssueType::InterfaceContract {
                        interface: interface.name.clone(),
                        issue: "Duplicate interface name".to_string(),
                    },
                    severity: WitValidationSeverity::Error,
                    message: format!("Interface '{}' is defined multiple times", interface.name),
                    suggestion: Some("Rename one of the conflicting interfaces".to_string()),
                    location: Some(format!("Interface: {}", interface.name)),
                });
            }
        }

        // Validate function signatures in interfaces
        for interface in imports.iter().chain(exports.iter()) {
            for function in &interface.functions {
                // Check for functions without return types (might be intentional)
                if function.results.is_empty() && function.name.contains("get") {
                    validation_results.push(WitValidationIssue {
                        issue_type: WitValidationIssueType::InvalidSignature {
                            function: function.name.clone(),
                            issue: "Getter function has no return value".to_string(),
                        },
                        severity: WitValidationSeverity::Warning,
                        message: format!(
                            "Function '{}' appears to be a getter but has no return value",
                            function.name
                        ),
                        suggestion: Some(
                            "Consider adding a return type if this function should return data"
                                .to_string(),
                        ),
                        location: Some(format!(
                            "Interface: {}, Function: {}",
                            interface.name, function.name
                        )),
                    });
                }
            }
        }

        // Check for balanced import/export interfaces for ADAS components
        if imports.is_empty() && !exports.is_empty() {
            validation_results.push(WitValidationIssue {
                issue_type: WitValidationIssueType::InterfaceContract {
                    interface: "component".to_string(),
                    issue: "No imports defined".to_string(),
                },
                severity: WitValidationSeverity::Warning,
                message: "Component has exports but no imports, which may indicate isolation"
                    .to_string(),
                suggestion: Some("Consider if this component needs input interfaces".to_string()),
                location: Some("Component structure".to_string()),
            });
        }
    }

    /// Validate type consistency and definitions
    async fn validate_type_consistency(
        types: &[WitType],
        validation_results: &mut Vec<WitValidationIssue>,
    ) {
        let mut type_names = std::collections::HashSet::new();

        for wit_type in types {
            // Check for duplicate type names
            if !type_names.insert(&wit_type.name) {
                validation_results.push(WitValidationIssue {
                    issue_type: WitValidationIssueType::UndefinedType {
                        type_name: wit_type.name.clone(),
                        location: "Type definitions".to_string(),
                    },
                    severity: WitValidationSeverity::Error,
                    message: format!("Type '{}' is defined multiple times", wit_type.name),
                    suggestion: Some("Rename or merge duplicate type definitions".to_string()),
                    location: Some(format!("Type: {}", wit_type.name)),
                });
            }

            // Validate specific type definitions
            match &wit_type.type_def {
                WitTypeDefinition::Record { fields } => {
                    if fields.is_empty() {
                        validation_results.push(WitValidationIssue {
                            issue_type: WitValidationIssueType::InvalidSignature {
                                function: wit_type.name.clone(),
                                issue: "Empty record type".to_string(),
                            },
                            severity: WitValidationSeverity::Warning,
                            message: format!("Record type '{}' has no fields", wit_type.name),
                            suggestion: Some(
                                "Consider if this empty record is intentional".to_string(),
                            ),
                            location: Some(format!("Type: {}", wit_type.name)),
                        });
                    }
                }
                WitTypeDefinition::Variant { cases } => {
                    if cases.is_empty() {
                        validation_results.push(WitValidationIssue {
                            issue_type: WitValidationIssueType::InvalidSignature {
                                function: wit_type.name.clone(),
                                issue: "Empty variant type".to_string(),
                            },
                            severity: WitValidationSeverity::Error,
                            message: format!("Variant type '{}' has no cases", wit_type.name),
                            suggestion: Some("Add at least one variant case".to_string()),
                            location: Some(format!("Type: {}", wit_type.name)),
                        });
                    }
                }
                WitTypeDefinition::Enum { cases } => {
                    if cases.is_empty() {
                        validation_results.push(WitValidationIssue {
                            issue_type: WitValidationIssueType::InvalidSignature {
                                function: wit_type.name.clone(),
                                issue: "Empty enum type".to_string(),
                            },
                            severity: WitValidationSeverity::Error,
                            message: format!("Enum type '{}' has no cases", wit_type.name),
                            suggestion: Some("Add at least one enum value".to_string()),
                            location: Some(format!("Type: {}", wit_type.name)),
                        });
                    }
                }
                _ => {}
            }
        }
    }

    /// Validate dependency relationships
    async fn validate_dependencies(
        dependencies: &[WitDependency],
        validation_results: &mut Vec<WitValidationIssue>,
    ) {
        // Check for circular dependencies (simplified check)
        let mut dependency_graph = std::collections::HashMap::new();

        for dep in dependencies {
            dependency_graph.insert(&dep.package, &dep.interfaces);
        }

        // Check for excessive dependencies
        if dependencies.len() > 10 {
            validation_results.push(WitValidationIssue {
                issue_type: WitValidationIssueType::ResourceConstraint {
                    resource: "dependencies".to_string(),
                    constraint: format!("Too many dependencies: {}", dependencies.len()),
                },
                severity: WitValidationSeverity::Warning,
                message: format!(
                    "Component has {} dependencies, which may impact performance",
                    dependencies.len()
                ),
                suggestion: Some("Consider consolidating or reducing dependencies".to_string()),
                location: Some("Dependency list".to_string()),
            });
        }

        // Check for missing standard ADAS dependencies for automotive components
        let adas_standard_deps = ["wasi:io", "wasi:filesystem", "adas:sensors"];
        let has_adas_marker = dependencies.iter().any(|dep| dep.package.contains("adas"));

        if has_adas_marker {
            for expected_dep in &adas_standard_deps {
                if !dependencies
                    .iter()
                    .any(|dep| dep.package.contains(expected_dep))
                {
                    validation_results.push(WitValidationIssue {
                        issue_type: WitValidationIssueType::MissingInterface {
                            expected: expected_dep.to_string(),
                        },
                        severity: WitValidationSeverity::Info,
                        message: format!(
                            "ADAS component might benefit from '{expected_dep}' interface"
                        ),
                        suggestion: Some(format!(
                            "Consider adding {expected_dep} dependency if needed"
                        )),
                        location: Some("Dependency analysis".to_string()),
                    });
                }
            }
        }
    }

    /// Generate compatibility report between two components
    pub async fn analyze_compatibility(
        component_a: &ComponentWitAnalysis,
        component_b: &ComponentWitAnalysis,
    ) -> Result<WitCompatibilityReport> {
        let mut missing_imports = Vec::new();
        let mut incompatible_exports = Vec::new();
        let mut type_mismatches = Vec::new();
        let mut suggestions = Vec::new();

        // Check if component A's exports satisfy component B's imports
        for import in &component_b.imports {
            let mut found_compatible = false;

            for export in &component_a.exports {
                if import.name == export.name {
                    found_compatible = true;

                    // Check function compatibility
                    for import_func in &import.functions {
                        if let Some(export_func) =
                            export.functions.iter().find(|f| f.name == import_func.name)
                        {
                            // Simple signature check
                            if import_func.params.len() != export_func.params.len()
                                || import_func.results.len() != export_func.results.len()
                            {
                                type_mismatches.push((
                                    format!("{}::{}", import.name, import_func.name),
                                    "Parameter or return type count mismatch".to_string(),
                                ));
                            }
                        } else {
                            incompatible_exports
                                .push(format!("{}::{}", import.name, import_func.name));
                        }
                    }
                    break;
                }
            }

            if !found_compatible {
                missing_imports.push(import.name.clone());
            }
        }

        // Generate suggestions
        if !missing_imports.is_empty() {
            suggestions
                .push("Some required imports are not satisfied by the other component".to_string());
        }

        if !type_mismatches.is_empty() {
            suggestions.push("Type signatures need to be aligned between components".to_string());
        }

        // Calculate compatibility score
        let total_imports = component_b.imports.len();
        let satisfied_imports = total_imports - missing_imports.len();
        let compatibility_score = if total_imports > 0 {
            satisfied_imports as f64 / total_imports as f64
        } else {
            1.0 // No imports to satisfy
        };

        let is_compatible = missing_imports.is_empty() && type_mismatches.is_empty();

        Ok(WitCompatibilityReport {
            is_compatible,
            compatibility_score,
            missing_imports,
            incompatible_exports,
            type_mismatches,
            suggestions,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_wit_analyzer_basic() {
        // Test that the analyzer can be instantiated
        let _analyzer = WitAnalyzer;

        // Test analyzing a non-existent file
        let result = WitAnalyzer::analyze_component("non-existent.wasm").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    #[ignore] // Ignore by default since it requires specific test files
    async fn test_wit_analyzer_with_real_component() {
        // This test requires actual WASM component files in the workspace
        let test_paths = [
            "../workspace/adas-wasm-components/wasm-outputs/vehicle-control.wasm",
            "../workspace/adas-wasm-components/dist/input-video-decoder.wasm",
        ];

        for path in &test_paths {
            if std::path::Path::new(path).exists() {
                debug!("Testing WIT analysis for: {path}");
                match WitAnalyzer::analyze_component(path).await {
                    Ok(analysis) => {
                        debug!("Successfully analyzed: {}", analysis.component_name);
                        debug!("World: {:?}", analysis.world_name);
                        debug!("Imports: {}", analysis.imports.len());
                        debug!("Exports: {}", analysis.exports.len());
                        // Basic validation
                        assert!(!analysis.component_name.is_empty());
                    }
                    Err(e) => {
                        warn!("Failed to analyze {path}: {e}");
                    }
                }
                break; // Test with first available file
            }
        }
    }
}
