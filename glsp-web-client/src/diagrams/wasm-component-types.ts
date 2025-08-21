/**
 * WebAssembly Component Diagram Types
 * Defines types for WASM component composition diagrams
 */

import {
  NodeTypeConfig,
  EdgeTypeConfig,
} from "../interaction/interaction-mode.js";

export interface WasmInterface {
  name: string;
  type: "import" | "export";
  interfaceType: string; // e.g., "wasi:http/handler", "custom:math/calculator"
  functions?: WasmFunction[];
}

export interface WasmFunction {
  name: string;
  params: WasmParam[];
  returns: WasmParam[];
}

export interface WasmParam {
  name: string;
  type: string; // WIT type like "string", "u32", "list<u8>"
}

export interface WasmComponentConfig {
  name: string;
  path?: string; // File path to .wasm component
  description?: string;
  interfaces: WasmInterface[];
  dependencies?: string[]; // Other component names
}

export interface WasmComposition {
  name: string;
  description?: string;
  components: WasmComponentConfig[];
  connections: WasmConnection[];
  hostInterfaces: WasmInterface[]; // Interfaces provided by host
}

export interface WasmConnection {
  sourceComponent: string;
  sourceInterface: string;
  targetComponent: string;
  targetInterface: string;
}

// Node types for WASM component diagrams
export const WASM_NODE_TYPES: NodeTypeConfig[] = [
  {
    type: "wasm-component",
    label: "WASM Component",
    defaultSize: { width: 160, height: 100 },
    icon: "📦",
  },
  {
    type: "host-component",
    label: "Host Component",
    defaultSize: { width: 140, height: 80 },
    icon: "🖥️",
  },
  {
    type: "import-interface",
    label: "Import Interface",
    defaultSize: { width: 20, height: 20 },
    icon: "🔵",
  },
  {
    type: "export-interface",
    label: "Export Interface",
    defaultSize: { width: 20, height: 20 },
    icon: "🟢",
  },
  {
    type: "composition-root",
    label: "Composition",
    defaultSize: { width: 200, height: 60 },
    icon: "🏗️",
  },
];

// Edge types for WASM component connections
export const WASM_EDGE_TYPES: EdgeTypeConfig[] = [
  {
    type: "interface-connection",
    label: "Interface Connection",
    style: "solid",
  },
  {
    type: "dependency",
    label: "Dependency",
    style: "dashed",
  },
  {
    type: "composition-contains",
    label: "Contains",
    style: "dotted",
  },
];

// Sample WASM component configurations
export const SAMPLE_WASM_COMPONENTS: WasmComponentConfig[] = [
  {
    name: "http-handler",
    description: "HTTP request handler component",
    interfaces: [
      {
        name: "wasi:http/handler",
        type: "export",
        interfaceType: "wasi:http/handler",
        functions: [
          {
            name: "handle",
            params: [{ name: "request", type: "request" }],
            returns: [{ name: "response", type: "response" }],
          },
        ],
      },
      {
        name: "wasi:filesystem/preopens",
        type: "import",
        interfaceType: "wasi:filesystem/preopens",
      },
    ],
  },
  {
    name: "database-client",
    description: "Database client component",
    interfaces: [
      {
        name: "custom:db/client",
        type: "export",
        interfaceType: "custom:db/client",
        functions: [
          {
            name: "query",
            params: [{ name: "sql", type: "string" }],
            returns: [{ name: "results", type: "list<record>" }],
          },
        ],
      },
      {
        name: "wasi:sockets/tcp",
        type: "import",
        interfaceType: "wasi:sockets/tcp",
      },
    ],
  },
  {
    name: "auth-service",
    description: "Authentication service component",
    interfaces: [
      {
        name: "custom:auth/service",
        type: "export",
        interfaceType: "custom:auth/service",
        functions: [
          {
            name: "authenticate",
            params: [{ name: "token", type: "string" }],
            returns: [{ name: "user", type: "option<user>" }],
          },
        ],
      },
      {
        name: "custom:crypto/hash",
        type: "import",
        interfaceType: "custom:crypto/hash",
      },
    ],
  },
];

// Host interfaces that can be provided by the runtime
export const HOST_INTERFACES: WasmInterface[] = [
  {
    name: "wasi:filesystem/preopens",
    type: "export",
    interfaceType: "wasi:filesystem/preopens",
  },
  {
    name: "wasi:sockets/tcp",
    type: "export",
    interfaceType: "wasi:sockets/tcp",
  },
  {
    name: "wasi:http/outgoing-handler",
    type: "export",
    interfaceType: "wasi:http/outgoing-handler",
  },
  {
    name: "wasi:clocks/wall-clock",
    type: "export",
    interfaceType: "wasi:clocks/wall-clock",
  },
];
