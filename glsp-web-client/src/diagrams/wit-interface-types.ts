/**
 * WIT Interface Diagram Types
 * Node and edge type definitions for WebAssembly Interface Types visualization
 */

import {
  NodeTypeConfig,
  EdgeTypeConfig,
} from "../interaction/interaction-mode.js";

/**
 * Node types for WIT interface diagrams
 */
export const WIT_NODE_TYPES: NodeTypeConfig[] = [
  // Package level
  {
    type: "wit-package",
    label: "📦 Package",
    defaultSize: { width: 200, height: 60 },
  },

  // World level
  {
    type: "wit-world",
    label: "🌐 World",
    defaultSize: { width: 180, height: 50 },
  },

  // Interface level
  {
    type: "wit-interface",
    label: "🔷 Interface",
    defaultSize: { width: 160, height: 120 },
  },

  // Type definitions
  {
    type: "wit-type-record",
    label: "📐 Record Type",
    defaultSize: { width: 140, height: 100 },
  },
  {
    type: "wit-type-variant",
    label: "📐 Variant Type",
    defaultSize: { width: 140, height: 100 },
  },
  {
    type: "wit-type-enum",
    label: "📐 Enum Type",
    defaultSize: { width: 120, height: 80 },
  },
  {
    type: "wit-type-flags",
    label: "📐 Flags Type",
    defaultSize: { width: 120, height: 80 },
  },
  {
    type: "wit-type-resource",
    label: "🔗 Resource",
    defaultSize: { width: 140, height: 100 },
  },

  // Function level
  {
    type: "wit-function",
    label: "🔧 Function",
    defaultSize: { width: 160, height: 60 },
  },

  // Import/Export containers
  {
    type: "wit-imports",
    label: "📥 Imports",
    defaultSize: { width: 180, height: 150 },
  },
  {
    type: "wit-exports",
    label: "📤 Exports",
    defaultSize: { width: 180, height: 150 },
  },
];

/**
 * Edge types for WIT interface diagrams
 */
export const WIT_EDGE_TYPES: EdgeTypeConfig[] = [
  {
    type: "wit-import",
    label: "Imports",
    style: "dashed",
    color: "#3B82F6", // Blue
  },
  {
    type: "wit-export",
    label: "Exports",
    style: "solid",
    color: "#10B981", // Green
  },
  {
    type: "wit-uses",
    label: "Uses",
    style: "dotted",
    color: "#8B5CF6", // Purple
  },
  {
    type: "wit-implements",
    label: "Implements",
    style: "solid",
    color: "#F59E0B", // Amber
  },
  {
    type: "wit-dependency",
    label: "Depends On",
    style: "dashed",
    color: "#6B7280", // Gray
  },
  {
    type: "wit-contains",
    label: "Contains",
    style: "solid",
    color: "#374151", // Dark gray
  },
  {
    type: "wit-type-ref",
    label: "Type Reference",
    style: "dotted",
    color: "#EC4899", // Pink
  },
];

/**
 * Layout hints for WIT diagrams
 */
export const WIT_LAYOUT_CONFIG = {
  // Hierarchical layout for package/world/interface structure
  hierarchical: {
    direction: "TB", // Top to bottom
    levelSeparation: 100,
    nodeSeparation: 80,
    edgeMinimization: true,
    parentCentralization: true,
  },

  // Force-directed for dependency graphs
  force: {
    nodeRepulsion: 2000,
    linkDistance: 150,
    linkStrength: 0.5,
    gravity: 0.1,
    theta: 0.8,
  },

  // Grid layout for type catalogs
  grid: {
    columns: 4,
    rowHeight: 150,
    columnWidth: 200,
    padding: 20,
  },
};

/**
 * Visual style configuration for WIT elements
 */
export const WIT_VISUAL_STYLES = {
  package: {
    backgroundColor: "#1E293B",
    borderColor: "#334155",
    borderWidth: 2,
    borderRadius: 12,
    textColor: "#F1F5F9",
    fontSize: 16,
    fontWeight: "bold",
  },
  world: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
    borderWidth: 2,
    borderRadius: 10,
    textColor: "#E5E7EB",
    fontSize: 14,
    fontWeight: "semibold",
  },
  interface: {
    backgroundColor: "#312E81",
    borderColor: "#4C1D95",
    borderWidth: 2,
    borderRadius: 8,
    textColor: "#EDE9FE",
    fontSize: 13,
    fontWeight: "medium",
  },
  type: {
    backgroundColor: "#1E3A8A",
    borderColor: "#2563EB",
    borderWidth: 1,
    borderRadius: 6,
    textColor: "#DBEAFE",
    fontSize: 12,
    fontWeight: "normal",
  },
  function: {
    backgroundColor: "#065F46",
    borderColor: "#059669",
    borderWidth: 1,
    borderRadius: 6,
    textColor: "#D1FAE5",
    fontSize: 12,
    fontWeight: "normal",
  },
  resource: {
    backgroundColor: "#7C2D12",
    borderColor: "#EA580C",
    borderWidth: 1,
    borderRadius: 6,
    textColor: "#FED7AA",
    fontSize: 12,
    fontWeight: "normal",
  },
};

/**
 * Icon mapping for WIT elements
 */
export const WIT_ICONS = {
  package: "📦",
  world: "🌐",
  interface: "🔷",
  record: "📋",
  variant: "🔀",
  enum: "📑",
  flags: "🚩",
  resource: "🔗",
  function: "🔧",
  import: "📥",
  export: "📤",
  primitive: "🔢",
  list: "📚",
  tuple: "🎯",
  option: "❓",
  result: "✅",
};
