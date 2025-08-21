/**
 * Environment detection utilities for identifying runtime context
 */

export interface RuntimeEnvironment {
  isDesktop: boolean;
  isWeb: boolean;
  isTauri: boolean;
  platform?: string;
}

export interface TauriAPI {
  invoke: (cmd: string, args?: any) => Promise<any>;
  dialog: {
    open: (options?: any) => Promise<string | null>;
    save: (options?: any) => Promise<string | null>;
  };
  fs: {
    readBinaryFile: (path: string) => Promise<ArrayBuffer>;
    writeBinaryFile: (path: string, data: ArrayBuffer) => Promise<void>;
    readTextFile: (path: string) => Promise<string>;
    writeTextFile: (path: string, data: string) => Promise<void>;
  };
  path: {
    appDataDir: () => Promise<string>;
    join: (...paths: string[]) => Promise<string>;
  };
}

declare global {
  interface Window {
    __TAURI__?: TauriAPI;
  }
  interface ImportMeta {
    env: Record<string, string>;
  }
}

/**
 * Detect the current runtime environment
 */
export function detectEnvironment(): RuntimeEnvironment {
  const isTauri = !!(window as any).__TAURI__;

  return {
    isDesktop: isTauri,
    isWeb: !isTauri,
    isTauri,
    platform: isTauri ? "desktop" : "web",
  };
}

/**
 * Get Tauri API if available
 */
export function getTauriAPI(): TauriAPI | null {
  return (window as any).__TAURI__ || null;
}

/**
 * Check if running in Tauri desktop environment
 */
export function isTauriApp(): boolean {
  return detectEnvironment().isTauri;
}

/**
 * Get appropriate base URL for API calls based on environment
 */
export function getApiBaseUrl(): string {
  const env = detectEnvironment();

  if (env.isTauri) {
    // In Tauri, always connect to local embedded server
    return "http://localhost:3000";
  } else {
    // In web, use environment variable or proxy
    return import.meta.env.VITE_API_URL || "/mcp";
  }
}

/**
 * Log environment information for debugging
 */
export function logEnvironmentInfo(): void {
  const env = detectEnvironment();
  console.log("Runtime Environment:", {
    ...env,
    userAgent: navigator.userAgent,
    apiBaseUrl: getApiBaseUrl(),
    hasFileSystemAccess: !!(window as any).showOpenFilePicker,
    hasTauriAPI: !!getTauriAPI(),
  });
}
