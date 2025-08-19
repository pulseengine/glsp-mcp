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
 * WASM Security Scanner
 *
 * This module provides security analysis for WebAssembly components,
 * moved from the frontend to ensure server-side security validation.
 */

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use tracing::{debug, info, warn};
use wasmparser::{Parser, Payload};

/// Security risk levels for WASM components
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum SecurityRiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

/// Security issue types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SecurityIssueType {
    UnsafeImport {
        import_name: String,
        reason: String,
    },
    SuspiciousExport {
        export_name: String,
        reason: String,
    },
    ExcessivePermissions {
        permission: String,
        reason: String,
    },
    UntrustedOrigin {
        source: String,
        reason: String,
    },
    MalformedComponent {
        issue: String,
    },
    ResourceLeak {
        resource_type: String,
        reason: String,
    },
}

/// Security issue identified during scanning
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityIssue {
    pub issue_type: SecurityIssueType,
    pub risk_level: SecurityRiskLevel,
    pub description: String,
    pub recommendation: String,
    pub location: Option<String>,
}

/// Complete security analysis result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityAnalysis {
    pub component_name: String,
    pub component_path: String,
    pub scan_timestamp: DateTime<Utc>,
    pub overall_risk: SecurityRiskLevel,
    pub issues: Vec<SecurityIssue>,
    pub permissions_requested: Vec<String>,
    pub imports_analyzed: usize,
    pub exports_analyzed: usize,
    pub scan_duration_ms: u64,
    pub is_component_valid: bool,
    pub trusted_signature: Option<String>,
}

/// WASM Security Scanner
#[derive(Clone)]
pub struct WasmSecurityScanner {
    /// Known dangerous imports that should be flagged
    dangerous_imports: HashSet<String>,
    /// Trusted component signatures/hashes
    trusted_components: HashSet<String>,
    /// Maximum allowed imports per component
    max_imports_threshold: usize,
}

impl Default for WasmSecurityScanner {
    fn default() -> Self {
        Self::new()
    }
}

impl WasmSecurityScanner {
    pub fn new() -> Self {
        let mut dangerous_imports = HashSet::new();

        // Add known dangerous imports
        dangerous_imports.insert("wasi_snapshot_preview1::proc_exit".to_string());
        dangerous_imports.insert("wasi_snapshot_preview1::fd_write".to_string());
        dangerous_imports.insert("wasi_snapshot_preview1::fd_read".to_string());
        dangerous_imports.insert("wasi_snapshot_preview1::path_open".to_string());
        dangerous_imports.insert("env::system".to_string());
        dangerous_imports.insert("env::exec".to_string());
        dangerous_imports.insert("env::fork".to_string());

        Self {
            dangerous_imports,
            trusted_components: HashSet::new(),
            max_imports_threshold: 50, // Reasonable limit for ADAS components
        }
    }

    /// Add a trusted component hash/signature
    pub fn add_trusted_component(&mut self, signature: String) {
        self.trusted_components.insert(signature);
    }

    /// Perform comprehensive security analysis on a WASM component
    pub async fn analyze_component<P: AsRef<Path>>(&self, path: P) -> Result<SecurityAnalysis> {
        let path = path.as_ref();
        let component_name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        let start_time = std::time::Instant::now();
        let scan_timestamp = Utc::now();

        info!("Starting security analysis for: {}", component_name);

        // Read the WASM file
        let wasm_bytes = tokio::fs::read(path)
            .await
            .with_context(|| format!("Failed to read WASM file: {path:?}"))?;

        let mut analysis = SecurityAnalysis {
            component_name: component_name.clone(),
            component_path: path.to_string_lossy().to_string(),
            scan_timestamp,
            overall_risk: SecurityRiskLevel::Low,
            issues: Vec::new(),
            permissions_requested: Vec::new(),
            imports_analyzed: 0,
            exports_analyzed: 0,
            scan_duration_ms: 0,
            is_component_valid: true,
            trusted_signature: None,
        };

        // Check if component is in trusted list
        let component_hash = self.calculate_component_hash(&wasm_bytes);
        if self.trusted_components.contains(&component_hash) {
            analysis.trusted_signature = Some(component_hash);
            info!("Component is in trusted list: {}", component_name);
        }

        // Parse WASM and analyze security
        match self.analyze_wasm_security(&wasm_bytes, &mut analysis).await {
            Ok(_) => {
                info!("Security analysis completed for: {}", component_name);
            }
            Err(e) => {
                warn!("Security analysis failed for {}: {}", component_name, e);
                analysis.is_component_valid = false;
                analysis.issues.push(SecurityIssue {
                    issue_type: SecurityIssueType::MalformedComponent {
                        issue: e.to_string(),
                    },
                    risk_level: SecurityRiskLevel::High,
                    description: format!("Component analysis failed: {e}"),
                    recommendation: "Component may be malformed or corrupted. Verify integrity."
                        .to_string(),
                    location: None,
                });
            }
        }

        // Calculate overall risk based on issues
        analysis.overall_risk = self.calculate_overall_risk(&analysis.issues);
        analysis.scan_duration_ms = start_time.elapsed().as_millis() as u64;

        Ok(analysis)
    }

