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

use crate::mcp::protocol::{
    GetPromptParams, GetPromptResult, Prompt, PromptArgument, PromptMessage, TextContent,
};
use anyhow::Result;
use std::collections::HashMap;

pub struct DiagramPrompts;

impl Default for DiagramPrompts {
    fn default() -> Self {
        Self::new()
    }
}

impl DiagramPrompts {
    pub fn new() -> Self {
        Self
    }

    pub fn get_available_prompts(&self) -> Vec<Prompt> {
        vec![
            Prompt {
                name: "generate_workflow".to_string(),
                description: Some("Generate a workflow diagram from a description".to_string()),
                arguments: Some(vec![
                    PromptArgument {
                        name: "description".to_string(),
                        description: Some("Description of the workflow to generate".to_string()),
                        required: Some(true),
                    },
                    PromptArgument {
                        name: "style".to_string(),
                        description: Some(
                            "Style of workflow (bpmn, flowchart, simple)".to_string(),
                        ),
                        required: Some(false),
                    },
                ]),
            },
            Prompt {
                name: "optimize_layout".to_string(),
                description: Some("Optimize the layout of an existing diagram".to_string()),
                arguments: Some(vec![
                    PromptArgument {
                        name: "diagram_id".to_string(),
                        description: Some("ID of the diagram to optimize".to_string()),
                        required: Some(true),
                    },
                    PromptArgument {
                        name: "criteria".to_string(),
                        description: Some(
                            "Optimization criteria (readability, compactness, flow)".to_string(),
                        ),
                        required: Some(false),
                    },
                ]),
            },
            Prompt {
                name: "add_error_handling".to_string(),
                description: Some("Add error handling patterns to a workflow".to_string()),
                arguments: Some(vec![
                    PromptArgument {
                        name: "diagram_id".to_string(),
                        description: Some("ID of the diagram to enhance".to_string()),
                        required: Some(true),
                    },
                    PromptArgument {
                        name: "error_types".to_string(),
                        description: Some(
                            "Types of errors to handle (validation, system, business)".to_string(),
                        ),
                        required: Some(false),
                    },
                ]),
            },
            Prompt {
                name: "analyze_diagram".to_string(),
                description: Some(
                    "Analyze a diagram for potential issues and improvements".to_string(),
                ),
                arguments: Some(vec![
                    PromptArgument {
                        name: "diagram_id".to_string(),
                        description: Some("ID of the diagram to analyze".to_string()),
                        required: Some(true),
                    },
                    PromptArgument {
                        name: "focus".to_string(),
                        description: Some(
                            "Analysis focus (performance, maintainability, compliance)".to_string(),
                        ),
                        required: Some(false),
                    },
                ]),
            },
            Prompt {
                name: "create_subprocess".to_string(),
                description: Some(
                    "Create a subprocess for a complex task in a workflow".to_string(),
                ),
                arguments: Some(vec![
                    PromptArgument {
                        name: "task_description".to_string(),
                        description: Some("Description of the task to break down".to_string()),
                        required: Some(true),
                    },
                    PromptArgument {
                        name: "detail_level".to_string(),
                        description: Some("Level of detail (high, medium, low)".to_string()),
                        required: Some(false),
                    },
                ]),
            },
            Prompt {
                name: "convert_diagram".to_string(),
                description: Some("Convert a diagram from one type to another".to_string()),
                arguments: Some(vec![
                    PromptArgument {
                        name: "diagram_id".to_string(),
                        description: Some("ID of the source diagram".to_string()),
                        required: Some(true),
                    },
                    PromptArgument {
                        name: "target_type".to_string(),
                        description: Some("Target diagram type (bpmn, uml, flowchart)".to_string()),
                        required: Some(true),
                    },
                ]),
            },
        ]
    }

    pub async fn get_prompt(&self, params: GetPromptParams) -> Result<GetPromptResult> {
        match params.name.as_str() {
            "generate_workflow" => self.generate_workflow_prompt(params.arguments).await,
            "optimize_layout" => self.optimize_layout_prompt(params.arguments).await,
            "add_error_handling" => self.add_error_handling_prompt(params.arguments).await,
            "analyze_diagram" => self.analyze_diagram_prompt(params.arguments).await,
            "create_subprocess" => self.create_subprocess_prompt(params.arguments).await,
            "convert_diagram" => self.convert_diagram_prompt(params.arguments).await,
            _ => Err(anyhow::anyhow!("Unknown prompt: {}", params.name)),
        }
    }

