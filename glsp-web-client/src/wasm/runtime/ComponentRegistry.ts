import {
  TranspiledComponent,
  ComponentMetadata,
} from "../transpiler/WasmTranspiler.js";

export interface LoadedComponent {
  component: TranspiledComponent;
  instance?: WebAssembly.Instance;
  isLoaded: boolean;
  loadedAt?: Date;
  lastUsed?: Date;
  errorMessage?: string;
}

export interface ComponentFilter {
  name?: string;
  hasInterface?: string;
  sizeLimit?: number;
  createdAfter?: Date;
}

export class ComponentRegistry {
  private components = new Map<string, LoadedComponent>();
  private maxComponents = 50; // Limit number of cached components

  registerComponent(component: TranspiledComponent): string {
    // Check if we're at capacity
    if (this.components.size >= this.maxComponents) {
      this.evictOldestComponent();
    }

    const loadedComponent: LoadedComponent = {
      component,
      isLoaded: false,
    };

    this.components.set(component.id, loadedComponent);
    console.log(
      `Component registered: ${component.metadata.name} (${component.id})`,
    );

    return component.id;
  }

  getComponent(id: string): LoadedComponent | null {
    const component = this.components.get(id);
    if (component) {
      component.lastUsed = new Date();
    }
    return component || null;
  }

  async loadComponent(id: string): Promise<WebAssembly.Instance> {
    const loadedComponent = this.components.get(id);
    if (!loadedComponent) {
      throw new Error(`Component not found: ${id}`);
    }

    if (loadedComponent.isLoaded && loadedComponent.instance) {
      loadedComponent.lastUsed = new Date();
      return loadedComponent.instance;
    }

    try {
      console.log(
        `Loading component: ${loadedComponent.component.metadata.name}`,
      );

      // Create a blob URL for the JavaScript module
      const jsBlob = new Blob([loadedComponent.component.jsModule], {
        type: "application/javascript",
      });
      const jsUrl = URL.createObjectURL(jsBlob);

      try {
        // Dynamic import of the transpiled JavaScript module
        const module = await import(jsUrl);

        // Instantiate if needed
        let instance;
        if (typeof module.instantiate === "function") {
          instance = await module.instantiate();
        } else if (typeof module.default === "function") {
          instance = await module.default();
        } else {
          instance = module;
        }

        loadedComponent.instance = instance;
        loadedComponent.isLoaded = true;
        loadedComponent.loadedAt = new Date();
        loadedComponent.lastUsed = new Date();
        loadedComponent.errorMessage = undefined;

        console.log(
          `Component loaded successfully: ${loadedComponent.component.metadata.name}`,
        );
        return instance;
      } finally {
        // Clean up the blob URL
        URL.revokeObjectURL(jsUrl);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      loadedComponent.errorMessage = errorMessage;
      loadedComponent.isLoaded = false;

      console.error(
        `Failed to load component ${loadedComponent.component.metadata.name}:`,
        error,
      );
      throw new Error(`Failed to load component: ${errorMessage}`);
    }
  }

  unloadComponent(id: string): boolean {
    const loadedComponent = this.components.get(id);
    if (!loadedComponent) {
      return false;
    }

    if (loadedComponent.isLoaded && loadedComponent.instance) {
      // Clean up if the instance has a cleanup method
      if (typeof (loadedComponent.instance as any).cleanup === "function") {
        try {
          (loadedComponent.instance as any).cleanup();
        } catch (error) {
          console.warn(`Error during component cleanup: ${error}`);
        }
      }

      loadedComponent.instance = undefined;
      loadedComponent.isLoaded = false;
      loadedComponent.loadedAt = undefined;

      console.log(
        `Component unloaded: ${loadedComponent.component.metadata.name}`,
      );
    }

    return true;
  }

  removeComponent(id: string): boolean {
    const loadedComponent = this.components.get(id);
    if (!loadedComponent) {
      return false;
    }

    // Unload first
    this.unloadComponent(id);

    // Remove from registry
    this.components.delete(id);
    console.log(
      `Component removed: ${loadedComponent.component.metadata.name}`,
    );

    return true;
  }

  hasComponent(id: string): boolean {
    return this.components.has(id);
  }

  listComponents(filter?: ComponentFilter): ComponentMetadata[] {
    let components = Array.from(this.components.values()).map(
      (lc) => lc.component.metadata,
    );

    if (filter) {
      if (filter.name) {
        const nameFilter = filter.name.toLowerCase();
        components = components.filter((c) =>
          c.name.toLowerCase().includes(nameFilter),
        );
      }

      if (filter.hasInterface) {
        components = components.filter((c) =>
          c.interfaces.includes(filter.hasInterface!),
        );
      }

      if (filter.sizeLimit) {
        components = components.filter((c) => c.size <= filter.sizeLimit!);
      }

      if (filter.createdAfter) {
        components = components.filter((c) => {
          const loadedComponent = this.components.get(c.hash);
          return (
            loadedComponent &&
            loadedComponent.component.created >= filter.createdAfter!
          );
        });
      }
    }

    return components.sort((a, b) => a.name.localeCompare(b.name));
  }

  getLoadedComponents(): ComponentMetadata[] {
    return Array.from(this.components.values())
      .filter((lc) => lc.isLoaded)
      .map((lc) => lc.component.metadata)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getComponentStatus(id: string): {
    exists: boolean;
    isLoaded: boolean;
    loadedAt?: Date;
    lastUsed?: Date;
    errorMessage?: string;
  } {
    const loadedComponent = this.components.get(id);
    if (!loadedComponent) {
      return { exists: false, isLoaded: false };
    }

    return {
      exists: true,
      isLoaded: loadedComponent.isLoaded,
      loadedAt: loadedComponent.loadedAt,
      lastUsed: loadedComponent.lastUsed,
      errorMessage: loadedComponent.errorMessage,
    };
  }

  private evictOldestComponent(): void {
    let oldestId = "";
    let oldestTime = new Date();

    for (const [id, loadedComponent] of this.components) {
      const lastUsed =
        loadedComponent.lastUsed || loadedComponent.component.created;
      if (lastUsed < oldestTime) {
        oldestTime = lastUsed;
        oldestId = id;
      }
    }

    if (oldestId) {
      console.log(`Evicting oldest component: ${oldestId}`);
      this.removeComponent(oldestId);
    }
  }

  getMemoryUsage(): {
    totalComponents: number;
    loadedComponents: number;
    totalSize: number;
    loadedSize: number;
  } {
    let totalSize = 0;
    let loadedSize = 0;
    let loadedCount = 0;

    for (const loadedComponent of this.components.values()) {
      totalSize += loadedComponent.component.metadata.size;
      if (loadedComponent.isLoaded) {
        loadedSize += loadedComponent.component.metadata.size;
        loadedCount++;
      }
    }

    return {
      totalComponents: this.components.size,
      loadedComponents: loadedCount,
      totalSize,
      loadedSize,
    };
  }

  cleanup(): void {
    console.log("Cleaning up component registry...");

    // Unload all components
    for (const id of this.components.keys()) {
      this.unloadComponent(id);
    }

    // Clear registry
    this.components.clear();
    console.log("Component registry cleaned up");
  }
}
