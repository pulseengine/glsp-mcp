/**
 * Unified WASM Component Types
 * Centralized type definitions for WebAssembly components
 */

// Base interface function definition
export interface InterfaceFunction {
    name: string;
    parameters?: unknown[];
    return_type?: string;
}

// Unified interface definition that resolves ComponentInterface/WasmInterface conflicts
export interface WasmInterface {
    name: string;
    interface_type: 'import' | 'export';
    type?: 'import' | 'export'; // Legacy compatibility
    direction?: 'import' | 'export'; // Legacy compatibility
    functions?: InterfaceFunction[];
}

// ComponentInterface now extends WasmInterface for full compatibility
export interface ComponentInterface extends WasmInterface {
    // Inherits all WasmInterface properties
}

// Color scheme for component rendering
export interface ComponentColors {
    component: string;
    host: string;
    import: string;
    export: string;
    selected: string;
    text: string;
    border: string;
    missing: string;
    background?: string;
    accent?: string;
}

export interface SecurityAnalysis {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    issues: string[];
    scanDate: string;
}

export interface WasmComponent {
    id: string;
    name: string;
    path: string;
    description: string;
    status: string;
    category?: string;
    interfaces: WasmInterface[];
    dependencies: string[];
    metadata: Record<string, unknown>;
    fileExists?: boolean;
    lastSeen?: string;
    removedAt?: string;
    witInterfaces?: string;
    securityAnalysis?: SecurityAnalysis;
    lastSecurityScan?: string;
    exports?: unknown[];
    imports?: unknown[];
    type?: string;
    isLoaded?: boolean; // For load/unload functionality
    componentPath?: string; // Legacy compatibility
    componentName?: string; // Legacy compatibility
}

export interface WasmComponentInfo {
    id: string;
    name: string;
    description: string;
    category: string;
    interfaces: WasmInterface[];
    status: string;
}

export interface WasmComponentData {
    id: string;
    name: string;
    description: string;
    interfaces: WasmInterface[];
    position: { x: number; y: number };
    size: { width: number; height: number };
}