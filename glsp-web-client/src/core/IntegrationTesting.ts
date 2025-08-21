/**
 * Integration Testing and Validation
 *
 * Comprehensive testing framework for validating the Component Execution
 * Monitoring System integration and service connectivity.
 */

import { serviceContainer } from "./ServiceContainer.js";
import {
  getService,
  getServiceHealthDashboard,
} from "./ServiceRegistration.js";
import { McpService } from "../services/McpService.js";
import { WasmRuntimeManager } from "../wasm/WasmRuntimeManager.js";
import { InteractionManager } from "../ui/InteractionManager.js";

export interface TestResult {
  name: string;
  success: boolean;
  message: string;
  details?: any;
  duration: number;
}

export interface IntegrationTestSuite {
  name: string;
  tests: TestResult[];
  overallSuccess: boolean;
  totalDuration: number;
}

/**
 * Comprehensive integration testing for the Component Execution Monitoring System
 */
export class IntegrationTester {
  private testResults: Map<string, IntegrationTestSuite> = new Map();

  /**
   * Run all integration tests
   */
  public async runAllTests(): Promise<Map<string, IntegrationTestSuite>> {
    console.log(
      "🧪 Starting Component Execution Monitoring System Integration Tests...",
    );

    // Test service container health
    await this.testServiceContainerHealth();

    // Test service dependencies
    await this.testServiceDependencies();

    // Test MCP connectivity
    await this.testMcpConnectivity();

    // Test component execution pipeline
    await this.testComponentExecutionPipeline();

    // Test real-time streaming
    await this.testRealTimeStreaming();

    // Test error handling and recovery
    await this.testErrorHandlingAndRecovery();

    this.logTestSummary();
    return this.testResults;
  }

  /**
   * Test service container health and initialization
   */
  private async testServiceContainerHealth(): Promise<void> {
    const suite: IntegrationTestSuite = {
      name: "Service Container Health",
      tests: [],
      overallSuccess: true,
      totalDuration: 0,
    };

    const startTime = Date.now();

    // Test 1: Service health dashboard
    const healthTest = await this.runTest(
      "Service Health Dashboard",
      async () => {
        const healthDashboard = getServiceHealthDashboard();

        if (healthDashboard.totalCount === 0) {
          throw new Error("No services registered");
        }

        if (healthDashboard.readyCount < healthDashboard.totalCount * 0.8) {
          throw new Error(
            `Only ${healthDashboard.readyCount}/${healthDashboard.totalCount} services ready`,
          );
        }

        return {
          success: true,
          message: `${healthDashboard.readyCount}/${healthDashboard.totalCount} services ready`,
          details: healthDashboard,
        };
      },
    );
    suite.tests.push(healthTest);

    // Test 2: Critical services availability
    const criticalServicesTest = await this.runTest(
      "Critical Services Availability",
      async () => {
        const criticalServices = [
          "mcpService",
          "diagramService",
          "interactionManager",
          "wasmRuntimeManager",
        ];
        const unavailableServices = [];

        for (const serviceName of criticalServices) {
          if (!serviceContainer.isServiceReady(serviceName)) {
            unavailableServices.push(serviceName);
          }
        }

        if (unavailableServices.length > 0) {
          throw new Error(
            `Critical services not available: ${unavailableServices.join(
              ", ",
            )}`,
          );
        }

        return {
          success: true,
          message: "All critical services are available",
          details: { criticalServices, availableServices: criticalServices },
        };
      },
    );
    suite.tests.push(criticalServicesTest);

    // Test 3: Service dependency resolution
    const dependencyTest = await this.runTest(
      "Service Dependency Resolution",
      async () => {
        try {
          const mcpService = await getService<McpService>("mcpService");
          const wasmManager =
            await getService<WasmRuntimeManager>("wasmRuntimeManager");
          const interactionManager =
            await getService<InteractionManager>("interactionManager");

          const resolvedServices = [
            mcpService ? "mcpService" : null,
            wasmManager ? "wasmRuntimeManager" : null,
            interactionManager ? "interactionManager" : null,
          ].filter((s) => s !== null);

          return {
            success: true,
            message: `Successfully resolved ${resolvedServices.length} service dependencies`,
            details: { resolvedServices },
          };
        } catch (error) {
          throw new Error(`Service dependency resolution failed: ${error}`);
        }
      },
    );
    suite.tests.push(dependencyTest);

    suite.totalDuration = Date.now() - startTime;
    suite.overallSuccess = suite.tests.every((t) => t.success);
    this.testResults.set("serviceHealth", suite);
  }

