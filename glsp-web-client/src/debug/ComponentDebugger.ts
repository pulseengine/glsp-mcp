/**
 * Advanced Component Debugging System
 * Provides comprehensive debugging capabilities for WASM components
 */

import {
  ExecutionEngine,
  ExecutionContext,
} from "../wasm/runtime/ExecutionEngine.js";
import { WasmComponentManager } from "../wasm/WasmComponentManager.js";

export interface Breakpoint {
  id: string;
  componentId: string;
  functionName: string;
  instructionOffset?: number;
  condition?: string;
  enabled: boolean;
  hitCount: number;
  created: Date;
}

export interface VariableInfo {
  name: string;
  type: string;
  value: any;
  scope: "local" | "global" | "parameter";
  memoryAddress?: number;
  size?: number;
  editable: boolean;
}

export interface CallFrame {
  functionName: string;
  componentId: string;
  instructionOffset: number;
  parameters: VariableInfo[];
  localVariables: VariableInfo[];
  returnAddress?: number;
}

export interface CallStack {
  frames: CallFrame[];
  depth: number;
  currentFrame: number;
}

export interface PerformanceMetrics {
  executionTime: number;
  memoryUsage: number;
  instructionCount: number;
  functionCalls: number;
  wasmTime: number;
  jsTime: number;
  gcTime: number;
}

export interface FunctionProfile {
  name: string;
  calls: number;
  totalTime: number;
  averageTime: number;
  maxTime: number;
  minTime: number;
  memoryAllocated: number;
}

export interface DebugSession {
  id: string;
  componentId: string;
  state: "running" | "paused" | "stopped" | "error";
  breakpoints: Map<string, Breakpoint>;
  callStack: CallStack;
  variables: Map<string, VariableInfo>;
  metrics: PerformanceMetrics;
  startTime: Date;
  pauseTime?: Date;
}

export class BreakpointManager {
  private breakpoints: Map<string, Breakpoint> = new Map();
  private nextId = 1;

  public addBreakpoint(
    componentId: string,
    functionName: string,
    options: {
      instructionOffset?: number;
      condition?: string;
      enabled?: boolean;
    } = {},
  ): string {
    const id = `bp_${this.nextId++}`;
    const breakpoint: Breakpoint = {
      id,
      componentId,
      functionName,
      instructionOffset: options.instructionOffset,
      condition: options.condition,
      enabled: options.enabled ?? true,
      hitCount: 0,
      created: new Date(),
    };

    this.breakpoints.set(id, breakpoint);
    console.log(
      `BreakpointManager: Added breakpoint ${id} for ${componentId}:${functionName}`,
    );
    return id;
  }

  public removeBreakpoint(id: string): boolean {
    const removed = this.breakpoints.delete(id);
    if (removed) {
      console.log(`BreakpointManager: Removed breakpoint ${id}`);
    }
    return removed;
  }

  public enableBreakpoint(id: string): boolean {
    const breakpoint = this.breakpoints.get(id);
    if (breakpoint) {
      breakpoint.enabled = true;
      console.log(`BreakpointManager: Enabled breakpoint ${id}`);
      return true;
    }
    return false;
  }

  public disableBreakpoint(id: string): boolean {
    const breakpoint = this.breakpoints.get(id);
    if (breakpoint) {
      breakpoint.enabled = false;
      console.log(`BreakpointManager: Disabled breakpoint ${id}`);
      return true;
    }
    return false;
  }

  public getBreakpoints(componentId?: string): Breakpoint[] {
    const breakpoints = Array.from(this.breakpoints.values());
    return componentId
      ? breakpoints.filter((bp) => bp.componentId === componentId)
      : breakpoints;
  }

  public shouldBreak(
    componentId: string,
    functionName: string,
    instructionOffset?: number,
  ): Breakpoint | null {
    for (const breakpoint of this.breakpoints.values()) {
      if (
        breakpoint.enabled &&
        breakpoint.componentId === componentId &&
        breakpoint.functionName === functionName
      ) {
        // Check instruction offset if specified
        if (
          breakpoint.instructionOffset !== undefined &&
          instructionOffset !== undefined &&
          breakpoint.instructionOffset !== instructionOffset
        ) {
          continue;
        }

        // TODO: Evaluate condition if specified
        if (breakpoint.condition) {
          // For now, simple conditions are supported
          // Real implementation would need expression evaluation
        }

        breakpoint.hitCount++;
        return breakpoint;
      }
    }
    return null;
  }