    async fn generate_workflow_prompt(
        &self,
        args: Option<HashMap<String, String>>,
    ) -> Result<GetPromptResult> {
        let args = args.unwrap_or_default();
        let description = args.get("description").cloned().unwrap_or_default();
        let style = args
            .get("style")
            .cloned()
            .unwrap_or_else(|| "flowchart".to_string());

        let prompt_text = format!(
            r#"You are an expert diagram designer. Create a workflow diagram based on this description:

"{description}"

Instructions:
1. First, create a new diagram using the 'create_diagram' tool with type '{style}'
2. Analyze the description to identify the main steps, decision points, and flow
3. Use 'create_node' to add nodes for each step:
   - Start/End events
   - Tasks/Activities
   - Decision points (gateways)
   - Intermediate events
4. Use 'create_edge' to connect the nodes in logical flow order
5. Apply appropriate layout using 'apply_layout' tool
6. Provide a summary of the created workflow

Node types to use:
- 'start-event' for beginning
- 'end-event' for completion
- 'task' for work activities
- 'gateway' for decisions/splits
- 'intermediate-event' for milestones

Edge types:
- 'sequence-flow' for normal flow
- 'conditional-flow' for decision branches
- 'message-flow' for communications

Remember to:
- Keep the flow logical and easy to follow
- Use clear, descriptive labels
- Position elements for good readability
- Include all necessary decision points"#
        );

        Ok(GetPromptResult {
            description: Some("Generate a workflow diagram from a description".to_string()),
            messages: vec![PromptMessage {
                role: "user".to_string(),
                content: TextContent {
                    content_type: "text".to_string(),
                    text: prompt_text,
                },
            }],
        })
    }

    async fn optimize_layout_prompt(
        &self,
        args: Option<HashMap<String, String>>,
    ) -> Result<GetPromptResult> {
        let args = args.unwrap_or_default();
        let diagram_id = args.get("diagram_id").cloned().unwrap_or_default();
        let criteria = args
            .get("criteria")
            .cloned()
            .unwrap_or_else(|| "readability".to_string());

        let prompt_text = format!(
            r#"You are a diagram layout expert. Optimize the layout of diagram '{diagram_id}' focusing on {criteria}.

Instructions:
1. First, examine the current diagram state using the resource 'diagram://model/{diagram_id}'
2. Analyze the current element positions and relationships
3. Apply the most appropriate layout algorithm:
   - For hierarchical flows: use 'hierarchical' layout
   - For balanced distribution: use 'grid' layout
   - For complex networks: use 'force' layout
4. Fine-tune individual element positions if needed using 'update_element'
5. Consider these optimization criteria:

For 'readability':
- Minimize edge crossings
- Ensure adequate spacing between elements
- Align elements on logical grids
- Group related elements

For 'compactness':
- Minimize overall diagram size
- Reduce whitespace efficiently
- Pack elements tightly while maintaining clarity

For 'flow':
- Follow natural reading patterns (left-to-right, top-to-bottom)
- Ensure logical progression is visually clear
- Minimize backtracking in the flow

Use the 'apply_layout' tool with the appropriate algorithm, then make manual adjustments as needed."#
        );

        Ok(GetPromptResult {
            description: Some("Optimize diagram layout for better visual clarity".to_string()),
            messages: vec![PromptMessage {
                role: "user".to_string(),
                content: TextContent {
                    content_type: "text".to_string(),
                    text: prompt_text,
                },
            }],
        })
    }