    /// Analyze WASM binary for security issues
    async fn analyze_wasm_security(
        &self,
        wasm_bytes: &[u8],
        analysis: &mut SecurityAnalysis,
    ) -> Result<()> {
        let parser = Parser::new(0);

        for payload in parser.parse_all(wasm_bytes) {
            match payload? {
                Payload::ImportSection(reader) => {
                    self.analyze_imports(reader, analysis)?;
                }
                Payload::ExportSection(reader) => {
                    self.analyze_exports(reader, analysis)?;
                }
                Payload::CustomSection(reader) => {
                    self.analyze_custom_section(reader, analysis)?;
                }
                Payload::ComponentImportSection(reader) => {
                    self.analyze_component_imports(reader, analysis)?;
                }
                _ => {}
            }
        }

        // Check for excessive imports
        if analysis.imports_analyzed > self.max_imports_threshold {
            analysis.issues.push(SecurityIssue {
                issue_type: SecurityIssueType::ExcessivePermissions {
                    permission: "imports".to_string(),
                    reason: format!(
                        "Component imports {} functions, exceeding threshold of {}",
                        analysis.imports_analyzed, self.max_imports_threshold
                    ),
                },
                risk_level: SecurityRiskLevel::Medium,
                description: "Component imports an excessive number of functions".to_string(),
                recommendation:
                    "Review if all imports are necessary for the component's functionality"
                        .to_string(),
                location: Some("Import Section".to_string()),
            });
        }

        Ok(())
    }

    /// Analyze import section for security issues
    fn analyze_imports(
        &self,
        reader: wasmparser::ImportSectionReader,
        analysis: &mut SecurityAnalysis,
    ) -> Result<()> {
        for import in reader {
            let import = import?;
            analysis.imports_analyzed += 1;

            let import_path = format!("{}::{}", import.module, import.name);

            // Check against dangerous imports list
            if self.dangerous_imports.contains(&import_path) {
                analysis.issues.push(SecurityIssue {
                    issue_type: SecurityIssueType::UnsafeImport {
                        import_name: import_path.clone(),
                        reason: "Import is known to be potentially dangerous".to_string(),
                    },
                    risk_level: SecurityRiskLevel::High,
                    description: format!(
                        "Component imports potentially dangerous function: {import_path}"
                    ),
                    recommendation: "Verify this import is necessary and used safely".to_string(),
                    location: Some(format!("Import: {import_path}")),
                });
            }

            // Track permissions requested
            if import.module.starts_with("wasi") {
                analysis.permissions_requested.push(import_path.clone());
            }

            // Check for suspicious patterns
            if import.name.contains("exec")
                || import.name.contains("system")
                || import.name.contains("spawn")
            {
                analysis.issues.push(SecurityIssue {
                    issue_type: SecurityIssueType::UnsafeImport {
                        import_name: import_path.clone(),
                        reason: "Import name suggests system execution capability".to_string(),
                    },
                    risk_level: SecurityRiskLevel::Critical,
                    description: format!(
                        "Component imports function with execution capability: {import_path}"
                    ),
                    recommendation:
                        "Carefully review this import as it may allow arbitrary code execution"
                            .to_string(),
                    location: Some(format!("Import: {import_path}")),
                });
            }
        }

        Ok(())
    }

