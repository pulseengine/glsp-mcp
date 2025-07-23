/**
 * WASM Component Discovery Service (Thin Client)
 * 
 * Uses MCP backend for all component discovery and monitoring.
 * Replaces the previous client-side file watching implementation.
 */

import { McpClient } from '../mcp/client.js';
import { WasmComponent, WasmInterface, SecurityAnalysis } from '../types/wasm-component.js';

export interface ExecutionProgress {
    executionId: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: number;
    message?: string;
    result?: unknown;
    error?: string;
}

export interface ExecutionResult {
    executionId: string;
    success: boolean;
    result?: unknown;
    error?: string;
    executionTime?: number;
}

export interface WasmFunction {
    name: string;
    params: WasmParam[];
    returns: WasmParam[];
}

export interface WasmParam {
    name: string;
    paramType: string;
}

export interface SecurityIssue {
    issueType: string;
    severity: string;
    description: string;
    location?: string;
}

export interface WasmComponentChange {
    eventType: 'added' | 'modified' | 'removed';
    path: string;
    componentName: string;
    timestamp: number;
}

export class WasmComponentDiscovery {
    private mcpClient: McpClient;
    private components: Map<string, WasmComponent> = new Map();
    private changeListeners: ((change: WasmComponentChange) => void)[] = [];
    private pollInterval?: number;

    constructor(mcpClient: McpClient) {
        this.mcpClient = mcpClient;
    }

    /**
     * Start monitoring for component changes
     * @param pollingInterval - How often to check for changes (ms)
     */
    async startMonitoring(pollingInterval: number = 5000): Promise<void> {
        // Initial scan
        await this.scanComponents();

        // Start polling for changes
        this.pollInterval = window.setInterval(async () => {
            await this.checkForChanges();
        }, pollingInterval);

        console.log('WASM component monitoring started (backend-powered)');
    }

