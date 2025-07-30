/**
 * Selection Manager for handling element selection in the diagram editor
 */

export enum SelectionMode {
    Single = 'single',
    Multiple = 'multiple',
    Range = 'range'
}

export interface SelectionState {
    selectedElements: Set<string>;
    hoveredElement: string | null;
    lastSelected: string | null;
    selectionMode: SelectionMode;
}

export interface SelectionChange {
    added: string[];
    removed: string[];
    current: string[];
}

export type SelectionChangeHandler = (change: SelectionChange) => void;

export class SelectionManager {
    private state: SelectionState;
    private changeHandlers: SelectionChangeHandler[] = [];

    constructor() {
        this.state = {
            selectedElements: new Set<string>(),
            hoveredElement: null,
            lastSelected: null,
            selectionMode: SelectionMode.Single
        };
    }

    // Selection operations
    selectElement(elementId: string, mode: SelectionMode = SelectionMode.Single, ctrlKey: boolean = false): void {
        const previousSelection = Array.from(this.state.selectedElements);
        
        if (mode === SelectionMode.Single && !ctrlKey) {
            // Clear selection and select only this element
            this.state.selectedElements.clear();
            this.state.selectedElements.add(elementId);
            this.state.lastSelected = elementId;
        } else if (mode === SelectionMode.Multiple || ctrlKey) {
            // Toggle selection
            if (this.state.selectedElements.has(elementId)) {
                this.state.selectedElements.delete(elementId);
                if (this.state.lastSelected === elementId) {
                    this.state.lastSelected = Array.from(this.state.selectedElements)[0] || null;
                }
            } else {
                this.state.selectedElements.add(elementId);
                this.state.lastSelected = elementId;
            }
        }
        
        this.state.selectionMode = ctrlKey ? SelectionMode.Multiple : mode;
        this.notifyChange(previousSelection);
    }

    selectMultiple(elementIds: string[], append: boolean = false): void {
        const previousSelection = Array.from(this.state.selectedElements);
        
        if (!append) {
            this.state.selectedElements.clear();
        }
        
        elementIds.forEach(id => {
            this.state.selectedElements.add(id);
            this.state.lastSelected = id;
        });
        
        this.state.selectionMode = SelectionMode.Multiple;
        this.notifyChange(previousSelection);
    }

    selectAll(elementIds: string[]): void {
        const previousSelection = Array.from(this.state.selectedElements);
        
        this.state.selectedElements.clear();
        elementIds.forEach(id => this.state.selectedElements.add(id));
        this.state.lastSelected = elementIds[elementIds.length - 1] || null;
        this.state.selectionMode = SelectionMode.Multiple;
        
        this.notifyChange(previousSelection);
    }

    clearSelection(): void {
        const previousSelection = Array.from(this.state.selectedElements);
        
        this.state.selectedElements.clear();
        this.state.lastSelected = null;
        this.state.hoveredElement = null;
        
        this.notifyChange(previousSelection);
    }

    // Hover operations
    setHover(elementId: string | null): void {
        this.state.hoveredElement = elementId;
    }

    // Query operations
    isSelected(elementId: string): boolean {
        return this.state.selectedElements.has(elementId);
    }

    isHovered(elementId: string): boolean {
        return this.state.hoveredElement === elementId;
    }

    getSelectedIds(): string[] {
        return Array.from(this.state.selectedElements);
    }

    getSelectedElements(diagramElements?: Record<string, import('../model/diagram.js').ModelElement>): import('../model/diagram.js').ModelElement[] {
        const selectedIds = this.getSelectedIds();
        if (!diagramElements) {
            // Return basic objects with just IDs if no diagram provided
            return selectedIds.map(id => ({ id }));
        }
        
        // Return full element objects with position data
        return selectedIds.map(id => {
            const element = diagramElements[id];
            if (element) {
                return {
                    id: element.id,
                    type: element.type || element.element_type,
                    bounds: element.bounds || { x: 0, y: 0, width: 50, height: 30 },
                    properties: element.properties || {},
                    ...element
                };
            }
            // Fallback for missing elements
            return { id, bounds: { x: 0, y: 0, width: 50, height: 30 } };
        });
    }

    getSelectedCount(): number {
        return this.state.selectedElements.size;
    }

    getState(): Readonly<SelectionState> {
        return {
            ...this.state,
            selectedElements: new Set(this.state.selectedElements)
        };
    }

    // Selection rectangle
    getElementsInRectangle(
        elements: Map<string, { x: number; y: number; width: number; height: number }>,
        rect: { x: number; y: number; width: number; height: number }
    ): string[] {
        const selected: string[] = [];
        
        elements.forEach((bounds, id) => {
            // Check if element intersects with selection rectangle
            const intersects = !(
                bounds.x > rect.x + rect.width ||
                bounds.x + bounds.width < rect.x ||
                bounds.y > rect.y + rect.height ||
                bounds.y + bounds.height < rect.y
            );
            
            if (intersects) {
                selected.push(id);
            }
        });
        
        return selected;
    }

    // Event handling
    addChangeHandler(handler: SelectionChangeHandler): void {
        this.changeHandlers.push(handler);
    }

    removeChangeHandler(handler: SelectionChangeHandler): void {
        const index = this.changeHandlers.indexOf(handler);
        if (index >= 0) {
            this.changeHandlers.splice(index, 1);
        }
    }

    private notifyChange(previousSelection: string[]): void {
        const currentSelection = Array.from(this.state.selectedElements);
        
        const added = currentSelection.filter(id => !previousSelection.includes(id));
        const removed = previousSelection.filter(id => !currentSelection.includes(id));
        
        const change: SelectionChange = {
            added,
            removed,
            current: currentSelection
        };
        
        this.changeHandlers.forEach(handler => handler(change));
    }

    // Keyboard handling helpers
    handleKeyboardSelection(
        elementId: string,
        event: KeyboardEvent | MouseEvent
    ): void {
        const mode = event.shiftKey ? SelectionMode.Range : 
                     event.ctrlKey || event.metaKey ? SelectionMode.Multiple : 
                     SelectionMode.Single;
        
        this.selectElement(elementId, mode, event.ctrlKey || event.metaKey);
    }

    // Serialization for sync with backend
    toJSON(): object {
        return {
            selectedElements: Array.from(this.state.selectedElements),
            hoveredElement: this.state.hoveredElement,
            lastSelected: this.state.lastSelected,
            selectionMode: this.state.selectionMode
        };
    }

    fromJSON(data: { selectedElementIds?: string[] }): void {
        if (data.selectedElementIds && Array.isArray(data.selectedElementIds)) {
            this.state.selectedElements = new Set(data.selectedElementIds);
        }
        if (data.hoveredElement !== undefined) {
            this.state.hoveredElement = data.hoveredElement;
        }
        if (data.lastSelected !== undefined) {
            this.state.lastSelected = data.lastSelected;
        }
        if (data.selectionMode !== undefined) {
            this.state.selectionMode = data.selectionMode;
        }
    }
}