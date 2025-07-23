/**
 * AI Diagram Agent
 * Combines Ollama LLM with MCP-GLSP to create diagrams from natural language
 */

import { OllamaClient } from './ollama-client.js';
import { McpClient } from '../mcp/client.js';

export interface DiagramRequest {
    description: string;
    diagramType?: string;
    style?: string;
}

export interface AgentResponse {
    success: boolean;
    message: string;
    diagramId?: string;
    steps: string[];
    errors?: string[];
}

export interface ToolCall {
    tool: string;
    arguments: Record<string, unknown>;
}

export class DiagramAgent {
    private ollama: OllamaClient;
    private mcpClient: McpClient;
    // System prompt for AI responses (initialized dynamically)

    constructor(ollamaClient: OllamaClient, mcpClient: McpClient) {
        this.ollama = ollamaClient;
        this.mcpClient = mcpClient;
        // System prompt will be generated dynamically based on available tools
    }

    private async getSystemPrompt(): Promise<string> {
        // Dynamic prompt that gets available tools from the server
        try {
            const tools = await this.mcpClient.listTools();
            const toolDescriptions = tools.map(tool => 
                `- ${tool.name}: ${tool.description || 'No description available'}`
            ).join('\n');
            
            return `You are an expert diagram creation agent that helps users create diagrams from natural language descriptions.

You have access to the following MCP tools:
${toolDescriptions}

When a user describes a process or workflow, you should:
1. Parse the description to identify the main steps, decisions, and flow
2. Generate a JSON array of MCP tool calls to create the diagram
3. Include proper positioning (spread elements across x-axis, use consistent y positions)
4. Apply logical flow connections between elements
5. End with apply_layout to organize the diagram

Respond with a JSON object containing:
{
  "analysis": "Brief analysis of the user's request",
  "toolCalls": [
    {
      "tool": "create_diagram", 
      "arguments": {"diagramType": "workflow", "name": "Process Name"}
    },
    {
      "tool": "create_node",
      "arguments": {"diagramId": "DIAGRAM_ID", "nodeType": "start-event", "position": {"x": 50, "y": 100}, "label": "Start"}
    }
    // ... more tool calls
  ]
}

IMPORTANT: 
- Use "DIAGRAM_ID" as placeholder - it will be replaced with actual ID
- Position elements logically (x: 50, 200, 350, 500... y: consistent like 100)
- Always include start and end events for processes
- Add meaningful labels that reflect the user's description
- Keep it simple but complete`;
        } catch (error) {
            console.warn('Failed to fetch tools from server, using fallback prompt');
            // Fallback to a basic system prompt if server is unavailable
            return `You are an expert diagram creation agent. Create diagrams using available MCP tools.
            
Respond with JSON format containing 'analysis' and 'toolCalls' array.`;
        }
    }

