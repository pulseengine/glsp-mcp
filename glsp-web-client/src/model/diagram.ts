/**
 * Client-side diagram model types
 * Mirrors the Rust server model structures
 */

export interface DiagramModel {
    id: string;
    diagramType: string;
    diagram_type?: string; // Rust uses snake_case
    revision: number;
    root: ModelElement;
    elements: Record<string, ModelElement>;
    name?: string;
    title?: string;
    metadata?: DiagramMetadata;
}

export interface ModelElement {
    id: string;
    type?: string;
    element_type?: string; // Rust uses element_type
    children?: string[];
    bounds?: Bounds;
    layoutOptions?: Record<string, unknown>;
    properties?: Record<string, unknown>; // Explicit properties field
    [key: string]: unknown; // For additional properties
}

export interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Position {
    x: number;
    y: number;
}

export interface Size {
    width: number;
    height: number;
}

export interface Node extends ModelElement {
    position?: Position;
    size?: Size;
    label?: string;
}

export interface Edge extends ModelElement {
    sourceId: string;
    targetId: string;
    routingPoints?: Position[];
    label?: string;
}

export interface Marker {
    label: string;
    description: string;
    elementId: string;
    kind: string;
    severity: 'error' | 'warning' | 'info' | 'hint';
}

export interface ValidationResult {
    diagramId: string;
    isValid: boolean;
    issues: ValidationIssue[];
    summary: {
        errors: number;
        warnings: number;
        info: number;
    };
}

export interface ValidationIssue {
    elementId: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    description: string;
}

export interface DiagramMetadata {
    id: string;
    type: string;
    revision: number;
    statistics: {
        totalElements: number;
        nodes: number;
        edges: number;
        elementTypes: Record<string, number>;
    };
    lastModified: string;
    preferences?: {
        edgeCreationType?: string;
        // Other diagram-specific preferences can be added here
    };
}

// Client-side event types for diagram changes
export interface DiagramEvent {
    type: 'element-added' | 'element-removed' | 'element-updated' | 'model-updated';
    diagramId: string;
    elementId?: string;
    element?: ModelElement;
    model?: DiagramModel;
}

export type DiagramEventHandler = (event: DiagramEvent) => void;

// Client-side diagram state manager
export class DiagramState {
    private diagrams: Map<string, DiagramModel> = new Map();
    private eventHandlers: DiagramEventHandler[] = [];

    addEventHandler(handler: DiagramEventHandler): void {
        this.eventHandlers.push(handler);
    }

    removeEventHandler(handler: DiagramEventHandler): void {
        const index = this.eventHandlers.indexOf(handler);
        if (index > -1) {
            this.eventHandlers.splice(index, 1);
        }
    }

    private emit(event: DiagramEvent): void {
        this.eventHandlers.forEach(handler => handler(event));
    }

    updateDiagram(diagram: DiagramModel): void {
        this.diagrams.set(diagram.id, diagram);
        this.emit({
            type: 'model-updated',
            diagramId: diagram.id,
            model: diagram
        });
    }

    getDiagram(id: string): DiagramModel | undefined {
        return this.diagrams.get(id);
    }

    getAllDiagrams(): DiagramModel[] {
        return Array.from(this.diagrams.values());
    }

    addElement(diagramId: string, element: ModelElement): void {
        const diagram = this.diagrams.get(diagramId);
        if (diagram) {
            diagram.elements[element.id] = element;
            diagram.revision++;
            this.emit({
                type: 'element-added',
                diagramId,
                elementId: element.id,
                element
            });
        }
    }

    removeElement(diagramId: string, elementId: string): void {
        const diagram = this.diagrams.get(diagramId);
        if (diagram && diagram.elements[elementId]) {
            delete diagram.elements[elementId];
            diagram.revision++;
            this.emit({
                type: 'element-removed',
                diagramId,
                elementId
            });
        }
    }

    updateElement(diagramId: string, elementId: string, updates: Partial<ModelElement>): void {
        const diagram = this.diagrams.get(diagramId);
        if (diagram && diagram.elements[elementId]) {
            Object.assign(diagram.elements[elementId], updates);
            diagram.revision++;
            this.emit({
                type: 'element-updated',
                diagramId,
                elementId,
                element: diagram.elements[elementId]
            });
        }
    }

    getElement(diagramId: string, elementId: string): ModelElement | undefined {
        const diagram = this.diagrams.get(diagramId);
        return diagram?.elements[elementId];
    }

    getElementsByType(diagramId: string, type: string): ModelElement[] {
        const diagram = this.diagrams.get(diagramId);
        if (!diagram) return [];
        
        return Object.values(diagram.elements).filter(element => element.type === type);
    }

    getNodes(diagramId: string): Node[] {
        const diagram = this.diagrams.get(diagramId);
        if (!diagram) return [];
        
        return Object.values(diagram.elements)
            .filter(element => {
                const elementType = element.type || element.element_type || '';
                return elementType !== 'graph' && !elementType.includes('edge');
            })
            .map(element => element as Node);
    }

    getEdges(diagramId: string): Edge[] {
        const diagram = this.diagrams.get(diagramId);
        if (!diagram) return [];
        
        return Object.values(diagram.elements)
            .filter(element => {
                const elementType = element.type || element.element_type || '';
                return elementType.includes('edge') || 
                       elementType === 'flow' || 
                       elementType === 'association' || 
                       elementType === 'dependency' ||
                       elementType === 'sequence-flow' ||
                       elementType === 'message-flow' ||
                       elementType === 'conditional-flow';
            })
            .map(element => element as Edge);
    }
}