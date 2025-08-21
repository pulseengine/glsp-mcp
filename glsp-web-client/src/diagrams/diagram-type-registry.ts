/**
 * Diagram Type Registry
 * Central registry for different diagram types and their configurations
 */

import {
  NodeTypeConfig,
  EdgeTypeConfig,
  DEFAULT_NODE_TYPES,
  DEFAULT_EDGE_TYPES,
} from "../interaction/interaction-mode.js";
import { WASM_NODE_TYPES, WASM_EDGE_TYPES } from "./wasm-component-types.js";
import { WIT_NODE_TYPES, WIT_EDGE_TYPES } from "./wit-interface-types.js";

export interface DiagramTypeConfig {
  type: string;
  label: string;
  description: string;
  nodeTypes: NodeTypeConfig[];
  edgeTypes: EdgeTypeConfig[];
  icon?: string;
  defaultLayout?: string;
  customRenderer?: string; // Optional custom renderer class name
}

export interface DiagramTypeRegistry {
  getAvailableTypes(): DiagramTypeConfig[];
  getTypeConfig(type: string): DiagramTypeConfig | undefined;
  getNodeTypes(diagramType: string): NodeTypeConfig[];
  getEdgeTypes(diagramType: string): EdgeTypeConfig[];
  registerType(config: DiagramTypeConfig): void;
}

class DiagramTypeRegistryImpl implements DiagramTypeRegistry {
  private types = new Map<string, DiagramTypeConfig>();

  constructor() {
    // Register built-in diagram types
    this.registerBuiltInTypes();
  }

  private registerBuiltInTypes(): void {
    // Workflow/BPMN diagrams
    this.registerType({
      type: "workflow",
      label: "Workflow Diagram",
      description: "Business process workflow with tasks, gateways, and events",
      nodeTypes: DEFAULT_NODE_TYPES,
      edgeTypes: DEFAULT_EDGE_TYPES,
      icon: "🔄",
      defaultLayout: "hierarchical",
    });

    this.registerType({
      type: "bpmn",
      label: "BPMN Diagram",
      description: "Business Process Model and Notation standard diagrams",
      nodeTypes: DEFAULT_NODE_TYPES,
      edgeTypes: DEFAULT_EDGE_TYPES,
      icon: "📊",
      defaultLayout: "hierarchical",
    });

    // UML diagrams
    this.registerType({
      type: "uml-class",
      label: "UML Class Diagram",
      description: "Object-oriented class relationships and structure",
      nodeTypes: [
        {
          type: "class",
          label: "Class",
          defaultSize: { width: 120, height: 80 },
        },
        {
          type: "interface",
          label: "Interface",
          defaultSize: { width: 120, height: 60 },
        },
        {
          type: "enum",
          label: "Enum",
          defaultSize: { width: 100, height: 60 },
        },
        {
          type: "package",
          label: "Package",
          defaultSize: { width: 150, height: 100 },
        },
      ],
      edgeTypes: [
        { type: "inheritance", label: "Inheritance", style: "solid" },
        { type: "composition", label: "Composition", style: "solid" },
        { type: "aggregation", label: "Aggregation", style: "dashed" },
        { type: "association", label: "Association", style: "solid" },
      ],
      icon: "🏗️",
      defaultLayout: "hierarchical",
    });

    // WebAssembly Component diagrams
    this.registerType({
      type: "wasm-component",
      label: "WASM Component Diagram",
      description:
        "WebAssembly component composition with interfaces and connections",
      nodeTypes: WASM_NODE_TYPES,
      edgeTypes: WASM_EDGE_TYPES,
      icon: "📦",
      defaultLayout: "grid",
      customRenderer: "WasmComponentRenderer",
    });

    // System architecture diagrams
    this.registerType({
      type: "system-architecture",
      label: "System Architecture",
      description: "High-level system components and their relationships",
      nodeTypes: [
        {
          type: "service",
          label: "Service",
          defaultSize: { width: 120, height: 80 },
        },
        {
          type: "database",
          label: "Database",
          defaultSize: { width: 100, height: 60 },
        },
        {
          type: "queue",
          label: "Message Queue",
          defaultSize: { width: 100, height: 60 },
        },
        {
          type: "cache",
          label: "Cache",
          defaultSize: { width: 80, height: 60 },
        },
        {
          type: "load-balancer",
          label: "Load Balancer",
          defaultSize: { width: 120, height: 60 },
        },
        {
          type: "api-gateway",
          label: "API Gateway",
          defaultSize: { width: 120, height: 60 },
        },
      ],
      edgeTypes: [
        { type: "http-api", label: "HTTP API", style: "solid" },
        { type: "async-message", label: "Async Message", style: "dashed" },
        { type: "data-flow", label: "Data Flow", style: "dotted" },
      ],
      icon: "🏭",
      defaultLayout: "hierarchical",
    });

    // WebAssembly Interface Types (WIT) diagrams
    this.registerType({
      type: "wit-interface",
      label: "WIT Interface Diagram",
      description:
        "WebAssembly Interface Types structure and dependencies visualization",
      nodeTypes: WIT_NODE_TYPES,
      edgeTypes: WIT_EDGE_TYPES,
      icon: "🔷",
      defaultLayout: "hierarchical",
      customRenderer: "WitInterfaceRenderer",
    });
  }

  getAvailableTypes(): DiagramTypeConfig[] {
    return Array.from(this.types.values());
  }

  getTypeConfig(type: string): DiagramTypeConfig | undefined {
    return this.types.get(type);
  }

  getNodeTypes(diagramType: string): NodeTypeConfig[] {
    const config = this.types.get(diagramType);
    console.log(
      `Getting node types for ${diagramType}:`,
      config?.nodeTypes?.map((n) => n.label) || "Using DEFAULT_NODE_TYPES",
    );
    return config ? config.nodeTypes : DEFAULT_NODE_TYPES;
  }

  getEdgeTypes(diagramType: string): EdgeTypeConfig[] {
    const config = this.types.get(diagramType);
    console.log(
      `Getting edge types for ${diagramType}:`,
      config?.edgeTypes?.map((e) => e.label) || "Using DEFAULT_EDGE_TYPES",
    );
    return config ? config.edgeTypes : DEFAULT_EDGE_TYPES;
  }

  registerType(config: DiagramTypeConfig): void {
    this.types.set(config.type, config);
  }
}

// Global registry instance
export const diagramTypeRegistry: DiagramTypeRegistry =
  new DiagramTypeRegistryImpl();

// Convenience functions
export function getAvailableDiagramTypes(): DiagramTypeConfig[] {
  return diagramTypeRegistry.getAvailableTypes();
}

export function getDiagramTypeConfig(
  type: string,
): DiagramTypeConfig | undefined {
  return diagramTypeRegistry.getTypeConfig(type);
}

export function getNodeTypesForDiagram(diagramType: string): NodeTypeConfig[] {
  return diagramTypeRegistry.getNodeTypes(diagramType);
}

export function getEdgeTypesForDiagram(diagramType: string): EdgeTypeConfig[] {
  return diagramTypeRegistry.getEdgeTypes(diagramType);
}