    /// Analyze export section for security issues
    fn analyze_exports(
        &self,
        reader: wasmparser::ExportSectionReader,
        analysis: &mut SecurityAnalysis,
    ) -> Result<()> {
        for export in reader {
            let export = export?;
            analysis.exports_analyzed += 1;

            // Check for suspicious export names
            if export.name.contains("__") || export.name.starts_with("_") {
                analysis.issues.push(SecurityIssue {
                    issue_type: SecurityIssueType::SuspiciousExport {
                        export_name: export.name.to_string(),
                        reason: "Export uses internal naming convention".to_string(),
                    },
                    risk_level: SecurityRiskLevel::Low,
                    description: format!(
                        "Component exports function with internal name: {}",
                        export.name
                    ),
                    recommendation: "Verify this export is intentionally public".to_string(),
                    location: Some(format!("Export: {}", export.name)),
                });
            }

            // Check for memory exports (potential security risk)
            if matches!(export.kind, wasmparser::ExternalKind::Memory) {
                analysis.issues.push(SecurityIssue {
                    issue_type: SecurityIssueType::ResourceLeak {
                        resource_type: "memory".to_string(),
                        reason: "Component exports memory, allowing external access".to_string(),
                    },
                    risk_level: SecurityRiskLevel::Medium,
                    description: "Component exports its memory, potentially exposing internal data"
                        .to_string(),
                    recommendation:
                        "Ensure memory export is necessary and doesn't leak sensitive data"
                            .to_string(),
                    location: Some(format!("Memory Export: {}", export.name)),
                });
            }
        }

        Ok(())
    }

    /// Analyze custom sections for security metadata
    fn analyze_custom_section(
        &self,
        reader: wasmparser::CustomSectionReader,
        analysis: &mut SecurityAnalysis,
    ) -> Result<()> {
        match reader.name() {
            "name" => {
                // Name section is generally safe
            }
            "producers" => {
                // Check producers for known safe toolchains
                if let Ok(data_str) = std::str::from_utf8(reader.data()) {
                    if !data_str.contains("rust") && !data_str.contains("cargo") {
                        analysis.issues.push(SecurityIssue {
                            issue_type: SecurityIssueType::UntrustedOrigin {
                                source: "unknown toolchain".to_string(),
                                reason: "Component not built with known safe toolchain".to_string(),
                            },
                            risk_level: SecurityRiskLevel::Medium,
                            description: "Component built with unknown or untrusted toolchain"
                                .to_string(),
                            recommendation: "Verify the toolchain used to build this component"
                                .to_string(),
                            location: Some("Producers Section".to_string()),
                        });
                    }
                }
            }
            section_name if section_name.starts_with("adas") => {
                // ADAS-specific metadata sections are generally trusted
                debug!("Found ADAS metadata section: {}", section_name);
            }
            _ => {
                // Unknown custom sections might be suspicious
                if reader.data().len() > 1024 {
                    analysis.issues.push(SecurityIssue {
                        issue_type: SecurityIssueType::SuspiciousExport {
                            export_name: reader.name().to_string(),
                            reason: "Large unknown custom section".to_string(),
                        },
                        risk_level: SecurityRiskLevel::Low,
                        description: format!(
                            "Component contains large unknown custom section: {}",
                            reader.name()
                        ),
                        recommendation: "Verify the purpose of this custom section".to_string(),
                        location: Some(format!("Custom Section: {}", reader.name())),
                    });
                }
            }
        }

        Ok(())
    }

    /// Analyze component-level imports (for component model)
    fn analyze_component_imports(
        &self,
        reader: wasmparser::ComponentImportSectionReader,
        analysis: &mut SecurityAnalysis,
    ) -> Result<()> {
        for import in reader {
            let import = import?;
            analysis.imports_analyzed += 1;

            // Component-level security analysis
            debug!("Analyzing component import: {:?}", import.name);
        }

        Ok(())
    }