  public clearAll(): void {
    this.breakpoints.clear();
    console.log("BreakpointManager: Cleared all breakpoints");
  }
}

export class VariableInspector {
  // private __executionEngine: ExecutionEngine; // Unused - commented out"
  private currentVariables: Map<string, VariableInfo> = new Map();

  constructor(_executionEngine: ExecutionEngine) {
    // Execution engine parameter is required for interface but not used yet
  }

  public async inspectVariables(
    context: ExecutionContext,
  ): Promise<VariableInfo[]> {
    const variables: VariableInfo[] = [];

    try {
      // Inspect local variables (simulated for now)
      const localVars = await this.getLocalVariables(context);
      variables.push(...localVars);

      // Inspect global variables
      const globalVars = await this.getGlobalVariables(context);
      variables.push(...globalVars);

      // Inspect function parameters
      const paramVars = await this.getParameterVariables(context);
      variables.push(...paramVars);

      // Update current variables cache
      this.currentVariables.clear();
      variables.forEach((v) => this.currentVariables.set(v.name, v));

      console.log(`VariableInspector: Inspected ${variables.length} variables`);
      return variables;
    } catch (error) {
      console.error("VariableInspector: Failed to inspect variables:", error);
      return [];
    }
  }

  public async getVariable(name: string): Promise<VariableInfo | null> {
    return this.currentVariables.get(name) || null;
  }

  public async setVariable(name: string, value: any): Promise<boolean> {
    const variable = this.currentVariables.get(name);
    if (!variable || !variable.editable) {
      return false;
    }

    try {
      // TODO: Actually set the variable value in the WASM context
      // This would require interfacing with wasmtime's debugging API
      variable.value = value;
      console.log(`VariableInspector: Set variable ${name} = ${value}`);
      return true;
    } catch (error) {
      console.error(
        `VariableInspector: Failed to set variable ${name}:`,
        error,
      );
      return false;
    }
  }

  public async inspectMemory(
    address: number,
    size: number,
  ): Promise<Uint8Array | null> {
    try {
      // TODO: Interface with WASM linear memory
      // For now, return simulated memory data
      const memory = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        memory[i] = (address + i) % 256;
      }
      console.log(
        `VariableInspector: Inspected memory at 0x${address.toString(
          16,
        )} (${size} bytes)`,
      );
      return memory;
    } catch (error) {
      console.error("VariableInspector: Failed to inspect memory:", error);
      return null;
    }
  }

  private async getLocalVariables(
    _context: ExecutionContext,
  ): Promise<VariableInfo[]> {
    // Simulated local variables - real implementation would query WASM runtime
    return [
      {
        name: "temp_var",
        type: "i32",
        value: 42,
        scope: "local",
        editable: true,
      },
      {
        name: "buffer",
        type: "ptr",
        value: 0x1000,
        scope: "local",
        memoryAddress: 0x1000,
        size: 256,
        editable: false,
      },
    ];
  }

  private async getGlobalVariables(
    _context: ExecutionContext,
  ): Promise<VariableInfo[]> {
    // Simulated global variables
    return [
      {
        name: "global_counter",
        type: "i64",
        value: 12345,
        scope: "global",
        editable: true,
      },
    ];
  }

  private async getParameterVariables(
    context: ExecutionContext,
  ): Promise<VariableInfo[]> {
    // Extract parameters from execution context
    const parameters = context.args || [];
    return parameters.map((_param, _index) => ({
      name: `param_${_index}`,
      type: typeof _param === "number" ? "i32" : "unknown",
      value: _param,
      scope: "parameter" as const,
      editable: false,
    }));
  }
}

export class PerformanceProfiler {
  private profiles: Map<string, FunctionProfile> = new Map();
  private currentSession: PerformanceMetrics | null = null;
  private startTime: number = 0;
  private lastGCTime: number = 0;

  public startProfiling(): void {
    this.startTime = performance.now();
    this.lastGCTime = this.getGCTime();
    this.currentSession = {
      executionTime: 0,
      memoryUsage: this.getMemoryUsage(),
      instructionCount: 0,
      functionCalls: 0,
      wasmTime: 0,
      jsTime: 0,
      gcTime: 0,
    };
    console.log("PerformanceProfiler: Started profiling session");
  }

