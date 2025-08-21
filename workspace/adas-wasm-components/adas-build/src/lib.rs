//! ADAS WebAssembly Components Build System
//!
//! A Rust-based build orchestrator for ADAS components that replaces shell scripts
//! with a type-safe, cross-platform, and efficient build system.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tracing::{debug, info, warn};

pub mod component;
pub mod composition;
pub mod config;
pub mod pipeline;
pub mod validation;

pub use component::{Component, ComponentCategory, ComponentMetadata};
pub use composition::{WacComposer, CompositionConfig};
pub use config::{BuildConfig, BuildProfile};
pub use pipeline::{BuildPipeline, BuildResult};
pub use validation::{ValidationResult, Validator};

/// The main build orchestrator for ADAS components
#[derive(Debug)]
pub struct AdasBuildSystem {
    /// Build configuration
    config: BuildConfig,

    /// Discovered components
    components: Vec<Component>,

    /// Build pipeline
    pipeline: BuildPipeline,

    /// Component validator
    validator: Validator,
}

impl AdasBuildSystem {
    /// Create a new build system instance
    pub fn new(workspace_root: impl AsRef<Path>) -> Result<Self> {
        let workspace_root = workspace_root.as_ref();
        info!("Initializing ADAS build system at: {}", workspace_root.display());

        // Load build configuration
        let config = BuildConfig::load(workspace_root)?;

        // Discover components
        let components = component::discover_components(workspace_root)?;
        info!("Discovered {} components", components.len());

        // Create build pipeline
        let pipeline = BuildPipeline::new(&config, &components)?;

        // Create validator
        let validator = Validator::new(&config);

        Ok(Self {
            config,
            components,
            pipeline,
            validator,
        })
    }

    /// Build all components
    pub async fn build_all(&mut self, profile: BuildProfile) -> Result<BuildResult> {
        info!("Building all components with profile: {:?}", profile);

        // Validate components first
        self.validate_all()?;

        // Execute build pipeline
        let result = self.pipeline.execute(profile).await?;

        info!("Build completed: {} succeeded, {} failed",
            result.successful_components.len(),
            result.failed_components.len()
        );

        Ok(result)
    }

    /// Build specific components
    pub async fn build_components(
        &mut self,
        component_names: &[String],
        profile: BuildProfile,
    ) -> Result<BuildResult> {
        info!("Building components: {:?} with profile: {:?}", component_names, profile);

        // Filter components
        let components: Vec<_> = self.components
            .iter()
            .filter(|c| component_names.contains(&c.name))
            .cloned()
            .collect();

        if components.is_empty() {
            anyhow::bail!("No matching components found");
        }

        // Create filtered pipeline
        let mut pipeline = BuildPipeline::new(&self.config, &components)?;

        // Execute build
        let result = pipeline.execute(profile).await?;

        Ok(result)
    }

    /// Compose components using WAC
    #[cfg(feature = "wac-composition")]
    pub async fn compose_components(
        &self,
        output_path: impl AsRef<Path>,
        composition_config: Option<CompositionConfig>,
    ) -> Result<()> {
        info!("Composing components to: {}", output_path.as_ref().display());

        let config = composition_config.unwrap_or_else(|| {
            CompositionConfig::from_workspace(&self.config)
        });

        let composer = WacComposer::new(&self.config, config)?;
        composer.compose(&self.components, output_path).await?;

        info!("Composition completed successfully");
        Ok(())
    }

    /// Validate all components
    pub fn validate_all(&self) -> Result<Vec<ValidationResult>> {
        info!("Validating all components");

        let mut results = Vec::new();
        let mut has_errors = false;

        for component in &self.components {
            let result = self.validator.validate_component(component)?;

            if result.has_errors() {
                has_errors = true;
                warn!("Component {} has validation errors", component.name);
            }

            results.push(result);
        }

        if has_errors {
            anyhow::bail!("Validation failed for one or more components");
        }

        info!("All components validated successfully");
        Ok(results)
    }

    /// Get build status
    pub fn status(&self) -> BuildStatus {
        BuildStatus {
            total_components: self.components.len(),
            components_by_category: self.components_by_category(),
            workspace_root: self.config.workspace_root.clone(),
            available_profiles: vec![BuildProfile::Debug, BuildProfile::Release],
        }
    }

    /// Clean build artifacts
    pub async fn clean(&self, deep: bool) -> Result<()> {
        info!("Cleaning build artifacts (deep: {})", deep);

        // Clean target directory
        let target_dir = self.config.workspace_root.join("target");
        if target_dir.exists() {
            if deep {
                tokio::fs::remove_dir_all(&target_dir).await
                    .context("Failed to remove target directory")?;
            } else {
                // Just remove wasm files
                self.clean_wasm_files(&target_dir).await?;
            }
        }

        // Clean deps directory
        let deps_dir = self.config.workspace_root.join("deps");
        if deps_dir.exists() {
            tokio::fs::remove_dir_all(&deps_dir).await
                .context("Failed to remove deps directory")?;
        }

        info!("Clean completed");
        Ok(())
    }

