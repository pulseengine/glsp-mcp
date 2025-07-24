import { DiagramState, DiagramModel } from '../model/diagram.js';
import { McpService } from './McpService.js';
import { diagramTypeRegistry } from '../diagrams/diagram-type-registry.js';
import { statusManager } from './StatusManager.js';

export interface DiagramMetadata {
    id: string;
    name: string;
    diagramType: string;
    created: string;
    modified: string;
    elementCount?: number;
}

export interface ElementWithBounds {
    id: string;
    bounds: {
        x: number;
        y: number;
        width?: number;
        height?: number;
    };
}

export class DiagramService {
    private diagramState: DiagramState;
    private mcpService: McpService;
    private currentDiagramId?: string;

    constructor(mcpService: McpService) {
        this.mcpService = mcpService;
        this.diagramState = new DiagramState();
        this.initializeStreaming();
    }

    private initializeStreaming(): void {
        // Add stream listeners for real-time diagram updates
        this.mcpService.addStreamListener('diagram-update', (data) => {
            this.handleDiagramUpdate(data);
        });

        this.mcpService.addStreamListener('component-status', (data) => {
            this.handleComponentStatusUpdate(data);
        });

        this.mcpService.addStreamListener('validation-result', (data) => {
            this.handleValidationResult(data);
        });

        console.log('DiagramService: Streaming listeners initialized');
    }

    private handleDiagramUpdate(data: unknown): void {
        console.log('DiagramService: Received diagram update:', data);
        try {
            const updateData = data as { diagramId: string; changes: unknown };
            if (updateData.diagramId && this.currentDiagramId === updateData.diagramId) {
                // Reload the current diagram to get latest changes
                this.loadDiagram(updateData.diagramId);
            }
        } catch (error) {
            console.error('Error handling diagram update:', error);
        }
    }

    private handleComponentStatusUpdate(data: unknown): void {
        console.log('DiagramService: Received component status update:', data);
        // This will be used for WASM component status changes
        // For now, just log the update
    }

    private handleValidationResult(data: unknown): void {
        console.log('DiagramService: Received validation result:', data);
        // This will be used for real-time validation feedback
        // For now, just log the result
    }

    public getDiagramState(): DiagramState {
        return this.diagramState;
    }

    public getCurrentDiagramId(): string | undefined {
        return this.currentDiagramId;
    }

    public getCurrentDiagram(): DiagramModel | undefined {
        if (!this.currentDiagramId) return undefined;
        return this.diagramState.getDiagram(this.currentDiagramId);
    }

    public setCurrentDiagramId(id: string | undefined): void {
        this.currentDiagramId = id;
    }

