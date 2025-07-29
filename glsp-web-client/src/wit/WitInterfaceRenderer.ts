/**
 * WIT Interface Renderer
 * Custom canvas renderer for WebAssembly Interface Types diagrams
 */

import { CanvasRenderer } from '../renderer/canvas-renderer.js';
import { DiagramModel, ModelElement, Node, Edge } from '../model/diagram.js';
import { WIT_VISUAL_STYLES, WIT_ICONS } from '../diagrams/wit-interface-types.js';
import { WitElement, WitConnection, WitDiagram, WitElementType, WitConnectionType, WitViewConfig } from './wit-types.js';

export class WitInterfaceRenderer extends CanvasRenderer {
    private expandedNodes: Set<string> = new Set();
    private hoveredElement: string | null = null;
    private witDiagramModel: DiagramModel | null = null;
    private witViewConfig: WitViewConfig = {
        showPackages: true,
        showWorlds: true,
        showInterfaces: true,
        showTypes: true,
        showFunctions: true,
        showResources: true,
        expandLevel: 2,
        highlightImports: true,
        highlightExports: true
    };
    private onWitModelChange?: (model: DiagramModel) => void;
    
    /**
     * Override the default node rendering for WIT-specific visualization
     */
    protected renderNode(node: Node): void {
        const ctx = this.ctx;
        if (!ctx) return;
        
        const bounds = node.bounds || {
            x: node.position?.x || 0,
            y: node.position?.y || 0,
            width: node.size?.width || 100,
            height: node.size?.height || 60
        };
        
        // Get node type and style
        const nodeType = this.getWitNodeType(node);
        const style = this.getNodeStyle(nodeType);
        
        // Save context state
        ctx.save();
        
        // Apply node-specific styling
        ctx.fillStyle = style.backgroundColor;
        ctx.strokeStyle = style.borderColor;
        ctx.lineWidth = style.borderWidth;
        
        // Draw rounded rectangle
        this.drawRoundedRect(
            bounds.x, 
            bounds.y, 
            bounds.width, 
            bounds.height, 
            style.borderRadius
        );
        
        // Fill and stroke
        ctx.fill();
        ctx.stroke();
        
        // Draw icon and label with enhanced positioning
        ctx.fillStyle = style.textColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        const icon = this.getNodeIcon(nodeType);
        const label = node.label || node.properties?.name || 'Unnamed';
        
        // Calculate icon size based on element type
        const iconSize = this.getIconSize(nodeType);
        const iconX = bounds.x + 8;
        const iconY = bounds.y + bounds.height / 2;
        
        // Draw icon with appropriate sizing
        ctx.font = `${iconSize}px sans-serif`;
        ctx.fillText(icon, iconX, iconY);
        
        // Draw label with proper spacing from icon
        ctx.font = `${style.fontWeight} ${style.fontSize}px -apple-system, sans-serif`;
        const labelX = bounds.x + iconSize + 15;
        const labelY = bounds.y + bounds.height / 2;
        
        // Truncate label if it's too long
        const maxLabelWidth = bounds.width - iconSize - 25;
        const truncatedLabel = this.truncateText(ctx, String(label), maxLabelWidth);
        ctx.fillText(truncatedLabel, labelX, labelY);
        
        // Draw additional details for interfaces
        if (nodeType === 'interface' && node.properties) {
            this.renderInterfaceDetails(node, bounds, style);
        }
        
        // Draw expansion indicator for container nodes
        if (this.isContainerNode(nodeType)) {
            this.drawExpansionIndicator(node, bounds);
        }
        
        // Restore context state
        ctx.restore();
    }
    
    /**
     * Get the WIT-specific node type
     */
    private getWitNodeType(node: Node): string {
        const elementType = node.element_type || node.type || '';
        
        // Map element types to WIT node types that correspond to WIT_ICONS keys
        if (elementType.includes('package')) return 'package';
        if (elementType.includes('world')) return 'world';
        if (elementType.includes('interface')) return 'interface';
        if (elementType.includes('function')) return 'function';
        if (elementType.includes('record')) return 'record';
        if (elementType.includes('variant')) return 'variant';
        if (elementType.includes('enum')) return 'enum';
        if (elementType.includes('flags')) return 'flags';
        if (elementType.includes('resource')) return 'resource';
        if (elementType.includes('import')) return 'import';
        if (elementType.includes('export')) return 'export';
        if (elementType.includes('primitive')) return 'primitive';
        if (elementType.includes('list')) return 'list';
        if (elementType.includes('tuple')) return 'tuple';
        if (elementType.includes('option')) return 'option';
        if (elementType.includes('result')) return 'result';
        if (elementType.includes('type')) return 'record'; // Generic type defaults to record
        
        return 'interface'; // default
    }
    
