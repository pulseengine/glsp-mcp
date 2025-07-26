/**
 * WasmViewTransformer - Handles transformations between WASM component and WIT interface views
 * 
 * This transformer converts WASM component diagrams to show different perspectives:
 * - Component View: Shows WASM components with their connections
 * - Interface View: Shows WIT interfaces, types, and functions extracted from components
 * - Dependencies View: Shows interface dependencies and relationships
 */

import { DiagramModel, ModelElement, Node, Edge } from '../model/diagram.js';
import { ViewTransformer, ViewTransformationResult } from './ViewModeManager.js';
import { WasmComponentData, ComponentInterface } from '../types/wasm-component.js';

export interface InterfaceFunction {
    name: string;
    parameters?: Parameter[];
    returnType?: string;
}

export interface InterfaceType {
    name: string;
    kind: 'record' | 'variant' | 'enum' | 'flags' | 'resource';
    fields?: TypeField[];
}

export interface Parameter {
    name: string;
    type: string;
}

export interface TypeField {
    name: string;
    type: string;
}

export class WasmViewTransformer implements ViewTransformer {
    
    /**
     * Check if transformation between view modes is supported
     */
    public canTransform(fromView: string, toView: string, diagram: DiagramModel): boolean {
        const supportedViews = ['component', 'uml-interface', 'wit-dependencies'];
        
        if (!supportedViews.includes(fromView) || !supportedViews.includes(toView)) {
            return false;
        }

        // Check if diagram has the necessary data for transformation
        const diagramType = diagram.diagramType || diagram.diagram_type;
        if (diagramType !== 'wasm-component') {
            return false;
        }

        return true;
    }