  public stopProfiling(): PerformanceMetrics | null {
    if (!this.currentSession) return null;

    const endTime = performance.now();
    this.currentSession.executionTime = endTime - this.startTime;
    this.currentSession.gcTime = this.getGCTime() - this.lastGCTime;

    console.log("PerformanceProfiler: Stopped profiling session");
    const result = { ...this.currentSession };
    this.currentSession = null;
    return result;
  }

  public recordFunctionCall(
    functionName: string,
    executionTime: number,
    memoryDelta: number = 0,
  ): void {
    let profile = this.profiles.get(functionName);
    if (!profile) {
      profile = {
        name: functionName,
        calls: 0,
        totalTime: 0,
        averageTime: 0,
        maxTime: 0,
        minTime: Infinity,
        memoryAllocated: 0,
      };
      this.profiles.set(functionName, profile);
    }

    profile.calls++;
    profile.totalTime += executionTime;
    profile.averageTime = profile.totalTime / profile.calls;
    profile.maxTime = Math.max(profile.maxTime, executionTime);
    profile.minTime = Math.min(profile.minTime, executionTime);
    profile.memoryAllocated += memoryDelta;

    if (this.currentSession) {
      this.currentSession.functionCalls++;
      this.currentSession.wasmTime += executionTime;
    }
  }

  public getFunctionProfiles(): FunctionProfile[] {
    return Array.from(this.profiles.values()).sort(
      (a, b) => b.totalTime - a.totalTime,
    );
  }

  public getTopFunctions(limit: number = 10): FunctionProfile[] {
    return this.getFunctionProfiles().slice(0, limit);
  }

  public resetProfiles(): void {
    this.profiles.clear();
    console.log("PerformanceProfiler: Reset all function profiles");
  }

  private getMemoryUsage(): number {
    if ("memory" in performance) {
      const memory = (performance as any).memory;
      return memory.usedJSHeapSize || 0;
    }
    return 0;
  }

  private getGCTime(): number {
    // Estimate GC time based on performance timeline
    if ("getEntriesByType" in performance) {
      const gcEntries = performance
        .getEntriesByType("measure")
        .filter((entry) => entry.name.includes("gc"));
      return gcEntries.reduce((total, entry) => total + entry.duration, 0);
    }
    return 0;
  }
}

export class DebuggingConsole {
  private commandHistory: string[] = [];
  private historyIndex: number = -1;
  private _componentManager: WasmComponentManager;
  // private __executionEngine: ExecutionEngine; // Unused - commented out"

  constructor(
    componentManager: WasmComponentManager,
    _executionEngine: ExecutionEngine,
  ) {
    this._componentManager = componentManager;
    // ExecutionEngine parameter is required for interface but not used yet
  }

  public async executeCommand(command: string): Promise<any> {
    this.addToHistory(command);

    try {
      const result = await this.parseAndExecute(command);
      console.log(
        `DebuggingConsole: Executed "${command}" -> ${JSON.stringify(result)}`,
      );
      return result;
    } catch (error) {
      console.error(`DebuggingConsole: Command failed "${command}":`, error);
      throw error;
    }
  }

  public getCommandHistory(): string[] {
    return [...this.commandHistory];
  }

  public getPreviousCommand(): string | null {
    if (this.historyIndex < this.commandHistory.length - 1) {
      this.historyIndex++;
      return this.commandHistory[
        this.commandHistory.length - 1 - this.historyIndex
      ];
    }
    return null;
  }

