import { OllamaClient } from "../ai/ollama-client.js";
import { DiagramAgent, DiagramRequest } from "../ai/diagram-agent.js";
import { McpService } from "./McpService.js";

export class AIService {
  private ollamaClient: OllamaClient;
  private diagramAgent: DiagramAgent;
  private connected: boolean = false;
  private pingInterval?: number;
  private connectionListeners: ((connected: boolean) => void)[] = [];

  constructor(mcpService: McpService) {
    this.ollamaClient = new OllamaClient();
    this.diagramAgent = new DiagramAgent(
      this.ollamaClient,
      mcpService.getClient(),
    );
  }

  public addConnectionListener(listener: (connected: boolean) => void): void {
    this.connectionListeners.push(listener);
  }

  public removeConnectionListener(
    listener: (connected: boolean) => void,
  ): void {
    const index = this.connectionListeners.indexOf(listener);
    if (index > -1) {
      this.connectionListeners.splice(index, 1);
    }
  }

  private notifyConnectionChange(connected: boolean): void {
    if (this.connected !== connected) {
      this.connected = connected;
      console.log(
        `AI/Ollama connection status changed: ${
          connected ? "Connected" : "Disconnected"
        }`,
      );
      this.connectionListeners.forEach((listener) => listener(connected));
    }
  }

  public isConnected(): boolean {
    return this.connected;
  }

  private startConnectionMonitoring(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    // Check connection immediately
    this.checkOllamaConnection();

    // Then check every 60 seconds (less frequent to reduce spam)
    this.pingInterval = window.setInterval(async () => {
      await this.checkOllamaConnection();
    }, 60000);
  }

  private async checkOllamaConnection(): Promise<void> {
    try {
      console.log("AIService: Checking Ollama connection...");
      const isConnected = await this.ollamaClient.checkConnection();
      console.log(`AIService: Ollama connection result: ${isConnected}`);
      this.notifyConnectionChange(isConnected);
    } catch (error) {
      console.error("AIService: Ollama connection check failed:", error);
      this.notifyConnectionChange(false);
    }
  }

  public stopConnectionMonitoring(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }

  public async testOllamaConnection(): Promise<boolean> {
    console.log("AIService: Manual Ollama connection test...");
    const result = await this.ollamaClient.checkConnection();
    console.log(`AIService: Manual test result: ${result}`);
    return result;
  }

  public async checkConnections(): Promise<{ ollama: boolean; mcp: boolean }> {
    console.log("AIService: Checking Ollama and MCP connections...");
    const connections = await this.diagramAgent.checkConnections();
    console.log("AIService: Connection check results:", connections);

    // Start continuous monitoring of Ollama connection
    this.startConnectionMonitoring();

    if (connections.ollama) {
      console.log(
        "AIService: Ollama connected, attempting to auto-select model.",
      );
      await this.ollamaClient.autoSelectModel();
      console.log("AIService: Auto-selected model.");
    }
    return connections;
  }

  public async getAvailableModels(): Promise<string[]> {
    console.log("AIService: Fetching available Ollama models...");
    const models = await this.ollamaClient.getAvailableModelNames();
    console.log("AIService: Available models:", models);
    return models;
  }

  public getCurrentModel(): string {
    return this.ollamaClient.getDefaultModel();
  }

  public setCurrentModel(model: string): void {
    this.ollamaClient.setDefaultModel(model);
  }

  public async createDiagramFromDescription(
    description: string,
    diagramType: string,
  ): Promise<import("../ai/diagram-agent.js").AgentResponse> {
    const request: DiagramRequest = {
      description,
      diagramType,
    };
    return this.diagramAgent.createDiagramFromDescription(request);
  }

  public async optimizeDiagram(
    diagramId: string,
    optimizationType: string,
  ): Promise<import("../ai/diagram-agent.js").AgentResponse> {
    return this.diagramAgent.optimizeDiagram(diagramId, optimizationType);
  }

  public async createTestDiagram(): Promise<
    import("../ai/diagram-agent.js").AgentResponse
  > {
    return this.diagramAgent.createTestDiagram();
  }

  public async createDiagramFromPrompt(
    prompt: string,
    _currentDiagramId?: string,
  ): Promise<import("../ai/diagram-agent.js").AgentResponse> {
    // Determine diagram type from prompt or use current diagram type
    let diagramType = "workflow"; // default

    if (prompt.toLowerCase().includes("bpmn")) {
      diagramType = "bpmn";
    } else if (
      prompt.toLowerCase().includes("class") ||
      prompt.toLowerCase().includes("uml")
    ) {
      diagramType = "uml-class";
    } else if (
      prompt.toLowerCase().includes("wasm") ||
      prompt.toLowerCase().includes("component")
    ) {
      diagramType = "wasm-component";
    } else if (
      prompt.toLowerCase().includes("architecture") ||
      prompt.toLowerCase().includes("system")
    ) {
      diagramType = "system-architecture";
    }

    return this.createDiagramFromDescription(prompt, diagramType);
  }

  public async analyzeDiagram(diagramId: string): Promise<string> {
    try {
      const result = await this.diagramAgent.analyzeDiagram(
        diagramId,
        "comprehensive",
      );
      return result.message || "No analysis available";
    } catch (error) {
      console.error("Failed to analyze diagram:", error);
      return "Analysis failed: " + error;
    }
  }

  public async suggestLayoutImprovements(diagramId: string): Promise<string> {
    try {
      const result = await this.diagramAgent.optimizeDiagram(
        diagramId,
        "layout",
      );
      return (
        result.message ||
        "Layout has been optimized. No additional suggestions."
      );
    } catch (error) {
      console.error("Failed to suggest layout improvements:", error);
      return "Failed to generate suggestions: " + error;
    }
  }
}