    async createDiagramFromDescription(request: DiagramRequest): Promise<AgentResponse> {
        const steps: string[] = [];
        const errors: string[] = [];

        try {
            steps.push("🤖 Analyzing description with AI...");

            // Enhanced prompt for better AI responses
            const enhancedPrompt = `Create a ${request.diagramType || 'workflow'} diagram for: "${request.description}"

EXAMPLE of correct JSON response format:
{
  "analysis": "Creating a simple order processing workflow",
  "toolCalls": [
    {"tool": "create_diagram", "arguments": {"diagramType": "workflow", "name": "Order Processing"}},
    {"tool": "create_node", "arguments": {"diagramId": "DIAGRAM_ID", "nodeType": "start-event", "position": {"x": 50, "y": 100}, "label": "Order Received"}},
    {"tool": "create_node", "arguments": {"diagramId": "DIAGRAM_ID", "nodeType": "task", "position": {"x": 200, "y": 100}, "label": "Validate Order"}},
    {"tool": "create_node", "arguments": {"diagramId": "DIAGRAM_ID", "nodeType": "end-event", "position": {"x": 350, "y": 100}, "label": "Order Complete"}},
    {"tool": "create_edge", "arguments": {"diagramId": "DIAGRAM_ID", "edgeType": "flow", "sourceId": "NODE_ID_1", "targetId": "NODE_ID_2"}},
    {"tool": "apply_layout", "arguments": {"diagramId": "DIAGRAM_ID", "algorithm": "hierarchical"}}
  ]
}

Respond with valid JSON only, no additional text.`;

            // Get dynamic system prompt
            const systemPrompt = await this.getSystemPrompt();
            
            // Get AI analysis and tool calls
            const aiResponse = await this.ollama.generateResponse(
                enhancedPrompt,
                systemPrompt
            );

            steps.push("✅ AI analysis complete");
            steps.push(`🔍 Raw AI Response: ${aiResponse.substring(0, 200)}...`);

            // Parse AI response
            let parsedResponse;
            try {
                // Try to find and parse JSON from the response
                let jsonStr = aiResponse.trim();
                
                // Remove markdown code blocks if present
                jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
                
                // Extract JSON object
                const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    // Fallback: try to create a simple structure from the AI response
                    steps.push("⚠️ No JSON detected, creating simple diagram");
                    return await this.createSimpleDiagramFallback(request, steps, errors);
                }
                
                parsedResponse = JSON.parse(jsonMatch[0]);
                steps.push(`📋 Parsed ${parsedResponse.toolCalls?.length || 0} tool calls`);
                
            } catch (parseError) {
                errors.push(`JSON Parse Error: ${parseError}`);
                steps.push("⚠️ JSON parsing failed, creating simple diagram");
                return await this.createSimpleDiagramFallback(request, steps, errors);
            }

            steps.push(`💭 AI Analysis: ${parsedResponse.analysis}`);

            // Execute tool calls with improved ID tracking
            return await this.executeToolCalls(parsedResponse.toolCalls, steps, errors);

        } catch (error) {
            errors.push(`Agent error: ${error}`);
            return {
                success: false,
                message: "Failed to create diagram",
                steps,
                errors
            };
        }
    }

    private async executeToolCalls(toolCalls: ToolCall[], steps: string[], errors: string[]): Promise<AgentResponse> {
        let diagramId: string | undefined;
        const nodeIds: string[] = [];
        
        for (const toolCall of toolCalls) {
            try {
                steps.push(`🔧 Executing: ${toolCall.tool} with ${JSON.stringify(toolCall.arguments).substring(0, 100)}...`);

                // Replace placeholders with actual IDs
                if (toolCall.arguments.diagramId === "DIAGRAM_ID" && diagramId) {
                    toolCall.arguments.diagramId = diagramId;
                }

                const result = await this.mcpClient.callTool(toolCall.tool, toolCall.arguments);
                
                // Extract IDs from results
                if (toolCall.tool === "create_diagram" && result.content?.[0]?.text) {
                    const match = result.content[0].text.match(/ID: ([a-f0-9-]+)/);
                    if (match) {
                        diagramId = match[1];
                        steps.push(`📝 Diagram ID: ${diagramId}`);
                    }
                }
                
                if (toolCall.tool === "create_node" && result.content?.[0]?.text) {
                    const match = result.content[0].text.match(/ID: ([a-f0-9-]+)/);
                    if (match) {
                        nodeIds.push(match[1]);
                        steps.push(`📦 Node ID: ${match[1]}`);
                    }
                }

                steps.push(`✅ ${toolCall.tool} completed successfully`);

            } catch (toolError) {
                const errorMsg = `Failed to execute ${toolCall.tool}: ${toolError}`;
                errors.push(errorMsg);
                steps.push(`❌ ${errorMsg}`);
            }
        }
        
        // Auto-connect nodes in sequence if we have multiple nodes but no edges
        if (nodeIds.length > 1 && !toolCalls.some(tc => tc.tool === "create_edge")) {
            steps.push("🔗 Auto-connecting nodes in sequence...");
            
            for (let i = 0; i < nodeIds.length - 1; i++) {
                try {
                    await this.mcpClient.callTool("create_edge", {
                        diagramId: diagramId,
                        edgeType: "flow",
                        sourceId: nodeIds[i],
                        targetId: nodeIds[i + 1],
                        label: undefined
                    });
                    steps.push(`✅ Connected ${nodeIds[i]} → ${nodeIds[i + 1]}`);
                } catch (edgeError) {
                    errors.push(`Failed to connect nodes: ${edgeError}`);
                }
            }
        }
        
        // Apply layout as final step if diagram was created
        if (diagramId && !toolCalls.some(tc => tc.tool === "apply_layout")) {
            try {
                steps.push("📐 Applying automatic layout...");
                await this.mcpClient.callTool("apply_layout", {
                    diagramId: diagramId,
                    algorithm: "hierarchical"
                });
                steps.push("✅ Layout applied");
            } catch (layoutError) {
                // Layout is optional, don't fail the whole operation
                steps.push(`⚠️ Layout failed: ${layoutError}`);
            }
        }
        
        if (errors.length > 0) {
            return {
                success: false,
                message: `Diagram partially created with ${errors.length} errors`,
                diagramId,
                steps,
                errors
            };
        }

        return {
            success: true,
            message: `Diagram created successfully with ${nodeIds.length} nodes!`,
            diagramId,
            steps
        };
    }

    private async createSimpleDiagramFallback(request: DiagramRequest, steps: string[], errors: string[]): Promise<AgentResponse> {
        try {
            steps.push("🔄 Creating fallback diagram structure...");
            
            // Create a simple diagram structure based on the description
            const toolCalls = [
                {
                    tool: "create_diagram",
                    arguments: {
                        diagramType: request.diagramType || "workflow",
                        name: `AI Generated: ${request.description.substring(0, 30)}...`
                    }
                },
                {
                    tool: "create_node",
                    arguments: {
                        diagramId: "DIAGRAM_ID",
                        nodeType: "start-event",
                        position: { x: 50, y: 100 },
                        label: "Start"
                    }
                },
                {
                    tool: "create_node", 
                    arguments: {
                        diagramId: "DIAGRAM_ID",
                        nodeType: "task",
                        position: { x: 200, y: 100 },
                        label: "Process"
                    }
                },
                {
                    tool: "create_node",
                    arguments: {
                        diagramId: "DIAGRAM_ID", 
                        nodeType: "end-event",
                        position: { x: 350, y: 100 },
                        label: "End"
                    }
                }
            ];
            
            // Add edge creation after we have the node IDs
            // Note: This will be handled by the executeToolCalls method
            
            return await this.executeToolCalls(toolCalls, steps, errors);
            
        } catch (error) {
            errors.push(`Fallback creation failed: ${error}`);
            return {
                success: false,
                message: "Failed to create fallback diagram",
                steps,
                errors
            };
        }
    }

    async optimizeDiagram(diagramId: string, criteria: string = "readability"): Promise<AgentResponse> {
        const steps: string[] = [];
        const errors: string[] = [];

        try {
            steps.push("🤖 Getting optimization recommendations...");

            // Create optimization prompt directly since prompts may not be implemented
            const optimizationPrompt = `Analyze and optimize the diagram with ID: ${diagramId}
            
Optimization criteria: ${criteria}
            
Provide specific recommendations for improving the diagram layout, readability, and flow.`;

            const aiResponse = await this.ollama.generateResponse(
                optimizationPrompt,
                "You are a diagram optimization expert. Provide specific, actionable recommendations."
            );

            steps.push("✅ AI recommendations generated");
            steps.push(`💡 Recommendations: ${aiResponse.substring(0, 200)}...`);

            // Apply layout optimization
            steps.push("📐 Applying layout optimization...");
            await this.mcpClient.callTool("apply_layout", {
                diagramId,
                algorithm: "hierarchical"
            });
            steps.push("✅ Layout optimization applied");

            return {
                success: true,
                message: "Diagram optimized successfully!",
                diagramId,
                steps
            };

        } catch (error) {
            errors.push(`Optimization error: ${error}`);
            return {
                success: false,
                message: "Failed to optimize diagram",
                steps,
                errors
            };
        }
    }

    async analyzeDiagram(diagramId: string, focus: string = "general"): Promise<AgentResponse> {
        const steps: string[] = [];

        try {
            steps.push("📊 Reading diagram data...");

            // Get diagram model
            const modelResource = await this.mcpClient.readResource(`diagram://model/${diagramId}`);
            const diagramData = JSON.parse(modelResource.text || '{}');

            // Get validation results  
            const validationResource = await this.mcpClient.readResource(`diagram://validation/${diagramId}`);
            const validationData = JSON.parse(validationResource.text || '{}');

            steps.push("🤖 Analyzing with AI...");

            const analysisPrompt = `Analyze this diagram:
            
Elements: ${Object.keys(diagramData.elements || {}).length}
Revision: ${diagramData.revision}
Valid: ${validationData.isValid}
Issues: ${validationData.issues?.length || 0}

Focus on: ${focus}

Provide insights about the diagram structure, potential improvements, and any issues found.`;

            const aiAnalysis = await this.ollama.generateResponse(
                analysisPrompt,
                "You are a process analysis expert. Provide clear, actionable insights about diagram quality and potential improvements."
            );

            steps.push("✅ Analysis complete");

            return {
                success: true,
                message: aiAnalysis,
                diagramId,
                steps
            };

        } catch (error) {
            return {
                success: false,
                message: `Analysis failed: ${error}`,
                steps,
                errors: [String(error)]
            };
        }
    }

    async checkConnections(): Promise<{ollama: boolean, mcp: boolean}> {
        const ollamaConnected = await this.ollama.checkConnection();
        
        let mcpConnected = false;
        try {
            await this.mcpClient.healthCheck();
            mcpConnected = true;
        } catch (error) {
            mcpConnected = false;
        }

        return { ollama: ollamaConnected, mcp: mcpConnected };
    }

    async createTestDiagram(): Promise<AgentResponse> {
        const steps: string[] = [];
        const errors: string[] = [];

        try {
            steps.push("🧪 Creating test diagram to verify functionality...");

            const toolCalls = [
                {
                    tool: "create_diagram",
                    arguments: {
                        diagramType: "workflow",
                        name: "AI Test Diagram"
                    }
                },
                {
                    tool: "create_node",
                    arguments: {
                        diagramId: "DIAGRAM_ID",
                        nodeType: "start-event",
                        position: { x: 50, y: 100 },
                        label: "AI Start"
                    }
                },
                {
                    tool: "create_node",
                    arguments: {
                        diagramId: "DIAGRAM_ID",
                        nodeType: "task",
                        position: { x: 200, y: 100 },
                        label: "AI Process"
                    }
                },
                {
                    tool: "create_node",
                    arguments: {
                        diagramId: "DIAGRAM_ID",
                        nodeType: "gateway",
                        position: { x: 350, y: 100 },
                        label: "AI Decision"
                    }
                },
                {
                    tool: "create_node",
                    arguments: {
                        diagramId: "DIAGRAM_ID",
                        nodeType: "end-event",
                        position: { x: 500, y: 100 },
                        label: "AI End"
                    }
                }
            ];

            return await this.executeToolCalls(toolCalls, steps, errors);

        } catch (error) {
            errors.push(`Test diagram creation failed: ${error}`);
            return {
                success: false,
                message: "Test diagram creation failed",
                steps,
                errors
            };
        }
    }
}