    async fn add_error_handling_prompt(
        &self,
        args: Option<HashMap<String, String>>,
    ) -> Result<GetPromptResult> {
        let args = args.unwrap_or_default();
        let diagram_id = args.get("diagram_id").cloned().unwrap_or_default();
        let error_types = args
            .get("error_types")
            .cloned()
            .unwrap_or_else(|| "validation,system".to_string());

        let prompt_text = format!(
            r#"You are a workflow design expert specializing in error handling and resilience patterns. Add comprehensive error handling to diagram '{diagram_id}' for these error types: {error_types}.

Instructions:
1. First, examine the current diagram using 'diagram://model/{diagram_id}'
2. Identify all task nodes that could potentially fail
3. For each error type, add appropriate error handling:

Validation Errors:
- Add validation checks before critical tasks
- Create decision gateways to route invalid inputs
- Add user notification tasks for validation failures
- Provide correction loops back to input points

System Errors:
- Add error boundary events attached to tasks
- Create retry mechanisms with exponential backoff
- Add fallback/alternative paths
- Include system administrator notifications

Business Errors:
- Add business rule validation points
- Create escalation paths for business exceptions
- Add compensation activities for rollback scenarios
- Include audit trail activities

Error Handling Patterns to implement:
1. Boundary Events: Attach error events to tasks that might fail
2. Error End Events: Add specific end events for different error scenarios
3. Retry Loops: Create loops with counters for transient failures
4. Escalation Paths: Add management notification for critical failures
5. Compensation: Add rollback activities for completed work

Use these node types:
- 'error-boundary-event' attached to tasks
- 'error-end-event' for terminal errors
- 'notification-task' for alerts
- 'compensation-task' for rollbacks
- 'timer-event' for delays/timeouts

Remember to maintain the original workflow logic while making it more robust."#
        );

        Ok(GetPromptResult {
            description: Some(
                "Add comprehensive error handling patterns to a workflow".to_string(),
            ),
            messages: vec![PromptMessage {
                role: "user".to_string(),
                content: TextContent {
                    content_type: "text".to_string(),
                    text: prompt_text,
                },
            }],
        })
    }

    async fn analyze_diagram_prompt(
        &self,
        args: Option<HashMap<String, String>>,
    ) -> Result<GetPromptResult> {
        let args = args.unwrap_or_default();
        let diagram_id = args.get("diagram_id").cloned().unwrap_or_default();
        let focus = args
            .get("focus")
            .cloned()
            .unwrap_or_else(|| "general".to_string());

        let prompt_text = format!(
            r#"You are a diagram analysis expert. Perform a comprehensive analysis of diagram '{diagram_id}' with focus on {focus}.

Instructions:
1. Examine the diagram structure using 'diagram://model/{diagram_id}'
2. Review validation results using 'diagram://validation/{diagram_id}'
3. Check element metadata using 'diagram://metadata/{diagram_id}'
4. Analyze the diagram based on the focus area:

General Analysis:
- Overall structure and organization
- Element relationships and flow logic
- Potential bottlenecks or inefficiencies
- Missing elements or connections
- Naming and labeling consistency

Performance Focus:
- Identify potential performance bottlenecks
- Look for unnecessarily complex paths
- Check for parallel processing opportunities
- Identify resource-intensive operations
- Suggest optimization strategies

Maintainability Focus:
- Assess diagram complexity and readability
- Check for proper decomposition of complex tasks
- Evaluate naming conventions and documentation
- Look for reusable patterns or components
- Identify areas that might be hard to modify

Compliance Focus:
- Check for required approval points
- Verify audit trail completeness
- Ensure proper error handling and logging
- Validate security checkpoints
- Review data handling compliance

Analysis Output:
1. Executive Summary: High-level findings and recommendations
2. Detailed Findings: Specific issues with element references
3. Improvement Recommendations: Concrete steps to address issues
4. Best Practices: Suggestions for alignment with industry standards
5. Risk Assessment: Potential risks and mitigation strategies

Format your analysis clearly with specific element IDs and actionable recommendations."#
        );

        Ok(GetPromptResult {
            description: Some(
                "Analyze diagram for issues and improvement opportunities".to_string(),
            ),
            messages: vec![PromptMessage {
                role: "user".to_string(),
                content: TextContent {
                    content_type: "text".to_string(),
                    text: prompt_text,
                },
            }],
        })
    }

