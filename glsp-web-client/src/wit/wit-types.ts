/**
 * Core WIT (WebAssembly Interface Types) type definitions
 */

export interface WitElement {
  id: string;
  type: WitElementType;
  name: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  metadata?: Record<string, any>;
}

export enum WitElementType {
  Package = "package",
  World = "world",
  Interface = "interface",
  Function = "function",
  Type = "type",
  Resource = "resource",
  Import = "import",
  Export = "export",
  Record = "record",
  Variant = "variant",
  Enum = "enum",
  Flags = "flags",
  Primitive = "primitive",
  List = "list",
  Tuple = "tuple",
  Option = "option",
  Result = "result",
}

export interface WitConnection {
  id: string;
  source: string;
  target: string;
  type: WitConnectionType;
  label?: string;
}

export enum WitConnectionType {
  Import = "import",
  Export = "export",
  Uses = "uses",
  Implements = "implements",
  Contains = "contains",
  TypeReference = "type-ref",
  Dependency = "dependency",
}

export interface WitDiagram {
  id: string;
  name: string;
  componentName: string;
  elements: WitElement[];
  connections: WitConnection[];
  layout?: WitLayoutType;
  viewConfig?: WitViewConfig;
}

export enum WitLayoutType {
  Hierarchical = "hierarchical",
  Force = "force",
  Grid = "grid",
  Circular = "circular",
}

export interface WitViewConfig {
  showPackages: boolean;
  showWorlds: boolean;
  showInterfaces: boolean;
  showTypes: boolean;
  showFunctions: boolean;
  showResources: boolean;
  expandLevel: number; // 0 = collapsed, 1 = packages, 2 = worlds, 3 = interfaces, etc.
  filterPattern?: string;
  highlightImports: boolean;
  highlightExports: boolean;
}
