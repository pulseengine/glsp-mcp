/**
 * Service Container for Dependency Injection
 *
 * Provides centralized service management with lifecycle control,
 * dependency resolution, and health monitoring for the GLSP Web Client.
 */

export type ServiceState = "initializing" | "ready" | "error" | "disposed";

export interface ServiceDescriptor<T = any> {
  name: string;
  factory: () => T | Promise<T>;
  dependencies?: string[];
  singleton?: boolean;
  lifecycle?: {
    onInit?: (service: T) => void | Promise<void>;
    onReady?: (service: T) => void | Promise<void>;
    onDispose?: (service: T) => void | Promise<void>;
  };
}

export interface ServiceInstance<T = any> {
  name: string;
  instance: T;
  state: ServiceState;
  dependencies: string[];
  dependents: string[];
  lastError?: Error;
  createdAt: Date;
}

/**
 * Centralized service container for managing application services
 * with proper dependency injection and lifecycle management.
 */
export class ServiceContainer {
  private services = new Map<string, ServiceInstance>();
  private descriptors = new Map<string, ServiceDescriptor>();
  private singletonInstances = new Map<string, any>();
  private initializationPromises = new Map<string, Promise<any>>();

  /**
   * Register a service descriptor with the container
   */
  register<T>(descriptor: ServiceDescriptor<T>): void {
    if (this.descriptors.has(descriptor.name)) {
      throw new Error(`Service '${descriptor.name}' is already registered`);
    }

    this.descriptors.set(descriptor.name, descriptor);
    console.log(`Registered service: ${descriptor.name}`);
  }

  /**
   * Get a service instance, creating it if necessary
   */
  async get<T>(name: string): Promise<T> {
    // Return existing singleton if available
    if (this.singletonInstances.has(name)) {
      return this.singletonInstances.get(name);
    }

    // Return existing initialization promise to avoid duplicate creation
    if (this.initializationPromises.has(name)) {
      return this.initializationPromises.get(name);
    }

    const descriptor = this.descriptors.get(name);
    if (!descriptor) {
      throw new Error(`Service '${name}' is not registered`);
    }

    // Create initialization promise
    const initPromise = this.createService<T>(descriptor);
    this.initializationPromises.set(name, initPromise);

    try {
      const instance = await initPromise;

      // Store singleton instance if configured
      if (descriptor.singleton !== false) {
        this.singletonInstances.set(name, instance);
      }

      return instance;
    } finally {
      this.initializationPromises.delete(name);
    }
  }

  /**
   * Create a service instance with dependency resolution
   */
  private async createService<T>(descriptor: ServiceDescriptor<T>): Promise<T> {
    console.log(`Creating service: ${descriptor.name}`);

    // Create service instance record
    const serviceInstance: ServiceInstance<T> = {
      name: descriptor.name,
      instance: null as any,
      state: "initializing",
      dependencies: descriptor.dependencies || [],
      dependents: [],
      createdAt: new Date(),
    };

    this.services.set(descriptor.name, serviceInstance);

    try {
      // Resolve dependencies first
      if (descriptor.dependencies) {
        for (const depName of descriptor.dependencies) {
          await this.get(depName);

          // Track dependent relationships
          const depInstance = this.services.get(depName);
          if (depInstance) {
            depInstance.dependents.push(descriptor.name);
          }
        }
      }

      // Create the service instance
      const instance = await descriptor.factory();
      serviceInstance.instance = instance;

      // Run lifecycle hooks
      if (descriptor.lifecycle?.onInit) {
        await descriptor.lifecycle.onInit(instance);
      }

      serviceInstance.state = "ready";

      if (descriptor.lifecycle?.onReady) {
        await descriptor.lifecycle.onReady(instance);
      }

      console.log(`Service ready: ${descriptor.name}`);
      return instance;
    } catch (error) {
      serviceInstance.state = "error";
      serviceInstance.lastError = error as Error;
      console.error(`Failed to create service '${descriptor.name}':`, error);
      throw error;
    }
  }

  /**
   * Initialize all registered services
   */
  async initializeAll(): Promise<void> {
    console.log("Initializing all services...");

    const serviceNames = Array.from(this.descriptors.keys());
    const initPromises = serviceNames.map((name) =>
      this.get(name).catch((error) => {
        console.error(`Failed to initialize service '${name}':`, error);
        return null;
      }),
    );

    await Promise.all(initPromises);

    const readyServices = Array.from(this.services.values()).filter(
      (s) => s.state === "ready",
    ).length;
    const totalServices = this.services.size;

    console.log(
      `Service initialization complete: ${readyServices}/${totalServices} services ready`,
    );
  }

  /**
   * Get service health status
   */
  getServiceHealth(): { [serviceName: string]: ServiceState } {
    const health: { [serviceName: string]: ServiceState } = {};

    for (const [name, instance] of this.services) {
      health[name] = instance.state;
    }

    return health;
  }

  /**
   * Get detailed service information
   */
  getServiceInfo(name: string): ServiceInstance | undefined {
    return this.services.get(name);
  }

  /**
   * Check if a specific service is ready
   */
  isServiceReady(name: string): boolean {
    const service = this.services.get(name);
    return service?.state === "ready";
  }

  /**
   * Get all services that are ready
   */
  getReadyServices(): string[] {
    return Array.from(this.services.values())
      .filter((s) => s.state === "ready")
      .map((s) => s.name);
  }

  /**
   * Dispose of all services in reverse dependency order
   */
  async dispose(): Promise<void> {
    console.log("Disposing services...");

    // Get services in reverse dependency order
    const serviceNames = this.getServicesInDisposeOrder();

    for (const name of serviceNames) {
      const service = this.services.get(name);
      if (service && service.state === "ready") {
        try {
          const descriptor = this.descriptors.get(name);
          if (descriptor?.lifecycle?.onDispose) {
            await descriptor.lifecycle.onDispose(service.instance);
          }
          service.state = "disposed";
          console.log(`Disposed service: ${name}`);
        } catch (error) {
          console.error(`Error disposing service '${name}':`, error);
        }
      }
    }

    // Clear all containers
    this.services.clear();
    this.singletonInstances.clear();
    this.initializationPromises.clear();

    console.log("All services disposed");
  }

  /**
   * Get services in reverse dependency order for proper disposal
   */
  private getServicesInDisposeOrder(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (serviceName: string) => {
      if (visited.has(serviceName)) return;
      visited.add(serviceName);

      const service = this.services.get(serviceName);
      if (service) {
        // Visit dependents first (they need to be disposed before their dependencies)
        for (const dependent of service.dependents) {
          visit(dependent);
        }
        result.push(serviceName);
      }
    };

    for (const serviceName of this.services.keys()) {
      visit(serviceName);
    }

    return result.reverse(); // Reverse to get proper disposal order
  }

  /**
   * Restart a failed service
   */
  async restartService(name: string): Promise<void> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service '${name}' not found`);
    }

    if (service.state !== "error") {
      throw new Error(`Service '${name}' is not in error state`);
    }

    // Remove from singletons to force recreation
    this.singletonInstances.delete(name);
    this.services.delete(name);

    // Recreate the service
    await this.get(name);
  }
}

// Global service container instance
export const serviceContainer = new ServiceContainer();