    /// Calculate a simple hash of the component for trust verification
    fn calculate_component_hash(&self, wasm_bytes: &[u8]) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        wasm_bytes.hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }

    /// Calculate overall risk level based on individual issues
    fn calculate_overall_risk(&self, issues: &[SecurityIssue]) -> SecurityRiskLevel {
        if issues.is_empty() {
            return SecurityRiskLevel::Low;
        }

        let mut max_risk = SecurityRiskLevel::Low;
        let mut critical_count = 0;
        let mut high_count = 0;

        for issue in issues {
            match issue.risk_level {
                SecurityRiskLevel::Critical => {
                    critical_count += 1;
                    max_risk = SecurityRiskLevel::Critical;
                }
                SecurityRiskLevel::High => {
                    high_count += 1;
                    if max_risk < SecurityRiskLevel::High {
                        max_risk = SecurityRiskLevel::High;
                    }
                }
                SecurityRiskLevel::Medium => {
                    if max_risk < SecurityRiskLevel::Medium {
                        max_risk = SecurityRiskLevel::Medium;
                    }
                }
                SecurityRiskLevel::Low => {}
            }
        }

        // Escalate risk if multiple high-level issues
        if critical_count > 0 || high_count > 2 {
            SecurityRiskLevel::Critical
        } else if high_count > 0 {
            SecurityRiskLevel::High
        } else {
            max_risk
        }
    }

    /// Generate a security report for a component
    pub fn generate_security_report(&self, analysis: &SecurityAnalysis) -> String {
        let mut report = String::new();

        report.push_str(&format!(
            "Security Analysis Report for: {}\n",
            analysis.component_name
        ));
        report.push_str(&format!(
            "Scan Time: {}\n",
            analysis.scan_timestamp.format("%Y-%m-%d %H:%M:%S UTC")
        ));
        report.push_str(&format!("Overall Risk: {:?}\n", analysis.overall_risk));
        report.push_str(&format!("Scan Duration: {}ms\n", analysis.scan_duration_ms));
        report.push_str(&format!(
            "Component Valid: {}\n",
            analysis.is_component_valid
        ));

        if let Some(sig) = &analysis.trusted_signature {
            report.push_str(&format!("Trusted Signature: {sig}\n"));
        }

        report.push_str(&format!(
            "\nImports Analyzed: {}\n",
            analysis.imports_analyzed
        ));
        report.push_str(&format!(
            "Exports Analyzed: {}\n",
            analysis.exports_analyzed
        ));
        report.push_str(&format!(
            "Permissions Requested: {}\n",
            analysis.permissions_requested.len()
        ));

        if !analysis.issues.is_empty() {
            report.push_str(&format!(
                "\nSecurity Issues Found ({}):\n",
                analysis.issues.len()
            ));
            for (i, issue) in analysis.issues.iter().enumerate() {
                report.push_str(&format!(
                    "  {}. [{:?}] {}\n",
                    i + 1,
                    issue.risk_level,
                    issue.description
                ));
                report.push_str(&format!("     Recommendation: {}\n", issue.recommendation));
                if let Some(location) = &issue.location {
                    report.push_str(&format!("     Location: {location}\n"));
                }
                report.push('\n');
            }
        } else {
            report.push_str("\n✅ No security issues found.\n");
        }

        report
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_security_scanner_creation() {
        let scanner = WasmSecurityScanner::new();
        assert!(!scanner.dangerous_imports.is_empty());
        assert_eq!(scanner.max_imports_threshold, 50);
    }

    #[tokio::test]
    async fn test_risk_calculation() {
        let scanner = WasmSecurityScanner::new();

        // Test empty issues
        let risk = scanner.calculate_overall_risk(&[]);
        assert_eq!(risk, SecurityRiskLevel::Low);

        // Test critical issue
        let issues = vec![SecurityIssue {
            issue_type: SecurityIssueType::UnsafeImport {
                import_name: "test".to_string(),
                reason: "test".to_string(),
            },
            risk_level: SecurityRiskLevel::Critical,
            description: "test".to_string(),
            recommendation: "test".to_string(),
            location: None,
        }];
        let risk = scanner.calculate_overall_risk(&issues);
        assert_eq!(risk, SecurityRiskLevel::Critical);
    }
}