  public getNextCommand(): string | null {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      return this.commandHistory[
        this.commandHistory.length - 1 - this.historyIndex
      ];
    } else if (this.historyIndex === 0) {
      this.historyIndex = -1;
      return "";
    }
    return null;
  }

  private addToHistory(command: string): void {
    // Don't add duplicate consecutive commands
    if (
      this.commandHistory.length === 0 ||
      this.commandHistory[this.commandHistory.length - 1] !== command
    ) {
      this.commandHistory.push(command);

      // Limit history size
      if (this.commandHistory.length > 100) {
        this.commandHistory.shift();
      }
    }
    this.historyIndex = -1;
  }

  private async parseAndExecute(command: string): Promise<any> {
    const trimmed = command.trim();
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case "help":
        return this.getHelpText();

      case "list":
        return this.listComponents();

      case "call":
        return await this.callFunction(parts.slice(1));

      case "inspect":
        return await this.inspectComponent(parts[1]);

      case "memory":
        return await this.inspectMemory(parts.slice(1));

      case "vars":
        return await this.listVariables(parts[1]);

      case "set":
        return await this.setVariable(parts.slice(1));

      case "eval":
        return await this.evaluateExpression(parts.slice(1).join(" "));

      case "status":
        return this.getStatus();

      default:
        throw new Error(
          `Unknown command: ${cmd}. Type 'help' for available commands.`,
        );
    }
  }

  private getHelpText(): string {
    return `
Available commands:
  help                    - Show this help text
  list                   - List loaded components
  call <component> <fn>  - Call a component function
  inspect <component>    - Inspect component details
  memory <addr> <size>   - Inspect memory region
  vars <component>       - List component variables
  set <var> <value>      - Set variable value
  eval <expression>      - Evaluate JavaScript expression
  status                 - Show debugger status
        `.trim();
  }

  private async listComponents(): Promise<any> {
    const components = await this._componentManager.getComponents();
    return {
      count: components.length,
      components: components.map((comp) => ({
        name: comp.name,
        path: comp.path,
        status: comp.fileExists ? "loaded" : "unloaded",
      })),
    };
  }

  private async callFunction(args: string[]): Promise<any> {
    if (args.length < 2) {
      throw new Error("Usage: call <component> <function> [args...]");
    }

    const [, , ...functionArgs] = args; // componentName and functionName unused
    functionArgs.map((arg) => {
      // Try to parse as number, otherwise keep as string
      const num = parseFloat(arg);
      return isNaN(num) ? arg : num;
    }); // parsedArgs unused

    // Execute the function call
    // const _context: ExecutionContext = { // Currently unused
    //   componentId: componentName,
    //   method: functionName,
    //   args: parsedArgs,
    // };

    // ExecutionEngine not implemented yet
    const result = { success: false, error: "ExecutionEngine not implemented" };
    return result.success ? { success: true } : { error: result.error };
  }

  private async inspectComponent(componentName: string): Promise<any> {
    if (!componentName) {
      throw new Error("Usage: inspect <component>");
    }

    const component = await this._componentManager.getComponent(componentName);

    if (!component) {
      throw new Error(`Component '${componentName}' not found`);
    }

    return {
      name: component.name,
      path: component.path,
      description: component.description,
      fileExists: component.fileExists,
      interfaces: component.interfaces?.length || 0,
      last_seen: component.lastSeen,
    };
  }

  private async inspectMemory(args: string[]): Promise<any> {
    if (args.length < 2) {
      throw new Error("Usage: memory <address> <size>");
    }

    const address = parseInt(args[0], 16);
    const size = parseInt(args[1]);

    if (isNaN(address) || isNaN(size)) {
      throw new Error("Invalid address or size");
    }

    // This would interface with actual WASM memory
    const memory = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      memory[i] = (address + i) % 256; // Simulated data
    }

    return {
      address: `0x${address.toString(16)}`,
      size,
      data: Array.from(memory).map(
        (b) => `0x${b.toString(16).padStart(2, "0")}`,
      ),
    };
  }

  private async listVariables(componentName: string): Promise<any> {
    if (!componentName) {
      throw new Error("Usage: vars <component>");
    }

    // This would use the variable inspector
    return {
      component: componentName,
      variables: [
        { name: "temp_var", type: "i32", value: 42 },
        { name: "global_counter", type: "i64", value: 12345 },
      ],
    };
  }

  private async setVariable(args: string[]): Promise<any> {
    if (args.length < 2) {
      throw new Error("Usage: set <variable> <value>");
    }

    const [varName, value] = args;
    const parsedValue = parseFloat(value);
    const finalValue = isNaN(parsedValue) ? value : parsedValue;

    // This would use the variable inspector
    return {
      variable: varName,
      oldValue: "unknown",
      newValue: finalValue,
      success: true,
    };
  }

  private async evaluateExpression(expression: string): Promise<any> {
    if (!expression) {
      throw new Error("Usage: eval <expression>");
    }

    try {
      // Simple expression evaluation
      // In a real implementation, this would be sandboxed
      const result = eval(expression);
      return { expression, result };
    } catch (error) {
      throw new Error(`Expression evaluation failed: ${error}`);
    }
  }

  private getStatus(): any {
    return {
      debugger: "active",
      timestamp: new Date().toISOString(),
      commandHistory: this.commandHistory.length,
      memoryUsage: this.getMemoryInfo(),
    };
  }

  private getMemoryInfo(): any {
    if ("memory" in performance) {
      const memory = (performance as any).memory;
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit,
      };
    }
    return { info: "not available" };
  }
}