    /// Generate build report
    pub fn generate_report(&self, format: ReportFormat) -> Result<String> {
        match format {
            ReportFormat::Json => self.generate_json_report(),
            ReportFormat::Markdown => self.generate_markdown_report(),
            ReportFormat::Html => self.generate_html_report(),
        }
    }

    // Private helper methods

    fn components_by_category(&self) -> HashMap<ComponentCategory, usize> {
        let mut map = HashMap::new();
        for component in &self.components {
            *map.entry(component.category).or_insert(0) += 1;
        }
        map
    }

    async fn clean_wasm_files(&self, target_dir: &Path) -> Result<()> {
        use tokio::fs;
        use futures::stream::{self, StreamExt};

        let wasm_pattern = target_dir.join("**/*.wasm");
        let paths: Vec<_> = glob::glob(wasm_pattern.to_str().unwrap())?
            .filter_map(Result::ok)
            .collect();

        let results: Vec<_> = stream::iter(paths)
            .map(|path| async move {
                fs::remove_file(&path).await
                    .with_context(|| format!("Failed to remove {}", path.display()))
            })
            .buffer_unordered(10)
            .collect()
            .await;

        for result in results {
            result?;
        }

        Ok(())
    }

    fn generate_json_report(&self) -> Result<String> {
        let report = BuildReport {
            timestamp: chrono::Utc::now(),
            workspace_root: self.config.workspace_root.clone(),
            total_components: self.components.len(),
            components: self.components.clone(),
            configuration: self.config.clone(),
        };

        serde_json::to_string_pretty(&report)
            .context("Failed to generate JSON report")
    }

    fn generate_markdown_report(&self) -> Result<String> {
        let mut report = String::new();
        report.push_str("# ADAS Build System Report\n\n");

        report.push_str(&format!("**Workspace**: `{}`\n", self.config.workspace_root.display()));
        report.push_str(&format!("**Total Components**: {}\n\n", self.components.len()));

        report.push_str("## Components by Category\n\n");
        for (category, count) in self.components_by_category() {
            report.push_str(&format!("- **{:?}**: {} components\n", category, count));
        }

        report.push_str("\n## Component List\n\n");
        report.push_str("| Name | Category | Safety Level | Dependencies |\n");
        report.push_str("|------|----------|--------------|-------------|\n");

        for component in &self.components {
            report.push_str(&format!(
                "| {} | {:?} | {} | {} |\n",
                component.name,
                component.category,
                component.metadata.safety_level.as_deref().unwrap_or("N/A"),
                component.dependencies.len()
            ));
        }

        Ok(report)
    }

    fn generate_html_report(&self) -> Result<String> {
        // Simple HTML report - could be enhanced with charts, etc.
        let markdown = self.generate_markdown_report()?;

        // Convert markdown to HTML (simplified version)
        let html = format!(
            r#"<!DOCTYPE html>
<html>
<head>
    <title>ADAS Build Report</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 40px; }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #f2f2f2; }}
    </style>
</head>
<body>
{}
</body>
</html>"#,
            markdown.replace("# ", "<h1>").replace("## ", "<h2>")
                .replace("**", "<strong>").replace("**", "</strong>")
                .replace("\n\n", "</p><p>")
        );

        Ok(html)
    }
}

/// Build status information
#[derive(Debug, Serialize)]
pub struct BuildStatus {
    pub total_components: usize,
    pub components_by_category: HashMap<ComponentCategory, usize>,
    pub workspace_root: PathBuf,
    pub available_profiles: Vec<BuildProfile>,
}

/// Build report
#[derive(Debug, Serialize)]
pub struct BuildReport {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub workspace_root: PathBuf,
    pub total_components: usize,
    pub components: Vec<Component>,
    pub configuration: BuildConfig,
}

/// Report format options
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReportFormat {
    Json,
    Markdown,
    Html,
}

impl std::str::FromStr for ReportFormat {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "json" => Ok(ReportFormat::Json),
            "markdown" | "md" => Ok(ReportFormat::Markdown),
            "html" => Ok(ReportFormat::Html),
            _ => anyhow::bail!("Unknown report format: {}", s),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_build_system_creation() {
        let temp_dir = TempDir::new().unwrap();
        let result = AdasBuildSystem::new(temp_dir.path());

        // Should handle missing workspace gracefully
        assert!(result.is_err());
    }
}
