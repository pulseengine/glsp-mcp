/**
 * Unified Status Manager
 * Manages connection status across all UI components
 */

export type DiagramSyncStatus = 'synced' | 'saving' | 'unsaved' | 'error' | 'loading' | 'none';

export interface DiagramStatus {
    currentDiagramId?: string;
    currentDiagramName?: string;
    syncStatus: DiagramSyncStatus;
    lastSaved?: Date;
    hasUnsavedChanges: boolean;
    errorMessage?: string;
}

export interface ConnectionStatus {
    mcp: boolean;
    ai: boolean;
    message: string;
    lastUpdated: Date;
}

export interface CombinedStatus {
    connection: ConnectionStatus;
    diagram: DiagramStatus;
}

export type StatusListener = (status: CombinedStatus) => void;

export class StatusManager {
    private connectionStatus: ConnectionStatus = {
        mcp: false,
        ai: false,
        message: 'Initializing...',
        lastUpdated: new Date()
    };

    private diagramStatus: DiagramStatus = {
        syncStatus: 'none',
        hasUnsavedChanges: false
    };
    
    private listeners: StatusListener[] = [];

    addListener(listener: StatusListener): void {
        this.listeners.push(listener);
        // Immediately call with current status
        listener(this.getCombinedStatus());
    }

    removeListener(listener: StatusListener): void {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }

    private notifyListeners(): void {
        this.connectionStatus.lastUpdated = new Date();
        this.listeners.forEach(listener => listener(this.getCombinedStatus()));
    }


    setMcpStatus(connected: boolean): void {
        console.log('StatusManager: Setting MCP status to:', connected);
        this.connectionStatus.mcp = connected;
        this.updateMessage();
        this.notifyListeners();
    }

    setAiStatus(connected: boolean): void {
        console.log('StatusManager: Setting AI status to:', connected);
        this.connectionStatus.ai = connected;
        this.updateMessage();
        this.notifyListeners();
    }

    private updateMessage(): void {
        if (this.connectionStatus.mcp && this.connectionStatus.ai) {
            this.connectionStatus.message = 'All services connected';
        } else if (this.connectionStatus.mcp) {
            this.connectionStatus.message = 'MCP connected, AI offline';
        } else if (this.connectionStatus.ai) {
            this.connectionStatus.message = 'AI connected, MCP offline';
        } else {
            this.connectionStatus.message = 'Connecting to services...';
        }
    }

    // Diagram status methods
    setCurrentDiagram(diagramId?: string, diagramName?: string, lastSaved?: Date): void {
        console.log('StatusManager: Setting current diagram:', diagramName, diagramId);
        this.diagramStatus.currentDiagramId = diagramId;
        this.diagramStatus.currentDiagramName = diagramName;
        this.diagramStatus.syncStatus = diagramId ? 'synced' : 'none';
        this.diagramStatus.hasUnsavedChanges = false;
        this.diagramStatus.errorMessage = undefined;
        // Only set lastSaved if explicitly provided (from actual save operation)
        if (lastSaved) {
            this.diagramStatus.lastSaved = lastSaved;
        }
        this.notifyListeners();
    }

    setDiagramSyncStatus(status: DiagramSyncStatus, errorMessage?: string): void {
        console.log('StatusManager: Setting diagram sync status to:', status);
        this.diagramStatus.syncStatus = status;
        this.diagramStatus.errorMessage = errorMessage;
        // Don't automatically update lastSaved - use setDiagramSaved() for actual saves
        this.notifyListeners();
    }

    setDiagramSaved(): void {
        console.log('StatusManager: Diagram successfully saved to server');
        this.diagramStatus.syncStatus = 'synced';
        this.diagramStatus.hasUnsavedChanges = false;
        this.diagramStatus.lastSaved = new Date();
        this.diagramStatus.errorMessage = undefined;
        this.notifyListeners();
    }

    setDiagramDirty(isDirty: boolean): void {
        if (this.diagramStatus.hasUnsavedChanges !== isDirty) {
            console.log('StatusManager: Setting diagram dirty state to:', isDirty);
            this.diagramStatus.hasUnsavedChanges = isDirty;
            if (isDirty && this.diagramStatus.syncStatus === 'synced') {
                this.diagramStatus.syncStatus = 'unsaved';
            }
            this.notifyListeners();
        }
    }

    clearCurrentDiagram(): void {
        console.log('StatusManager: Clearing current diagram');
        console.trace('StatusManager: clearCurrentDiagram called from:');
        this.diagramStatus.currentDiagramId = undefined;
        this.diagramStatus.currentDiagramName = undefined;
        this.diagramStatus.syncStatus = 'none';
        this.diagramStatus.hasUnsavedChanges = false;
        this.diagramStatus.lastSaved = undefined;
        this.diagramStatus.errorMessage = undefined;
        this.notifyListeners();
    }

    // Legacy methods for backward compatibility
    getStatus(): ConnectionStatus {
        return { ...this.connectionStatus };
    }

    getCombinedStatus(): CombinedStatus {
        return {
            connection: { ...this.connectionStatus },
            diagram: { ...this.diagramStatus }
        };
    }

    getDiagramStatus(): DiagramStatus {
        return { ...this.diagramStatus };
    }

    isFullyConnected(): boolean {
        return this.connectionStatus.mcp && this.connectionStatus.ai;
    }

    isMcpConnected(): boolean {
        return this.connectionStatus.mcp;
    }

    isAiConnected(): boolean {
        return this.connectionStatus.ai;
    }

    getCurrentDiagramId(): string | undefined {
        return this.diagramStatus.currentDiagramId;
    }

    getCurrentDiagramName(): string | undefined {
        return this.diagramStatus.currentDiagramName;
    }

    hasCurrentDiagram(): boolean {
        return !!this.diagramStatus.currentDiagramId;
    }

    hasUnsavedChanges(): boolean {
        return this.diagramStatus.hasUnsavedChanges;
    }

    // Component and validation status methods for stream listeners
    setComponentError(componentId: string, message: string): void {
        console.log(`StatusManager: Component ${componentId} error:`, message);
        this.diagramStatus.errorMessage = `Component ${componentId}: ${message}`;
        this.diagramStatus.syncStatus = 'error';
        this.notifyListeners();
    }

    setValidationStatus(status: 'loading' | 'success' | 'warning' | 'error', message: string): void {
        console.log('StatusManager: Setting validation status:', status, message);
        // Update the connection message to show validation status
        if (status === 'loading') {
            this.connectionStatus.message = `Validating diagram... ${message}`;
        } else if (status === 'success') {
            this.connectionStatus.message = `Validation passed: ${message}`;
        } else if (status === 'warning') {
            this.connectionStatus.message = `Validation warnings: ${message}`;
        } else if (status === 'error') {
            this.connectionStatus.message = `Validation failed: ${message}`;
            this.diagramStatus.syncStatus = 'error';
        }
        this.notifyListeners();
    }
}

// Global instance
export const statusManager = new StatusManager();