    /**
     * Transform diagram data for the target view mode
     */
    public transform(diagram: DiagramModel, targetView: string): ViewTransformationResult {
        try {
            switch (targetView) {
                case 'component':
                    return this.transformToComponentView(diagram);
                case 'uml-interface':
                    return this.transformToUMLView(diagram);
                case 'wit-dependencies':
                    return this.transformToDependencyView(diagram);
                default:
                    return {
                        success: false,
                        error: `Unsupported view mode: ${targetView}`
                    };
            }
        } catch (error) {
            return {
                success: false,
                error: `Transformation error: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * Transform to component view (default WASM component representation)
     */
    private transformToComponentView(diagram: DiagramModel): ViewTransformationResult {
        // Component view uses the original diagram data structure
        // No transformation needed, just ensure elements have correct types
        const elements = Object.values(diagram.elements).map(element => {
            // Ensure WASM component elements have correct types
            if (this.isWitElement(element)) {
                // Convert WIT elements back to WASM component equivalents
                return this.convertWitToWasmElement(element);
            }
            return element;
        });

        return {
            success: true,
            transformedElements: elements,
            additionalData: {
                viewMode: 'component',
                renderingHints: {
                    showComponents: true,
                    showInterfaces: true,
                    showConnections: true
                }
            }
        };
    }

    /**
     * Transform to UML view (UML-style class diagram rendering with separate interface components)
     */
    private transformToUMLView(diagram: DiagramModel): ViewTransformationResult {
        const elements = Object.values(diagram.elements);
        const wasmComponents = this.extractWasmComponents(elements);
        const umlElements: ModelElement[] = [];
        
        let nodeIdCounter = 1;
        let edgeIdCounter = 1;
        
        // Base positioning
        let currentX = 50;
        let currentY = 50;
        const componentSpacing = 400;
        const interfaceSpacing = 200;
        
        wasmComponents.forEach((component, componentIndex) => {
            // Create main component (simplified - just core component info)
            const mainComponent: ModelElement = {
                id: `uml-component-${nodeIdCounter++}`,
                type: 'uml-component',
                element_type: 'uml-component',
                label: component.name,
                bounds: {
                    x: currentX,
                    y: currentY,
                    width: 200,
                    height: 100
                },
                properties: {
                    originalId: component.id,
                    componentType: 'main',
                    category: component.properties?.category,
                    status: component.properties?.status,
                    componentPath: component.properties?.componentPath
                }
            };
            umlElements.push(mainComponent);
            
            // Create separate interface components
            let interfaceY = currentY;
            const interfaces = component.interfaces || [];
            
            // Group interfaces by type for better layout
            const importInterfaces = interfaces.filter(iface => iface.type === 'import');
            const exportInterfaces = interfaces.filter(iface => iface.type === 'export');
            
            // Create import interface components (left side)
            let leftX = currentX - interfaceSpacing;
            importInterfaces.forEach((iface, index) => {
                const interfaceComponent: ModelElement = {
                    id: `uml-interface-${nodeIdCounter++}`,
                    type: 'uml-interface',
                    element_type: 'uml-interface',
                    label: iface.name,
                    bounds: {
                        x: leftX,
                        y: interfaceY + (index * 120),
                        width: 180,
                        height: Math.max(80, (iface.functions?.length || 0) * 20 + 60)
                    },
                    properties: {
                        interfaceType: 'import',
                        parentComponent: component.id,
                        functions: iface.functions || [],
                        types: iface.types || []
                    }
                };
                umlElements.push(interfaceComponent);
                
                // Create connection edge from interface to component
                const edge: ModelElement = {
                    id: `uml-edge-${edgeIdCounter++}`,
                    type: 'uml-dependency',
                    element_type: 'uml-dependency',
                    sourceId: interfaceComponent.id,
                    targetId: mainComponent.id,
                    label: 'requires',
                    properties: {
                        edgeType: 'import'
                    }
                };
                umlElements.push(edge);
            });
            
            // Create export interface components (right side)
            let rightX = currentX + 220;
            exportInterfaces.forEach((iface, index) => {
                const interfaceComponent: ModelElement = {
                    id: `uml-interface-${nodeIdCounter++}`,
                    type: 'uml-interface',
                    element_type: 'uml-interface',
                    label: iface.name,
                    bounds: {
                        x: rightX,
                        y: interfaceY + (index * 120),
                        width: 180,
                        height: Math.max(80, (iface.functions?.length || 0) * 20 + 60)
                    },
                    properties: {
                        interfaceType: 'export',
                        parentComponent: component.id,
                        functions: iface.functions || [],
                        types: iface.types || []
                    }
                };
                umlElements.push(interfaceComponent);
                
                // Create connection edge from component to interface
                const edge: ModelElement = {
                    id: `uml-edge-${edgeIdCounter++}`,
                    type: 'uml-realization',
                    element_type: 'uml-realization',
                    sourceId: mainComponent.id,
                    targetId: interfaceComponent.id,
                    label: 'provides',
                    properties: {
                        edgeType: 'export'
                    }
                };
                umlElements.push(edge);
            });
            
            // Move to next component position
            currentY += Math.max(200, Math.max(importInterfaces.length, exportInterfaces.length) * 120 + 100);
        });
        
        return {
            success: true,
            transformedElements: umlElements,
            additionalData: {
                viewMode: 'uml-interface',
                renderingHints: {
                    showUMLStyle: true,
                    showStereotypes: true,
                    showVisibility: true,
                    showMethodSignatures: true,
                    showSeparateInterfaces: true
                }
            }
        };
    }

    /**
     * Calculate adaptive layout parameters based on content complexity
     */
    private calculateLayoutParameters(components: WasmComponentData[]): {
        packageWidth: number;
        packageHeight: number;
        interfaceWidth: number;
        interfaceHeight: number;
        functionWidth: number;
        functionHeight: number;
        horizontalSpacing: number;
        verticalGroupSpacing: number;
        interfaceVerticalSpacing: number;
        functionVerticalSpacing: number;
        functionHorizontalOffset: number;
    } {
        const maxFunctionsPerInterface = Math.max(
            ...components.flatMap(c => c.interfaces.map(i => i.functions?.length || 0))
        );
        const maxInterfacesPerComponent = Math.max(
            ...components.map(c => c.interfaces.length)
        );
        
        // Adaptive sizing based on content complexity
        const complexityFactor = Math.min(maxFunctionsPerInterface / 5, 2);
        const densityFactor = Math.min(maxInterfacesPerComponent / 3, 1.5);
        
        return {
            packageWidth: 280 + (densityFactor * 40),
            packageHeight: 80,
            interfaceWidth: 220 + (complexityFactor * 20),
            interfaceHeight: 100 + (complexityFactor * 20),
            functionWidth: 180 + (complexityFactor * 15),
            functionHeight: 50,
            horizontalSpacing: 400 + (densityFactor * 100),
            verticalGroupSpacing: 200,
            interfaceVerticalSpacing: 140 + (complexityFactor * 20),
            functionVerticalSpacing: 70,
            functionHorizontalOffset: 300 + (complexityFactor * 50)
        };
    }

    /**
     * Transform to WIT interface view with improved hierarchical layout
     */
    private transformToInterfaceView(diagram: DiagramModel): ViewTransformationResult {
        const elements = Object.values(diagram.elements);
        const wasmComponents = this.extractWasmComponents(elements);
        const witElements: ModelElement[] = [];
        
        let nodeIdCounter = 1;
        let edgeIdCounter = 1;

        // Calculate adaptive layout parameters based on content complexity
        const layout = this.calculateLayoutParameters(wasmComponents);
        
        let currentX = 100;
        let maxY = 100;

        // Transform each WASM component into WIT interface representation
        wasmComponents.forEach((component, componentIndex) => {
            const componentStartY = maxY;
            
            // Separate import and export interfaces for better visual grouping
            const importInterfaces = component.interfaces.filter(iface => iface.type === 'import');
            const exportInterfaces = component.interfaces.filter(iface => iface.type === 'export');
            
            // Create package node for each component
            const packageNode: Node = {
                id: `wit-package-${nodeIdCounter++}`,
                type: 'wit-package',
                element_type: 'wit-package',
                label: `${component.name} Package`,
                bounds: {
                    x: currentX,
                    y: componentStartY,
                    width: layout.packageWidth,
                    height: layout.packageHeight
                },
                properties: {
                    componentId: component.id,
                    interfaceCount: component.interfaces.length,
                    importCount: importInterfaces.length,
                    exportCount: exportInterfaces.length
                }
            };
            witElements.push(packageNode);

            let interfaceY = componentStartY + layout.packageHeight + 40;
            
            // Create import interfaces group
            if (importInterfaces.length > 0) {
                const importGroupY = interfaceY;
                
                importInterfaces.forEach((iface, ifaceIndex) => {
                    const interfaceNode = this.createInterfaceNode(
                        nodeIdCounter++, 
                        iface, 
                        component.id, 
                        currentX, 
                        interfaceY,
                        layout.interfaceWidth,
                        layout.interfaceHeight
                    );
                    witElements.push(interfaceNode);

                    // Create edge from package to interface
                    const packageEdge: Edge = {
                        id: `wit-contains-${edgeIdCounter++}`,
                        type: 'wit-contains',
                        element_type: 'wit-contains',
                        sourceId: packageNode.id,
                        targetId: interfaceNode.id,
                        label: 'imports'
                    };
                    witElements.push(packageEdge);

                    // Create function nodes with improved positioning
                    const functionElements = this.createFunctionNodes(
                        iface, 
                        interfaceNode, 
                        nodeIdCounter, 
                        edgeIdCounter,
                        currentX + layout.functionHorizontalOffset,
                        interfaceY,
                        layout.functionWidth,
                        layout.functionHeight,
                        layout.functionVerticalSpacing
                    );
                    
                    nodeIdCounter += functionElements.nodes.length;
                    edgeIdCounter += functionElements.edges.length;
                    witElements.push(...functionElements.nodes, ...functionElements.edges);

                    // Create type nodes if interface has types
                    if (iface.types && iface.types.length > 0) {
                        const typeElements = this.createTypeNodes(
                            iface,
                            interfaceNode,
                            nodeIdCounter,
                            edgeIdCounter,
                            currentX + layout.functionHorizontalOffset + 200,
                            interfaceY,
                            layout.functionWidth,
                            layout.functionHeight,
                            layout.functionVerticalSpacing
                        );
                        
                        nodeIdCounter += typeElements.nodes.length;
                        edgeIdCounter += typeElements.edges.length;
                        witElements.push(...typeElements.nodes, ...typeElements.edges);
                    }
                    
                    interfaceY += layout.interfaceVerticalSpacing + (iface.functions?.length || 0) * layout.functionVerticalSpacing;
                });
            }
            
            // Add spacing between import and export groups
            if (importInterfaces.length > 0 && exportInterfaces.length > 0) {
                interfaceY += layout.verticalGroupSpacing;
            }
            
            // Create export interfaces group
            if (exportInterfaces.length > 0) {
                exportInterfaces.forEach((iface, ifaceIndex) => {
                    const interfaceNode = this.createInterfaceNode(
                        nodeIdCounter++, 
                        iface, 
                        component.id, 
                        currentX, 
                        interfaceY,
                        layout.interfaceWidth,
                        layout.interfaceHeight
                    );
                    witElements.push(interfaceNode);

                    // Create edge from package to interface
                    const packageEdge: Edge = {
                        id: `wit-contains-${edgeIdCounter++}`,
                        type: 'wit-contains',
                        element_type: 'wit-contains',
                        sourceId: packageNode.id,
                        targetId: interfaceNode.id,
                        label: 'exports'
                    };
                    witElements.push(packageEdge);

                    // Create function nodes with improved positioning
                    const functionElements = this.createFunctionNodes(
                        iface, 
                        interfaceNode, 
                        nodeIdCounter, 
                        edgeIdCounter,
                        currentX + layout.functionHorizontalOffset,
                        interfaceY,
                        layout.functionWidth,
                        layout.functionHeight,
                        layout.functionVerticalSpacing
                    );
                    
                    nodeIdCounter += functionElements.nodes.length;
                    edgeIdCounter += functionElements.edges.length;
                    witElements.push(...functionElements.nodes, ...functionElements.edges);

                    // Create type nodes if interface has types
                    if (iface.types && iface.types.length > 0) {
                        const typeElements = this.createTypeNodes(
                            iface,
                            interfaceNode,
                            nodeIdCounter,
                            edgeIdCounter,
                            currentX + layout.functionHorizontalOffset + 200,
                            interfaceY,
                            layout.functionWidth,
                            layout.functionHeight,
                            layout.functionVerticalSpacing
                        );
                        
                        nodeIdCounter += typeElements.nodes.length;
                        edgeIdCounter += typeElements.edges.length;
                        witElements.push(...typeElements.nodes, ...typeElements.edges);
                    }
                    
                    interfaceY += layout.interfaceVerticalSpacing + (iface.functions?.length || 0) * layout.functionVerticalSpacing;
                });
            }
            
            // Update positioning for next component
            currentX += layout.horizontalSpacing;
            maxY = Math.max(maxY, interfaceY + layout.verticalGroupSpacing);
        });

        return {
            success: true,
            transformedElements: witElements,
            additionalData: {
                viewMode: 'wit-interface',
                renderingHints: {
                    showPackages: true,
                    showInterfaces: true,
                    showFunctions: true,
                    showTypes: true,
                    groupByInterfaceType: true
                }
            }
        };
    }

    /**
     * Create an interface node with improved styling
     */
    private createInterfaceNode(
        nodeId: number, 
        iface: ComponentInterface, 
        componentId: string, 
        x: number, 
        y: number,
        width: number,
        height: number
    ): Node {
        return {
            id: `wit-interface-${nodeId}`,
            type: 'wit-interface',
            element_type: 'wit-interface',
            label: iface.name,
            bounds: {
                x,
                y,
                width,
                height
            },
            properties: {
                componentId,
                interfaceType: iface.type,
                functionCount: iface.functions?.length || 0,
                typeCount: iface.types?.length || 0,
                functions: iface.functions || [],
                types: iface.types || []
            }
        };
    }

    /**
     * Create function nodes with improved layout
     */
    private createFunctionNodes(
        iface: ComponentInterface, 
        interfaceNode: Node, 
        nodeIdCounter: number, 
        edgeIdCounter: number,
        baseX: number,
        baseY: number,
        width: number,
        height: number,
        verticalSpacing: number
    ): { nodes: Node[], edges: Edge[] } {
        const nodes: Node[] = [];
        const edges: Edge[] = [];
        
        iface.functions?.forEach((func, funcIndex) => {
            const functionY = baseY + (funcIndex * verticalSpacing);
            
            const functionNode: Node = {
                id: `wit-function-${nodeIdCounter + funcIndex}`,
                type: 'wit-function',
                element_type: 'wit-function',
                label: func.name,
                bounds: {
                    x: baseX,
                    y: functionY,
                    width,
                    height
                },
                properties: {
                    interfaceId: interfaceNode.id,
                    parameters: func.parameters || [],
                    returnType: func.returnType || 'void',
                    parameterCount: func.parameters?.length || 0
                }
            };
            nodes.push(functionNode);

            // Create edge from interface to function
            const functionEdge: Edge = {
                id: `wit-contains-func-${edgeIdCounter + funcIndex}`,
                type: 'wit-contains',
                element_type: 'wit-contains',
                sourceId: interfaceNode.id,
                targetId: functionNode.id,
                label: 'contains'
            };
            edges.push(functionEdge);
        });
        
        return { nodes, edges };
    }

    /**
     * Create type nodes for interface types
     */
    private createTypeNodes(
        iface: ComponentInterface,
        interfaceNode: Node,
        nodeIdCounter: number,
        edgeIdCounter: number,
        baseX: number,
        baseY: number,
        width: number,
        height: number,
        verticalSpacing: number
    ): { nodes: Node[], edges: Edge[] } {
        const nodes: Node[] = [];
        const edges: Edge[] = [];
        
        iface.types?.forEach((type, typeIndex) => {
            const typeY = baseY + (typeIndex * verticalSpacing);
            
            const typeNode: Node = {
                id: `wit-type-${nodeIdCounter + typeIndex}`,
                type: 'wit-type',
                element_type: 'wit-type',
                label: type.name,
                bounds: {
                    x: baseX,
                    y: typeY,
                    width,
                    height
                },
                properties: {
                    interfaceId: interfaceNode.id,
                    typeKind: type.kind,
                    fields: type.fields || [],
                    fieldCount: type.fields?.length || 0
                }
            };
            nodes.push(typeNode);

            // Create edge from interface to type
            const typeEdge: Edge = {
                id: `wit-contains-type-${edgeIdCounter + typeIndex}`,
                type: 'wit-contains',
                element_type: 'wit-contains',
                sourceId: interfaceNode.id,
                targetId: typeNode.id,
                label: 'defines'
            };
            edges.push(typeEdge);
        });
        
        return { nodes, edges };
    }

    /**
     * Transform to dependency view
     */
    private transformToDependencyView(diagram: DiagramModel): ViewTransformationResult {
        const elements = Object.values(diagram.elements);
        const wasmComponents = this.extractWasmComponents(elements);
        const dependencyElements: ModelElement[] = [];

        let nodeIdCounter = 1;
        let edgeIdCounter = 1;

        // Create interface nodes grouped by name (to show dependencies)
        const interfaceMap = new Map<string, { exporters: string[], importers: string[] }>();

        // Analyze interfaces to find dependencies
        wasmComponents.forEach(component => {
            component.interfaces.forEach(iface => {
                if (!interfaceMap.has(iface.name)) {
                    interfaceMap.set(iface.name, { exporters: [], importers: [] });
                }
                const entry = interfaceMap.get(iface.name)!;
                
                if (iface.type === 'export') {
                    entry.exporters.push(component.name);
                } else {
                    entry.importers.push(component.name);
                }
            });
        });

        // Create nodes for interfaces that have both exporters and importers (dependencies)
        let yOffset = 150;
        interfaceMap.forEach((deps, interfaceName) => {
            if (deps.exporters.length > 0 && deps.importers.length > 0) {
                // Create interface node
                const interfaceNode: Node = {
                    id: `dep-interface-${nodeIdCounter++}`,
                    type: 'wit-interface',
                    element_type: 'wit-interface',
                    label: interfaceName,
                    bounds: {
                        x: 400,
                        y: yOffset,
                        width: 200,
                        height: 80
                    },
                    properties: {
                        exporters: deps.exporters,
                        importers: deps.importers,
                        isDependencyInterface: true
                    }
                };
                dependencyElements.push(interfaceNode);

                // Create exporter nodes
                deps.exporters.forEach((exporter, index) => {
                    const exporterNode: Node = {
                        id: `dep-exporter-${nodeIdCounter++}`,
                        type: 'wasm-component',
                        element_type: 'wasm-component',
                        label: exporter,
                        bounds: {
                            x: 100,
                            y: yOffset + (index * 100),
                            width: 150,
                            height: 60
                        },
                        properties: {
                            role: 'exporter',
                            interfaceName: interfaceName
                        }
                    };
                    dependencyElements.push(exporterNode);

                    // Create export edge
                    const exportEdge: Edge = {
                        id: `dep-export-${edgeIdCounter++}`,
                        type: 'wit-export',
                        element_type: 'wit-export',
                        sourceId: exporterNode.id,
                        targetId: interfaceNode.id,
                        label: 'exports'
                    };
                    dependencyElements.push(exportEdge);
                });

                // Create importer nodes
                deps.importers.forEach((importer, index) => {
                    const importerNode: Node = {
                        id: `dep-importer-${nodeIdCounter++}`,
                        type: 'wasm-component',
                        element_type: 'wasm-component',
                        label: importer,
                        bounds: {
                            x: 700,
                            y: yOffset + (index * 100),
                            width: 150,
                            height: 60
                        },
                        properties: {
                            role: 'importer',
                            interfaceName: interfaceName
                        }
                    };
                    dependencyElements.push(importerNode);

                    // Create import edge
                    const importEdge: Edge = {
                        id: `dep-import-${edgeIdCounter++}`,
                        type: 'wit-import',
                        element_type: 'wit-import',
                        sourceId: interfaceNode.id,
                        targetId: importerNode.id,
                        label: 'imported by'
                    };
                    dependencyElements.push(importEdge);
                });

                yOffset += Math.max(deps.exporters.length, deps.importers.length) * 100 + 150;
            }
        });

        return {
            success: true,
            transformedElements: dependencyElements,
            additionalData: {
                viewMode: 'wit-dependencies',
                renderingHints: {
                    showDependencies: true,
                    showExporters: true,
                    showImporters: true,
                    groupByInterface: true
                }
            }
        };
    }

    /**
     * Extract WASM component data from diagram elements
     */
    private extractWasmComponents(elements: ModelElement[]): WasmComponentData[] {
        const components: WasmComponentData[] = [];

        elements.forEach(element => {
            const elementType = element.type || element.element_type;
            
            if (elementType === 'wasm-component') {
                const node = element as Node;
                const component: WasmComponentData = {
                    id: node.id,
                    name: node.label || `Component ${node.id}`,
                    interfaces: this.extractComponentInterfaces(node),
                    position: { 
                        x: node.bounds?.x || 0, 
                        y: node.bounds?.y || 0 
                    },
                    properties: node.properties || {}
                };
                components.push(component);
            }
        });

        return components;
    }

    /**
     * Extract interface information from a WASM component node
     */
    private extractComponentInterfaces(component: Node): ComponentInterface[] {
        const interfaces: ComponentInterface[] = [];
        
        
        // Check for various possible interface property names
        const interfaceData = component.properties?.interfaces || 
                            component.properties?.imports || 
                            component.properties?.exports ||
                            component.properties?.wit_interfaces;
        
        // Also check for specific import/export arrays
        if (component.properties?.importInterfaces || component.properties?.exportInterfaces) {
            // Handle separate import/export arrays
            if (component.properties.importInterfaces) {
                const imports = Array.isArray(component.properties.importInterfaces) 
                    ? component.properties.importInterfaces 
                    : [];
                imports.forEach((iface: any) => {
                    interfaces.push({
                        name: typeof iface === 'string' ? iface : iface.name || 'unknown',
                        type: 'import',
                        functions: []
                    });
                });
            }
            if (component.properties.exportInterfaces) {
                const exports = Array.isArray(component.properties.exportInterfaces) 
                    ? component.properties.exportInterfaces 
                    : [];
                exports.forEach((iface: any) => {
                    interfaces.push({
                        name: typeof iface === 'string' ? iface : iface.name || 'unknown',
                        type: 'export',  
                        functions: []
                    });
                });
            }
            return interfaces;
        }
        
        // Try to extract interfaces from component properties
        if (interfaceData) {
            if (Array.isArray(interfaceData)) {
                // Map the actual interface structure to our expected format
                return interfaceData.map((iface: any) => ({
                    name: iface.name,
                    type: iface.interface_type === 'export' ? 'export' : 'import',
                    functions: iface.functions?.map((func: any) => ({
                        name: func.name,
                        parameters: func.params?.map((p: any) => ({
                            name: p.name,
                            type: p.param_type
                        })) || [],
                        returnType: func.returns?.[0]?.param_type || 'void'
                    })) || [],
                    types: iface.types || []
                }));
            } else if (typeof interfaceData === 'number') {
                // If interfaces is a count, create mock interfaces
                const count = interfaceData;
                for (let i = 0; i < count; i++) {
                    interfaces.push({
                        name: `interface-${i + 1}`,
                        type: i % 2 === 0 ? 'import' : 'export',
                        functions: [
                            {
                                name: `function-${i + 1}`,
                                parameters: [{ name: 'input', type: 'string' }],
                                returnType: 'string'
                            }
                        ]
                    });
                }
            }
        }

        // If no interfaces found, create default ones
        if (interfaces.length === 0) {
            interfaces.push(
                {
                    name: 'main-interface',
                    type: 'export',
                    functions: [
                        {
                            name: 'process',
                            parameters: [{ name: 'data', type: 'bytes' }],
                            returnType: 'result'
                        }
                    ]
                },
                {
                    name: 'config-interface',
                    type: 'import',
                    functions: [
                        {
                            name: 'get-config',
                            parameters: [],
                            returnType: 'config'
                        }
                    ]
                }
            );
        }

        return interfaces;
    }

    /**
     * Check if an element is a WIT element type
     */
    private isWitElement(element: ModelElement): boolean {
        const elementType = element.type || element.element_type;
        return elementType?.startsWith('wit-') || false;
    }

    /**
     * Convert WIT element back to WASM component equivalent
     */
    private convertWitToWasmElement(element: ModelElement): ModelElement {
        const elementType = element.type || element.element_type;
        
        if (elementType === 'wit-package') {
            // Convert package back to WASM component
            return {
                ...element,
                type: 'wasm-component',
                element_type: 'wasm-component'
            };
        }
        
        // For other WIT elements, keep as-is or remove them in component view
        return element;
    }
}