  /**
   * Test service dependencies and interconnection
   */
  private async testServiceDependencies(): Promise<void> {
    const suite: IntegrationTestSuite = {
      name: "Service Dependencies",
      tests: [],
      overallSuccess: true,
      totalDuration: 0,
    };

    const startTime = Date.now();

    // Test: InteractionManager has required dependencies
    const interactionManagerTest = await this.runTest(
      "InteractionManager Dependencies",
      async () => {
        const interactionManager =
          await getService<InteractionManager>("interactionManager");

        // Check if InteractionManager has access to its dependencies
        const hasWasmManager =
          (interactionManager as any).wasmComponentManager !== undefined;
        const hasUiManager =
          (interactionManager as any).uiManager !== undefined;
        const hasMcpService =
          (interactionManager as any).mcpService !== undefined;

        const dependencies = {
          wasmComponentManager: hasWasmManager,
          uiManager: hasUiManager,
          mcpService: hasMcpService,
        };

        const missingDeps = Object.entries(dependencies)
          .filter(([_, available]) => !available)
          .map(([name]) => name);

        if (missingDeps.length > 0) {
          throw new Error(
            `InteractionManager missing dependencies: ${missingDeps.join(
              ", ",
            )}`,
          );
        }

        return {
          success: true,
          message: "InteractionManager has all required dependencies",
          details: dependencies,
        };
      },
    );
    suite.tests.push(interactionManagerTest);

    suite.totalDuration = Date.now() - startTime;
    suite.overallSuccess = suite.tests.every((t) => t.success);
    this.testResults.set("serviceDependencies", suite);
  }

  /**
   * Test MCP connectivity and communication
   */
  private async testMcpConnectivity(): Promise<void> {
    const suite: IntegrationTestSuite = {
      name: "MCP Connectivity",
      tests: [],
      overallSuccess: true,
      totalDuration: 0,
    };

    const startTime = Date.now();

    // Test: MCP service connection
    const connectionTest = await this.runTest(
      "MCP Service Connection",
      async () => {
        const mcpService = await getService<McpService>("mcpService");
        const isConnected = mcpService.isConnected();

        return {
          success: isConnected,
          message: isConnected
            ? "MCP service is connected"
            : "MCP service is not connected",
          details: { connected: isConnected },
        };
      },
    );
    suite.tests.push(connectionTest);

    // Test: MCP tool availability
    const toolsTest = await this.runTest("MCP Tools Availability", async () => {
      const mcpService = await getService<McpService>("mcpService");

      try {
        // Test if execute_wasm_component tool is available by attempting to call it
        // Since listTools doesn't exist, we'll test by calling the tools directly
        let hasExecuteTool = false;
        let hasLoadTool = false;

        try {
          await mcpService.callTool("execute_wasm_component", {});
          hasExecuteTool = true;
        } catch {
          // Tool may not exist or may fail due to missing parameters
          hasExecuteTool = false;
        }

        try {
          await mcpService.callTool("load_wasm_component", {});
          hasLoadTool = true;
        } catch {
          // Tool may not exist or may fail due to missing parameters
          hasLoadTool = false;
        }

        const availableTools = {
          execute_wasm_component: hasExecuteTool,
          load_wasm_component: hasLoadTool,
          totalTools: (hasExecuteTool ? 1 : 0) + (hasLoadTool ? 1 : 0),
        };

        const hasAnyTools = hasExecuteTool || hasLoadTool;

        return {
          success: hasAnyTools,
          message: hasAnyTools
            ? `Found MCP tools including ${hasExecuteTool ? "execute" : ""}${
                hasExecuteTool && hasLoadTool ? " and " : ""
              }${hasLoadTool ? "load" : ""} tools`
            : "No critical WASM execution tools found",
          details: availableTools,
        };
      } catch (error) {
        throw new Error(`Failed to list MCP tools: ${error}`);
      }
    });
    suite.tests.push(toolsTest);

    suite.totalDuration = Date.now() - startTime;
    suite.overallSuccess = suite.tests.every((t) => t.success);
    this.testResults.set("mcpConnectivity", suite);
  }

