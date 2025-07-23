/**
 * WIT Interface Renderer
 * Custom canvas renderer for WebAssembly Interface Types diagrams
 */

import { CanvasRenderer } from '../renderer/canvas-renderer.js';
import { DiagramModel, ModelElement, Node, Edge } from '../model/diagram.js';
import { WIT_VISUAL_STYLES, WIT_ICONS } from '../diagrams/wit-interface-types.js';

export class WitInterfaceRenderer extends CanvasRenderer {
    private expandedNodes: Set<string> = new Set();
    private hoveredElement: string | null = null;
    
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
        
        // Draw icon and label
        ctx.fillStyle = style.textColor;
        ctx.font = `${style.fontWeight} ${style.fontSize}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const icon = this.getNodeIcon(nodeType);
        const label = node.label || node.properties?.name || 'Unnamed';
        
        // Draw icon
        ctx.font = '20px sans-serif';
        ctx.fillText(icon, bounds.x + 25, bounds.y + bounds.height / 2);
        
        // Draw label
        ctx.font = `${style.fontWeight} ${style.fontSize}px -apple-system, sans-serif`;
        const labelX = bounds.x + bounds.width / 2 + 10;
        const labelY = bounds.y + bounds.height / 2;
        ctx.fillText(label, labelX, labelY);
        
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
        
        // Map element types to WIT node types
        if (elementType.includes('package')) return 'package';
        if (elementType.includes('world')) return 'world';
        if (elementType.includes('interface')) return 'interface';
        if (elementType.includes('function')) return 'function';
        if (elementType.includes('type')) return 'type';
        if (elementType.includes('resource')) return 'resource';
        if (elementType.includes('import')) return 'import';
        if (elementType.includes('export')) return 'export';
        
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
     * Get icon for a node type
     */
    private getNodeIcon(nodeType: string): string {
        const icons: Record<string, string> = {
            package: '📦',
            world: '🌐',
            interface: '🔷',
            function: '🔧',
            type: '📐',
            resource: '🔗',
            import: '📥',
            export: '📤'
        };
        return icons[nodeType] || '🔷';
    }
    
    /**
     * Render additional details for interface nodes
     */
    private renderInterfaceDetails(node: Node, bounds: any, style: any): void {
        const ctx = this.ctx;
        if (!ctx || !node.properties) return;
        
        ctx.save();
        
        // Draw interface type badge
        const interfaceType = node.properties.interfaceType || 'export';
        const badgeColor = interfaceType === 'import' ? '#3B82F6' : '#10B981';
        
        ctx.fillStyle = badgeColor;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(
            interfaceType.toUpperCase(), 
            bounds.x + bounds.width - 10, 
            bounds.y + 15
        );
        
        // Draw function/type counts if available
        if (node.properties.functions || node.properties.types) {
            ctx.font = '11px sans-serif';
            ctx.fillStyle = style.textColor;
            ctx.globalAlpha = 0.7;
            ctx.textAlign = 'center';
            
            const counts = [];
            if (node.properties.functions) {
                counts.push(`${node.properties.functions.length} functions`);
            }
            if (node.properties.types) {
                counts.push(`${node.properties.types.length} types`);
            }
            
            const countsText = counts.join(', ');
            ctx.fillText(
                countsText,
                bounds.x + bounds.width / 2,
                bounds.y + bounds.height - 15
            );
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
    protected drawArrowhead(to: Position, from: Position): void {
        const headLength = 10;
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        
        this.ctx.fillStyle = '#654FF0'; // Default WIT color
        this.ctx.beginPath();
        this.ctx.moveTo(to.x, to.y);
        this.ctx.lineTo(
            to.x - headLength * Math.cos(angle - Math.PI / 6),
            to.y - headLength * Math.sin(angle - Math.PI / 6)
        );
        this.ctx.lineTo(
            to.x - headLength * Math.cos(angle + Math.PI / 6),
            to.y - headLength * Math.sin(angle + Math.PI / 6)
        );
        this.ctx.closePath();
        this.ctx.fill();
    }
    
    /**
     * Draw edge label
     */
    protected drawEdgeLabel(text: string, position: Position): void {
        if (!this.ctx || !text) return;
        
        this.ctx.save();
        
        // Draw label background
        const padding = 4;
        const metrics = this.ctx.measureText(text);
        const width = metrics.width + padding * 2;
        const height = 16;
        
        this.ctx.fillStyle = 'rgba(31, 41, 55, 0.9)';
        this.ctx.fillRect(position.x - width / 2, position.y - height / 2, width, height);
        
        // Draw label text
        this.ctx.fillStyle = '#E5E7EB';
        this.ctx.font = '11px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, position.x, position.y);
        
        this.ctx.restore();
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
}