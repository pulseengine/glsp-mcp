/**
 * ViewModeManager - Handles view mode transformations without creating new diagrams
 * 
 * This class separates view modes from diagram types, allowing users to switch
 * between different presentations of the same diagram data without data loss.
 */

import { DiagramModel, ModelElement } from '../model/diagram.js';
import { DiagramService } from '../services/DiagramService.js';
import { CanvasRenderer } from '../renderer/canvas-renderer.js';

export interface ViewMode {
    id: string;
    label: string;
    icon: string;
    tooltip: string;
    compatibleDiagramTypes: string[];
}

export interface ViewTransformationResult {
    success: boolean;
    transformedElements?: ModelElement[];
    error?: string;
    additionalData?: Record<string, unknown>;
}

export interface ViewTransformer {
    canTransform(fromView: string, toView: string, diagram: DiagramModel): boolean;
    transform(diagram: DiagramModel, targetView: string): ViewTransformationResult;
}

export class ViewModeManager {
    private currentViewMode: string = 'component';
    private diagramService: DiagramService;
    private renderer: CanvasRenderer;
    private transformers: Map<string, ViewTransformer> = new Map();
    private viewModeListeners: Array<(mode: string) => void> = [];
    private lastTransformationResult?: ViewTransformationResult;
    
    // Available view modes
    private readonly viewModes: ViewMode[] = [
        {
            id: 'component',
            label: 'Component View',
            icon: '📦',
            tooltip: 'View WASM components and their connections',
            compatibleDiagramTypes: ['wasm-component']
        },
        {
            id: 'uml-interface',
            label: 'UML View',
            icon: '📐',
            tooltip: 'View components in UML-style class diagram format',
            compatibleDiagramTypes: ['wasm-component']
        },
        {
            id: 'wit-interface',
            label: 'WIT Interface',
            icon: '🔗',
            tooltip: 'View WIT interfaces with packages, functions, and types',
            compatibleDiagramTypes: ['wasm-component', 'wit-interface']
        },
        {
            id: 'wit-dependencies',
            label: 'Dependencies',
            icon: '🕸️',
            tooltip: 'View interface dependencies and relationships',
            compatibleDiagramTypes: ['wasm-component']
        }
    ];

    constructor(diagramService: DiagramService, renderer: CanvasRenderer) {
        this.diagramService = diagramService;
        this.renderer = renderer;
    }

    /**
     * Register a view transformer for handling specific view transformations
     */
    public registerTransformer(diagramType: string, transformer: ViewTransformer): void {
        this.transformers.set(diagramType, transformer);
    }

    /**
     * Get available view modes for the current diagram type
     */
    public getAvailableViewModes(diagramType?: string): ViewMode[] {
        if (!diagramType) {
            const currentDiagram = this.diagramService.getCurrentDiagram();
            diagramType = currentDiagram?.diagramType || currentDiagram?.diagram_type;
        }

        if (!diagramType) {
            return [];
        }

        return this.viewModes.filter(mode => 
            mode.compatibleDiagramTypes.includes(diagramType!)
        );
    }

    /**
     * Get current view mode
     */
    public getCurrentViewMode(): string {
        return this.currentViewMode;
    }

