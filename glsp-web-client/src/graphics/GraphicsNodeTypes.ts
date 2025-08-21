/**
 * Graphics Node Types for Diagram Visualization
 * Defines visual component types that can be added to diagrams
 */

export interface GraphicsNodeType {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: "visualization" | "chart" | "animation" | "sensor";
  defaultSize: { width: number; height: number };
  properties: Record<string, any>;
  animation?: {
    enabled: boolean;
    type: "continuous" | "triggered" | "interactive";
    frameRate?: number;
    autoStart?: boolean;
  };
}

/**
 * Registry of available graphics node types
 */
export const GRAPHICS_NODE_TYPES: GraphicsNodeType[] = [
  {
    id: "sine-wave-visualizer",
    name: "Sine Wave",
    icon: "〰️",
    description: "Animated sine wave visualization",
    category: "animation",
    defaultSize: { width: 200, height: 120 },
    properties: {
      amplitude: 50,
      frequency: 0.02,
      speed: 0.05,
      color: "#4A9EFF",
      backgroundColor: "#0A0E1A",
    },
    animation: {
      enabled: true,
      type: "continuous",
      frameRate: 60,
      autoStart: true,
    },
  },
  {
    id: "particle-system",
    name: "Particle System",
    icon: "✨",
    description: "Real-time particle system animation",
    category: "animation",
    defaultSize: { width: 200, height: 150 },
    properties: {
      maxParticles: 100,
      emitRate: 2,
      particleColors: ["#4A9EFF", "#00D4AA", "#654FF0", "#F0B72F"],
      backgroundColor: "#0A0E1A",
    },
    animation: {
      enabled: true,
      type: "continuous",
      frameRate: 60,
      autoStart: true,
    },
  },
  {
    id: "radar-visualization",
    name: "Radar Display",
    icon: "📡",
    description: "Radar sensor data visualization",
    category: "sensor",
    defaultSize: { width: 180, height: 180 },
    properties: {
      range: 100,
      sweepSpeed: 0.02,
      detectionColor: "#00D4AA",
      backgroundColor: "#0A0E1A",
      showGrid: true,
    },
  },
  {
    id: "camera-view",
    name: "Camera Feed",
    icon: "📹",
    description: "Camera sensor visualization",
    category: "sensor",
    defaultSize: { width: 240, height: 180 },
    properties: {
      aspectRatio: "4:3",
      showOverlay: true,
      overlayColor: "#4A9EFF",
      backgroundColor: "#0A0E1A",
    },
  },
  {
    id: "lidar-point-cloud",
    name: "LiDAR Points",
    icon: "🌐",
    description: "LiDAR point cloud visualization",
    category: "sensor",
    defaultSize: { width: 200, height: 200 },
    properties: {
      pointSize: 2,
      pointColor: "#00D4AA",
      density: 500,
      rotationSpeed: 0.01,
      backgroundColor: "#0A0E1A",
    },
  },
  {
    id: "data-chart",
    name: "Data Chart",
    icon: "📊",
    description: "Dynamic data visualization chart",
    category: "chart",
    defaultSize: { width: 250, height: 150 },
    properties: {
      chartType: "line",
      dataPoints: 50,
      updateInterval: 100,
      primaryColor: "#4A9EFF",
      backgroundColor: "#0A0E1A",
    },
  },
  {
    id: "status-indicator",
    name: "Status LED",
    icon: "🔴",
    description: "Component status indicator",
    category: "visualization",
    defaultSize: { width: 80, height: 80 },
    properties: {
      states: ["active", "warning", "error", "offline"],
      colors: {
        active: "#00D4AA",
        warning: "#F0B72F",
        error: "#FF6B6B",
        offline: "#666666",
      },
      blinkOnChange: true,
    },
  },
  {
    id: "waveform-display",
    name: "Waveform",
    icon: "📈",
    description: "Signal waveform visualization",
    category: "visualization",
    defaultSize: { width: 220, height: 100 },
    properties: {
      sampleRate: 1000,
      bufferSize: 200,
      color: "#654FF0",
      backgroundColor: "#0A0E1A",
      showGrid: true,
    },
  },
];

/**
 * Get graphics node type by ID
 */
export function getGraphicsNodeType(id: string): GraphicsNodeType | undefined {
  return GRAPHICS_NODE_TYPES.find((type) => type.id === id);
}

/**
 * Get graphics node types by category
 */
export function getGraphicsNodeTypesByCategory(
  category: string,
): GraphicsNodeType[] {
  return GRAPHICS_NODE_TYPES.filter((type) => type.category === category);
}

/**
 * Create default properties for a graphics node
 */
export function createDefaultGraphicsNodeProperties(
  nodeType: GraphicsNodeType,
): Record<string, any> {
  return {
    isGraphicsNode: true,
    graphicsType: nodeType.id,
    graphicsProperties: { ...nodeType.properties },
    size: { ...nodeType.defaultSize },
    animated: ["animation", "sensor"].includes(nodeType.category),
    renderingEnabled: true,
    lastUpdate: Date.now(),
  };
}
