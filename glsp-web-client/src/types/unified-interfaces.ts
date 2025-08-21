/**
 * Unified Interface Definitions
 * Bridges WASM components and WIT interface systems
 */

import {
  WasmInterface,
  ComponentInterface,
  ComponentColors,
} from "./wasm-component.js";
import { WitElement, WitConnection } from "../wit/wit-types.js";

// Extended interface that bridges WASM and WIT systems
export interface UnifiedInterface extends WasmInterface {
  // WIT-specific properties
  witElement?: WitElement;
  connections?: WitConnection[];

  // Extended metadata
  description?: string;
  documentation?: string;
  packageName?: string;
  version?: string;
}

// Rendering context for unified interfaces
export interface UnifiedRenderingContext {
  ctx: CanvasRenderingContext2D;
  scale: number;
  isSelected: boolean;
  isHovered: boolean;
  isMissing?: boolean;
  colors: ComponentColors;
  showWitDetails?: boolean;
  renderMode: "component" | "wit-interface" | "wit-dependency";
}

// Interface mapping utilities
export class InterfaceMapper {
  /**
   * Convert ComponentInterface to WasmInterface
   */
  static componentToWasm(component: ComponentInterface): WasmInterface {
    return {
      name: component.name,
      interface_type: component.interface_type,
      type: component.type || component.interface_type,
      direction: component.direction || component.interface_type,
      functions: component.functions,
    };
  }

  /**
   * Convert WasmInterface to ComponentInterface
   */
  static wasmToComponent(wasm: WasmInterface): ComponentInterface {
    return {
      name: wasm.name,
      interface_type: wasm.interface_type,
      type: wasm.type || wasm.interface_type,
      direction: wasm.direction || wasm.interface_type,
      functions: wasm.functions,
    };
  }

  /**
   * Create UnifiedInterface from WasmInterface
   */
  static createUnified(
    wasm: WasmInterface,
    witElement?: WitElement,
  ): UnifiedInterface {
    return {
      ...wasm,
      witElement,
      connections: [],
    };
  }
}

// Default color schemes
export const DEFAULT_COMPONENT_COLORS: ComponentColors = {
  component: "#e3f2fd",
  host: "#f3e5f5",
  import: "#2196f3",
  export: "#4caf50",
  selected: "#ff9800",
  text: "#333333",
  border: "#666666",
  missing: "#9e9e9e",
  background: "#ffffff",
  accent: "#1976d2",
};

export const DARK_COMPONENT_COLORS: ComponentColors = {
  component: "#1e3a8a",
  host: "#7c2d92",
  import: "#3b82f6",
  export: "#10b981",
  selected: "#f59e0b",
  text: "#e5e7eb",
  border: "#6b7280",
  missing: "#6b7280",
  background: "#1f2937",
  accent: "#3b82f6",
};
