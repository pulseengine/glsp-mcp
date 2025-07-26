/**
 * Canvas-based diagram renderer
 * Renders diagram elements using HTML5 Canvas
 */

import { DiagramModel, ModelElement, Node, Edge, Bounds, Position } from '../model/diagram.js';
import { SelectionManager } from '../selection/selection-manager.js';
import { InteractionMode, InteractionModeManager } from '../interaction/interaction-mode.js';
import { WasmComponentRendererV2 } from '../diagrams/wasm-component-renderer-v2.js';
import { UMLComponentRenderer, UMLRenderingContext } from '../diagrams/uml-component-renderer.js';
import { getDiagramTypeConfig } from '../diagrams/diagram-type-registry.js';
import { ComponentInterface } from '../types/wasm-component.js';
import { WitInterface, WitFunction } from '../diagrams/interface-compatibility.js';

// Convert ComponentInterface to WitInterface for compatibility
function convertToWitInterface(componentInterface: ComponentInterface): WitInterface {
    const witFunctions: WitFunction[] = (componentInterface.functions || []).map(func => ({
        name: func.name,
        params: (func.parameters as any[])?.map((param: any) => ({
            name: param.name || 'param',
            param_type: param.type || 'unknown'
        })) || [],
        results: func.return_type ? [{ name: 'result', param_type: func.return_type }] : []
    }));

    return {
        name: componentInterface.name,
        interface_type: componentInterface.interface_type,
        functions: witFunctions
    };
}

interface InterfaceInfo {
    componentId: string;
    interface: ComponentInterface;
    interfaceType: 'import' | 'export';
    position: Position;
}
import { McpClient } from '../mcp/client.js';

export interface RenderOptions {
    backgroundColor?: string;
    nodeColor?: string;
    edgeColor?: string;
    textColor?: string;
    selectedColor?: string;
    gridEnabled?: boolean;
    gridColor?: string;
    scale?: number;
    offset?: Position;
}

export interface InteractionEvent {
    type: 'click' | 'hover' | 'drag-start' | 'drag-move' | 'drag-end' | 'canvas-click' | 'edge-start' | 'edge-end' | 'interface-click';
    position: Position;
    element?: ModelElement;
    sourceElement?: ModelElement; // For edge creation
    interfaceInfo?: {
        componentId: string;
        interface: import('../diagrams/interface-compatibility.js').WitInterface;
        interfaceType: 'import' | 'export';
        connectorPosition: Position;
    };
    originalEvent: MouseEvent;
}

export type InteractionHandler = (event: InteractionEvent) => void;

export class CanvasRenderer {
    private canvas: HTMLCanvasElement;
    protected ctx: CanvasRenderingContext2D;
    private options: Required<RenderOptions>;
    protected currentDiagram?: DiagramModel;
    private selectionManager: SelectionManager;
    private modeManager: InteractionModeManager;
    private interactionHandlers: InteractionHandler[] = [];
    private isDragging = false;
    private dragStart?: Position;
    private dragOffsets: Map<string, Position> = new Map();
    private hasDragged = false;
    private lastMousePosition?: Position;
    private isPanning = false;
    private panStart?: Position;
    private selectionRect?: { start: Position; end: Position };
    private isSelectingRect = false;
    private edgeCreationSource?: ModelElement;
    // Edge creation type (used in setEdgeCreationType method - planned feature)
    private edgeCreationType?: string;
    private edgePreviewTarget?: Position;
    // Interface linking properties
    private interfaceLinkingMode = false;
    private sourceInterfaceInfo?: InterfaceInfo;
    private highlightedInterfaces: Map<string, string[]> = new Map(); // componentId -> interface names
    private interfaceTooltip?: HTMLElement;
    private minScale = 0.1;
    private maxScale = 5.0;
    private scrollBounds?: { minX: number; minY: number; maxX: number; maxY: number };
    private mcpClient?: McpClient;
    private showInterfaceNames: boolean = false;
    private currentViewMode: string = 'component';