    /**
     * Stop monitoring for changes
     */
    stopMonitoring(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = undefined;
        }
        console.log('WASM component monitoring stopped');
    }

    /**
     * Scan for all available components
     */
    async scanComponents(): Promise<void> {
        try {
            // Call backend tool to scan components
            const response = await this.mcpClient.callTool('scan_wasm_components', {});
            
            if (response.isError) {
                throw new Error(response.content[0].text);
            }

            // Get component list resource
            const listResource = await this.mcpClient.readResource('wasm://components/list');
            const components: WasmComponent[] = JSON.parse(listResource.text || '[]');

            // Update local cache
            this.components.clear();
            components.forEach(comp => {
                this.components.set(comp.name, comp);
            });

            console.log(`Discovered ${components.length} WASM components`);
        } catch (error) {
            console.error('Failed to scan components:', error);
        }
    }

    /**
     * Check for recent changes
     */
    private async checkForChanges(): Promise<void> {
        try {
            // Get recent changes from backend
            const changesResource = await this.mcpClient.readResource('wasm://changes/recent');
            const changes: WasmComponentChange[] = JSON.parse(changesResource.text || '[]');

            // Process changes
            for (const change of changes) {
                // Notify listeners
                this.notifyListeners(change);

                // Update local cache based on change type
                switch (change.eventType) {
                    case 'added':
                    case 'modified':
                        // Refresh component data
                        await this.refreshComponent(change.componentName);
                        break;
                    case 'removed': {
                        // Mark as missing in cache
                        const comp = this.components.get(change.componentName);
                        if (comp) {
                            comp.fileExists = false;
                            comp.removedAt = new Date(change.timestamp * 1000).toISOString();
                        }
                        break;
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to check for changes:', error);
        }
    }

    /**
     * Refresh a specific component's data
     */
    private async refreshComponent(componentName: string): Promise<void> {
        try {
            const response = await this.mcpClient.callTool('check_wasm_component_status', {
                componentName
            });

            if (!response.isError) {
                const componentData: WasmComponent = JSON.parse(response.content[0].text);
                this.components.set(componentName, componentData);
            }
        } catch (error) {
            console.warn(`Failed to refresh component ${componentName}:`, error);
        }
    }

    /**
     * Get all known components
     */
    getComponents(): WasmComponent[] {
        return Array.from(this.components.values());
    }

    /**
     * Get available components (file exists)
     */
    getAvailableComponents(): WasmComponent[] {
        return this.getComponents().filter(c => c.fileExists);
    }

    /**
     * Get missing components (file doesn't exist)
     */
    getMissingComponents(): WasmComponent[] {
        return this.getComponents().filter(c => !c.fileExists);
    }

    /**
     * Get a specific component by name
     */
    getComponent(name: string): WasmComponent | undefined {
        return this.components.get(name);
    }

    /**
     * Check if a component exists
     */
    hasComponent(name: string): boolean {
        return this.components.has(name);
    }

    /**
     * Get security summary
     */
    async getSecuritySummary(): Promise<Record<string, number>> {
        try {
            const resource = await this.mcpClient.readResource('wasm://security/summary');
            return JSON.parse(resource.text || '{}');
        } catch (error) {
            console.error('Failed to get security summary:', error);
            return {};
        }
    }

    /**
     * Execute a WASM component
     */
    async executeComponent(
        componentName: string,
        method: string = 'main',
        args: Record<string, unknown> = {},
        timeoutMs: number = 30000,
        maxMemoryMb: number = 64
    ): Promise<string> {
        const response = await this.mcpClient.callTool('execute_wasm_component', {
            componentName,
            method,
            args,
            timeout_ms: timeoutMs,
            max_memory_mb: maxMemoryMb
        });

        if (response.isError) {
            throw new Error(response.content[0].text);
        }

        // Extract execution ID from response
        const match = response.content[0].text.match(/ID: (\w+)/);
        if (!match) {
            throw new Error('Failed to get execution ID');
        }

        return match[1];
    }

    /**
     * Get execution progress
     */
    async getExecutionProgress(executionId: string): Promise<ExecutionProgress> {
        const response = await this.mcpClient.callTool('get_execution_progress', {
            executionId
        });

        if (response.isError) {
            throw new Error(response.content[0].text);
        }

        return JSON.parse(response.content[0].text);
    }

    /**
     * Get execution result
     */
    async getExecutionResult(executionId: string): Promise<ExecutionResult> {
        const response = await this.mcpClient.callTool('get_execution_result', {
            executionId
        });

        if (response.isError) {
            throw new Error(response.content[0].text);
        }

        return JSON.parse(response.content[0].text);
    }

    /**
     * Add a change listener
     */
    addChangeListener(listener: (change: WasmComponentChange) => void): void {
        this.changeListeners.push(listener);
    }

    /**
     * Remove a change listener
     */
    removeChangeListener(listener: (change: WasmComponentChange) => void): void {
        const index = this.changeListeners.indexOf(listener);
        if (index >= 0) {
            this.changeListeners.splice(index, 1);
        }
    }

    /**
     * Notify all change listeners
     */
    private notifyListeners(change: WasmComponentChange): void {
        this.changeListeners.forEach(listener => {
            try {
                listener(change);
            } catch (error) {
                console.error('Error in change listener:', error);
            }
        });
    }

    /**
     * Remove a missing component permanently
     */
    async removeMissingComponent(componentName: string): Promise<boolean> {
        const response = await this.mcpClient.callTool('remove_missing_component', {
            componentName
        });

        if (!response.isError) {
            this.components.delete(componentName);
            return true;
        }

        return false;
    }

    /**
     * Load a component into a diagram
     */
    async loadComponentIntoDiagram(
        diagramId: string,
        componentName: string,
        position: { x: number; y: number }
    ): Promise<string> {
        const response = await this.mcpClient.callTool('load_wasm_component', {
            diagramId,
            componentName,
            position
        });

        if (response.isError) {
            throw new Error(response.content[0].text);
        }

        // Extract node ID from response
        const match = response.content[0].text.match(/ID: (\w+)/);
        return match ? match[1] : '';
    }
}