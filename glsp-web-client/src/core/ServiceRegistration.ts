/**
 * Service Registration Configuration
 * 
 * Defines all application services and their dependencies for the ServiceContainer.
 * This replaces the manual service creation in AppController with a dependency
 * injection pattern.
 */

import { serviceContainer, ServiceDescriptor } from './ServiceContainer.js';
import { McpService } from '../services/McpService.js';
import { DiagramService } from '../services/DiagramService.js';
import { AIService } from '../services/AIService.js';
import { UIManager } from '../ui/UIManager.js';
import { CanvasRenderer } from '../renderer/canvas-renderer.js';
import { InteractionManager } from '../ui/InteractionManager.js';
import { WasmRuntimeManager } from '../wasm/WasmRuntimeManager.js';
import { WitVisualizationPanel } from '../wit/WitVisualizationPanel.js';
import { ViewSwitcher } from '../ui/ViewSwitcher.js';
import { ViewModeManager } from '../ui/ViewModeManager.js';
import { WasmViewTransformer } from '../ui/WasmViewTransformer.js';
import { statusManager } from '../services/StatusManager.js';

/**
 * Register all application services with their dependencies
 */
export function registerServices(canvas: HTMLCanvasElement): void {
    console.log('Registering application services...');

    // Core MCP Service - foundation service with no dependencies
    serviceContainer.register<McpService>({
        name: 'mcpService',
        factory: () => new McpService(),
        singleton: true,
        lifecycle: {
            onInit: async (service) => {
                console.log('Initializing MCP service...');
                await service.initialize();
            },
            onReady: (service) => {
                console.log('MCP service ready, setting up connection monitoring and execution streaming...');
                
                // Setup connection status monitoring
                service.addConnectionListener((connected: boolean) => {
                    statusManager.setMcpStatus(connected);
                });

                // Check current connection status
                const mcpConnected = service.isConnected();
                console.log('Current MCP connection status:', mcpConnected);
                statusManager.setMcpStatus(mcpConnected);

                // Setup execution streaming for real-time monitoring
                service.setupExecutionStreaming();
            }
        }
    });

    // Diagram Service - depends on MCP
    serviceContainer.register<DiagramService>({
        name: 'diagramService',
        factory: async () => {
            const mcpService = await serviceContainer.get<McpService>('mcpService');
            return new DiagramService(mcpService);
        },
        dependencies: ['mcpService'],
        singleton: true
    });

    // AI Service - depends on MCP
    serviceContainer.register<AIService>({
        name: 'aiService',
        factory: async () => {
            const mcpService = await serviceContainer.get<McpService>('mcpService');
            return new AIService(mcpService);
        },
        dependencies: ['mcpService'],
        singleton: true,
        lifecycle: {
            onReady: async (service) => {
                console.log('AI service ready, setting up connection monitoring...');
                
                // Setup AI connection monitoring
                service.addConnectionListener((connected: boolean) => {
                    statusManager.setAiStatus(connected);
                });

                // Check connections to initialize monitoring
                await service.checkConnections();
            }
        }
    });

    // UI Manager - no dependencies (manages UI independently)
    serviceContainer.register<UIManager>({
        name: 'uiManager',
        factory: () => new UIManager(),
        singleton: true,
        lifecycle: {
            onReady: (uiManager) => {
                console.log('UI Manager ready, showing AI panel...');
                uiManager.showAIPanel();
            }
        }
    });

    // Canvas Renderer - requires canvas element
    serviceContainer.register<CanvasRenderer>({
        name: 'canvasRenderer',
        factory: () => new CanvasRenderer(canvas),
        singleton: true
    });

    // View Switcher - no dependencies
    serviceContainer.register<ViewSwitcher>({
        name: 'viewSwitcher',
        factory: () => new ViewSwitcher(),
        singleton: true
    });

    // View Mode Manager - depends on diagram service and renderer
    serviceContainer.register<ViewModeManager>({
        name: 'viewModeManager',
        factory: async () => {
            const diagramService = await serviceContainer.get<DiagramService>('diagramService');
            const renderer = await serviceContainer.get<CanvasRenderer>('canvasRenderer');
            const viewModeManager = new ViewModeManager(diagramService, renderer);
            
            // Register the WASM view transformer
            viewModeManager.registerTransformer('wasm-component', new WasmViewTransformer());
            
            return viewModeManager;
        },
        dependencies: ['diagramService', 'canvasRenderer'],
        singleton: true
    });

    // WASM Runtime Manager - depends on MCP, diagram service, and renderer
    serviceContainer.register<WasmRuntimeManager>({
        name: 'wasmRuntimeManager',
        factory: async () => {
            const mcpService = await serviceContainer.get<McpService>('mcpService');
            const diagramService = await serviceContainer.get<DiagramService>('diagramService');
            const renderer = await serviceContainer.get<CanvasRenderer>('canvasRenderer');
            
            return new WasmRuntimeManager(mcpService, diagramService, {
                enableClientSideTranspilation: true,
                maxConcurrentExecutions: 5,
                maxCachedComponents: 50
            }, renderer);
        },
        dependencies: ['mcpService', 'diagramService', 'canvasRenderer'],
        singleton: true,
        lifecycle: {
            onReady: async (wasmRuntimeManager) => {
                console.log('WASM Runtime Manager ready, initializing enhanced components...');
                await wasmRuntimeManager.initializeEnhancedWasmComponents();
            }
        }
    });

    // WIT Visualization Panel - depends on MCP
    serviceContainer.register<WitVisualizationPanel>({
        name: 'witVisualizationPanel',
        factory: async () => {
            const mcpService = await serviceContainer.get<McpService>('mcpService');
            return new WitVisualizationPanel(mcpService);
        },
        dependencies: ['mcpService'],
        singleton: true
    });

    // Interaction Manager - depends on renderer, diagram service, MCP service, and WASM manager
    serviceContainer.register<InteractionManager>({
        name: 'interactionManager',
        factory: async () => {
            const renderer = await serviceContainer.get<CanvasRenderer>('canvasRenderer');
            const diagramService = await serviceContainer.get<DiagramService>('diagramService');
            const mcpService = await serviceContainer.get<McpService>('mcpService');
            
            return new InteractionManager(renderer, diagramService, mcpService);
        },
        dependencies: ['canvasRenderer', 'diagramService', 'mcpService'],
        singleton: true,
        lifecycle: {
            onReady: async (interactionManager) => {
                console.log('Interaction Manager ready, setting up dependencies and event handlers...');
                
                // Get dependent services
                const wasmRuntimeManager = await serviceContainer.get<WasmRuntimeManager>('wasmRuntimeManager');
                const uiManager = await serviceContainer.get<UIManager>('uiManager');
                const viewModeManager = await serviceContainer.get<ViewModeManager>('viewModeManager');
                
                // Setup dependencies
                interactionManager.setWasmComponentManager(wasmRuntimeManager);
                interactionManager.setUIManager(uiManager);
                interactionManager.setViewModeManager(viewModeManager);
                
                // Setup event handlers
                interactionManager.setupEventHandlers();
                
                console.log('Interaction Manager fully configured');
            }
        }
    });

    console.log('All services registered successfully');
}

/**
 * Get a service from the container with proper typing
 */
export async function getService<T>(name: string): Promise<T> {
    return await serviceContainer.get<T>(name);
}

/**
 * Check if all critical services are ready
 */
export function areServicesReady(): boolean {
    const criticalServices = [
        'mcpService',
        'diagramService',
        'uiManager',
        'canvasRenderer',
        'interactionManager'
    ];

    return criticalServices.every(serviceName => 
        serviceContainer.isServiceReady(serviceName)
    );
}

/**
 * Get service health dashboard
 */
export function getServiceHealthDashboard() {
    const health = serviceContainer.getServiceHealth();
    const readyServices = serviceContainer.getReadyServices();
    
    return {
        health,
        readyCount: readyServices.length,
        totalCount: Object.keys(health).length,
        readyServices,
        allReady: areServicesReady()
    };
}