    /**
     * Get visual style for a node type
     */
    private getNodeStyle(nodeType: string): any {
        const styles = WIT_VISUAL_STYLES as any;
        return styles[nodeType] || styles.interface;
    }
    
    /**
     * Get icon for a node type using the WIT_ICONS system
     */
    private getNodeIcon(nodeType: string): string {
        return WIT_ICONS[nodeType as keyof typeof WIT_ICONS] || WIT_ICONS.interface;
    }
    
    /**
     * Get appropriate icon size based on element type and hierarchy
     */
    private getIconSize(nodeType: string): number {
        const iconSizes: Record<string, number> = {
            package: 24,     // Largest for top-level elements
            world: 22,       // Large for world-level elements
            interface: 20,   // Standard for interfaces
            function: 16,    // Smaller for functions
            record: 16,      // Standard for type definitions
            variant: 16,
            enum: 16,
            flags: 16,
            resource: 18,    // Slightly larger for resources
            import: 18,      // Standard for import/export containers
            export: 18,
            primitive: 14,   // Smallest for primitive types
            list: 16,
            tuple: 16,
            option: 14,
            result: 16
        };
        return iconSizes[nodeType] || 18;
    }
    
    /**
     * Truncate text to fit within specified width
     */
    private truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
        const metrics = ctx.measureText(text);
        if (metrics.width <= maxWidth) {
            return text;
        }
        
        // Try progressively shorter versions with ellipsis
        for (let i = text.length - 1; i > 0; i--) {
            const truncated = text.substring(0, i) + '…';
            const truncatedMetrics = ctx.measureText(truncated);
            if (truncatedMetrics.width <= maxWidth) {
                return truncated;
            }
        }
        
