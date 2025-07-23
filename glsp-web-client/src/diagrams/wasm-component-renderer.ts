/**
 * WebAssembly Component Renderer
 * Custom rendering for WASM component diagrams with interface circles
 */

import { Bounds, ModelElement } from '../model/diagram.js';
import { ComponentColors } from '../types/wasm-component.js';

export interface WasmRenderingContext {
    ctx: CanvasRenderingContext2D;
    scale: number;
    isSelected: boolean;
    isHovered: boolean;
    isMissing?: boolean; // Indicates if the component file is missing
    colors: {
        component: string;
        host: string;
        import: string;
        export: string;
        selected: string;
        text: string;
        border: string;
        missing: string; // Color for missing components
    };
}

export class WasmComponentRenderer {
    private static readonly INTERFACE_SPACING = 20;

    static renderWasmComponent(
        element: ModelElement,
        bounds: Bounds,
        context: WasmRenderingContext
    ): void {
        const { ctx, isSelected, isHovered, isMissing, colors } = context;

        // Get component properties
        const label = element.properties?.label?.toString() || element.properties?.componentName?.toString() || 'Component';
        const componentType = element.element_type || element.type || 'wasm-component';
        const interfaces = element.properties?.interfaces as import('../types/wasm-component.js').ComponentInterface[] || [];
        const description = element.properties?.description?.toString();
        const metadata = element.properties?.metadata || {};
        const filePath = element.properties?.componentPath?.toString();
        const fileSize = (metadata as any)?.file_size;
        const dependencies = element.properties?.dependencies as string[] || [];

        // Choose colors based on component type and missing status
        let bgColor = componentType === 'host-component' ? colors.host : colors.component;
        let borderColor = isSelected ? colors.selected : (isHovered ? colors.selected : colors.border);
        
        // Apply missing component styling
        if (isMissing) {
            bgColor = colors.missing;
            borderColor = colors.missing;
            ctx.globalAlpha = 0.5;
        }

        // Draw main component rectangle with rounded corners
        const cornerRadius = 8;
        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = isSelected ? 3 : 1;

        this.drawRoundedRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, cornerRadius);
        ctx.fill();
        ctx.stroke();