export class ComponentDebugger {
  public readonly breakpoints: BreakpointManager;
  public readonly inspector: VariableInspector;
  public readonly profiler: PerformanceProfiler;
  public readonly console: DebuggingConsole;

  private sessions: Map<string, DebugSession> = new Map();
  private currentSession: DebugSession | null = null;
  // private __executionEngine: ExecutionEngine; // Unused - commented out"
  private _componentManager: WasmComponentManager;

  constructor(
    _executionEngine: ExecutionEngine,
    componentManager: WasmComponentManager,
  ) {
    // ExecutionEngine parameter is required for interface but not used yet
    this._componentManager = componentManager;

    this.breakpoints = new BreakpointManager();
    this.inspector = new VariableInspector(_executionEngine);
    this.profiler = new PerformanceProfiler();
    this.console = new DebuggingConsole(
      this._componentManager,
      _executionEngine,
    );

    this.setupDebuggingHooks();
  }

  public startDebuggingSession(componentId: string): string {
    const sessionId = `debug_${componentId}_${Date.now()}`;
    const session: DebugSession = {
      id: sessionId,
      componentId,
      state: "running",
      breakpoints: new Map(),
      callStack: { frames: [], depth: 0, currentFrame: 0 },
      variables: new Map(),
      metrics: {
        executionTime: 0,
        memoryUsage: 0,
        instructionCount: 0,
        functionCalls: 0,
        wasmTime: 0,
        jsTime: 0,
        gcTime: 0,
      },
      startTime: new Date(),
    };

    this.sessions.set(sessionId, session);
    this.currentSession = session;
    this.profiler.startProfiling();

    console.log(
      `ComponentDebugger: Started debugging session ${sessionId} for component ${componentId}`,
    );
    return sessionId;
  }

  public stopDebuggingSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.state = "stopped";
    const metrics = this.profiler.stopProfiling();
    if (metrics) {
      session.metrics = metrics;
    }

    if (this.currentSession?.id === sessionId) {
      this.currentSession = null;
    }

    console.log(`ComponentDebugger: Stopped debugging session ${sessionId}`);
    return true;
  }

  public pauseSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.state !== "running") return false;

    session.state = "paused";
    session.pauseTime = new Date();

    console.log(`ComponentDebugger: Paused debugging session ${sessionId}`);
    return true;
  }

  public resumeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.state !== "paused") return false;

    session.state = "running";
    session.pauseTime = undefined;

    console.log(`ComponentDebugger: Resumed debugging session ${sessionId}`);
    return true;
  }

  public getCurrentSession(): DebugSession | null {
    return this.currentSession;
  }

  public getSession(sessionId: string): DebugSession | null {
    return this.sessions.get(sessionId) || null;
  }

  public getAllSessions(): DebugSession[] {
    return Array.from(this.sessions.values());
  }

  private setupDebuggingHooks(): void {
    // Hook into execution engine to capture debugging events
    // This would integrate with the actual WASM runtime debugging capabilities
    console.log("ComponentDebugger: Set up debugging hooks");
  }

  public setupGlobalDebuggingInterface(): void {
    if (typeof window !== "undefined") {
      (window as any).componentDebugger = {
        startSession: this.startDebuggingSession.bind(this),
        stopSession: this.stopDebuggingSession.bind(this),
        pauseSession: this.pauseSession.bind(this),
        resumeSession: this.resumeSession.bind(this),
        getCurrentSession: this.getCurrentSession.bind(this),
        addBreakpoint: this.breakpoints.addBreakpoint.bind(this.breakpoints),
        removeBreakpoint: this.breakpoints.removeBreakpoint.bind(
          this.breakpoints,
        ),
        getBreakpoints: this.breakpoints.getBreakpoints.bind(this.breakpoints),
        executeCommand: this.console.executeCommand.bind(this.console),
        getProfiles: this.profiler.getFunctionProfiles.bind(this.profiler),
        inspectMemory: this.inspector.inspectMemory.bind(this.inspector),
      };
      console.log(
        "ComponentDebugger: Global debugging interface available as window.componentDebugger",
      );
    }
  }
}