        return '…';
    }
    
    /**
     * Render additional details for interface nodes
     */
    private renderInterfaceDetails(node: Node, bounds: any, style: any): void {
        const ctx = this.ctx;
        if (!ctx || !node.properties) return;
        
        ctx.save();
        
        // Draw interface type badge
        const interfaceType = (node.properties.interfaceType as string) || 'export';
        const badgeColor = interfaceType === 'import' ? '#3B82F6' : '#10B981';
        
        ctx.fillStyle = badgeColor;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(
            interfaceType.toUpperCase(), 
            bounds.x + bounds.width - 10, 
            bounds.y + 15
        );
        
        // Draw function/type counts with icons if available
        if (node.properties.functions || node.properties.types || node.properties.resources) {
            ctx.font = '10px sans-serif';
            ctx.fillStyle = style.textColor;
            ctx.globalAlpha = 0.8;
            ctx.textAlign = 'left';
            
            let detailY = bounds.y + bounds.height - 25;
            const detailX = bounds.x + 8;
            
            // Show function count with icon
            const functions = (node.properties.functions as any[]) || [];
            if (functions.length > 0) {
                ctx.fillText(
                    `${WIT_ICONS.function} ${functions.length}`,
                    detailX,
                    detailY
                );
                detailY += 12;
            }
            
            // Show type count with icon
            const types = (node.properties.types as any[]) || [];
            if (types.length > 0) {
                ctx.fillText(
                    `${WIT_ICONS.record} ${types.length}`,
                    detailX,
                    detailY
                );
                detailY += 12;
            }
            
            // Show resource count with icon
            const resources = (node.properties.resources as any[]) || [];
            if (resources.length > 0) {
                ctx.fillText(
                    `${WIT_ICONS.resource} ${resources.length}`,
                    detailX,
                    detailY
                );
            }
        }
        
        ctx.restore();
    }
    
    /**
     * Check if a node type can contain other nodes
     */
    private isContainerNode(nodeType: string): boolean {
        return ['package', 'world', 'interface', 'import', 'export'].includes(nodeType);
    }
    
    /**
     * Draw expansion/collapse indicator
     */
    private drawExpansionIndicator(node: Node, bounds: any): void {
        const ctx = this.ctx;
        if (!ctx) return;
        
        const isExpanded = this.expandedNodes.has(node.id);
        const indicatorSize = 12;
        const x = bounds.x + bounds.width - indicatorSize - 5;
        const y = bounds.y + bounds.height - indicatorSize - 5;
        
        ctx.save();
        
        // Draw background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        ctx.arc(x + indicatorSize/2, y + indicatorSize/2, indicatorSize/2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Draw plus/minus
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        // Horizontal line
        ctx.moveTo(x + 3, y + indicatorSize/2);
        ctx.lineTo(x + indicatorSize - 3, y + indicatorSize/2);
        
        // Vertical line (only for collapsed state)
        if (!isExpanded) {
            ctx.moveTo(x + indicatorSize/2, y + 3);
            ctx.lineTo(x + indicatorSize/2, y + indicatorSize - 3);
        }
        
        ctx.stroke();
        ctx.restore();
    }
    
    /**
     * Override edge rendering for WIT-specific styling
     */
    protected renderEdge(edge: Edge): void {
        const ctx = this.ctx;
        if (!ctx || !edge.sourceId || !edge.targetId) return;
        
        // Get edge type and style
        const edgeType = this.getWitEdgeType(edge);
        const edgeConfig = this.getEdgeConfig(edgeType);
        
        // Find source and target nodes
        const sourceNode = this.findNode(edge.sourceId);
        const targetNode = this.findNode(edge.targetId);
        
        if (!sourceNode || !targetNode) return;
        
        // Calculate connection points
        const sourceBounds = this.getNodeBounds(sourceNode);
        const targetBounds = this.getNodeBounds(targetNode);
        
        const sourcePoint = this.getConnectionPoint(sourceBounds, targetBounds);
        const targetPoint = this.getConnectionPoint(targetBounds, sourceBounds);
        
        ctx.save();
        
        // Set edge style
        ctx.strokeStyle = edgeConfig.color || '#6B7280';
        ctx.lineWidth = 2;
        
        // Set dash pattern based on style
        if (edgeConfig.style === 'dashed') {
            ctx.setLineDash([5, 5]);
        } else if (edgeConfig.style === 'dotted') {
            ctx.setLineDash([2, 3]);
        }
        
        // Draw the path
        ctx.beginPath();
        
        if (edge.routingPoints && edge.routingPoints.length > 0) {
            // Use routing points if available
            ctx.moveTo(sourcePoint.x, sourcePoint.y);
            edge.routingPoints.forEach(point => {
                ctx.lineTo(point.x, point.y);
            });
            ctx.lineTo(targetPoint.x, targetPoint.y);
        } else {
            // Draw curved connection
            const dx = targetPoint.x - sourcePoint.x;
            const dy = targetPoint.y - sourcePoint.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const curvature = Math.min(distance * 0.3, 50);
            
            ctx.moveTo(sourcePoint.x, sourcePoint.y);
            ctx.bezierCurveTo(
                sourcePoint.x + dx * 0.3, sourcePoint.y + curvature,
                targetPoint.x - dx * 0.3, targetPoint.y - curvature,
                targetPoint.x, targetPoint.y
            );
        }
        
        ctx.stroke();
        
        // Draw arrowhead
        this.drawArrowhead(ctx, targetPoint, sourcePoint, edgeConfig.color || '#6B7280');
        
        // Draw edge label if present
        if (edge.label) {
            this.drawEdgeLabel(edge, sourcePoint, targetPoint);
        }
        
        ctx.restore();
    }
    
    /**
     * Get WIT-specific edge type
     */
    private getWitEdgeType(edge: Edge): string {
        const elementType = edge.element_type || edge.type || '';
        
        if (elementType.includes('import')) return 'import';
        if (elementType.includes('export')) return 'export';
        if (elementType.includes('uses')) return 'uses';
        if (elementType.includes('implements')) return 'implements';
        if (elementType.includes('dependency')) return 'dependency';
        if (elementType.includes('contains')) return 'contains';
        if (elementType.includes('type-ref')) return 'type-ref';
        
        return 'dependency'; // default
    }
    
    /**
     * Get edge configuration
     */
    private getEdgeConfig(edgeType: string): any {
        const configs: Record<string, any> = {
            import: { style: 'dashed', color: '#3B82F6' },
            export: { style: 'solid', color: '#10B981' },
            uses: { style: 'dotted', color: '#8B5CF6' },
            implements: { style: 'solid', color: '#F59E0B' },
            dependency: { style: 'dashed', color: '#6B7280' },
            contains: { style: 'solid', color: '#374151' },
            'type-ref': { style: 'dotted', color: '#EC4899' }
        };
        
        return configs[edgeType] || configs.dependency;
    }
    
    /**
     * Draw an arrowhead at the target point
     */
    protected drawArrowhead(
        ctx: CanvasRenderingContext2D, 
        to: { x: number; y: number }, 
        from: { x: number; y: number }, 
        color: string
    ): void {
        const headLength = 10;
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(
            to.x - headLength * Math.cos(angle - Math.PI / 6),
            to.y - headLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            to.x - headLength * Math.cos(angle + Math.PI / 6),
            to.y - headLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
    }
    
    /**
     * Draw edge label
     */
    protected drawEdgeLabel(
        edge: Edge, 
        sourcePoint: { x: number; y: number }, 
        targetPoint: { x: number; y: number }
    ): void {
        const ctx = this.ctx;
        const text = edge.label;
        if (!ctx || !text) return;
        
        // Calculate midpoint
        const position = {
            x: (sourcePoint.x + targetPoint.x) / 2,
            y: (sourcePoint.y + targetPoint.y) / 2
        };
        
        ctx.save();
        
        // Draw label background
        const padding = 4;
        const metrics = ctx.measureText(text);
        const width = metrics.width + padding * 2;
        const height = 16;
        
        ctx.fillStyle = 'rgba(31, 41, 55, 0.9)';
        ctx.fillRect(position.x - width / 2, position.y - height / 2, width, height);
        
        // Draw label text
        ctx.fillStyle = '#E5E7EB';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, position.x, position.y);
        
        ctx.restore();
    }
    
    /**
     * Handle click events for expanding/collapsing nodes
     */
    protected handleClick(event: MouseEvent): void {
        const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const worldPos = this.screenToWorld(x, y);
        const clickedNode = this.getNodeAt(worldPos.x, worldPos.y);
        
        if (clickedNode && this.isContainerNode(this.getWitNodeType(clickedNode))) {
            // Check if click was on expansion indicator
            const bounds = this.getNodeBounds(clickedNode);
            const indicatorSize = 12;
            const indicatorX = bounds.x + bounds.width - indicatorSize - 5;
            const indicatorY = bounds.y + bounds.height - indicatorSize - 5;
            
            const dx = worldPos.x - (indicatorX + indicatorSize/2);
            const dy = worldPos.y - (indicatorY + indicatorSize/2);
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= indicatorSize/2) {
                // Toggle expansion state
                if (this.expandedNodes.has(clickedNode.id)) {
                    this.expandedNodes.delete(clickedNode.id);
                } else {
                    this.expandedNodes.add(clickedNode.id);
                }
                
                // Trigger re-render
                this.render();
                return;
            }
        }
        
        super.handleClick(event);
    }
    
    /**
     * Get node at specific coordinates
     */
    private getNodeAt(x: number, y: number): Node | null {
        if (!this.currentDiagram) return null;
        
        const nodes = Object.values(this.currentDiagram.elements).filter(
            el => this.isNode(el)
        ) as Node[];
        
        // Check nodes in reverse order (top to bottom)
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            const bounds = this.getNodeBounds(node);
            
            if (x >= bounds.x && x <= bounds.x + bounds.width &&
                y >= bounds.y && y <= bounds.y + bounds.height) {
                return node;
            }
        }
        
        return null;
    }
    
    /**
     * Find a node by ID
     */
    private findNode(id: string): Node | null {
        if (!this.currentDiagram) return null;
        const element = this.currentDiagram.elements[id];
        return element && this.isNode(element) ? element as Node : null;
    }
    
    /**
     * Check if an element is a node
     */
    private isNode(element: ModelElement): boolean {
        const elementType = element.element_type || element.type || '';
        return !elementType.includes('edge') && 
               !elementType.includes('flow') && 
               !elementType.includes('connection');
    }

    // ===== DIAGRAM MODEL INTEGRATION METHODS =====

    /**
     * Set callback for model changes
     */
    public onModelChange(callback: (model: DiagramModel) => void): void {
        this.onWitModelChange = callback;
    }

    /**
     * Convert WIT diagram to DiagramModel
     */
    public convertWitToDiagram(witDiagram: WitDiagram): DiagramModel {
        console.log('WitInterfaceRenderer: Converting WIT diagram to DiagramModel...');
        
        const diagramModel: DiagramModel = {
            id: witDiagram.id,
            diagramType: 'wit-diagram',
            revision: 1,
            root: '',
            elements: {},
            metadata: {
                type: 'wit-diagram',
                name: witDiagram.name,
                componentName: witDiagram.componentName,
                layout: witDiagram.layout,
                viewConfig: witDiagram.viewConfig
            } as any
        };

        // Convert WIT elements to diagram nodes
        witDiagram.elements.forEach(witElement => {
            const node = this.convertWitElementToNode(witElement);
            diagramModel.elements[node.id] = node;
        });

        // Convert WIT connections to diagram edges
        witDiagram.connections.forEach(witConnection => {
            const edge = this.convertWitConnectionToEdge(witConnection);
            diagramModel.elements[edge.id] = edge;
        });

        this.witDiagramModel = diagramModel;
        console.log(`WitInterfaceRenderer: Converted ${witDiagram.elements.length} elements, ${witDiagram.connections.length} connections`);
        
        return diagramModel;
    }

    /**
     * Convert DiagramModel back to WIT diagram
     */
    public convertDiagramToWit(diagramModel: DiagramModel): WitDiagram {
        console.log('WitInterfaceRenderer: Converting DiagramModel to WIT diagram...');
        
        const elements: WitElement[] = [];
        const connections: WitConnection[] = [];

        Object.values(diagramModel.elements).forEach(element => {
            if (this.isNode(element)) {
                const witElement = this.convertNodeToWitElement(element as Node);
                elements.push(witElement);
            } else {
                const witConnection = this.convertEdgeToWitConnection(element as Edge);
                connections.push(witConnection);
            }
        });

        const metadata = diagramModel.metadata as any;
        const witDiagram: WitDiagram = {
            id: metadata?.id || `wit-diagram-${Date.now()}`,
            name: metadata?.name || 'Untitled WIT Diagram',
            componentName: metadata?.componentName || 'component',
            elements,
            connections,
            layout: metadata?.layout,
            viewConfig: metadata?.viewConfig || this.witViewConfig
        };

        console.log(`WitInterfaceRenderer: Converted to WIT diagram with ${elements.length} elements, ${connections.length} connections`);
        return witDiagram;
    }

    /**
     * Convert WIT element to diagram node
     */
    private convertWitElementToNode(witElement: WitElement): Node {
        return {
            id: witElement.id,
            element_type: `wit-${witElement.type}`,
            type: `wit-${witElement.type}`,
            label: witElement.name,
            position: witElement.position || { x: 0, y: 0 },
            size: witElement.size || this.getDefaultSizeForType(witElement.type),
            bounds: {
                x: witElement.position?.x || 0,
                y: witElement.position?.y || 0,
                width: witElement.size?.width || this.getDefaultSizeForType(witElement.type).width,
                height: witElement.size?.height || this.getDefaultSizeForType(witElement.type).height
            },
            properties: {
                name: witElement.name,
                witType: witElement.type,
                metadata: witElement.metadata || {},
                ...this.extractTypeSpecificProperties(witElement)
            }
        };
    }

    /**
     * Convert WIT connection to diagram edge
     */
    private convertWitConnectionToEdge(witConnection: WitConnection): Edge {
        return {
            id: witConnection.id,
            element_type: `wit-${witConnection.type}`,
            type: `wit-${witConnection.type}`,
            sourceId: witConnection.source,
            targetId: witConnection.target,
            label: witConnection.label,
            properties: {
                witConnectionType: witConnection.type,
                edgeStyle: this.getEdgeStyleForType(witConnection.type)
            }
        };
    }

    /**
     * Convert diagram node back to WIT element
     */
    private convertNodeToWitElement(node: Node): WitElement {
        const witType = node.properties?.witType || 
                       node.element_type?.replace('wit-', '') || 
                       WitElementType.Interface;

        return {
            id: node.id,
            type: witType as WitElementType,
            name: node.label || node.properties?.name || 'Unnamed',
            position: node.position,
            size: node.size,
            metadata: node.properties?.metadata || {}
        };
    }

    /**
     * Convert diagram edge back to WIT connection
     */
    private convertEdgeToWitConnection(edge: Edge): WitConnection {
        const witType = edge.properties?.witConnectionType || 
                       edge.element_type?.replace('wit-', '') || 
                       WitConnectionType.Dependency;

        return {
            id: edge.id,
            source: edge.sourceId!,
            target: edge.targetId!,
            type: witType as WitConnectionType,
            label: edge.label
        };
    }

    /**
     * Get default size for WIT element type
     */
    private getDefaultSizeForType(type: WitElementType): { width: number; height: number } {
        const sizes: Record<string, { width: number; height: number }> = {
            [WitElementType.Package]: { width: 200, height: 150 },
            [WitElementType.World]: { width: 180, height: 120 },
            [WitElementType.Interface]: { width: 160, height: 100 },
            [WitElementType.Function]: { width: 140, height: 60 },
            [WitElementType.Type]: { width: 120, height: 50 },
            [WitElementType.Resource]: { width: 150, height: 80 },
            [WitElementType.Import]: { width: 130, height: 70 },
            [WitElementType.Export]: { width: 130, height: 70 },
            // Additional WIT types
            'record': { width: 140, height: 100 },
            'variant': { width: 140, height: 100 },
            'enum': { width: 120, height: 80 },
            'flags': { width: 120, height: 80 },
            'primitive': { width: 100, height: 50 },
            'list': { width: 120, height: 60 },
            'tuple': { width: 120, height: 60 },
            'option': { width: 110, height: 50 },
            'result': { width: 110, height: 50 }
        };
        return sizes[type] || { width: 120, height: 60 };
    }

    /**
     * Extract type-specific properties from WIT element
     */
    private extractTypeSpecificProperties(witElement: WitElement): Record<string, any> {
        const props: Record<string, any> = {};

        switch (witElement.type) {
            case WitElementType.Package:
                props.version = witElement.metadata?.version || '1.0.0';
                props.worlds = witElement.metadata?.worlds || [];
                props.interfaces = witElement.metadata?.interfaces || [];
                break;
            case WitElementType.World:
                props.imports = witElement.metadata?.imports || [];
                props.exports = witElement.metadata?.exports || [];
                props.components = witElement.metadata?.components || [];
                break;
            case WitElementType.Interface:
                props.interfaceType = witElement.metadata?.interfaceType || 'export';
                props.functions = witElement.metadata?.functions || [];
                props.types = witElement.metadata?.types || [];
                props.resources = witElement.metadata?.resources || [];
                break;
            case WitElementType.Function:
                props.signature = witElement.metadata?.signature || '';
                props.parameters = witElement.metadata?.parameters || [];
                props.returnType = witElement.metadata?.returnType;
                props.isAsync = witElement.metadata?.isAsync || false;
                break;
            case WitElementType.Type:
                props.typeKind = witElement.metadata?.kind || 'record';
                props.fields = witElement.metadata?.fields || [];
                props.variants = witElement.metadata?.variants || [];
                props.values = witElement.metadata?.values || [];
                break;
            case WitElementType.Resource:
                props.methods = witElement.metadata?.methods || [];
                props.constructor = witElement.metadata?.constructor;
                props.destructor = witElement.metadata?.destructor;
                props.statics = witElement.metadata?.statics || [];
                break;
            case WitElementType.Import:
                props.source = witElement.metadata?.source || '';
                props.namespace = witElement.metadata?.namespace || '';
                props.items = witElement.metadata?.items || [];
                break;
            case WitElementType.Export:
                props.target = witElement.metadata?.target || '';
                props.visibility = witElement.metadata?.visibility || 'public';
                props.items = witElement.metadata?.items || [];
                break;
        }

        return props;
    }

    /**
     * Get edge style for connection type
     */
    private getEdgeStyleForType(type: WitConnectionType): string {
        const styles: Record<string, string> = {
            [WitConnectionType.Import]: 'dashed',
            [WitConnectionType.Export]: 'solid',
            [WitConnectionType.Uses]: 'dotted',
            [WitConnectionType.Implements]: 'solid',
            [WitConnectionType.Contains]: 'solid',
            [WitConnectionType.TypeReference]: 'dotted',
            [WitConnectionType.Dependency]: 'dashed'
        };
        return styles[type] || 'solid';
    }

    /**
     * Load WIT diagram and render it
     */
    public loadWitDiagram(witDiagram: WitDiagram): void {
        console.log('WitInterfaceRenderer: Loading WIT diagram...');
        
        const diagramModel = this.convertWitToDiagram(witDiagram);
        this.setDiagram(diagramModel);
        
        // Apply view configuration
        this.applyWitViewConfig(witDiagram.viewConfig || this.witViewConfig);
        
        // Trigger render
        this.render();
        
        console.log(`WitInterfaceRenderer: Loaded WIT diagram "${witDiagram.name}"`);
    }

    /**
     * Export current diagram as WIT diagram
     */
    public exportWitDiagram(): WitDiagram | null {
        if (!this.witDiagramModel) {
            console.warn('WitInterfaceRenderer: No WIT diagram model to export');
            return null;
        }

        return this.convertDiagramToWit(this.witDiagramModel);
    }

    /**
     * Apply WIT view configuration
     */
    private applyWitViewConfig(viewConfig: WitViewConfig): void {
        this.witViewConfig = { ...this.witViewConfig, ...viewConfig };
        
        // Apply visibility filters
        if (this.currentDiagram) {
            Object.values(this.currentDiagram.elements).forEach(element => {
                if (this.isNode(element)) {
                    const node = element as Node;
                    const witType = node.properties?.witType;
                    
                    // Set visibility based on view config
                    node.properties = node.properties || {};
                    node.properties.visible = this.shouldShowElementType(String(witType));
                }
            });
        }
        
        // Apply expansion level
        this.applyExpansionLevel(viewConfig.expandLevel);
    }

    /**
     * Check if element type should be visible
     */
    private shouldShowElementType(witType: string): boolean {
        switch (witType) {
            case WitElementType.Package: return this.witViewConfig.showPackages;
            case WitElementType.World: return this.witViewConfig.showWorlds;
            case WitElementType.Interface: return this.witViewConfig.showInterfaces;
            case WitElementType.Type: return this.witViewConfig.showTypes;
            case WitElementType.Function: return this.witViewConfig.showFunctions;
            case WitElementType.Resource: return this.witViewConfig.showResources;
            case WitElementType.Import:
            case WitElementType.Export:
                return true; // Always show import/export elements
            default:
                return true;
        }
    }

    /**
     * Apply expansion level to nodes
     */
    private applyExpansionLevel(level: number): void {
        this.expandedNodes.clear();
        
        if (this.currentDiagram) {
            Object.values(this.currentDiagram.elements).forEach(element => {
                if (this.isNode(element)) {
                    const node = element as Node;
                    const witType = node.properties?.witType;
                    
                    // Expand nodes based on level
                    if (this.shouldExpandAtLevel(String(witType), level)) {
                        this.expandedNodes.add(node.id);
                    }
                }
            });
        }
    }

    /**
     * Check if element should be expanded at given level
     */
    private shouldExpandAtLevel(witType: string, level: number): boolean {
        const expansionLevels: Record<string, number> = {
            [WitElementType.Package]: 1,
            [WitElementType.World]: 2,
            [WitElementType.Interface]: 3,
            [WitElementType.Function]: 4,
            [WitElementType.Type]: 4,
            [WitElementType.Resource]: 4
        };
        
        const elementLevel = expansionLevels[witType] || 0;
        return level >= elementLevel;
    }

    /**
     * Create a new WIT element in the diagram
     */
    public createWitElement(
        type: WitElementType, 
        name: string, 
        position: { x: number; y: number }
    ): string {
        if (!this.witDiagramModel) {
            console.warn('WitInterfaceRenderer: No diagram model available for element creation');
            return '';
        }

        const id = `wit-${type}-${Date.now()}`;
        const witElement: WitElement = {
            id,
            type,
            name,
            position,
            size: this.getDefaultSizeForType(type),
            metadata: {}
        };

        const node = this.convertWitElementToNode(witElement);
        this.witDiagramModel.elements[id] = node;
        
        // Update current diagram
        if (this.currentDiagram) {
            this.currentDiagram.elements[id] = node;
        }

        // Notify of model change
        if (this.onWitModelChange && this.witDiagramModel) {
            this.onWitModelChange(this.witDiagramModel);
        }

        this.render();
        console.log(`WitInterfaceRenderer: Created ${type} element "${name}"`);
        
        return id;
    }

    /**
     * Delete a WIT element from the diagram
     */
    public deleteWitElement(elementId: string): boolean {
        if (!this.witDiagramModel || !this.witDiagramModel.elements[elementId]) {
            return false;
        }

        // Remove from diagram model
        delete this.witDiagramModel.elements[elementId];
        
        // Remove from current diagram
        if (this.currentDiagram) {
            delete this.currentDiagram.elements[elementId];
        }

        // Remove from expanded nodes
        this.expandedNodes.delete(elementId);

        // Remove any connections to this element
        Object.values(this.witDiagramModel.elements).forEach(element => {
            if (!this.isNode(element)) {
                const edge = element as Edge;
                if (edge.sourceId === elementId || edge.targetId === elementId) {
                    delete this.witDiagramModel!.elements[edge.id];
                    if (this.currentDiagram) {
                        delete this.currentDiagram.elements[edge.id];
                    }
                }
            }
        });

        // Notify of model change
        if (this.onWitModelChange && this.witDiagramModel) {
            this.onWitModelChange(this.witDiagramModel);
        }

        this.render();
        console.log(`WitInterfaceRenderer: Deleted element ${elementId}`);
        
        return true;
    }

    /**
     * Update WIT view configuration
     */
    public updateWitViewConfig(config: Partial<WitViewConfig>): void {
        this.witViewConfig = { ...this.witViewConfig, ...config };
        this.applyWitViewConfig(this.witViewConfig);
        this.render();
        console.log('WitInterfaceRenderer: Updated view configuration');
    }

    /**
     * Get current WIT view configuration
     */
    public getWitViewConfig(): WitViewConfig {
        return { ...this.witViewConfig };
    }

    /**
     * Validate WIT diagram structure
     */
    public validateWitDiagram(): { isValid: boolean; errors: string[]; warnings: string[] } {
        if (!this.witDiagramModel) {
            return { isValid: false, errors: ['No diagram model available'], warnings: [] };
        }

        const errors: string[] = [];
        const warnings: string[] = [];
        const elements = Object.values(this.witDiagramModel.elements);
        
        // Check for orphaned elements
        const nodes = elements.filter(el => this.isNode(el)) as Node[];
        const edges = elements.filter(el => !this.isNode(el)) as Edge[];
        
        edges.forEach(edge => {
            const sourceExists = nodes.some(node => node.id === edge.sourceId);
            const targetExists = nodes.some(node => node.id === edge.targetId);
            
            if (!sourceExists) {
                errors.push(`Edge ${edge.id} references non-existent source ${edge.sourceId}`);
            }
            if (!targetExists) {
                errors.push(`Edge ${edge.id} references non-existent target ${edge.targetId}`);
            }
        });

        // Check for duplicate names within the same type
        const namesByType = new Map<string, string[]>();
        nodes.forEach(node => {
            const witType = node.properties?.witType || 'unknown';
            const name = node.label || 'unnamed';
            
            if (!namesByType.has(witType)) {
                namesByType.set(witType, []);
            }
            
            const names = namesByType.get(witType)!;
            if (names.includes(name)) {
                warnings.push(`Duplicate ${witType} name: "${name}"`);
            } else {
                names.push(name);
            }
        });

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
}