    async fn create_subprocess_prompt(
        &self,
        args: Option<HashMap<String, String>>,
    ) -> Result<GetPromptResult> {
        let args = args.unwrap_or_default();
        let task_description = args.get("task_description").cloned().unwrap_or_default();
        let detail_level = args
            .get("detail_level")
            .cloned()
            .unwrap_or_else(|| "medium".to_string());

        let prompt_text = format!(
            r#"You are a process decomposition expert. Break down this complex task into a detailed subprocess: "{task_description}"

Detail Level: {detail_level}

Instructions:
1. Create a new diagram using 'create_diagram' with type 'subprocess'
2. Analyze the task to identify constituent steps and activities
3. Design a subprocess that breaks down the task appropriately:

High Detail Level:
- Include all individual steps and micro-activities
- Add validation points between steps
- Include detailed error handling for each step
- Add intermediate data storage/retrieval points
- Include user interactions and system integrations

Medium Detail Level:
- Focus on major activities and decision points
- Include key validation and error handling
- Group related micro-activities into logical steps
- Include primary user and system interactions

Low Detail Level:
- High-level phases or stages only
- Major decision points and outcomes
- Primary inputs and outputs
- Key stakeholder interactions

Subprocess Design Principles:
1. Single Responsibility: Each step should have a clear, single purpose
2. Proper Sequencing: Logical order of execution
3. Clear Interfaces: Well-defined inputs and outputs
4. Error Handling: Appropriate error paths and recovery
5. Measurable Outcomes: Each step should have measurable results

Node Types to Use:
- 'start-event': Subprocess initiation
- 'end-event': Subprocess completion
- 'task': Individual work activities
- 'user-task': Manual activities requiring human input
- 'service-task': Automated system activities
- 'gateway': Decision points and parallel splits
- 'intermediate-event': Milestones and wait points

Remember to:
- Keep the subprocess focused and cohesive
- Ensure all paths lead to a proper conclusion
- Include appropriate checkpoints and validations
- Design for reusability where possible"#
        );

        Ok(GetPromptResult {
            description: Some("Create a detailed subprocess for a complex task".to_string()),
            messages: vec![PromptMessage {
                role: "user".to_string(),
                content: TextContent {
                    content_type: "text".to_string(),
                    text: prompt_text,
                },
            }],
        })
    }

    async fn convert_diagram_prompt(
        &self,
        args: Option<HashMap<String, String>>,
    ) -> Result<GetPromptResult> {
        let args = args.unwrap_or_default();
        let diagram_id = args.get("diagram_id").cloned().unwrap_or_default();
        let target_type = args.get("target_type").cloned().unwrap_or_default();

        let prompt_text = format!(
            r#"You are a diagram conversion expert. Convert diagram '{diagram_id}' to {target_type} format while preserving the essential meaning and flow.

Instructions:
1. Examine the source diagram using 'diagram://model/{diagram_id}'
2. Understand the current structure and semantics
3. Create a new diagram with type '{target_type}'
4. Map elements according to the target format conventions:

BPMN Conversion:
- Start/End events → BPMN Start/End Events
- Tasks → BPMN Tasks (User, Service, Manual, Business Rule)
- Decisions → BPMN Gateways (Exclusive, Inclusive, Parallel)
- Flows → BPMN Sequence Flows
- Add BPMN-specific elements like pools, lanes if appropriate

UML Conversion:
- Tasks → UML Activities or Actions
- Decisions → UML Decision Nodes
- Parallel paths → UML Fork/Join Nodes
- Start/End → UML Initial/Final Nodes
- Add UML-specific constructs like swimlanes, partitions

Flowchart Conversion:
- Simplify to basic flowchart symbols
- Tasks → Process boxes
- Decisions → Diamond shapes
- Start/End → Oval shapes
- Flows → Simple arrows
- Focus on clarity and simplicity

Conversion Guidelines:
1. Preserve Semantics: Maintain the original meaning and flow
2. Follow Standards: Use target format conventions and best practices
3. Add Missing Elements: Include standard elements required by target format
4. Optimize Layout: Arrange for target format readability
5. Update Labels: Use terminology appropriate for target format

After conversion:
- Apply appropriate layout using 'apply_layout'
- Validate the result for completeness
- Provide a summary of the conversion changes"#
        );

        Ok(GetPromptResult {
            description: Some(
                "Convert diagram between different formats and standards".to_string(),
            ),
            messages: vec![PromptMessage {
                role: "user".to_string(),
                content: TextContent {
                    content_type: "text".to_string(),
                    text: prompt_text,
                },
            }],
        })
    }
}
