/**
 * Interaction modes for the diagram editor
 */

export interface InterfaceLinkInfo {
  componentId: string;
  interfaceName: string;
  interfaceType: "import" | "export";
  interfaceObject: import("../diagrams/interface-compatibility.js").WitInterface; // WIT interface details
  position: { x: number; y: number }; // Visual position for UI feedback
}

export enum InteractionMode {
  Select = "select",
  CreateNode = "create-node",
  CreateEdge = "create-edge",
  CreateInterfaceLink = "create-interface-link",
  Pan = "pan",
}

export interface NodeTypeConfig {
  type: string;
  label: string;
  icon?: string;
  defaultSize?: { width: number; height: number };
}

export interface EdgeTypeConfig {
  type: string;
  label: string;
  style?: "solid" | "dashed" | "dotted";
  color?: string;
}

export const DEFAULT_NODE_TYPES: NodeTypeConfig[] = [
  { type: "task", label: "Task", defaultSize: { width: 100, height: 50 } },
  {
    type: "start-event",
    label: "Start Event",
    defaultSize: { width: 40, height: 40 },
  },
  {
    type: "end-event",
    label: "End Event",
    defaultSize: { width: 40, height: 40 },
  },
  { type: "gateway", label: "Gateway", defaultSize: { width: 50, height: 50 } },
  {
    type: "decision",
    label: "Decision",
    defaultSize: { width: 100, height: 50 },
  },
  {
    type: "subprocess",
    label: "Subprocess",
    defaultSize: { width: 120, height: 80 },
  },
];

export const DEFAULT_EDGE_TYPES: EdgeTypeConfig[] = [
  { type: "flow", label: "Flow", style: "solid" },
  { type: "association", label: "Association", style: "dashed" },
  { type: "dependency", label: "Dependency", style: "dotted" },
];

export class InteractionModeManager {
  private currentMode: InteractionMode = InteractionMode.Select;
  private selectedNodeType: string = "task";
  private selectedEdgeType: string = "flow";
  private modeChangeHandlers: ((mode: InteractionMode) => void)[] = [];
  private sourceInterface?: InterfaceLinkInfo;

  constructor() {}

  getMode(): InteractionMode {
    return this.currentMode;
  }

  setMode(mode: InteractionMode): void {
    if (this.currentMode !== mode) {
      this.currentMode = mode;
      this.notifyModeChange();
    }
  }

  getSelectedNodeType(): string {
    return this.selectedNodeType;
  }

  setSelectedNodeType(type: string): void {
    this.selectedNodeType = type;
    this.setMode(InteractionMode.CreateNode);
  }

  getSelectedEdgeType(): string {
    return this.selectedEdgeType;
  }

  setSelectedEdgeType(type: string): void {
    this.selectedEdgeType = type;
    this.setMode(InteractionMode.CreateEdge);
  }

  // Interface linking methods
  startInterfaceLinking(): void {
    this.sourceInterface = undefined;
    this.setMode(InteractionMode.CreateInterfaceLink);
  }

  setSourceInterface(interfaceInfo: InterfaceLinkInfo): void {
    this.sourceInterface = interfaceInfo;
  }

  getSourceInterface(): InterfaceLinkInfo | undefined {
    return this.sourceInterface;
  }

  clearInterfaceLinking(): void {
    this.sourceInterface = undefined;
    this.setMode(InteractionMode.Select);
  }

  onModeChange(handler: (mode: InteractionMode) => void): void {
    this.modeChangeHandlers.push(handler);
  }

  private notifyModeChange(): void {
    this.modeChangeHandlers.forEach((handler) => handler(this.currentMode));
  }
}