    /**
     * Switch to a different view mode without creating a new diagram
     */
    public async switchViewMode(targetMode: string): Promise<boolean> {
        // Special case: switching back to component view
        if (targetMode === 'component' && this.currentViewMode !== 'component' && this.lastTransformationResult) {
            console.log('ViewModeManager: Restoring original component view');
            
            // Get the original diagram from the service (which maintains the original state)
            const originalDiagram = this.diagramService.getCurrentDiagram();
            if (originalDiagram) {
                this.renderer.setDiagram(originalDiagram);
                this.currentViewMode = 'component';
                this.renderer.setViewMode('component');
                this.renderer.render();
                this.notifyViewModeChanged('component', this.currentViewMode);
                this.lastTransformationResult = undefined;
                return true;
            }
        }
        
        const currentDiagram = this.diagramService.getCurrentDiagram();
        if (!currentDiagram) {
            console.warn('ViewModeManager: No current diagram to switch views');
            return false;
        }

        const diagramType = currentDiagram.diagramType || currentDiagram.diagram_type;
        if (!diagramType) {
            console.warn('ViewModeManager: Current diagram has no type');
            return false;
        }

        // Check if target view mode is compatible with current diagram type
        const targetViewMode = this.viewModes.find(mode => mode.id === targetMode);
        if (!targetViewMode) {
            console.warn(`ViewModeManager: Unknown view mode: ${targetMode}`);
            return false;
        }

        if (!targetViewMode.compatibleDiagramTypes.includes(diagramType)) {
            console.warn(`ViewModeManager: View mode ${targetMode} not compatible with diagram type ${diagramType}`);
            return false;
        }

        // If switching to the same view mode, do nothing
        if (this.currentViewMode === targetMode) {
            return true;
        }

        // Get transformer for this diagram type
        const transformer = this.transformers.get(diagramType);
        if (!transformer) {
            console.warn(`ViewModeManager: No transformer registered for diagram type: ${diagramType}`);
            return false;
        }

        // Check if transformation is possible
        if (!transformer.canTransform(this.currentViewMode, targetMode, currentDiagram)) {
            console.warn(`ViewModeManager: Cannot transform from ${this.currentViewMode} to ${targetMode}`);
            return false;
        }

        try {
            // Perform the transformation
            const result = transformer.transform(currentDiagram, targetMode);
            
            if (!result.success) {
                console.error('ViewModeManager: Transformation failed:', result.error);
                return false;
            }

            // Update the current view mode
            const previousMode = this.currentViewMode;
            this.currentViewMode = targetMode;

            // Apply the transformed elements to the diagram if provided
            if (result.transformedElements) {
                console.log(`ViewModeManager: Applying ${result.transformedElements.length} transformed elements`);
                
                // Create a new diagram with transformed elements
                const transformedDiagram = {
                    ...currentDiagram,
                    elements: {}
                };
                
                // Convert array to elements map
                result.transformedElements.forEach(element => {
                    transformedDiagram.elements[element.id] = element;
                });
                
                // Update the renderer with the transformed diagram
                this.renderer.setDiagram(transformedDiagram);
            }

            // Update the renderer with view mode context
            this.renderer.setViewMode(targetMode);
            
            // Store transformation result for potential restoration
            this.lastTransformationResult = result;
            
            // Add smooth transition by fading during re-render
            await this.performViewModeTransition(() => {
                this.renderer.render();
            });

            // Notify listeners
            this.notifyViewModeChanged(targetMode, previousMode);

            console.log(`ViewModeManager: Successfully switched from ${previousMode} to ${targetMode}`);
            return true;

        } catch (error) {
            console.error('ViewModeManager: Error during view mode switch:', error);
            return false;
        }
    }

    /**
     * Check if a view mode is compatible with the current diagram
     */
    public isViewModeCompatible(viewMode: string): boolean {
        const currentDiagram = this.diagramService.getCurrentDiagram();
        if (!currentDiagram) return false;

        const diagramType = currentDiagram.diagramType || currentDiagram.diagram_type;
        if (!diagramType) return false;

        const mode = this.viewModes.find(m => m.id === viewMode);
        return mode ? mode.compatibleDiagramTypes.includes(diagramType) : false;
    }

    /**
     * Add listener for view mode changes
     */
    public addViewModeListener(listener: (mode: string, previousMode?: string) => void): void {
        this.viewModeListeners.push(listener);
    }

    /**
     * Remove view mode listener
     */
    public removeViewModeListener(listener: (mode: string, previousMode?: string) => void): void {
        const index = this.viewModeListeners.indexOf(listener);
        if (index > -1) {
            this.viewModeListeners.splice(index, 1);
        }
    }

    /**
     * Reset view mode when diagram changes
     */
    public onDiagramChanged(diagram: DiagramModel | null): void {
        if (!diagram) {
            this.currentViewMode = 'component'; // Default view mode
            return;
        }

        // Check if current view mode is compatible with new diagram
        const diagramType = diagram.diagramType || diagram.diagram_type;
        if (diagramType) {
            const availableModes = this.getAvailableViewModes(diagramType);
            if (availableModes.length > 0) {
                // If current mode is not compatible, switch to first available mode
                if (!availableModes.find(mode => mode.id === this.currentViewMode)) {
                    const newMode = availableModes[0].id;
                    const previousMode = this.currentViewMode;
                    console.log(`ViewModeManager: Switching to compatible view mode: ${newMode}`);
                    this.currentViewMode = newMode;
                    this.notifyViewModeChanged(newMode, previousMode);
                }
            }
        }
    }

    /**
     * Get view mode configuration
     */
    public getViewModeConfig(modeId: string): ViewMode | undefined {
        return this.viewModes.find(mode => mode.id === modeId);
    }

    private notifyViewModeChanged(newMode: string, previousMode?: string): void {
        this.viewModeListeners.forEach(listener => {
            try {
                listener(newMode, previousMode);
            } catch (error) {
                console.error('ViewModeManager: Error in view mode listener:', error);
            }
        });
    }

    /**
     * Perform smooth transition animation during view mode change
     */
    private async performViewModeTransition(renderCallback: () => void): Promise<void> {
        const canvas = this.renderer.getCanvas();
        
        // Apply fade out effect
        canvas.style.transition = 'opacity 150ms ease-out';
        canvas.style.opacity = '0.7';
        
        // Wait for fade out
        await new Promise(resolve => setTimeout(resolve, 75));
        
        // Perform the re-render
        renderCallback();
        
        // Fade back in
        canvas.style.opacity = '1';
        
        // Clean up transition after animation
        setTimeout(() => {
            canvas.style.transition = '';
        }, 150);
    }
}