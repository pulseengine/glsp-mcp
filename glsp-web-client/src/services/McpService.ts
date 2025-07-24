import { McpClient } from '../mcp/client.js';

export interface McpToolResponse {
    is_error?: boolean;
    content?: Array<{ text?: string; type?: string }>;
}

export interface DiagramListResponse {
    diagrams: Array<{
        id: string;
        name: string;
        diagramType: string;
        created: string;
        modified: string;
        elementCount?: number;
    }>;
}

export interface McpResourceContent {
    text?: string;
    type?: string;
}

export interface McpResourceResponse {
    contents?: McpResourceContent[];
}

export class McpService {
    private mcpClient: McpClient;

    constructor() {
        this.mcpClient = new McpClient();
    }

    async initialize(): Promise<void> {
        await this.mcpClient.initialize();
    }

    public isConnected(): boolean {
        return this.mcpClient.isConnected();
    }

    public addConnectionListener(listener: (connected: boolean) => void): void {
        this.mcpClient.addConnectionListener(listener);
    }

    public removeConnectionListener(listener: (connected: boolean) => void): void {
        this.mcpClient.removeConnectionListener(listener);
    }

    public disconnect(): void {
        this.mcpClient.disconnect();
    }

    async callTool(toolName: string, params: Record<string, unknown>): Promise<McpToolResponse> {
        return this.mcpClient.callTool(toolName, params);
    }

    async createDiagram(diagramType: string, name: string): Promise<McpToolResponse> {
        return this.callTool('create_diagram', { diagramType, name });
    }

    async deleteDiagram(diagramId: string): Promise<McpToolResponse> {
        return this.callTool('delete_diagram', { diagramId });
    }

    async createNode(diagramId: string, nodeType: string, position: { x: number; y: number }, label: string, properties?: Record<string, unknown>): Promise<McpToolResponse> {
        const params: Record<string, unknown> = { diagramId, nodeType, position, label };
        if (properties) {
            params.properties = properties;
        }
        return this.callTool('create_node', params);
    }

    async createEdge(diagramId: string, edgeType: string, sourceId: string, targetId: string, label?: string): Promise<McpToolResponse> {
        return this.callTool('create_edge', { diagramId, edgeType, sourceId, targetId, label });
    }

    async updateElement(diagramId: string, elementId: string, position: { x: number, y: number }): Promise<McpToolResponse> {
        return this.callTool('update_element', { diagramId, elementId, position });
    }

    async exportDiagram(diagramId: string, format: string): Promise<McpToolResponse> {
        return this.callTool('export_diagram', { diagramId, format });
    }

    async deleteElement(diagramId: string, elementId: string): Promise<McpToolResponse> {
        return this.callTool('delete_element', { diagramId, elementId });
    }

    async applyLayout(diagramId: string, algorithm: string): Promise<McpToolResponse> {
        return this.callTool('apply_layout', { diagramId, algorithm });
    }

    async listDiagrams(): Promise<DiagramListResponse> {
        const resource = await this.readResource('diagram://list');
        console.log('McpService: List diagrams resource:', resource);
        if (resource && resource.text) {
            const parsed = JSON.parse(resource.text);
            console.log('McpService: Parsed diagram list:', parsed);
            return parsed;
        }
        console.log('McpService: No diagram list found, returning empty');
        return { diagrams: [] };
    }

    async readResource(uri: string): Promise<McpResourceContent> {
        const result = await this.mcpClient.readResource(uri);
        console.log('McpService: Raw resource result for', uri, ':', result);
        
        // Handle both direct ResourceContent and wrapped response formats
        const wrappedResult = result as McpResourceResponse;
        if (wrappedResult.contents && Array.isArray(wrappedResult.contents) && wrappedResult.contents.length > 0) {
            // MCP server is returning wrapped format
            return wrappedResult.contents[0];
        }
        
        // Direct ResourceContent format
        return result;
    }

    async getDiagramModel(diagramId: string): Promise<import('../model/diagram.js').DiagramModel> {
        const resource = await this.readResource(`diagram://model/${diagramId}`);
        console.log('McpService: Diagram model resource for', diagramId, ':', resource);
        console.log('McpService: Resource has text?', !!resource?.text);
        console.log('McpService: Resource keys:', resource ? Object.keys(resource) : 'resource is null');
        if (resource && resource.text) {
            try {
                const parsed = JSON.parse(resource.text);
                console.log('McpService: Successfully parsed diagram model:', parsed);
                return parsed;
            } catch (e) {
                console.error('McpService: Failed to parse diagram model JSON:', e);
                console.error('McpService: Raw text was:', resource.text);
                return undefined;
            }
        }
        console.log('McpService: No valid resource.text found, returning undefined');
        return undefined;
    }

    public getClient(): McpClient {
        return this.mcpClient;
    }

    // MCP Streaming Support
    public addStreamListener(streamType: string, listener: (data: unknown) => void): void {
        this.mcpClient.addStreamListener(streamType, listener);
    }

    public removeStreamListener(streamType: string, listener: (data: unknown) => void): void {
        this.mcpClient.removeStreamListener(streamType, listener);
    }

    public isStreaming(): boolean {
        return this.mcpClient.isStreaming();
    }

    // MCP Notification Support
    public async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
        return this.mcpClient.sendNotification(method, params);
    }

    public addNotificationListener(method: string, listener: (notification: import('../mcp/client.js').McpNotification) => void): void {
        this.mcpClient.addNotificationListener(method, listener);
    }

    public removeNotificationListener(method: string, listener: (notification: import('../mcp/client.js').McpNotification) => void): void {
        this.mcpClient.removeNotificationListener(method, listener);
    }
}