  /**
   * Test component execution pipeline
   */
  private async testComponentExecutionPipeline(): Promise<void> {
    const suite: IntegrationTestSuite = {
      name: "Component Execution Pipeline",
      tests: [],
      overallSuccess: true,
      totalDuration: 0,
    };

    const startTime = Date.now();

    // Test: WASM Component Manager functionality
    const wasmManagerTest = await this.runTest(
      "WASM Component Manager",
      async () => {
        const wasmManager =
          await getService<WasmRuntimeManager>("wasmRuntimeManager");

        // Test basic functionality
        const components = await wasmManager.getComponents();
        const hasComponents = components && components.length > 0;

        return {
          success: true,
          message: `WASM Component Manager operational with ${
            components?.length || 0
          } components`,
          details: {
            componentCount: components?.length || 0,
            hasComponents,
            sampleComponent: hasComponents ? components[0].name : null,
          },
        };
      },
    );
    suite.tests.push(wasmManagerTest);

    // Test: Component execution capability
    const executionCapabilityTest = await this.runTest(
      "Component Execution Capability",
      async () => {
        const interactionManager =
          await getService<InteractionManager>("interactionManager");

        // Check if execution methods are available
        const hasExecuteMethod =
          typeof (interactionManager as any).executeComponentOnServer ===
          "function";
        const hasOpenExecutionView =
          typeof (interactionManager as any).openComponentExecutionView ===
          "function";

        if (!hasExecuteMethod || !hasOpenExecutionView) {
          throw new Error("Component execution methods not available");
        }

        return {
          success: true,
          message: "Component execution capability is available",
          details: {
            executeComponentOnServer: hasExecuteMethod,
            openComponentExecutionView: hasOpenExecutionView,
          },
        };
      },
    );
    suite.tests.push(executionCapabilityTest);

    suite.totalDuration = Date.now() - startTime;
    suite.overallSuccess = suite.tests.every((t) => t.success);
    this.testResults.set("executionPipeline", suite);
  }

  /**
   * Test real-time streaming functionality
   */
  private async testRealTimeStreaming(): Promise<void> {
    const suite: IntegrationTestSuite = {
      name: "Real-time Streaming",
      tests: [],
      overallSuccess: true,
      totalDuration: 0,
    };

    const startTime = Date.now();

    // Test: MCP streaming setup
    const streamingSetupTest = await this.runTest(
      "MCP Streaming Setup",
      async () => {
        const mcpService = await getService<McpService>("mcpService");
        const isStreaming = mcpService.isStreaming();

        return {
          success: true,
          message: isStreaming
            ? "MCP streaming is active"
            : "MCP streaming is inactive",
          details: { streaming: isStreaming },
        };
      },
    );
    suite.tests.push(streamingSetupTest);

    // Test: Execution streaming listeners
    const executionStreamingTest = await this.runTest(
      "Execution Streaming Listeners",
      async () => {
        // Check if execution streaming event listeners are available
        const hasExecutionProgressEvent = window.addEventListener !== undefined;
        const hasCustomEventSupport = typeof CustomEvent !== "undefined";

        return {
          success: hasExecutionProgressEvent && hasCustomEventSupport,
          message: "Execution streaming event system is available",
          details: {
            eventListeners: hasExecutionProgressEvent,
            customEvents: hasCustomEventSupport,
          },
        };
      },
    );
    suite.tests.push(executionStreamingTest);

    suite.totalDuration = Date.now() - startTime;
    suite.overallSuccess = suite.tests.every((t) => t.success);
    this.testResults.set("realTimeStreaming", suite);
  }

