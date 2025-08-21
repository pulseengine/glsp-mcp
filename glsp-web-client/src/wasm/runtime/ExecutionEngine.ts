import { ComponentRegistry } from "./ComponentRegistry.js";

export interface ExecutionContext {
  componentId: string;
  method: string;
  args: unknown[];
  timeout?: number;
  onProgress?: (progress: ExecutionProgress) => void;
}

export interface ExecutionProgress {
  stage: "preparing" | "executing" | "processing" | "complete" | "error";
  progress: number; // 0-100
  message: string;
  error?: string;
}

export interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime: number;
  memoryUsage?: number;
}

export interface ComponentMethod {
  name: string;
  parameters: ComponentParameter[];
  returnType: string;
  description?: string;
}

export interface ComponentParameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: unknown;
}

export class ExecutionEngine {
  private registry: ComponentRegistry;
  private activeExecutions = new Map<string, AbortController>();
  private maxConcurrentExecutions = 5;
  private totalExecutions = 0;

  constructor(registry: ComponentRegistry) {
    this.registry = registry;
  }

  async executeComponent(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    const executionId = this.generateExecutionId();

    // Check concurrent execution limit
    if (this.activeExecutions.size >= this.maxConcurrentExecutions) {
      throw new Error(
        `Maximum concurrent executions (${this.maxConcurrentExecutions}) exceeded`,
      );
    }

    const abortController = new AbortController();
    this.activeExecutions.set(executionId, abortController);
    this.totalExecutions++;

    try {
      context.onProgress?.({
        stage: "preparing",
        progress: 0,
        message: "Loading component...",
      });

      // Load component if not already loaded
      const componentInstance = await this.registry.loadComponent(
        context.componentId,
      );
      if (!componentInstance) {
        throw new Error(`Failed to load component: ${context.componentId}`);
      }

      context.onProgress?.({
        stage: "executing",
        progress: 25,
        message: `Executing ${context.method}...`,
      });

      // Check if method exists
      if (typeof (componentInstance as any)[context.method] !== "function") {
        throw new Error(`Method '${context.method}' not found in component`);
      }

      // Setup timeout if specified
      const timeout = context.timeout || 30000; // 30 second default
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          abortController.abort();
          reject(new Error(`Execution timeout after ${timeout}ms`));
        }, timeout);
      });

      context.onProgress?.({
        stage: "processing",
        progress: 50,
        message: "Processing...",
      });

      // Execute the method
      const executionPromise = this.executeMethod(
        componentInstance,
        context.method,
        context.args,
      );
      const result = await Promise.race([executionPromise, timeoutPromise]);

      context.onProgress?.({
        stage: "complete",
        progress: 100,
        message: "Execution complete",
      });

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        result,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown execution error";

      context.onProgress?.({
        stage: "error",
        progress: 100,
        message: "Execution failed",
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime,
      };
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  private async executeMethod(
    instance: WebAssembly.Instance,
    methodName: string,
    args: unknown[],
  ): Promise<unknown> {
    try {
      const method = (instance.exports as Record<string, unknown>)[methodName];

      // Handle both sync and async methods
      if (typeof method === "function") {
        const result = (method as (...args: unknown[]) => unknown)(...args);

        // If result is a promise, await it
        if (result && typeof result === "object" && "then" in result) {
          return await (result as Promise<unknown>);
        }

        return result;
      } else {
        throw new Error(`Method ${methodName} is not a function`);
      }
    } catch (error) {
      console.error(`Error executing method ${methodName}:`, error);
      throw error;
    }
  }

  async getComponentMethods(componentId: string): Promise<ComponentMethod[]> {
    try {
      const componentInstance = await this.registry.loadComponent(componentId);
      if (!componentInstance) {
        return [];
      }

      const methods: ComponentMethod[] = [];
      const proto = Object.getPrototypeOf(componentInstance);

      // Get all method names
      const methodNames = Object.getOwnPropertyNames(proto)
        .concat(Object.getOwnPropertyNames(componentInstance))
        .filter((name) => {
          try {
            return (
              typeof (componentInstance as any)[name] === "function" &&
              name !== "constructor" &&
              !name.startsWith("_")
            ); // Skip private methods
          } catch {
            return false;
          }
        });

      // Remove duplicates
      const uniqueMethodNames = [...new Set(methodNames)];

      for (const methodName of uniqueMethodNames) {
        try {
          const method = componentInstance[methodName];
          if (typeof method === "function") {
            methods.push({
              name: methodName,
              parameters: this.extractParameters(method),
              returnType: "unknown", // Return type introspection not implemented
              description: `Component method: ${methodName}`,
            });
          }
        } catch (error) {
          console.warn(`Failed to analyze method ${methodName}:`, error);
        }
      }

      return methods.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error(
        `Failed to get component methods for ${componentId}:`,
        error,
      );
      return [];
    }
  }

  private extractParameters(
    method: (...args: unknown[]) => unknown,
  ): ComponentParameter[] {
    try {
      // Basic parameter extraction from function signature
      const funcStr = method.toString();
      const match = funcStr.match(/\(([^)]*)\)/);

      if (!match || !match[1].trim()) {
        return [];
      }

      const paramStr = match[1];
      const params = paramStr.split(",").map((p) => p.trim());

      return params.map((param, index) => {
        // Remove default values and destructuring for basic name extraction
        const cleanParam = param.split("=")[0].trim();
        const paramName = cleanParam.includes(":")
          ? cleanParam.split(":")[0].trim()
          : cleanParam;

        return {
          name: paramName || `param${index}`,
          type: "unknown", // Parameter type introspection not implemented
          required: !param.includes("="),
          description: `Parameter ${index + 1}`,
        };
      });
    } catch (error) {
      console.warn("Failed to extract parameters:", error);
      return [];
    }
  }

  async testComponent(componentId: string): Promise<{
    success: boolean;
    availableMethods: string[];
    errors: string[];
  }> {
    const errors: string[] = [];
    let availableMethods: string[] = [];

    try {
      // Try to load the component
      const componentInstance = await this.registry.loadComponent(componentId);
      if (!componentInstance) {
        errors.push("Failed to load component instance");
        return { success: false, availableMethods: [], errors };
      }

      // Get available methods
      const methods = await this.getComponentMethods(componentId);
      availableMethods = methods.map((m) => m.name);

      // Test basic component functionality
      if (typeof componentInstance.constructor === "function") {
        // Component loaded successfully
      } else {
        errors.push("Component instance is not valid");
      }

      return {
        success: errors.length === 0,
        availableMethods,
        errors,
      };
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Unknown test error",
      );
      return { success: false, availableMethods, errors };
    }
  }

  abortExecution(executionId: string): boolean {
    const abortController = this.activeExecutions.get(executionId);
    if (abortController) {
      abortController.abort();
      this.activeExecutions.delete(executionId);
      return true;
    }
    return false;
  }

  abortAllExecutions(): void {
    for (const [_executionId, abortController] of this.activeExecutions) {
      abortController.abort();
    }
    this.activeExecutions.clear();
  }

  getActiveExecutions(): string[] {
    return Array.from(this.activeExecutions.keys());
  }

  getExecutionStats(): {
    activeExecutions: number;
    maxConcurrentExecutions: number;
    totalExecutionsToday: number;
  } {
    return {
      activeExecutions: this.activeExecutions.size,
      maxConcurrentExecutions: this.maxConcurrentExecutions,
      totalExecutionsToday: this.totalExecutions,
    };
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  setMaxConcurrentExecutions(max: number): void {
    this.maxConcurrentExecutions = Math.max(1, max);
  }

  cleanup(): void {
    console.log("Cleaning up execution engine...");
    this.abortAllExecutions();
    console.log("Execution engine cleaned up");
  }
}