    public async loadDiagram(diagramId: string): Promise<DiagramModel | undefined> {
        try {
            console.log('DiagramService: Loading diagram:', diagramId);
            
            // Set loading status
            statusManager.setDiagramSyncStatus('loading');
            
            const diagram: DiagramModel = await this.mcpService.getDiagramModel(diagramId);
            console.log('DiagramService: Got diagram from MCP service:', diagram);
            if (diagram) {
                console.log('DiagramService: About to update diagram state and set current diagram');
                this.diagramState.updateDiagram(diagram);
                this.currentDiagramId = diagramId;
                
                // Update status manager with current diagram info
                // The diagram object uses different property names - check for various possibilities
                const diagramName = diagram.name || diagram.title || 'Unnamed Diagram';
                console.log('DiagramService: Setting current diagram to:', diagramId, diagramName);
                statusManager.setCurrentDiagram(diagramId, diagramName);
                
                console.log(`DiagramService: Successfully loaded diagram: ${diagram.diagramType || 'unknown-type'}`);
                
                // Pre-load WIT data for WASM components if this is a wasm-component diagram
                if (diagram.diagramType === 'wasm-component') {
                    // Trigger preloading of WIT data after a short delay to allow rendering to complete
                    setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('diagram-loaded-preload-wit'));
                    }, 100);
                }
                console.log('DiagramService: Diagram load completed successfully, returning diagram');
                return diagram;
            } else {
                console.warn('DiagramService: getDiagramModel returned null/undefined for:', diagramId);
                statusManager.setDiagramSyncStatus('error', 'Failed to load diagram');
            }
        } catch (error) {
            console.error('DiagramService: Failed to load diagram:', error);
            statusManager.setDiagramSyncStatus('error', error instanceof Error ? error.message : 'Unknown error');
            
            // If the diagram doesn't exist on the server, clear our local reference
            if (this.currentDiagramId === diagramId) {
                console.warn(`DiagramService: Diagram ${diagramId} no longer exists on server, clearing local reference`);
                this.currentDiagramId = undefined;
                statusManager.clearCurrentDiagram();
            }
        }
        console.log('DiagramService: Returning undefined for diagram:', diagramId);
        return undefined;
    }

    public async createSampleDiagram(): Promise<DiagramModel | undefined> {
        try {
            const result = await this.mcpService.createDiagram('workflow', 'Sample Workflow');

            console.log('Created diagram:', result);

            const match = result.content?.[0]?.text?.match(/ID: ([a-f0-9-]+)/);
            if (match) {
                const diagramId = match[1];
                this.currentDiagramId = diagramId;
                await this.addSampleNodes(diagramId);
                const diagram = await this.loadDiagram(diagramId);
                return diagram;
            }
        } catch (error) {
            console.error('Failed to create sample diagram:', error);
        }
        return undefined;
    }

    private async addSampleNodes(diagramId: string): Promise<void> {
        try {
            const nodeIds: string[] = [];
            
            const startResult = await this.mcpService.callTool('create_node', {
                diagramId,
                nodeType: 'start-event',
                position: { x: 50, y: 100 },
                label: 'Start'
            });
            const startMatch = startResult.content?.[0]?.text?.match(/ID: ([a-f0-9-]+)/);
            if (startMatch) nodeIds.push(startMatch[1]);

            const taskResult = await this.mcpService.callTool('create_node', {
                diagramId,
                nodeType: 'task',
                position: { x: 200, y: 100 },
                label: 'Process Order'
            });
            const taskMatch = taskResult.content?.[0]?.text?.match(/ID: ([a-f0-9-]+)/);
            if (taskMatch) nodeIds.push(taskMatch[1]);

            const gatewayResult = await this.mcpService.callTool('create_node', {
                diagramId,
                nodeType: 'gateway',
                position: { x: 350, y: 100 },
                label: 'Valid?'
            });
            const gatewayMatch = gatewayResult.content?.[0]?.text?.match(/ID: ([a-f0-9-]+)/);
            if (gatewayMatch) nodeIds.push(gatewayMatch[1]);

            const endResult = await this.mcpService.callTool('create_node', {
                diagramId,
                nodeType: 'end-event',
                position: { x: 500, y: 100 },
                label: 'End'
            });
            const endMatch = endResult.content?.[0]?.text?.match(/ID: ([a-f0-9-]+)/);
            if (endMatch) nodeIds.push(endMatch[1]);

            console.log('Sample nodes created:', nodeIds);
            
            if (nodeIds.length > 1) {
                for (let i = 0; i < nodeIds.length - 1; i++) {
                    await this.mcpService.createEdge(diagramId, 'flow', nodeIds[i], nodeIds[i + 1]);
                    console.log(`Created edge: ${nodeIds[i]} → ${nodeIds[i + 1]}`);
                }
            }
            
        } catch (error) {
            console.error('Failed to create sample nodes:', error);
        }
    }


    public async createNewDiagram(diagramType: string, name: string): Promise<string | undefined> {
        try {
            const result = await this.mcpService.createDiagram(diagramType, name);

            const match = result.content?.[0]?.text?.match(/ID: ([a-f0-9-]+)/);
            if (match) {
                const diagramId = match[1];
                await this.loadDiagram(diagramId);
                return diagramId;
            }
        } catch (error) {
            console.error('Failed to create new diagram:', error);
        }
        return undefined;
    }

    public async saveDiagram(diagramId: string): Promise<void> {
        if (!diagramId) return;

        try {
            statusManager.setDiagramSyncStatus('saving');
            const result = await this.mcpService.exportDiagram(diagramId, 'json');
            console.log('Diagram saved:', result);
            statusManager.setDiagramSaved(); // Use the new method for actual saves
        } catch (error) {
            console.error('Failed to save diagram:', error);
            statusManager.setDiagramSyncStatus('error', 'Failed to save diagram');
        }
    }

    public async applyLayout(diagramId: string, algorithm: string): Promise<void> {
        try {
            await this.mcpService.applyLayout(diagramId, algorithm);
            await this.loadDiagram(diagramId);
        } catch (error) {
            console.error('Failed to apply layout:', error);
        }
    }

    public async deleteElements(diagramId: string, elementIds: string[]): Promise<void> {
        if (!diagramId || elementIds.length === 0) return;

        try {
            for (const elementId of elementIds) {
                await this.mcpService.deleteElement(diagramId, elementId);
            }
            await this.loadDiagram(diagramId);
            console.log(`Deleted ${elementIds.length} element(s)`);
        } catch (error) {
            console.error('Failed to delete elements:', error);
        }
    }

    public async createNode(diagramId: string, nodeType: string, position: { x: number; y: number }, label: string, properties?: Record<string, unknown>): Promise<void> {
        if (!diagramId) return;
        
        try {
            statusManager.setDiagramSyncStatus('saving');
            await this.mcpService.createNode(diagramId, nodeType, position, label, properties);
            await this.loadDiagram(diagramId);
            // Node creation IS a save operation to the server
            statusManager.setDiagramSaved();
        } catch (error) {
            console.error('Failed to create node:', error);
            statusManager.setDiagramSyncStatus('error', error instanceof Error ? error.message : 'Unknown error');
        }
    }

    public async createEdge(diagramId: string, edgeType: string, sourceId: string, targetId: string, label?: string): Promise<void> {
        if (!diagramId) return;

        try {
            statusManager.setDiagramSyncStatus('saving');
            await this.mcpService.createEdge(diagramId, edgeType, sourceId, targetId, label);
            await this.loadDiagram(diagramId);
            // Edge creation IS a save operation to the server
            statusManager.setDiagramSaved();
        } catch (error) {
            console.error('Failed to create edge:', error);
            statusManager.setDiagramSyncStatus('error', error instanceof Error ? error.message : 'Unknown error');
        }
    }

    public async getAvailableDiagrams(): Promise<DiagramMetadata[]> {
        try {
            const data = await this.mcpService.listDiagrams();
            return data.diagrams || [];
        } catch (error) {
            console.error('Failed to get available diagrams:', error);
        }
        return [];
    }

    public async deleteDiagram(diagramId: string): Promise<boolean> {
        try {
            const result = await this.mcpService.deleteDiagram(diagramId);
            console.log('DiagramService: Delete result:', result);
            
            // Check if the deletion actually succeeded
            if (result.is_error || (result.content && result.content.some((c: { text?: string }) => c.text && c.text.includes('Unknown tool')))) {
                console.error('DiagramService: Server returned error for delete:', result);
                return false;
            }
            
            // Clear from local state if it's the current diagram
            if (this.currentDiagramId === diagramId) {
                this.currentDiagramId = undefined;
                statusManager.clearCurrentDiagram();
                console.log('DiagramService: Cleared current diagram after deletion');
            }
            
            console.log('DiagramService: Diagram deleted successfully');
            return true;
        } catch (error) {
            console.error('Failed to delete diagram:', error);
            return false;
        }
    }

    public getAvailableDiagramTypes(): import('../diagrams/diagram-type-registry.js').DiagramTypeConfig[] {
        return diagramTypeRegistry.getAvailableTypes();
    }

    // Dirty state tracking methods
    public markDiagramDirty(): void {
        statusManager.setDiagramDirty(true);
        console.log('DiagramService: Marked diagram as dirty (unsaved changes)');
    }

    public markDiagramClean(): void {
        statusManager.setDiagramDirty(false);
        console.log('DiagramService: Marked diagram as clean (saved)');
    }

    public hasUnsavedChanges(): boolean {
        return statusManager.hasUnsavedChanges();
    }

    // Method to be called when diagram operations complete successfully
    public onDiagramOperationSuccess(operationType: string): void {
        console.log(`DiagramService: ${operationType} operation completed successfully`);
        // Operations like move, create, etc. change the diagram but don't save it
        // Mark as having unsaved changes instead of claiming it's "saved"
        statusManager.setDiagramDirty(true);
        statusManager.setDiagramSyncStatus('unsaved');
    }

    // Method to be called when diagram operations start
    public onDiagramOperationStart(operationType: string): void {
        console.log(`DiagramService: ${operationType} operation started`);
        // Don't claim we're "saving" when we're just doing operations
        statusManager.setDiagramSyncStatus('loading');
    }

    // Method to be called when diagram operations fail
    public onDiagramOperationError(operationType: string, error: string): void {
        console.error(`DiagramService: ${operationType} operation failed:`, error);
        statusManager.setDiagramSyncStatus('error', error);
    }

    // Check if current diagram is deletable (has warning implications)
    public isCurrentDiagramDeletable(diagramId: string): boolean {
        return this.currentDiagramId === diagramId;
    }

    // Get the MCP client for making direct tool calls
    public getMcpClient(): import('../mcp/client.js').McpClient {
        return this.mcpService.getClient();
    }

    // Update positions of selected elements and save to server
    public async updateSelectedElementPositions(diagramId: string, selectedElements: ElementWithBounds[]): Promise<void> {
        try {
            console.log('DiagramService: Updating positions for selected elements:', selectedElements.length);
            statusManager.setDiagramSyncStatus('saving');

            // Update each element's position on the server
            for (const element of selectedElements) {
                if (element.bounds && element.id) {
                    await this.mcpService.updateElement(diagramId, element.id, {
                        x: element.bounds.x,
                        y: element.bounds.y
                    });
                    console.log(`DiagramService: Updated position for element ${element.id} to (${element.bounds.x}, ${element.bounds.y})`);
                }
            }

            // Mark diagram as saved after all updates complete
            statusManager.setDiagramSaved();
            console.log('DiagramService: All element positions updated and saved to server');
        } catch (error) {
            console.error('DiagramService: Failed to update element positions:', error);
            statusManager.setDiagramSyncStatus('error', error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
}