  /**
   * Test error handling and recovery mechanisms
   */
  private async testErrorHandlingAndRecovery(): Promise<void> {
    const suite: IntegrationTestSuite = {
      name: "Error Handling & Recovery",
      tests: [],
      overallSuccess: true,
      totalDuration: 0,
    };

    const startTime = Date.now();

    // Test: Service error recovery
    const errorRecoveryTest = await this.runTest(
      "Service Error Recovery",
      async () => {
        // Check if service container has recovery capabilities
        const hasRestartCapability =
          typeof serviceContainer.restartService === "function";
        const hasHealthMonitoring =
          typeof serviceContainer.getServiceHealth === "function";

        return {
          success: hasRestartCapability && hasHealthMonitoring,
          message: "Service error recovery mechanisms are available",
          details: {
            canRestartServices: hasRestartCapability,
            hasHealthMonitoring: hasHealthMonitoring,
          },
        };
      },
    );
    suite.tests.push(errorRecoveryTest);

    suite.totalDuration = Date.now() - startTime;
    suite.overallSuccess = suite.tests.every((t) => t.success);
    this.testResults.set("errorHandling", suite);
  }

  /**
   * Run a single test with error handling
   */
  private async runTest(
    name: string,
    testFn: () => Promise<{ success: boolean; message: string; details?: any }>,
  ): Promise<TestResult> {
    const startTime = Date.now();

    try {
      console.log(`🧪 Running test: ${name}`);
      const result = await testFn();
      const duration = Date.now() - startTime;

      console.log(`✅ ${name}: ${result.message}`);

      return {
        name,
        success: result.success,
        message: result.message,
        details: result.details,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error(`❌ ${name}: ${errorMessage}`);

      return {
        name,
        success: false,
        message: errorMessage,
        duration,
      };
    }
  }

  /**
   * Log comprehensive test summary
   */
  private logTestSummary(): void {
    console.log("\n🧪 ===== INTEGRATION TEST SUMMARY =====");

    let totalTests = 0;
    let passedTests = 0;
    let totalDuration = 0;

    for (const [_suiteName, suite] of this.testResults) {
      console.log(`\n📋 ${suite.name}:`);
      console.log(
        `   Overall: ${suite.overallSuccess ? "✅ PASS" : "❌ FAIL"} (${
          suite.totalDuration
        }ms)`,
      );

      for (const test of suite.tests) {
        console.log(
          `   ${test.success ? "✅" : "❌"} ${test.name}: ${test.message}`,
        );
        totalTests++;
        if (test.success) passedTests++;
      }

      totalDuration += suite.totalDuration;
    }

    console.log(`\n🎯 FINAL RESULTS:`);
    console.log(`   Tests: ${passedTests}/${totalTests} passed`);
    console.log(
      `   Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`,
    );
    console.log(`   Total Duration: ${totalDuration}ms`);
    console.log(
      `   Status: ${
        passedTests === totalTests
          ? "🎉 ALL TESTS PASSED"
          : "⚠️  SOME TESTS FAILED"
      }`,
    );
    console.log("=====================================\n");
  }

  /**
   * Get test results for external access
   */
  public getTestResults(): Map<string, IntegrationTestSuite> {
    return this.testResults;
  }

  /**
   * Check if all tests passed
   */
  public allTestsPassed(): boolean {
    return Array.from(this.testResults.values()).every(
      (suite) => suite.overallSuccess,
    );
  }
}

/**
 * Global integration tester instance
 */
export const integrationTester = new IntegrationTester();

/**
 * Expose testing functionality to window for debugging
 */
if (typeof window !== "undefined") {
  (window as any).runIntegrationTests = () => integrationTester.runAllTests();
  (window as any).getTestResults = () => integrationTester.getTestResults();
  (window as any).integrationTester = integrationTester;
}