        // Draw header section with gradient
        const headerHeight = 35;
        const gradient = ctx.createLinearGradient(bounds.x, bounds.y, bounds.x, bounds.y + headerHeight);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.05)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.02)');
        ctx.fillStyle = gradient;
        this.drawRoundedRect(ctx, bounds.x + 1, bounds.y + 1, bounds.width - 2, headerHeight, cornerRadius, true);
        ctx.fill();

        // Draw component name (bold and larger)
        ctx.fillStyle = colors.text;
        ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(label, bounds.x + bounds.width / 2, bounds.y + 8);

        // Draw component type badge
        this.drawTypeBadge(ctx, componentType, bounds, colors);

        // Draw load/unload switch
        const isLoaded = element.properties?.isLoaded === true;
        this.drawLoadSwitch(ctx, bounds, isLoaded, colors);

        // Calculate content area (below header)
        const contentY = bounds.y + headerHeight + 8;

        // Draw metadata section
        let currentY = contentY;
        currentY = this.drawMetadataSection(ctx, {
            description,
            filePath,
            fileSize,
            dependencies,
            metadata: metadata as Record<string, unknown>
        }, bounds.x + 12, currentY, bounds.width - 24, colors);

        // Draw interface circles with improved positioning
        const importInterfaces = interfaces.filter(i => 
            i.interface_type === 'import' || 
            (i as any).type === 'import' ||
            (i as any).direction === 'import'
        );
        const exportInterfaces = interfaces.filter(i => 
            i.interface_type === 'export' || 
            (i as any).type === 'export' ||
            (i as any).direction === 'export'
        );

        // Calculate interface positioning to avoid overlapping with content
        const interfaceStartY = Math.max(currentY + 10, bounds.y + headerHeight + 20);
        const availableHeight = bounds.y + bounds.height - interfaceStartY - 10;

        this.drawInterfaceConnectors(ctx, importInterfaces, bounds, 'left', colors.import, interfaceStartY, availableHeight);
        this.drawInterfaceConnectors(ctx, exportInterfaces, bounds, 'right', colors.export, interfaceStartY, availableHeight);

        // Draw missing file indicator if component is missing
        if (isMissing) {
            this.drawMissingIndicator(ctx, bounds, colors);
        }
        
        // Restore alpha if it was modified
        if (isMissing) {
            ctx.globalAlpha = 1.0;
        }
    }

    static renderInterfaceNode(
        element: ModelElement,
        bounds: Bounds,
        context: WasmRenderingContext
    ): void {
        const { ctx, isSelected, isHovered, colors } = context;
        const interfaceType = element.properties?.interfaceType?.toString() || '';
        const elementType = element.element_type || element.type || '';
        const isImport = elementType === 'import-interface';

        const color = isImport ? colors.import : colors.export;
        const borderColor = isSelected ? colors.selected : (isHovered ? colors.selected : colors.border);

        // Draw interface circle
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        const radius = Math.min(bounds.width, bounds.height) / 2;

        ctx.fillStyle = color;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = isSelected ? 3 : 2;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // Draw interface type label
        if (interfaceType) {
            ctx.fillStyle = colors.text;
            ctx.font = '8px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Draw background for text
            const textMetrics = ctx.measureText(interfaceType);
            const textWidth = textMetrics.width + 4;
            const textHeight = 12;
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(
                centerX - textWidth / 2,
                centerY + radius + 2,
                textWidth,
                textHeight
            );
            
            ctx.fillStyle = colors.text;
            ctx.fillText(interfaceType, centerX, centerY + radius + 8);
        }
    }

    private static drawInterfaceConnectors(
        ctx: CanvasRenderingContext2D,
        interfaces: Array<{ name?: string; functions?: unknown[] }>,
        bounds: Bounds,
        side: 'left' | 'right',
        color: string,
        startY: number,
        availableHeight: number
    ): void {
        if (interfaces.length === 0) return;

        const spacing = Math.min(this.INTERFACE_SPACING, availableHeight / Math.max(interfaces.length, 1));
        const connectorRadius = 6;
        const connectorOffset = 3; // How far the connector extends from the component

        interfaces.forEach((interface_, index) => {
            const x = side === 'left' ? 
                bounds.x - connectorOffset - connectorRadius : 
                bounds.x + bounds.width + connectorOffset + connectorRadius;
            const y = startY + (index * spacing) + connectorRadius;

            // Draw connector line from component edge to circle
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (side === 'left') {
                ctx.moveTo(bounds.x, y);
                ctx.lineTo(x + connectorRadius, y);
            } else {
                ctx.moveTo(bounds.x + bounds.width, y);
                ctx.lineTo(x - connectorRadius, y);
            }
            ctx.stroke();

            // Draw interface connector circle
            ctx.fillStyle = color;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.arc(x, y, connectorRadius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();

            // Add inner dot for better visibility
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x, y, connectorRadius - 3, 0, 2 * Math.PI);
            ctx.fill();

            // Draw interface name with background
            const interfaceName = interface_.name || `interface-${index + 1}`;
            this.drawInterfaceLabel(ctx, interfaceName, x, y, side, connectorRadius);
        });
    }

    private static drawInterfaceLabel(
        ctx: CanvasRenderingContext2D,
        text: string,
        centerX: number,
        centerY: number,
        side: 'left' | 'right',
        connectorRadius: number
    ): void {
        ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textBaseline = 'middle';
        
        const textMetrics = ctx.measureText(text);
        const textWidth = textMetrics.width + 6;
        const textHeight = 14;
        
        const textX = side === 'left' ? 
            centerX - connectorRadius - 8 - textWidth/2 : 
            centerX + connectorRadius + 8 + textWidth/2;
        
        // Draw background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.lineWidth = 1;
        this.drawRoundedRect(ctx, textX - textWidth/2, centerY - textHeight/2, textWidth, textHeight, 3);
        ctx.fill();
        ctx.stroke();
        
        // Draw text
        ctx.fillStyle = '#333333';
        ctx.textAlign = 'center';
        ctx.fillText(text, textX, centerY);
    }


    static getDefaultColors() {
        return {
            component: '#e3f2fd',
            host: '#f3e5f5',
            import: '#2196f3',
            export: '#4caf50',
            selected: '#ff9800',
            text: '#333333',
            border: '#666666',
            missing: '#9e9e9e' // Grey color for missing components
        };
    }

    private static drawRoundedRect(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number,
        topOnly: boolean = false
    ): void {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        
        if (topOnly) {
            ctx.lineTo(x + width, y + height);
            ctx.lineTo(x, y + height);
            ctx.lineTo(x, y + radius);
        } else {
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
        }
        
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    private static drawTypeBadge(
        ctx: CanvasRenderingContext2D,
        componentType: string,
        bounds: Bounds,
        _colors: unknown
    ): void {
        const badgeX = bounds.x + bounds.width - 50;
        const badgeY = bounds.y + 6;
        const badgeWidth = 40;
        const badgeHeight = 20;

        // Badge background
        ctx.fillStyle = componentType === 'host-component' ? '#9c27b0' : '#1976d2';
        this.drawRoundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 10);
        ctx.fill();

        // Badge text
        ctx.fillStyle = 'white';
        ctx.font = 'bold 8px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const badgeText = componentType === 'host-component' ? 'HOST' : 'WASM';
        ctx.fillText(badgeText, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);
    }

    private static drawMetadataSection(
        ctx: CanvasRenderingContext2D,
        metadata: {
            description?: string;
            filePath?: string;
            fileSize?: number;
            dependencies: string[];
            metadata: Record<string, unknown>;
        },
        x: number,
        y: number,
        maxWidth: number,
        colors: ComponentColors
    ): number {
        let currentY = y;
        const lineHeight = 12;
        const sectionSpacing = 8;

        // Description
        if (metadata.description) {
            ctx.fillStyle = colors.text;
            ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            currentY = this.drawWrappedText(ctx, metadata.description, x, currentY, maxWidth, lineHeight) + sectionSpacing;
        }

        // File info
        if (metadata.filePath || metadata.fileSize) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.font = '8px Monaco, "Lucida Console", monospace';
            ctx.textAlign = 'left';
            
            if (metadata.filePath) {
                const fileName = metadata.filePath.split('/').pop() || metadata.filePath;
                ctx.fillText(`📁 ${fileName}`, x, currentY);
                currentY += lineHeight;
            }
            
            if (metadata.fileSize) {
                const sizeKB = Math.round(metadata.fileSize / 1024);
                ctx.fillText(`📊 ${sizeKB} KB`, x, currentY);
                currentY += lineHeight;
            }
            
            currentY += sectionSpacing;
        }

        // Dependencies count
        if (metadata.dependencies.length > 0) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.font = '8px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillText(`🔗 ${metadata.dependencies.length} dependencies`, x, currentY);
            currentY += lineHeight + sectionSpacing;
        }

        return currentY;
    }

    private static drawWrappedText(
        ctx: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        maxWidth: number,
        lineHeight: number
    ): number {
        const words = text.split(' ');
        let line = '';
        let currentY = y;

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;

            if (testWidth > maxWidth && n > 0) {
                ctx.fillText(line, x, currentY);
                line = words[n] + ' ';
                currentY += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, currentY);
        
        return currentY + lineHeight;
    }

    private static drawLoadSwitch(
        ctx: CanvasRenderingContext2D,
        bounds: Bounds,
        isLoaded: boolean,
        colors: ComponentColors
    ): void {
        const switchWidth = 36;
        const switchHeight = 18;
        const switchX = bounds.x + 8;
        const switchY = bounds.y + 8;
        
        // Draw switch background
        ctx.fillStyle = isLoaded ? '#4caf50' : '#ccc';
        this.drawRoundedRect(ctx, switchX, switchY, switchWidth, switchHeight, switchHeight / 2);
        ctx.fill();
        
        // Draw switch border
        ctx.strokeStyle = isLoaded ? '#388e3c' : '#999';
        ctx.lineWidth = 1;
        this.drawRoundedRect(ctx, switchX, switchY, switchWidth, switchHeight, switchHeight / 2);
        ctx.stroke();
        
        // Draw switch knob
        const knobRadius = (switchHeight - 4) / 2;
        const knobX = isLoaded ? 
            switchX + switchWidth - knobRadius - 2 : 
            switchX + knobRadius + 2;
        const knobY = switchY + switchHeight / 2;
        
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(knobX, knobY, knobRadius, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Draw status text
        ctx.fillStyle = colors.text;
        ctx.font = '8px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            isLoaded ? 'LOADED' : 'UNLOADED', 
            switchX + switchWidth + 6, 
            switchY + switchHeight / 2
        );
    }

    // Check if a position is within the load switch area
    static isPositionInLoadSwitch(position: { x: number; y: number }, bounds: Bounds): boolean {
        const switchWidth = 36;
        const switchHeight = 18;
        const switchX = bounds.x + 8;
        const switchY = bounds.y + 8;
        
        return position.x >= switchX && 
               position.x <= switchX + switchWidth &&
               position.y >= switchY && 
               position.y <= switchY + switchHeight;
    }

    private static drawMissingIndicator(
        ctx: CanvasRenderingContext2D,
        bounds: Bounds,
        _colors: ComponentColors
    ): void {
        // Draw a warning triangle in the top-right corner
        const triangleSize = 12;
        const triangleX = bounds.x + bounds.width - triangleSize - 5;
        const triangleY = bounds.y + 5;
        
        // Save current alpha to restore later
        const savedAlpha = ctx.globalAlpha;
        ctx.globalAlpha = 1.0; // Make warning icon fully opaque
        
        // Draw warning triangle
        ctx.fillStyle = '#ff5722'; // Orange-red warning color
        ctx.beginPath();
        ctx.moveTo(triangleX + triangleSize / 2, triangleY);
        ctx.lineTo(triangleX, triangleY + triangleSize);
        ctx.lineTo(triangleX + triangleSize, triangleY + triangleSize);
        ctx.closePath();
        ctx.fill();
        
        // Draw exclamation mark
        ctx.fillStyle = 'white';
        ctx.font = 'bold 8px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', triangleX + triangleSize / 2, triangleY + triangleSize * 0.6);
        
        // Add strikethrough effect across the component
        ctx.strokeStyle = '#f44336'; // Red strikethrough
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(bounds.x, bounds.y);
        ctx.lineTo(bounds.x + bounds.width, bounds.y + bounds.height);
        ctx.moveTo(bounds.x + bounds.width, bounds.y);
        ctx.lineTo(bounds.x, bounds.y + bounds.height);
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash pattern
        
        // Restore original alpha
        ctx.globalAlpha = savedAlpha;
    }
}