    constructor(canvas: HTMLCanvasElement, options: RenderOptions = {}) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Unable to get 2D context from canvas');
        }
        this.ctx = ctx;
        this.selectionManager = new SelectionManager();
        this.modeManager = new InteractionModeManager();

        // Check if dark theme is active
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const isDarkTheme = currentTheme === 'dark';
        
        this.options = {
            backgroundColor: isDarkTheme ? '#0D1117' : '#ffffff',
            nodeColor: '#e1f5fe',
            edgeColor: isDarkTheme ? '#7D8590' : '#666666',
            textColor: isDarkTheme ? '#E6EDF3' : '#333333',
            selectedColor: '#2196f3',
            gridEnabled: true,
            gridColor: isDarkTheme ? '#1C2333' : '#f0f0f0',
            scale: 1.0,
            offset: { x: 0, y: 0 },
            ...options
        };

        this.setupEventListeners();
        this.resizeCanvas();
        
        // Listen to selection changes
        this.selectionManager.addChangeHandler(() => {
            this.render();
        });
    }

    private setupEventListeners(): void {
        // Mouse events - Note: mousedown/up should be before click for proper event ordering
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('click', this.handleClick.bind(this));
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));

        // Resize observer
        const resizeObserver = new ResizeObserver(() => {
            this.resizeCanvas();
            this.render();
        });
        resizeObserver.observe(this.canvas.parentElement || this.canvas);
        
        // Listen for interface names toggle
        window.addEventListener('toggle-interface-names', (e: Event) => {
            const customEvent = e as CustomEvent;
            this.showInterfaceNames = customEvent.detail.show;
            this.render(); // Re-render to show/hide interface names
        });

        
        // Initialize from localStorage
        this.showInterfaceNames = localStorage.getItem('showInterfaceNames') === 'true';
    }

    private resizeCanvas(): void {
        const parent = this.canvas.parentElement || this.canvas;
        const rect = parent.getBoundingClientRect();
        
        // Set canvas size to fill parent
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        
        // Set CSS size
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        this.canvas.style.display = 'block';
    }

    addInteractionHandler(handler: InteractionHandler): void {
        this.interactionHandlers.push(handler);
    }

    removeInteractionHandler(handler: InteractionHandler): void {
        const index = this.interactionHandlers.indexOf(handler);
        if (index > -1) {
            this.interactionHandlers.splice(index, 1);
        }
    }

    private emit(event: InteractionEvent): void {
        this.interactionHandlers.forEach(handler => handler(event));
    }

    private getMousePosition(event: MouseEvent): Position {
        const rect = this.canvas.getBoundingClientRect();
        const worldPos = {
            x: (event.clientX - rect.left - this.options.offset.x) / this.options.scale,
            y: (event.clientY - rect.top - this.options.offset.y) / this.options.scale
        };
        return worldPos;
    }
    
    public screenToWorld(screenX: number, screenY: number): Position {
        return {
            x: (screenX - this.options.offset.x) / this.options.scale,
            y: (screenY - this.options.offset.y) / this.options.scale
        };
    }

    private getElementAt(position: Position): ModelElement | undefined {
        if (!this.currentDiagram) return undefined;

        // Check nodes first (they should be on top)
        for (const element of Object.values(this.currentDiagram.elements)) {
            const elementType = element.type || element.element_type || '';
            if (elementType === 'graph') continue;
            
            if (element.bounds && this.isPointInBounds(position, element.bounds)) {
                return element;
            }
        }

        // Check edges if no node was found
        for (const element of Object.values(this.currentDiagram.elements)) {
            const elementType = element.type || element.element_type || '';
            
            // Check for various edge types
            const isEdge = elementType.includes('edge') || 
                          elementType === 'flow' || 
                          elementType === 'association' || 
                          elementType === 'dependency' ||
                          elementType === 'sequence-flow' ||
                          elementType === 'message-flow' ||
                          elementType === 'conditional-flow';
            
            if (isEdge && this.isPointOnEdge(position, element as Edge)) {
                return element;
            }
        }

        return undefined;
    }

    private isPointInBounds(point: Position, bounds: Bounds): boolean {
        return point.x >= bounds.x && 
               point.x <= bounds.x + bounds.width &&
               point.y >= bounds.y && 
               point.y <= bounds.y + bounds.height;
    }

    private isPointOnEdge(point: Position, edge: Edge): boolean {
        const tolerance = 8; // Pixels tolerance for edge selection (scaled)
        const scaledTolerance = tolerance / this.options.scale;
        
        // Get source and target elements
        const sourceId = String(edge.sourceId || edge.properties?.sourceId || '');
        const targetId = String(edge.targetId || edge.properties?.targetId || '');
        
        if (!sourceId || !targetId) return false;
        
        const sourceElement = this.currentDiagram?.elements[sourceId];
        const targetElement = this.currentDiagram?.elements[targetId];
        
        if (!sourceElement?.bounds || !targetElement?.bounds) return false;
        
        // Calculate source and target centers
        const sourceCenter = {
            x: sourceElement.bounds.x + sourceElement.bounds.width / 2,
            y: sourceElement.bounds.y + sourceElement.bounds.height / 2
        };
        
        const targetCenter = {
            x: targetElement.bounds.x + targetElement.bounds.width / 2,
            y: targetElement.bounds.y + targetElement.bounds.height / 2
        };
        
        // Create line segments to check
        const segments: Array<{start: Position, end: Position}> = [];
        
        if (edge.routingPoints && edge.routingPoints.length > 0) {
            // Edge has routing points
            let prevPoint = sourceCenter;
            
            for (const routingPoint of edge.routingPoints) {
                segments.push({ start: prevPoint, end: routingPoint });
                prevPoint = routingPoint;
            }
            
            // Final segment to target
            segments.push({ start: prevPoint, end: targetCenter });
        } else {
            // Direct line from source to target
            segments.push({ start: sourceCenter, end: targetCenter });
        }
        
        // Check if point is close to any segment
        for (const segment of segments) {
            if (this.distanceToLineSegment(point, segment.start, segment.end) <= scaledTolerance) {
                return true;
            }
        }
        
        return false;
    }

    private distanceToLineSegment(point: Position, lineStart: Position, lineEnd: Position): number {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        
        if (lenSq === 0) {
            // Line start and end are the same point
            return Math.sqrt(A * A + B * B);
        }
        
        const param = dot / lenSq;

        let xx, yy;

        if (param < 0) {
            xx = lineStart.x;
            yy = lineStart.y;
        } else if (param > 1) {
            xx = lineEnd.x;
            yy = lineEnd.y;
        } else {
            xx = lineStart.x + param * C;
            yy = lineStart.y + param * D;
        }

        const dx = point.x - xx;
        const dy = point.y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    protected handleClick(event: MouseEvent): void {
        console.log('handleClick: Method called');
        // Don't process click if we just finished dragging
        if (this.hasDragged) {
            console.log('handleClick: Ignoring click due to drag');
            this.hasDragged = false;
            return;
        }
        
        const position = this.getMousePosition(event);
        const mode = this.modeManager.getMode();
        console.log('handleClick: Mode detected as:', mode, 'InteractionMode.CreateInterfaceLink:', InteractionMode.CreateInterfaceLink);
        console.log('handleClick: Mode comparison result:', mode === InteractionMode.CreateInterfaceLink);
        
        // For interface linking mode, check interface connectors FIRST before element selection
        if (mode === InteractionMode.CreateInterfaceLink) {
            console.log('handleClick: Interface linking mode - checking for connector at', position);
            const interfaceConnector = this.getInterfaceConnectorAt(position);
            console.log('handleClick: Interface connector result:', interfaceConnector);
            if (interfaceConnector) {
                console.log(`INTERFACE CLICK SUCCESS: ${interfaceConnector.interface.name}`);
                this.emit({
                    type: 'interface-click',
                    position,
                    element: interfaceConnector.element,
                    interfaceInfo: {
                        componentId: interfaceConnector.element.id,
                        interface: convertToWitInterface(interfaceConnector.interface),
                        interfaceType: interfaceConnector.side === 'left' ? 'import' : 'export',
                        connectorPosition: interfaceConnector.connectorPosition
                    },
                    originalEvent: event
                });
                return; // Important: return early to prevent component selection
            } else {
                console.log('handleClick: No interface connector found, canceling linking');
                // Click on empty space - cancel interface linking
                this.interfaceLinkingMode = false;
                this.sourceInterfaceInfo = undefined;
                this.clearInterfaceHighlights();
                return;
            }
        }
        
        // For other modes, get element normally
        const element = this.getElementAt(position);
        
        // console.log('Click:', { position, element, mode });

        switch (mode) {
            case InteractionMode.Select:
                if (element) {
                    this.selectionManager.handleKeyboardSelection(element.id, event);
                } else if (!event.ctrlKey && !event.metaKey) {
                    // Clear selection when clicking empty space
                    this.selectionManager.clearSelection();
                }
                this.emit({
                    type: 'click',
                    position,
                    element,
                    originalEvent: event
                });
                break;
                
            case InteractionMode.CreateNode:
                if (!element) {
                    // Create node at clicked position
                    this.emit({
                        type: 'canvas-click',
                        position,
                        originalEvent: event
                    });
                }
                break;
                
            case InteractionMode.CreateEdge: {
                const elementTypeForEdge = element?.type || element?.element_type || '';
                if (element && (elementTypeForEdge === 'task' || elementTypeForEdge.includes('event') || elementTypeForEdge === 'gateway')) {
                    if (!this.edgeCreationSource) {
                        // Start edge creation
                        this.edgeCreationSource = element;
                        this.emit({
                            type: 'edge-start',
                            position,
                            element,
                            originalEvent: event
                        });
                    } else if (element.id !== this.edgeCreationSource.id) {
                        // Complete edge creation
                        this.emit({
                            type: 'edge-end',
                            position,
                            element,
                            sourceElement: this.edgeCreationSource,
                            originalEvent: event
                        });
                        this.edgeCreationSource = undefined;
                        this.edgePreviewTarget = undefined;
                    }
                } else if (!element && this.edgeCreationSource) {
                    // Cancel edge creation
                    this.edgeCreationSource = undefined;
                    this.edgePreviewTarget = undefined;
                    this.render();
                }
                break;
            }

            // Note: InteractionMode.CreateInterfaceLink is handled above the switch statement
        }
    }

    private handleMouseMove(event: MouseEvent): void {
        const position = this.getMousePosition(event);
        this.lastMousePosition = position; // Track mouse position for tooltips
        const element = this.getElementAt(position);
        
        // Handle panning
        if (this.isPanning && this.panStart) {
            const deltaX = event.clientX - this.panStart.x;
            const deltaY = event.clientY - this.panStart.y;
            
            this.options.offset.x += deltaX;
            this.options.offset.y += deltaY;
            
            this.panStart = { x: event.clientX, y: event.clientY };
            this.render();
            return;
        }

        if (this.isDragging && this.dragStart) {
            this.hasDragged = true; // Mark that we've actually dragged
            
            // Update positions of all selected elements
            this.dragOffsets.forEach((offset, id) => {
                const elem = this.currentDiagram?.elements[id];
                if (elem?.bounds) {
                    elem.bounds.x = position.x + offset.x;
                    elem.bounds.y = position.y + offset.y;
                }
            });

            this.emit({
                type: 'drag-move',
                position,
                element,
                originalEvent: event
            });

            this.render();
        } else {
            // Check for interface connector hover first
            const interfaceConnector = this.getInterfaceConnectorAt(position);
            
            if (interfaceConnector) {
                // Show interface connector tooltip
                this.showInterfaceTooltip(interfaceConnector, position);
            } else {
                // Hide tooltip if no connector
                this.hideInterfaceTooltip();
                
                // Handle regular element hover
                const newHovered = element?.id || null;
                if (newHovered !== this.selectionManager.getState().hoveredElement) {
                    this.selectionManager.setHover(newHovered);

                    if (element) {
                        this.emit({
                            type: 'hover',
                            position,
                            element,
                            originalEvent: event
                        });
                    }
                }
            }
            
            // Update cursor based on mode and hover state
            const mode = this.modeManager.getMode();
            if (mode === InteractionMode.Select && element && this.selectionManager.isSelected(element.id)) {
                this.canvas.style.cursor = 'grab';
            } else if (mode === InteractionMode.CreateNode) {
                this.canvas.style.cursor = 'crosshair';
            } else if (mode === InteractionMode.CreateEdge) {
                this.canvas.style.cursor = element ? 'pointer' : 'default';
            } else if (mode === InteractionMode.Pan) {
                this.canvas.style.cursor = 'move';
            } else {
                this.canvas.style.cursor = 'default';
            }
            
            // Update edge preview if creating edge
            if (this.edgeCreationSource) {
                this.edgePreviewTarget = position;
                this.render();
            }
        }
    }

    private handleMouseDown(event: MouseEvent): void {
        const position = this.getMousePosition(event);
        const mode = this.modeManager.getMode();
        
        // Handle middle mouse button for panning
        if (event.button === 1 || (event.button === 0 && mode === InteractionMode.Pan)) {
            this.isPanning = true;
            this.panStart = { x: event.clientX, y: event.clientY };
            this.canvas.style.cursor = 'move';
            event.preventDefault();
            return;
        }

        // In interface linking mode, don't process element selection at all
        if (mode === InteractionMode.CreateInterfaceLink) {
            return;
        }

        const element = this.getElementAt(position);

        if (element && this.selectionManager.isSelected(element.id) && mode === InteractionMode.Select) {
            this.isDragging = true;
            this.dragStart = position;
            this.canvas.style.cursor = 'grabbing';
            
            // Calculate drag offsets for all selected elements
            this.dragOffsets.clear();
            const selectedIds = this.selectionManager.getSelectedIds();
            
            selectedIds.forEach(id => {
                const elem = this.currentDiagram?.elements[id];
                if (elem?.bounds) {
                    this.dragOffsets.set(id, {
                        x: elem.bounds.x - position.x,
                        y: elem.bounds.y - position.y
                    });
                }
            });

            this.emit({
                type: 'drag-start',
                position,
                element,
                originalEvent: event
            });
        }
    }

    private handleMouseUp(event: MouseEvent): void {
        if (this.isPanning) {
            this.isPanning = false;
            this.panStart = undefined;
            this.canvas.style.cursor = 'default';
            return;
        }
        
        if (this.isDragging) {
            const position = this.getMousePosition(event);
            const element = this.getElementAt(position);

            this.isDragging = false;
            this.dragStart = undefined;
            this.dragOffsets.clear();
            this.canvas.style.cursor = 'default';

            this.emit({
                type: 'drag-end',
                position,
                element,
                originalEvent: event
            });
        }
    }

    private handleWheel(event: WheelEvent): void {
        event.preventDefault();
        
        // Use Ctrl/Cmd for zoom, otherwise pan
        if (event.ctrlKey || event.metaKey) {
            // Zoom
            const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.options.scale * scaleFactor));
            
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            
            // Calculate world position before zoom
            const worldX = (mouseX - this.options.offset.x) / this.options.scale;
            const worldY = (mouseY - this.options.offset.y) / this.options.scale;
            
            // Update scale
            this.options.scale = newScale;
            
            // Calculate new offset to keep mouse position fixed
            this.options.offset.x = mouseX - worldX * newScale;
            this.options.offset.y = mouseY - worldY * newScale;
        } else {
            // Pan with scroll wheel
            const sensitivity = 1.0;
            this.options.offset.x -= event.deltaX * sensitivity;
            this.options.offset.y -= event.deltaY * sensitivity;
        }
        
        // Apply pan constraints if we have bounds
        this.constrainPan();
        this.render();
    }

    setDiagram(diagram: DiagramModel): void {
        this.currentDiagram = diagram;
        this.selectionManager.clearSelection();
        this.updateScrollBounds();
        this.render();
    }

    clear(): void {
        this.currentDiagram = undefined;
        this.selectionManager.clearSelection();
        this.render();
    }

    setSelected(elementIds: string[]): void {
        this.selectionManager.selectMultiple(elementIds, false);
    }
    
    getSelectionManager(): SelectionManager {
        return this.selectionManager;
    }
    
    getModeManager(): InteractionModeManager {
        return this.modeManager;
    }
    
    getCurrentDiagram(): DiagramModel | undefined {
        return this.currentDiagram;
    }

    pan(deltaX: number, deltaY: number): void {
        this.options.offset.x += deltaX;
        this.options.offset.y += deltaY;
        this.render();
    }

    zoom(scaleFactor: number, center?: Position): void {
        const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.options.scale * scaleFactor));
        
        if (center) {
            // Zoom toward specific point
            this.options.offset.x = center.x - (center.x - this.options.offset.x) * (newScale / this.options.scale);
            this.options.offset.y = center.y - (center.y - this.options.offset.y) * (newScale / this.options.scale);
        } else {
            // Zoom toward canvas center
            const centerX = this.canvas.clientWidth / 2;
            const centerY = this.canvas.clientHeight / 2;
            this.options.offset.x = centerX - (centerX - this.options.offset.x) * (newScale / this.options.scale);
            this.options.offset.y = centerY - (centerY - this.options.offset.y) * (newScale / this.options.scale);
        }
        
        this.options.scale = newScale;
        this.constrainPan();
        this.render();
    }

    fitToContent(): void {
        if (!this.currentDiagram) return;

        const elements = Object.values(this.currentDiagram.elements).filter(e => e.bounds);
        if (elements.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        elements.forEach(element => {
            if (element.bounds) {
                minX = Math.min(minX, element.bounds.x);
                minY = Math.min(minY, element.bounds.y);
                maxX = Math.max(maxX, element.bounds.x + element.bounds.width);
                maxY = Math.max(maxY, element.bounds.y + element.bounds.height);
            }
        });

        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        const canvasWidth = this.canvas.clientWidth;
        const canvasHeight = this.canvas.clientHeight;

        const scaleX = canvasWidth / (contentWidth + 100); // Add padding
        const scaleY = canvasHeight / (contentHeight + 100);
        const scale = Math.min(scaleX, scaleY, 1.0); // Don't zoom in beyond 100%

        this.options.scale = scale;
        this.options.offset.x = (canvasWidth - contentWidth * scale) / 2 - minX * scale;
        this.options.offset.y = (canvasHeight - contentHeight * scale) / 2 - minY * scale;
        
        // Update scroll bounds
        this.updateScrollBounds();
        this.render();
    }

    render(): void {
        this.ctx.save();
        
        // Clear canvas
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);

        // If no diagram, show empty state
        if (!this.currentDiagram) {
            this.drawEmptyState();
            this.ctx.restore();
            return;
        }

        // Apply transformations
        this.ctx.translate(this.options.offset.x, this.options.offset.y);
        this.ctx.scale(this.options.scale, this.options.scale);

        // Draw grid
        if (this.options.gridEnabled) {
            this.drawGrid();
        }

        // Draw edges first (so they appear behind nodes)
        this.drawEdges();

        // Draw nodes
        this.drawNodes();
        
        // Draw selection rectangle if active
        if (this.isSelectingRect && this.selectionRect) {
            this.drawSelectionRectangle();
        }
        
        // Draw edge preview if creating edge
        if (this.edgeCreationSource && this.edgePreviewTarget) {
            this.drawEdgePreview();
        }

        this.ctx.restore();
    }
    
    private updateScrollBounds(): void {
        if (!this.currentDiagram) return;
        
        const elements = Object.values(this.currentDiagram.elements).filter(e => e.bounds);
        if (elements.length === 0) {
            this.scrollBounds = undefined;
            return;
        }
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        elements.forEach(element => {
            if (element.bounds) {
                let elementMinX = element.bounds.x;
                const elementMinY = element.bounds.y;
                let elementMaxX = element.bounds.x + element.bounds.width;
                const elementMaxY = element.bounds.y + element.bounds.height;
                
                // For WASM components, account for interface connectors that extend beyond bounds
                const nodeType = element.type || element.element_type || '';
                if (this.isWasmComponentType(nodeType) && nodeType !== 'import-interface' && nodeType !== 'export-interface') {
                    const interfaces = element.properties?.interfaces as ComponentInterface[] || [];
                    if (interfaces.length > 0) {
                        const connectorExtension = 20; // connectors extend ~20px from component edges
                        elementMinX -= connectorExtension; // Left side import connectors
                        elementMaxX += connectorExtension; // Right side export connectors
                        
                        // Account for interface labels
                        const labelExtension = 80; // Interface labels can be quite long
                        elementMinX -= labelExtension; // Left side labels
                        elementMaxX += labelExtension; // Right side labels
                    }
                }
                
                minX = Math.min(minX, elementMinX);
                minY = Math.min(minY, elementMinY);
                maxX = Math.max(maxX, elementMaxX);
                maxY = Math.max(maxY, elementMaxY);
            }
        });
        
        // Add padding around content
        const padding = 200;
        this.scrollBounds = {
            minX: minX - padding,
            minY: minY - padding,
            maxX: maxX + padding,
            maxY: maxY + padding
        };
    }
    
    private constrainPan(): void {
        if (!this.scrollBounds) return;
        
        const canvasWidth = this.canvas.clientWidth;
        const canvasHeight = this.canvas.clientHeight;
        
        // Calculate world bounds at current scale
        const worldMinX = this.scrollBounds.minX * this.options.scale;
        const worldMinY = this.scrollBounds.minY * this.options.scale;
        const worldMaxX = this.scrollBounds.maxX * this.options.scale;
        const worldMaxY = this.scrollBounds.maxY * this.options.scale;
        
        // Calculate content size in screen coordinates
        const contentWidth = worldMaxX - worldMinX;
        const contentHeight = worldMaxY - worldMinY;
        
        // Only constrain if content is larger than viewport
        if (contentWidth > canvasWidth) {
            // Allow scrolling within content bounds
            const maxOffsetX = canvasWidth - worldMinX;
            const minOffsetX = canvasWidth - worldMaxX;
            this.options.offset.x = Math.max(minOffsetX, Math.min(maxOffsetX, this.options.offset.x));
        }
        
        if (contentHeight > canvasHeight) {
            // Allow scrolling within content bounds
            const maxOffsetY = canvasHeight - worldMinY;
            const minOffsetY = canvasHeight - worldMaxY;
            this.options.offset.y = Math.max(minOffsetY, Math.min(maxOffsetY, this.options.offset.y));
        }
    }
    
    getScale(): number {
        return this.options.scale;
    }
    
    getOffset(): Position {
        return { ...this.options.offset };
    }
    
    getWorldBounds(): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
        return this.scrollBounds ? { ...this.scrollBounds } : undefined;
    }
    
    resetView(): void {
        this.options.scale = 1.0;
        this.options.offset = { x: 0, y: 0 };
        this.updateScrollBounds();
        this.render();
    }

    // Public method to refresh scroll bounds when content changes
    refreshScrollBounds(): void {
        this.updateScrollBounds();
        this.render();
    }

    private drawGrid(): void {
        const gridSize = 20;
        const startX = Math.floor(-this.options.offset.x / this.options.scale / gridSize) * gridSize;
        const startY = Math.floor(-this.options.offset.y / this.options.scale / gridSize) * gridSize;
        const endX = startX + (this.canvas.clientWidth / this.options.scale) + gridSize;
        const endY = startY + (this.canvas.clientHeight / this.options.scale) + gridSize;

        this.ctx.strokeStyle = this.options.gridColor;
        this.ctx.lineWidth = 1 / this.options.scale;
        this.ctx.beginPath();

        for (let x = startX; x < endX; x += gridSize) {
            this.ctx.moveTo(x, startY);
            this.ctx.lineTo(x, endY);
        }

        for (let y = startY; y < endY; y += gridSize) {
            this.ctx.moveTo(startX, y);
            this.ctx.lineTo(endX, y);
        }

        this.ctx.stroke();
    }

    private drawNodes(): void {
        if (!this.currentDiagram) return;

        const elements = Object.values(this.currentDiagram.elements);

        elements.forEach(element => {
            const elementType = element.type || element.element_type;
            if (elementType === 'graph' || !element.bounds) {
                return;
            }
            
            this.drawNode(element as Node);
        });
    }

    private drawNode(node: Node): void {
        // Ensure element has bounds before rendering
        this.ensureElementBounds(node);
        
        if (!node.bounds) {
            console.warn('drawNode: Skipping node without bounds:', node.id);
            return;
        }

        const isSelected = this.selectionManager.isSelected(node.id);
        const isHovered = this.selectionManager.isHovered(node.id);
        const nodeType = this.getElementType(node);

        // Debug: Log node type for troubleshooting
        console.log(`Rendering node ${node.id} with type: ${nodeType}`);

        // Check if this is a WIT interface type
        if (this.isWitInterfaceType(nodeType)) {
            console.log(`Using WIT renderer for node ${node.id}`);
            this.drawWitInterfaceNode(node, isSelected, isHovered);
            return;
        }

        // Check if this is a WASM component type
        if (this.isWasmComponentType(nodeType)) {
            // Use UML rendering if in UML interface view mode
            if (this.currentViewMode === 'uml-interface') {
                const umlContext: UMLRenderingContext = {
                    ctx: this.ctx,
                    scale: this.options.scale,
                    isSelected,
                    isHovered,
                    style: {
                        primaryColor: '#2D3748',
                        backgroundColor: '#FFFFFF',
                        borderColor: '#4A5568',
                        textColor: '#1A202C',
                        secondaryTextColor: '#4A5568',
                        compartmentLineColor: '#CBD5E0',
                        interfaceColor: '#3182CE',
                        selectedColor: '#3182CE',
                        fontFamily: 'Arial, sans-serif',
                        fontSize: 12,
                        headerFontSize: 14,
                        lineHeight: 1.4,
                        padding: 12,
                        compartmentPadding: 8,
                        borderWidth: 1,
                        cornerRadius: 4
                    },
                    renderMode: 'component',
                    showStereotypes: true,
                    showVisibility: true,
                    showMethodSignatures: true
                };

                // Calculate optimal size for UML component to accommodate interface data
                const optimalSize = UMLComponentRenderer.calculateOptimalSize(node, umlContext.style, umlContext);
                const umlBounds = {
                    x: node.bounds.x,
                    y: node.bounds.y,
                    width: Math.max(node.bounds.width, optimalSize.width),
                    height: Math.max(node.bounds.height, optimalSize.height)
                };
                
                UMLComponentRenderer.renderUMLComponent(node, umlBounds, umlContext);
                return;
            }

            // Default WASM component rendering
            const colors = WasmComponentRendererV2.getDefaultColors();
            
            // Check if component file is missing or not loaded
            const isMissing = this.isComponentMissingFile(node);
            // Component load state (available for future features)
        // const isLoaded = node.properties?.isLoaded === true;
            
            // Update node properties to include load status
            if (!node.properties) {
                node.properties = {};
            }
            
            const context = {
                ctx: this.ctx,
                scale: this.options.scale,
                isSelected,
                isHovered,
                isMissing: isMissing, // Only show as missing if file is actually missing
                colors,
                showTooltip: isHovered, // Show tooltip when hovering
                mousePosition: this.lastMousePosition, // Add mouse position for tooltip
                showInterfaceNames: this.showInterfaceNames // Pass the toggle state
            };

            // Use the new V2 renderer for all WASM components
            // The V2 renderer handles both main components and interface nodes in one unified design
            WasmComponentRendererV2.renderWasmComponent(node, node.bounds, context);
            return;
        }

        // Default rendering for other node types
        this.ctx.fillStyle = isSelected ? this.options.selectedColor : this.options.nodeColor;
        this.ctx.strokeStyle = isHovered ? this.options.selectedColor : this.options.edgeColor;
        this.ctx.lineWidth = isSelected ? 3 : 1;

        // Draw different shapes based on node type
        switch (nodeType) {
            case 'start-event':
                this.drawCircle(node.bounds, true);
                break;
            case 'end-event':
                this.drawCircle(node.bounds, false);
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
                break;
            case 'gateway':
                this.drawDiamond(node.bounds);
                break;
            default:
                this.drawRectangle(node.bounds);
                break;
        }

        // Draw label
        const label = String(node.label || node.properties?.label || '');
        if (label) {
            this.drawLabel(label, node.bounds);
        }
    }
    
    private isWasmComponentType(nodeType: string): boolean {
        return [
            'wasm-component',
            'host-component',
            'import-interface',
            'export-interface',
            'composition-root',
            'uml-component',
            'uml-interface'
        ].includes(nodeType);
    }
    
    private isWitInterfaceType(nodeType: string): boolean {
        return [
            'wit-package',
            'wit-world',
            'wit-interface',
            'wit-function',
            'wit-type',
            'wit-record',
            'wit-variant',
            'wit-enum',
            'wit-flags',
            'wit-resource'
        ].includes(nodeType);
    }
    
    private drawWitInterfaceNode(node: Node, isSelected: boolean, isHovered: boolean): void {
        if (!node.bounds) return;
        
        const nodeType = node.type || node.element_type || '';
        const style = this.getWitNodeStyle(nodeType);
        
        // Draw base shape
        this.ctx.fillStyle = style.backgroundColor;
        this.ctx.strokeStyle = isSelected ? '#654FF0' : (isHovered ? style.borderColor : style.borderColor);
        this.ctx.lineWidth = isSelected ? 3 : (isHovered ? 2 : 1);
        
        // Draw rounded rectangle using built-in canvas API
        this.ctx.beginPath();
        this.ctx.roundRect(
            node.bounds.x,
            node.bounds.y,
            node.bounds.width,
            node.bounds.height,
            6
        );
        
        this.ctx.fill();
        this.ctx.stroke();
        
        // Draw icon and text
        this.drawWitNodeContent(node, nodeType, style);
        
        // Draw selection highlight if selected
        if (isSelected) {
            this.ctx.save();
            this.ctx.strokeStyle = '#654FF0';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.roundRect(
                node.bounds.x - 2,
                node.bounds.y - 2,
                node.bounds.width + 4,
                node.bounds.height + 4,
                8
            );
            this.ctx.stroke();
            this.ctx.restore();
        }
    }
    
    private getWitNodeStyle(nodeType: string): any {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const isDarkTheme = currentTheme === 'dark';
        
        
        const styles: { [key: string]: any } = {
            'wit-package': {
                backgroundColor: isDarkTheme ? '#1C2333' : '#F6F8FA',
                borderColor: isDarkTheme ? '#3D444D' : '#D0D7DE',
                textColor: isDarkTheme ? '#E6EDF3' : '#1F2328',
                icon: '📦'
            },
            'wit-world': {
                backgroundColor: isDarkTheme ? '#151B2C' : '#FFFFFF',
                borderColor: isDarkTheme ? '#3D444D' : '#D0D7DE',
                textColor: isDarkTheme ? '#E6EDF3' : '#1F2328',
                icon: '🌐'
            },
            'wit-interface': {
                backgroundColor: isDarkTheme ? '#0F1419' : '#F6F8FA',
                borderColor: isDarkTheme ? '#654FF0' : '#6639BA',
                textColor: isDarkTheme ? '#E6EDF3' : '#1F2328',
                icon: '🔷'
            },
            'wit-function': {
                backgroundColor: isDarkTheme ? '#0D1117' : '#F1F8FF',
                borderColor: isDarkTheme ? '#58A6FF' : '#0969DA',
                textColor: isDarkTheme ? '#E6EDF3' : '#1F2328',
                icon: '🔧'
            },
            'wit-type': {
                backgroundColor: '#151B2C',
                borderColor: '#7D8590',
                textColor: '#E6EDF3',
                icon: '📐'
            },
            'wit-record': {
                backgroundColor: '#0F1419',
                borderColor: '#3FB950',
                textColor: '#E6EDF3',
                icon: '📋'
            },
            'wit-variant': {
                backgroundColor: '#151B2C',
                borderColor: '#F0B72F',
                textColor: '#E6EDF3',
                icon: '🔀'
            },
            'wit-enum': {
                backgroundColor: '#0F1419',
                borderColor: '#F85149',
                textColor: '#E6EDF3',
                icon: '📑'
            },
            'wit-flags': {
                backgroundColor: '#151B2C',
                borderColor: '#FF7B72',
                textColor: '#E6EDF3',
                icon: '🚩'
            },
            'wit-resource': {
                backgroundColor: '#0F1419',
                borderColor: '#A5A5A5',
                textColor: '#E6EDF3',
                icon: '🔗'
            }
        };
        
        return styles[nodeType] || styles['wit-interface'];
    }
    
    private drawWitNodeContent(node: Node, nodeType: string, style: any): void {
        if (!node.bounds) return;
        
        const icon = style.icon;
        const name = node.label || node.properties?.name || node.id;
        const centerX = node.bounds.x + node.bounds.width / 2;
        const iconY = node.bounds.y + 20;
        const textY = node.bounds.y + 40;
        
        // Draw icon
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = style.textColor;
        this.ctx.fillText(icon, centerX, iconY);
        
        // Draw name
        this.ctx.font = '12px Arial';
        this.ctx.fillStyle = style.textColor;
        this.ctx.fillText(name, centerX, textY);
        
        // Draw additional info for specific types
        if (nodeType === 'wit-interface') {
            const functionCount = node.properties?.functionCount || 0;
            const typeCount = node.properties?.typeCount || 0;
            const infoText = `${functionCount}f, ${typeCount}t`;
            
            this.ctx.font = '10px Arial';
            this.ctx.fillStyle = '#7D8590';
            this.ctx.fillText(infoText, centerX, textY + 15);
        } else if (nodeType === 'wit-package') {
            const interfaceCount = node.properties?.interfaceCount || 0;
            const infoText = `${interfaceCount} interfaces`;
            
            this.ctx.font = '10px Arial';
            this.ctx.fillStyle = '#7D8590';
            this.ctx.fillText(infoText, centerX, textY + 15);
        }
    }

    private drawEdges(): void {
        if (!this.currentDiagram) return;

        Object.values(this.currentDiagram.elements).forEach(element => {
            const elementType = element.type || element.element_type || '';
            // Check for various edge types - the backend might use 'flow' instead of 'edge'
            const isEdge = elementType.includes('edge') || 
                          elementType === 'flow' || 
                          elementType === 'association' || 
                          elementType === 'dependency' ||
                          elementType === 'sequence-flow' ||
                          elementType === 'message-flow' ||
                          elementType === 'conditional-flow' ||
                          elementType.startsWith('wit-') && (elementType.includes('contains') || 
                                                              elementType.includes('import') || 
                                                              elementType.includes('export'));
            
            if (!isEdge) return;
            
            this.drawEdge(element as Edge);
        });
    }

    private drawEdge(edge: Edge): void {
        // Handle both direct properties and properties object
        const sourceId = String(edge.source || edge.sourceId || edge.properties?.sourceId || '');
        const targetId = String(edge.target || edge.targetId || edge.properties?.targetId || '');
        
        if (!sourceId || !targetId) {
            console.warn('Edge missing sourceId or targetId:', edge);
            return;
        }
        
        const sourceElement = this.currentDiagram?.elements[sourceId];
        const targetElement = this.currentDiagram?.elements[targetId];

        if (!sourceElement?.bounds || !targetElement?.bounds) return;

        const isSelected = this.selectionManager.isSelected(edge.id);
        const isHovered = this.selectionManager.isHovered(edge.id);
        
        const edgeType = edge.type || edge.element_type || '';
        
        // Check if this is a WIT interface edge type
        if (this.isWitEdgeType(edgeType)) {
            this.drawWitEdge(edge, sourceElement, targetElement, isSelected, isHovered);
            return;
        }
        
        // Check if this is a UML edge type
        if (this.isUMLEdgeType(edgeType)) {
            this.drawUMLEdge(edge, sourceElement, targetElement, isSelected, isHovered);
            return;
        }

        this.ctx.strokeStyle = isSelected || isHovered ? this.options.selectedColor : this.options.edgeColor;
        this.ctx.lineWidth = isSelected ? 3 : (isHovered ? 2 : 1);

        // Calculate connection points
        const sourceCenter = {
            x: sourceElement.bounds.x + sourceElement.bounds.width / 2,
            y: sourceElement.bounds.y + sourceElement.bounds.height / 2
        };

        const targetCenter = {
            x: targetElement.bounds.x + targetElement.bounds.width / 2,
            y: targetElement.bounds.y + targetElement.bounds.height / 2
        };

        // Draw line based on edge creation type
        this.drawEdgeByType(sourceCenter, targetCenter, edge.routingPoints, this.edgeCreationType || 'straight');

        // Draw arrowhead
        this.drawArrowhead(targetCenter, sourceCenter);

        // Draw edge label
        const edgeLabel = edge.label || edge.properties?.label;
        if (edgeLabel) {
            const midPoint = {
                x: (sourceCenter.x + targetCenter.x) / 2,
                y: (sourceCenter.y + targetCenter.y) / 2
            };
            this.drawEdgeLabel(edgeLabel, midPoint);
        }
    }
    
    private drawEdgeByType(
        sourceCenter: Position, 
        targetCenter: Position, 
        routingPoints?: Position[], 
        edgeType: string = 'straight'
    ): void {
        this.ctx.beginPath();
        
        switch (edgeType) {
            case 'curved':
                this.drawCurvedEdge(sourceCenter, targetCenter, routingPoints);
                break;
            case 'orthogonal':
                this.drawOrthogonalEdge(sourceCenter, targetCenter, routingPoints);
                break;
            case 'bezier':
                this.drawBezierEdge(sourceCenter, targetCenter, routingPoints);
                break;
            case 'straight':
            default:
                this.drawStraightEdge(sourceCenter, targetCenter, routingPoints);
                break;
        }
        
        this.ctx.stroke();
    }
    
    private drawStraightEdge(sourceCenter: Position, targetCenter: Position, routingPoints?: Position[]): void {
        this.ctx.moveTo(sourceCenter.x, sourceCenter.y);
        
        if (routingPoints && routingPoints.length > 0) {
            routingPoints.forEach(point => {
                this.ctx.lineTo(point.x, point.y);
            });
        }
        
        this.ctx.lineTo(targetCenter.x, targetCenter.y);
    }
    
    private drawCurvedEdge(sourceCenter: Position, targetCenter: Position, routingPoints?: Position[]): void {
        this.ctx.moveTo(sourceCenter.x, sourceCenter.y);
        
        if (routingPoints && routingPoints.length > 0) {
            // Use quadratic curves between points
            let currentPoint = sourceCenter;
            routingPoints.forEach(routingPoint => {
                const controlX = (currentPoint.x + routingPoint.x) / 2;
                const controlY = currentPoint.y; // Keep control point at source Y level for smooth curve
                this.ctx.quadraticCurveTo(controlX, controlY, routingPoint.x, routingPoint.y);
                currentPoint = routingPoint;
            });
            
            // Final curve to target
            const controlX = (currentPoint.x + targetCenter.x) / 2;
            const controlY = currentPoint.y;
            this.ctx.quadraticCurveTo(controlX, controlY, targetCenter.x, targetCenter.y);
        } else {
            // Simple curved edge without routing points
            const controlX = (sourceCenter.x + targetCenter.x) / 2;
            const controlY = sourceCenter.y - Math.abs(targetCenter.x - sourceCenter.x) * 0.2; // Curve upward
            this.ctx.quadraticCurveTo(controlX, controlY, targetCenter.x, targetCenter.y);
        }
    }
    
    private drawOrthogonalEdge(sourceCenter: Position, targetCenter: Position, routingPoints?: Position[]): void {
        this.ctx.moveTo(sourceCenter.x, sourceCenter.y);
        
        if (routingPoints && routingPoints.length > 0) {
            // Use routing points as-is for orthogonal edges
            routingPoints.forEach(point => {
                this.ctx.lineTo(point.x, point.y);
            });
            this.ctx.lineTo(targetCenter.x, targetCenter.y);
        } else {
            // Create orthogonal routing (L-shaped)
            const midX = sourceCenter.x + (targetCenter.x - sourceCenter.x) / 2;
            
            // Go right/left from source, then up/down to target
            this.ctx.lineTo(midX, sourceCenter.y);
            this.ctx.lineTo(midX, targetCenter.y);
            this.ctx.lineTo(targetCenter.x, targetCenter.y);
        }
    }
    
    private drawBezierEdge(sourceCenter: Position, targetCenter: Position, routingPoints?: Position[]): void {
        this.ctx.moveTo(sourceCenter.x, sourceCenter.y);
        
        if (routingPoints && routingPoints.length >= 2) {
            // Use routing points as control points for bezier curve
            this.ctx.bezierCurveTo(
                routingPoints[0].x, routingPoints[0].y,
                routingPoints[1].x, routingPoints[1].y,
                targetCenter.x, targetCenter.y
            );
        } else {
            // Create default bezier control points
            const dx = targetCenter.x - sourceCenter.x;
            
            const cp1x = sourceCenter.x + dx * 0.25;
            const cp1y = sourceCenter.y;
            const cp2x = targetCenter.x - dx * 0.25;
            const cp2y = targetCenter.y;
            
            this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, targetCenter.x, targetCenter.y);
        }
    }

    private drawCircle(bounds: Bounds, filled: boolean = false): void {
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        const radius = Math.min(bounds.width, bounds.height) / 2;

        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        
        if (filled) {
            this.ctx.fill();
        }
        this.ctx.stroke();
    }

    private drawRectangle(bounds: Bounds): void {
        this.ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        this.ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    private drawDiamond(bounds: Bounds): void {
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        // const halfWidth = bounds.width / 2;
        // const halfHeight = bounds.height / 2;

        this.ctx.beginPath();
        this.ctx.moveTo(centerX, bounds.y);
        this.ctx.lineTo(bounds.x + bounds.width, centerY);
        this.ctx.lineTo(centerX, bounds.y + bounds.height);
        this.ctx.lineTo(bounds.x, centerY);
        this.ctx.closePath();
        
        this.ctx.fill();
        this.ctx.stroke();
    }

    private drawLabel(text: string, bounds: Bounds): void {
        this.ctx.fillStyle = this.options.textColor;
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;

        this.ctx.fillText(text, centerX, centerY);
    }

    protected drawEdgeLabel(text: string, position: Position): void {
        this.ctx.save();
        
        // Set up font and text properties
        this.ctx.font = '10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Calculate background dimensions
        const metrics = this.ctx.measureText(text);
        const padding = 4;
        const bgWidth = metrics.width + padding * 2;
        const bgHeight = 14;

        // Draw background rectangle with theme-appropriate colors
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const isDarkTheme = currentTheme === 'dark';
        
        // Use contrasting background that works in both themes
        this.ctx.fillStyle = isDarkTheme ? 'rgba(45, 55, 72, 0.9)' : 'rgba(255, 255, 255, 0.9)';
        this.ctx.fillRect(
            position.x - bgWidth / 2,
            position.y - bgHeight / 2,
            bgWidth,
            bgHeight
        );

        // Draw border for better visibility
        this.ctx.strokeStyle = isDarkTheme ? '#4A5568' : '#E2E8F0';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(
            position.x - bgWidth / 2,
            position.y - bgHeight / 2,
            bgWidth,
            bgHeight
        );

        // Draw text with contrasting color
        this.ctx.fillStyle = isDarkTheme ? '#E2E8F0' : '#2D3748';
        this.ctx.fillText(text, position.x, position.y);
        
        this.ctx.restore();
    }

    protected drawArrowhead(to: Position, from: Position): void {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const arrowLength = 10;
        // const arrowWidth = 6;

        this.ctx.beginPath();
        this.ctx.moveTo(to.x, to.y);
        this.ctx.lineTo(
            to.x - arrowLength * Math.cos(angle - Math.PI / 6),
            to.y - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        this.ctx.moveTo(to.x, to.y);
        this.ctx.lineTo(
            to.x - arrowLength * Math.cos(angle + Math.PI / 6),
            to.y - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        this.ctx.stroke();
    }
    
    private drawSelectionRectangle(): void {
        if (!this.selectionRect) return;
        
        const { start, end } = this.selectionRect;
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const width = Math.abs(end.x - start.x);
        const height = Math.abs(end.y - start.y);
        
        this.ctx.strokeStyle = this.options.selectedColor;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeRect(x, y, width, height);
        this.ctx.setLineDash([]);
        
        this.ctx.fillStyle = this.options.selectedColor + '20'; // Add transparency
        this.ctx.fillRect(x, y, width, height);
    }
    
    private drawEdgePreview(): void {
        if (!this.edgeCreationSource?.bounds || !this.edgePreviewTarget) return;
        
        const sourceCenter = {
            x: this.edgeCreationSource.bounds.x + this.edgeCreationSource.bounds.width / 2,
            y: this.edgeCreationSource.bounds.y + this.edgeCreationSource.bounds.height / 2
        };
        
        this.ctx.strokeStyle = this.options.selectedColor;
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        
        // Draw preview edge using the selected creation type
        this.drawEdgeByType(sourceCenter, this.edgePreviewTarget, undefined, this.edgeCreationType || 'straight');
        
        this.ctx.setLineDash([]);
    }

    // Start edge creation from the given element
    public startEdgeCreation(sourceElement: ModelElement, edgeType: string): void {
        this.edgeCreationSource = sourceElement;
        this.edgeCreationType = edgeType;
        console.log('Started edge creation from:', sourceElement.id, 'Type:', edgeType);
    }
    
    // Set edge creation type (shape: straight, curved, orthogonal, bezier)
    public setEdgeCreationType(creationType: string): void {
        this.edgeCreationType = creationType;
        console.log('CanvasRenderer: Edge creation type set to:', creationType);
    }
    
    // Set interaction mode (pan, select, etc.)
    public setInteractionMode(mode: string): void {
        if (mode === 'pan') {
            this.modeManager.setMode(InteractionMode.Pan);
            this.canvas.style.cursor = 'grab';
            this.interfaceLinkingMode = false;
        } else if (mode === 'select') {
            this.modeManager.setMode(InteractionMode.Select);
            this.canvas.style.cursor = 'default';
            this.interfaceLinkingMode = false;
        } else if (mode === 'create-node') {
            this.modeManager.setMode(InteractionMode.CreateNode);
            this.canvas.style.cursor = 'crosshair';
            this.interfaceLinkingMode = false;
        } else if (mode === 'create-edge') {
            this.modeManager.setMode(InteractionMode.CreateEdge);
            this.canvas.style.cursor = 'crosshair';
            this.interfaceLinkingMode = false;
        } else if (mode === 'create-interface-link') {
            this.modeManager.setMode(InteractionMode.CreateInterfaceLink);
            this.canvas.style.cursor = 'crosshair';
            this.interfaceLinkingMode = true;
            this.clearInterfaceHighlights();
        }
    }

    // Interface linking methods
    public startInterfaceLinking(interfaceInfo: InterfaceInfo): void {
        this.sourceInterfaceInfo = interfaceInfo;
        this.interfaceLinkingMode = true;
        this.updateInterfaceHighlights();
        console.log('Started interface linking from:', interfaceInfo);
    }

    public clearInterfaceHighlights(): void {
        this.highlightedInterfaces.clear();
        this.render();
    }

    private updateInterfaceHighlights(): void {
        if (!this.sourceInterfaceInfo || !this.currentDiagram) return;

        // Find all compatible interfaces in the diagram
        // This will be implemented with the compatibility checker
        this.render();
    }

    public getInterfaceLinkingMode(): boolean {
        return this.interfaceLinkingMode;
    }

    public getSourceInterfaceInfo(): InterfaceInfo | undefined {
        return this.sourceInterfaceInfo;
    }

    // Find interface connector at a given position
    private findInterfaceConnector(position: Position): { 
        element: ModelElement; 
        interface: ComponentInterface; 
        side: 'left' | 'right'; 
        connectorPosition: Position 
    } | undefined {
        if (!this.currentDiagram) return undefined;

        // Check all WASM components for interface clicks
        for (const element of Object.values(this.currentDiagram.elements)) {
            const elementType = element.type || element.element_type;
            if (elementType !== 'wasm-component' || !element.bounds) continue;

            const interfaces = element.properties?.interfaces || [];
            if (interfaces.length === 0) continue;

            // Separate inputs and outputs
            const inputs = interfaces.filter((i: { interface_type?: string; type?: string; direction?: string }) => 
                i.interface_type === 'import' || i.type === 'import' || i.direction === 'input'
            );
            const outputs = interfaces.filter((i: { interface_type?: string; type?: string; direction?: string }) => 
                i.interface_type === 'export' || i.type === 'export' || i.direction === 'output'
            );

            // Check input interfaces (left side)
            const result = this.checkInterfacePorts(element, inputs, 'left', position);
            if (result) return result;

            // Check output interfaces (right side)
            const outputResult = this.checkInterfacePorts(element, outputs, 'right', position);
            if (outputResult) return outputResult;
        }

        return undefined;
    }

    private checkInterfacePorts(
        element: ModelElement,
        interfaces: ComponentInterface[],
        side: 'left' | 'right',
        clickPosition: Position
    ): { element: ModelElement; interface: ComponentInterface; side: 'left' | 'right'; connectorPosition: Position } | undefined {
        if (!element.bounds) return undefined;

        const headerHeight = 40; // V2 HEADER_HEIGHT
        const portSpacing = 24;  // V2 PORT_SPACING
        const portRadius = 8;    // V2 PORT_RADIUS
        const startY = element.bounds.y + headerHeight + 20;

        for (let i = 0; i < interfaces.length; i++) {
            const x = side === 'left' ? element.bounds.x : element.bounds.x + element.bounds.width;
            const y = startY + (i * portSpacing);

            // Check if click is within port radius
            const distance = Math.sqrt(
                Math.pow(clickPosition.x - x, 2) + Math.pow(clickPosition.y - y, 2)
            );

            if (distance <= portRadius) {
                return {
                    element,
                    interface: interfaces[i],
                    side,
                    connectorPosition: { x, y }
                };
            }
        }

        return undefined;
    }

    // Set the MCP client for component status checking
    setMcpClient(client: McpClient): void {
        this.mcpClient = client;
    }

    // Check if a component's file is missing (async, but we'll cache results)
    private isComponentMissingFile(_node: Node): boolean {
        // For now, return false and implement async checking later
        // TODO: Implement async component status checking via MCP
        return false;
    }

    // Get missing component info for UI via MCP
    async getMissingComponents(): Promise<Array<{ path: string; component: { name: string; description?: string }; removedAt: number }>> {
        if (!this.mcpClient) return [];
        
        try {
            const missingResource = await this.mcpClient.readResource('wasm://components/missing');
            const data = JSON.parse(missingResource.text || '{}');
            return data.missingComponents || [];
        } catch (error) {
            console.warn('Failed to get missing components:', error);
            return [];
        }
    }

    // Handle component restoration or permanent removal via MCP
    async handleMissingComponent(componentName: string, action: 'restore' | 'remove'): Promise<boolean> {
        if (!this.mcpClient) return false;
        
        if (action === 'remove') {
            try {
                await this.mcpClient.callTool('remove_missing_component', {
                    componentName: componentName
                });
                return true;
            } catch (error) {
                console.error('Failed to remove missing component:', error);
                return false;
            }
        }
        
        // For restore, show the expected file location
        try {
            const result = await this.mcpClient.callTool('check_wasm_component_status', {
                componentName: componentName
            });
            const status = JSON.parse(result.content[0]?.text || '{}');
            if (status.path) {
                console.log(`To restore component "${componentName}", place the WASM file at: ${status.path}`);
                return true;
            }
        } catch (error) {
            console.error('Failed to get component status:', error);
        }
        
        return false;
    }

    private getInterfaceConnectorAt(position: Position): {
        element: ModelElement;
        interface: ComponentInterface;
        side: 'left' | 'right';
        connectorPosition: Position;
    } | undefined {
        if (!this.currentDiagram) return undefined;

        // Check each WASM component for interface connectors using V2 renderer logic
        for (const element of Object.values(this.currentDiagram.elements)) {
            if (!element.bounds) continue;
            
            const nodeType = element.type || element.element_type || '';
            
            if (!this.isWasmComponentType(nodeType) || nodeType === 'import-interface' || nodeType === 'export-interface') {
                continue;
            }

            const interfaces = element.properties?.interfaces as ComponentInterface[] || [];
            if (interfaces.length === 0) continue;

            // Use the V2 renderer's port detection method
            const portInfo = WasmComponentRendererV2.getPortAtPosition(element, element.bounds, position);
            
            if (portInfo) {
                console.log('getInterfaceConnectorAt: Port found, creating connector:', portInfo);
                // Calculate the actual connector position for the found port
                const interfaces = element.properties?.interfaces || [];
                
                // Handle both interface count (number) and interface array
                let actualInterfaces: ComponentInterface[] = [];
                
                if (typeof interfaces === 'number') {
                    // If interfaces is a number (count), create placeholder interfaces
                    actualInterfaces = Array.from({ length: interfaces }, (_, i) => ({
                        name: `interface-${i + 1}`,
                        interface_type: (i % 2 === 0 ? 'import' : 'export') as 'import' | 'export',
                        type: (i % 2 === 0 ? 'import' : 'export') as 'import' | 'export',
                        direction: (i % 2 === 0 ? 'import' : 'export') as 'import' | 'export',
                        functions: []
                    }));
                } else if (Array.isArray(interfaces)) {
                    // If interfaces is already an array, use it directly
                    actualInterfaces = interfaces as ComponentInterface[];
                }
                
                const inputs = actualInterfaces.filter(i => 
                    i.interface_type === 'import' || i.type === 'import' || i.direction === 'input'
                );
                const outputs = actualInterfaces.filter(i => 
                    i.interface_type === 'export' || i.type === 'export' || i.direction === 'output'
                );

                const isInput = portInfo.type === 'input';
                const portArray = isInput ? inputs : outputs;
                const portIndex = portArray.findIndex(p => p === portInfo.port);
                
                if (portIndex >= 0) {
                    // Calculate position using V2 renderer constants
                    const headerHeight = 40; // V2 HEADER_HEIGHT
                    const portSpacing = 24;  // V2 PORT_SPACING
                    const startY = element.bounds.y + headerHeight + 20;
                    
                    const x = isInput ? element.bounds.x : element.bounds.x + element.bounds.width;
                    const y = startY + (portIndex * portSpacing);

                    const connector = {
                        element,
                        interface: portInfo.port,
                        side: (isInput ? 'left' : 'right') as 'left' | 'right',
                        connectorPosition: { x, y }
                    };
                    console.log('getInterfaceConnectorAt: Returning connector:', connector);
                    return connector;
                }
            }
        }

        return undefined;
    }

    private showInterfaceTooltip(
        connector: {
            element: ModelElement;
            interface: { name: string; interface_type?: string; type?: string; direction?: string };
            side: 'left' | 'right';
            connectorPosition: Position;
        },
        mousePosition: Position
    ): void {
        // Remove existing tooltip
        this.hideInterfaceTooltip();

        // Create tooltip element
        this.interfaceTooltip = document.createElement('div');
        this.interfaceTooltip.className = 'interface-tooltip';
        this.interfaceTooltip.innerHTML = `
            <div class="tooltip-header">
                <span class="tooltip-icon">${connector.side === 'left' ? '🔵' : '🟢'}</span>
                <span class="tooltip-title">${connector.interface.name}</span>
            </div>
            <div class="tooltip-type">${connector.side === 'left' ? 'Import' : 'Export'} Interface</div>
            ${connector.interface.functions && connector.interface.functions.length > 0 ? 
                `<div class="tooltip-functions">${connector.interface.functions.length} function(s)</div>` : 
                ''
            }
        `;

        // Style the tooltip
        Object.assign(this.interfaceTooltip.style, {
            position: 'fixed',
            background: 'rgba(0, 0, 0, 0.9)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            zIndex: '10000',
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            maxWidth: '200px',
            wordWrap: 'break-word'
        });

        // Position tooltip near mouse but avoid edges
        const canvasRect = this.canvas.getBoundingClientRect();
        const tooltipX = canvasRect.left + mousePosition.x + 10;
        const tooltipY = canvasRect.top + mousePosition.y - 10;

        this.interfaceTooltip.style.left = tooltipX + 'px';
        this.interfaceTooltip.style.top = tooltipY + 'px';

        // Add to document
        document.body.appendChild(this.interfaceTooltip);
    }

    private hideInterfaceTooltip(): void {
        if (this.interfaceTooltip) {
            document.body.removeChild(this.interfaceTooltip);
            this.interfaceTooltip = undefined;
        }
    }

    private drawEmptyState(): void {
        const centerX = this.canvas.clientWidth / 2;
        const centerY = this.canvas.clientHeight / 2;
        
        this.ctx.save();
        
        // Draw message
        this.ctx.font = '18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
        this.ctx.fillStyle = this.options.textColor;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        this.ctx.fillText('No diagram loaded', centerX, centerY - 20);
        
        this.ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
        this.ctx.fillStyle = this.options.textColor + '80'; // Add transparency
        this.ctx.fillText('Select or create a diagram to get started', centerX, centerY + 10);
        
        // Draw decorative icon
        this.ctx.font = '48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
        this.ctx.fillStyle = this.options.textColor + '40'; // More transparent
        this.ctx.fillText('📊', centerX, centerY - 80);
        
        this.ctx.restore();
    }
    
    private isWitEdgeType(edgeType: string): boolean {
        return [
            'wit-import',
            'wit-export',
            'wit-uses',
            'wit-implements',
            'wit-dependency',
            'wit-contains',
            'wit-type-ref'
        ].includes(edgeType);
    }

    private isUMLEdgeType(edgeType: string): boolean {
        return [
            'uml-dependency',
            'uml-realization',
            'uml-association',
            'uml-aggregation',
            'uml-composition'
        ].includes(edgeType);
    }

    private drawUMLEdge(edge: Edge, sourceElement: ModelElement, targetElement: ModelElement, isSelected: boolean, isHovered: boolean): void {
        const edgeType = edge.type || edge.element_type || '';
        
        // Set styling based on UML edge type
        if (edgeType === 'uml-dependency') {
            this.ctx.strokeStyle = isSelected ? '#E53E3E' : '#DD6B20';
            this.ctx.lineWidth = isSelected ? 3 : 2;
            this.ctx.setLineDash([8, 4]); // Dashed line for dependencies
        } else if (edgeType === 'uml-realization') {
            this.ctx.strokeStyle = isSelected ? '#2B6CB0' : '#3182CE';
            this.ctx.lineWidth = isSelected ? 3 : 2;
            this.ctx.setLineDash([]); // Solid line for realizations
        } else {
            this.ctx.strokeStyle = isSelected ? this.options.selectedColor : this.options.edgeColor;
            this.ctx.lineWidth = isSelected ? 3 : 2;
            this.ctx.setLineDash([]);
        }

        // Calculate connection points based on interface type
        let sourceCenter, targetCenter;
        
        if (edgeType === 'uml-dependency') {
            // From interface (right edge) to component (left edge) 
            sourceCenter = {
                x: sourceElement.bounds.x + sourceElement.bounds.width,
                y: sourceElement.bounds.y + sourceElement.bounds.height / 2
            };
            targetCenter = {
                x: targetElement.bounds.x,
                y: targetElement.bounds.y + targetElement.bounds.height / 2
            };
        } else if (edgeType === 'uml-realization') {
            // From component (right edge) to interface (left edge)
            sourceCenter = {
                x: sourceElement.bounds.x + sourceElement.bounds.width,
                y: sourceElement.bounds.y + sourceElement.bounds.height / 2
            };
            targetCenter = {
                x: targetElement.bounds.x,
                y: targetElement.bounds.y + targetElement.bounds.height / 2
            };
        } else {
            // Default center-to-center connection
            sourceCenter = {
                x: sourceElement.bounds.x + sourceElement.bounds.width / 2,
                y: sourceElement.bounds.y + sourceElement.bounds.height / 2
            };
            targetCenter = {
                x: targetElement.bounds.x + targetElement.bounds.width / 2,
                y: targetElement.bounds.y + targetElement.bounds.height / 2
            };
        }

        // Draw orthogonal line with corners
        this.drawOrthogonalConnection(sourceCenter, targetCenter);

        // Draw appropriate arrowhead based on UML edge type
        if (edgeType === 'uml-dependency') {
            this.drawUMLDependencyArrow(targetCenter, sourceCenter);
        } else if (edgeType === 'uml-realization') {
            this.drawUMLRealizationArrow(targetCenter, sourceCenter);
        }

        // Reset line dash
        this.ctx.setLineDash([]);

        // Draw edge label if present
        const edgeLabel = edge.label || edge.properties?.label;
        if (edgeLabel) {
            const midPoint = {
                x: (sourceCenter.x + targetCenter.x) / 2,
                y: (sourceCenter.y + targetCenter.y) / 2 - 12
            };
            this.drawEdgeLabel(edgeLabel, midPoint);
        }
    }

    private drawOrthogonalConnection(source: Position, target: Position): void {
        this.ctx.beginPath();
        this.ctx.moveTo(source.x, source.y);
        
        // Calculate midpoint for orthogonal routing
        const midX = source.x + (target.x - source.x) / 2;
        
        // Draw L-shaped connection with corners
        this.ctx.lineTo(midX, source.y);  // Horizontal from source
        this.ctx.lineTo(midX, target.y);  // Vertical to target level
        this.ctx.lineTo(target.x, target.y);  // Horizontal to target
        
        this.ctx.stroke();
    }

    private drawUMLDependencyArrow(target: Position, source: Position): void {
        const angle = Math.atan2(target.y - source.y, target.x - source.x);
        const arrowLength = 12;
        const arrowAngle = Math.PI / 6;

        this.ctx.beginPath();
        this.ctx.moveTo(
            target.x - arrowLength * Math.cos(angle - arrowAngle),
            target.y - arrowLength * Math.sin(angle - arrowAngle)
        );
        this.ctx.lineTo(target.x, target.y);
        this.ctx.lineTo(
            target.x - arrowLength * Math.cos(angle + arrowAngle),
            target.y - arrowLength * Math.sin(angle + arrowAngle)
        );
        this.ctx.stroke();
    }

    private drawUMLRealizationArrow(target: Position, source: Position): void {
        const angle = Math.atan2(target.y - source.y, target.x - source.x);
        const arrowLength = 12;
        const arrowAngle = Math.PI / 6;

        // Draw hollow triangle
        this.ctx.beginPath();
        this.ctx.moveTo(target.x, target.y);
        this.ctx.lineTo(
            target.x - arrowLength * Math.cos(angle - arrowAngle),
            target.y - arrowLength * Math.sin(angle - arrowAngle)
        );
        this.ctx.lineTo(
            target.x - arrowLength * Math.cos(angle + arrowAngle),
            target.y - arrowLength * Math.sin(angle + arrowAngle)
        );
        this.ctx.closePath();
        
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fill();
        this.ctx.stroke();
    }
    
    private drawWitEdge(edge: Edge, sourceElement: ModelElement, targetElement: ModelElement, isSelected: boolean, isHovered: boolean): void {
        const edgeType = edge.type || edge.element_type || '';
        const style = this.getWitEdgeStyle(edgeType);
        
        // Calculate connection points
        const sourceBounds = sourceElement.bounds!;
        const targetBounds = targetElement.bounds!;
        
        const sourceCenter = {
            x: sourceBounds.x + sourceBounds.width / 2,
            y: sourceBounds.y + sourceBounds.height / 2
        };
        
        const targetCenter = {
            x: targetBounds.x + targetBounds.width / 2,
            y: targetBounds.y + targetBounds.height / 2
        };
        
        // Determine connection points on the edge of rectangles
        const sourcePoint = this.getConnectionPoint(sourceBounds, targetCenter);
        const targetPoint = this.getConnectionPoint(targetBounds, sourceCenter);
        
        // Set line style
        this.ctx.strokeStyle = isSelected ? '#654FF0' : (isHovered ? '#8B5CF6' : style.color);
        this.ctx.lineWidth = isSelected ? 3 : (isHovered ? 2 : 1.5);
        
        // Set line dash pattern
        const dash = this.getLineDashPattern(style.style);
        this.ctx.setLineDash(dash);
        
        // Draw line
        this.ctx.beginPath();
        this.ctx.moveTo(sourcePoint.x, sourcePoint.y);
        this.ctx.lineTo(targetPoint.x, targetPoint.y);
        this.ctx.stroke();
        
        // Draw arrowhead
        this.drawWitArrowhead(sourcePoint, targetPoint, style.color, isSelected, isHovered);
        
        // Reset line dash
        this.ctx.setLineDash([]);
        
        // Draw edge label
        const label = edge.properties?.label || style.label;
        if (label) {
            const midPoint = {
                x: (sourcePoint.x + targetPoint.x) / 2,
                y: (sourcePoint.y + targetPoint.y) / 2
            };
            this.drawWitEdgeLabel(label, midPoint, style.color);
        }
    }
    
    private getWitEdgeStyle(edgeType: string): any {
        const styles: { [key: string]: any } = {
            'wit-import': { color: '#3B82F6', style: 'dashed', label: 'imports' },
            'wit-export': { color: '#10B981', style: 'solid', label: 'exports' },
            'wit-uses': { color: '#8B5CF6', style: 'dotted', label: 'uses' },
            'wit-implements': { color: '#F59E0B', style: 'solid', label: 'implements' },
            'wit-dependency': { color: '#6B7280', style: 'dashed', label: 'depends on' },
            'wit-contains': { color: '#374151', style: 'solid', label: 'contains' },
            'wit-type-ref': { color: '#EF4444', style: 'dotted', label: 'type ref' }
        };
        
        return styles[edgeType] || { color: '#6B7280', style: 'solid', label: '' };
    }
    
    private getLineDashPattern(style: string): number[] {
        switch (style) {
            case 'dashed': return [10, 5];
            case 'dotted': return [3, 3];
            case 'solid':
            default: return [];
        }
    }
    
    
    private drawWitArrowhead(start: Position, end: Position, color: string, isSelected: boolean, isHovered: boolean): void {
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const headLength = isSelected ? 12 : 8;
        const headAngle = Math.PI / 6;
        
        this.ctx.save();
        this.ctx.fillStyle = isSelected ? '#654FF0' : (isHovered ? '#8B5CF6' : color);
        
        // Draw arrowhead
        this.ctx.beginPath();
        this.ctx.moveTo(end.x, end.y);
        this.ctx.lineTo(
            end.x - headLength * Math.cos(angle - headAngle),
            end.y - headLength * Math.sin(angle - headAngle)
        );
        this.ctx.lineTo(
            end.x - headLength * Math.cos(angle + headAngle),
            end.y - headLength * Math.sin(angle + headAngle)
        );
        this.ctx.closePath();
        this.ctx.fill();
        
        this.ctx.restore();
    }
    
    private drawWitEdgeLabel(text: string, position: Position, color: string): void {
        this.ctx.save();
        
        // Draw background rectangle
        this.ctx.font = '10px Arial';
        const metrics = this.ctx.measureText(text);
        const padding = 4;
        const bgWidth = metrics.width + padding * 2;
        const bgHeight = 16;
        
        // Use theme-appropriate background colors
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const isDarkTheme = currentTheme === 'dark';
        
        this.ctx.fillStyle = isDarkTheme ? 'rgba(45, 55, 72, 0.9)' : 'rgba(255, 255, 255, 0.9)';
        this.ctx.fillRect(
            position.x - bgWidth / 2,
            position.y - bgHeight / 2,
            bgWidth,
            bgHeight
        );
        
        // Draw border with theme-appropriate color
        this.ctx.strokeStyle = isDarkTheme ? '#4A5568' : '#E2E8F0';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(
            position.x - bgWidth / 2,
            position.y - bgHeight / 2,
            bgWidth,
            bgHeight
        );
        
        // Draw text with contrasting color
        this.ctx.fillStyle = isDarkTheme ? '#E2E8F0' : '#2D3748';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, position.x, position.y);
        
        this.ctx.restore();
    }
    
    private getElementType(element: any): string {
        return String(element.type || element.element_type || '');
    }
    
    private ensureElementBounds(element: any): void {
        if (!element.bounds && this.isWitInterfaceType(this.getElementType(element))) {
            // Get default size from diagram type config
            const config = getDiagramTypeConfig('wit-interface');
            const nodeType = config?.nodeTypes.find(n => n.type === this.getElementType(element));
            
            element.bounds = {
                x: element.position?.x || element.x || 100,
                y: element.position?.y || element.y || 100,
                width: nodeType?.defaultSize?.width || 160,
                height: nodeType?.defaultSize?.height || 60
            };
        }
    }

    /**
     * Set the current view mode for rendering context
     */
    public setViewMode(viewMode: string): void {
        this.currentViewMode = viewMode;
        console.log(`CanvasRenderer: View mode set to ${viewMode}`);
    }

    /**
     * Get the current view mode
     */
    public getViewMode(): string {
        return this.currentViewMode;
    }
    
    public updateTheme(): void {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const isDarkTheme = currentTheme === 'dark';
        
        this.options.backgroundColor = isDarkTheme ? '#0D1117' : '#ffffff';
        this.options.edgeColor = isDarkTheme ? '#7D8590' : '#666666';
        this.options.textColor = isDarkTheme ? '#E6EDF3' : '#333333';
        this.options.gridColor = isDarkTheme ? '#1C2333' : '#f0f0f0';
        
        
        // Re-render with new theme
        this.render();
    }

    /**
     * Check if current view mode is WIT-based
     */
    private isWitViewMode(): boolean {
        return this.currentViewMode === 'wit-interface' || this.currentViewMode === 'wit-dependencies';
    }

    /**
     * Get view mode specific rendering hints
     */
    private getViewModeRenderingHints(): Record<string, boolean> {
        switch (this.currentViewMode) {
            case 'component':
                return {
                    showComponents: true,
                    showInterfaces: true,
                    showConnections: true,
                    showInterfaceNames: this.showInterfaceNames
                };
            case 'wit-interface':
                return {
                    showPackages: true,
                    showInterfaces: true,
                    showFunctions: true,
                    showTypes: true,
                    emphasizeStructure: true
                };
            case 'wit-dependencies':
                return {
                    showDependencies: true,
                    showExporters: true,
                    showImporters: true,
                    groupByInterface: true,
                    highlightDependencies: true
                };
            default:
                return {};
        }
    }

    // Protected methods for subclass access
    protected drawRoundedRect(x: number, y: number, width: number, height: number, radius: number): void {
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, width, height, radius);
    }

    protected getNodeBounds(node: Node): Bounds {
        if (node.bounds) {
            return node.bounds;
        }
        // Fallback if no bounds are set
        return {
            x: node.position?.x || 0,
            y: node.position?.y || 0,
            width: node.size?.width || 100,
            height: node.size?.height || 60
        };
    }

    protected getConnectionPoint(bounds: Bounds, targetPoint: Position): Position {
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        
        const dx = targetPoint.x - centerX;
        const dy = targetPoint.y - centerY;
        
        const angle = Math.atan2(dy, dx);
        
        // Calculate intersection with rectangle edge
        const absAngle = Math.abs(angle);
        const halfWidth = bounds.width / 2;
        const halfHeight = bounds.height / 2;
        
        if (absAngle < Math.atan2(halfHeight, halfWidth)) {
            // Right edge
            return {
                x: bounds.x + bounds.width,
                y: centerY + halfWidth * Math.tan(angle)
            };
        } else if (absAngle > Math.PI - Math.atan2(halfHeight, halfWidth)) {
            // Left edge
            return {
                x: bounds.x,
                y: centerY - halfWidth * Math.tan(angle)
            };
        } else if (angle > 0) {
            // Bottom edge
            return {
                x: centerX + halfHeight / Math.tan(angle),
                y: bounds.y + bounds.height
            };
        } else {
            // Top edge
            return {
                x: centerX - halfHeight / Math.tan(angle),
                y: bounds.y
            };
        }
    }
}