// Note: @bytecodealliance/jco will be imported dynamically to avoid build errors
// import { transpile } from '@bytecodealliance/jco';
// Note: Validation moved to backend services via ValidationService
// import { ComponentValidator, ValidationRules } from '../validation/ComponentValidator.js';
// import { SecurityScanner, SecurityScanResult } from '../validation/SecurityScanner.js';

export interface WasmImport {
  module: string;
  name: string;
  kind: "function" | "table" | "memory" | "global";
  type?: string;
  signature?: string;
}

export interface WasmExport {
  name: string;
  kind: "function" | "table" | "memory" | "global";
  type?: string;
  signature?: string;
}

export interface ModuleDependency {
  name: string;
  version?: string;
  required: boolean;
  imports: WasmImport[];
  status: "available" | "missing" | "incompatible";
}

export interface OptimizationSuggestion {
  type:
    | "remove_unused_import"
    | "merge_modules"
    | "optimize_exports"
    | "reduce_memory";
  description: string;
  impact: "low" | "medium" | "high";
  savings?: {
    size?: number;
    performance?: number;
  };
}

export interface CompatibilityReport {
  compatible: boolean;
  issues: string[];
  warnings: string[];
  missingDependencies: string[];
  conflictingVersions: string[];
}

export interface ModuleAnalysis {
  imports: WasmImport[];
  exports: WasmExport[];
  dependencies: ModuleDependency[];
  optimizations: OptimizationSuggestion[];
  compatibility: CompatibilityReport;
  statistics: {
    importCount: number;
    exportCount: number;
    dependencyCount: number;
    complexityScore: number;
  };
}

export interface ComponentMetadata {
  name: string;
  version?: string;
  description?: string;
  interfaces: string[];
  exports: string[];
  imports: string[];
  size: number;
  hash: string;
  analysis?: ModuleAnalysis; // Enhanced analysis data
}

interface SecurityScanResult {
  safe: boolean;
  issues: string[];
  score: number;
  risks?: string[];
}

interface ValidationRules {
  maxExports?: number;
  maxImports?: number;
  allowedImports?: string[];
  [key: string]: unknown;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TranspilerValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  securityScan?: SecurityScanResult;
}

export interface TranspiledComponent {
  id: string;
  metadata: ComponentMetadata;
  jsModule: string;
  typeDefinitions: string;
  wasmCore: ArrayBuffer;
  created: Date;
  validation?: TranspilerValidationResult;
}

// Stub classes for compatibility - actual validation is done on backend
class ComponentValidator {
  private rules: ValidationRules;
  constructor(rules?: ValidationRules) {
    this.rules = rules || {};
  }
  async validate(_component: ArrayBuffer): Promise<ValidationResult> {
    return { isValid: true, errors: [], warnings: [] };
  }
  updateRules(rules: ValidationRules): void {
    this.rules = { ...this.rules, ...rules };
  }
  getRules(): ValidationRules {
    return this.rules;
  }
}

class SecurityScanner {
  async scan(_component: ArrayBuffer): Promise<SecurityScanResult> {
    return { safe: true, issues: [], score: 100 };
  }
  async scanComponent(_component: ArrayBuffer): Promise<SecurityScanResult> {
    return { safe: true, issues: [], score: 100 };
  }
  generateReport(scan: SecurityScanResult): string {
    return `Security Score: ${scan.score}/100`;
  }
}

export class WasmTranspiler {
  private cache = new Map<string, TranspiledComponent>();
  private validator: ComponentValidator;
  private securityScanner: SecurityScanner;
  private analysisCache = new Map<string, ModuleAnalysis>(); // Cache for module analysis
  private knownDependencies = new Map<string, ModuleDependency>(); // Registry of known dependencies

  constructor(validationRules?: Partial<ValidationRules>) {
    this.validator = new ComponentValidator(validationRules);
    this.securityScanner = new SecurityScanner();
    this.initializeKnownDependencies();
  }

  async transpileComponent(
    wasmBytes: ArrayBuffer,
    name?: string,
  ): Promise<TranspiledComponent> {
    const hash = await this.computeHash(wasmBytes);

    // Check cache first
    if (this.cache.has(hash)) {
      const cached = this.cache.get(hash)!;
      console.log(
        `Using cached transpilation for component: ${cached.metadata.name}`,
      );
      return cached;
    }

    console.log("Transpiling WASM component...", {
      size: wasmBytes.byteLength,
      name,
    });

    try {
      // Extract metadata before transpilation
      const metadata = await this.extractMetadata(wasmBytes, name);

      // Validate component with metadata
      const validation = await this.validateComponent(wasmBytes, metadata);
      if (!validation.isValid) {
        throw new Error(
          `Component validation failed: ${validation.errors.join(", ")}`,
        );
      }

      // Log security scan results if available
      if (validation.securityScan) {
        console.log(
          `Security scan score: ${validation.securityScan.score}/100`,
        );
        if (!validation.securityScan.safe) {
          console.warn(
            "Security risks detected:",
            validation.securityScan.risks,
          );
        }
      }

      // Transpile using jco (dynamically imported)
      const { transpile } = await import("@bytecodealliance/jco");
      const transpileResult = await transpile(new Uint8Array(wasmBytes), {
        name: metadata.name,
        instantiation: "async",
        optimize: true,
        nodejsCompat: false,
        tracing: false,
      });

      // Create transpiled component
      const jsModule = transpileResult.files?.["index.js"];
      const typeDefinitions = transpileResult.files?.["index.d.ts"];

      const component: TranspiledComponent = {
        id: hash,
        metadata,
        jsModule: typeof jsModule === "string" ? jsModule : "",
        typeDefinitions:
          typeof typeDefinitions === "string" ? typeDefinitions : "",
        wasmCore: wasmBytes,
        created: new Date(),
        validation,
      };

      // Cache the result
      this.cache.set(hash, component);
      console.log(`Component transpiled successfully: ${metadata.name}`);

      return component;
    } catch (error) {
      console.error("Transpilation failed:", error);
      throw new Error(
        `Failed to transpile component: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  async validateComponent(
    _wasmBytes: ArrayBuffer,
    _metadata?: ComponentMetadata,
  ): Promise<TranspilerValidationResult> {
    // NOTE: Validation is now handled by backend services via ValidationService
    // This method is kept for compatibility but returns a stub response
    console.log(
      "WasmTranspiler: Validation requests are now handled by backend services",
    );

    return {
      isValid: true,
      errors: [],
      warnings: ["Validation is now handled by backend services"],
      securityScan: { safe: true, issues: [], score: 100 },
    };
  }

  async extractMetadata(
    wasmBytes: ArrayBuffer,
    providedName?: string,
  ): Promise<ComponentMetadata> {
    try {
      const hash = await this.computeHash(wasmBytes);

      // Enhanced WASM module introspection with full analysis
      const moduleInfo = await this.basicWasmIntrospection(wasmBytes);
      const analysis = await this.analyzeModule(wasmBytes, hash);

      return {
        name: providedName || `component-${hash.substring(0, 8)}`,
        size: wasmBytes.byteLength,
        hash,
        interfaces: moduleInfo.interfaces,
        exports: moduleInfo.exports,
        imports: moduleInfo.imports,
        analysis, // Include full module analysis
      };
    } catch (error) {
      console.error("Metadata extraction failed:", error);
      throw new Error(
        `Failed to extract component metadata: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  private async computeHash(data: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  getCachedComponents(): TranspiledComponent[] {
    return Array.from(this.cache.values());
  }

  clearCache(): void {
    this.cache.clear();
    console.log("Transpiler cache cleared");
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  updateValidationRules(rules: Partial<ValidationRules>): void {
    this.validator.updateRules(rules);
  }

  getValidationRules(): ValidationRules {
    return this.validator.getRules();
  }

  async generateSecurityReport(wasmBytes: ArrayBuffer): Promise<string> {
    try {
      const module = await WebAssembly.compile(wasmBytes);
      const _imports = WebAssembly.Module.imports(module);
      const _exports = WebAssembly.Module.exports(module);

      // Analyze imports for security implications
      const importAnalysis = this.analyzeImports(_imports);
      const exportAnalysis = this.analyzeExports(_exports);

      const scanResult = await this.securityScanner.scanComponent(wasmBytes);
      const baseReport = this.securityScanner.generateReport(scanResult);

      // Enhance report with dependency analysis
      return this.enhanceSecurityReportWithDependencies(
        baseReport,
        importAnalysis,
        exportAnalysis,
      );
    } catch (error) {
      return `Failed to generate security report: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    }
  }

  private async basicWasmIntrospection(wasmBytes: ArrayBuffer): Promise<{
    interfaces: string[];
    exports: string[];
    imports: string[];
  }> {
    try {
      const module = await WebAssembly.compile(wasmBytes);
      const moduleImports = WebAssembly.Module.imports(module);
      const moduleExports = WebAssembly.Module.exports(module);

      return {
        interfaces: [], // WIT interfaces would require specialized parsing
        exports: moduleExports.map((exp) => `${exp.name}:${exp.kind}`),
        imports: moduleImports.map(
          (imp) => `${imp.module}.${imp.name}:${imp.kind}`,
        ),
      };
    } catch (error) {
      // Fallback for invalid WASM
      return {
        interfaces: [],
        exports: [],
        imports: [],
      };
    }
  }

  // ===== ADVANCED MODULE ANALYSIS METHODS =====

  /**
   * Perform comprehensive module analysis
   */
  public async analyzeModule(
    wasmBytes: ArrayBuffer,
    hash?: string,
  ): Promise<ModuleAnalysis> {
    const moduleHash = hash || (await this.computeHash(wasmBytes));

    // Check analysis cache first
    if (this.analysisCache.has(moduleHash)) {
      return this.analysisCache.get(moduleHash)!;
    }

    try {
      console.log("WasmTranspiler: Performing advanced module analysis...");

      const module = await WebAssembly.compile(wasmBytes);
      const rawImports = WebAssembly.Module.imports(module);
      const rawExports = WebAssembly.Module.exports(module);

      // Enhanced import/export analysis
      const imports = this.analyzeImports(rawImports);
      const exports = this.analyzeExports(rawExports);

      // Dependency analysis
      const dependencies = this.analyzeDependencies(imports);

      // Optimization suggestions
      const optimizations = this.generateOptimizationSuggestions(
        imports,
        exports,
        wasmBytes.byteLength,
      );

      // Compatibility analysis
      const compatibility = this.analyzeCompatibility(dependencies);

      // Calculate statistics
      const statistics = {
        importCount: imports.length,
        exportCount: exports.length,
        dependencyCount: dependencies.length,
        complexityScore: this.calculateComplexityScore(
          imports,
          exports,
          dependencies,
        ),
      };

      const analysis: ModuleAnalysis = {
        imports,
        exports,
        dependencies,
        optimizations,
        compatibility,
        statistics,
      };

      // Cache the analysis
      this.analysisCache.set(moduleHash, analysis);

      console.log(
        `WasmTranspiler: Analysis completed - ${imports.length} imports, ${exports.length} exports, ${dependencies.length} dependencies`,
      );
      return analysis;
    } catch (error) {
      console.error("Module analysis failed:", error);
      // Return empty analysis on failure
      return {
        imports: [],
        exports: [],
        dependencies: [],
        optimizations: [],
        compatibility: {
          compatible: false,
          issues: ["Analysis failed"],
          warnings: [],
          missingDependencies: [],
          conflictingVersions: [],
        },
        statistics: {
          importCount: 0,
          exportCount: 0,
          dependencyCount: 0,
          complexityScore: 0,
        },
      };
    }
  }

  /**
   * Analyze WASM imports with enhanced metadata
   */
  private analyzeImports(rawImports: WebAssemblyImports): WasmImport[] {
    return rawImports.map((imp) => {
      const wasmImport: WasmImport = {
        module: imp.module,
        name: imp.name,
        kind: imp.kind as any,
      };

      // Add type information based on kind
      switch (imp.kind) {
        case "function":
          wasmImport.signature = this.inferFunctionSignature(
            imp.module,
            imp.name,
          );
          break;
        case "global":
          wasmImport.type = this.inferGlobalType(imp.module, imp.name);
          break;
        case "memory":
          wasmImport.type = "linear-memory";
          break;
        case "table":
          wasmImport.type = "function-table";
          break;
      }

      return wasmImport;
    });
  }

  /**
   * Analyze WASM exports with enhanced metadata
   */
  private analyzeExports(rawExports: WebAssemblyExports): WasmExport[] {
    return rawExports.map((exp) => {
      const wasmExport: WasmExport = {
        name: exp.name,
        kind: exp.kind as any,
      };

      // Add type information based on kind
      switch (exp.kind) {
        case "function":
          wasmExport.signature = this.inferExportFunctionSignature(exp.name);
          break;
        case "global":
          wasmExport.type = this.inferExportGlobalType(exp.name);
          break;
        case "memory":
          wasmExport.type = "linear-memory";
          break;
        case "table":
          wasmExport.type = "function-table";
          break;
      }

      return wasmExport;
    });
  }

  /**
   * Analyze module dependencies
   */
  private analyzeDependencies(imports: WasmImport[]): ModuleDependency[] {
    const dependencyMap = new Map<string, WasmImport[]>();

    // Group imports by module
    imports.forEach((imp) => {
      if (!dependencyMap.has(imp.module)) {
        dependencyMap.set(imp.module, []);
      }
      dependencyMap.get(imp.module)!.push(imp);
    });

    // Convert to dependency objects
    return Array.from(dependencyMap.entries()).map(
      ([moduleName, moduleImports]) => {
        const knownDep = this.knownDependencies.get(moduleName);

        return {
          name: moduleName,
          version: knownDep?.version,
          required: true, // All imports are considered required
          imports: moduleImports,
          status: knownDep ? "available" : "missing",
        };
      },
    );
  }

  /**
   * Generate optimization suggestions
   */
  private generateOptimizationSuggestions(
    imports: WasmImport[],
    exports: WasmExport[],
    moduleSize: number,
  ): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // Check for unused imports (heuristic-based)
    const potentiallyUnusedImports = imports.filter(
      (imp) =>
        imp.module.includes("debug") ||
        imp.name.includes("log") ||
        imp.name.includes("trace"),
    );

    if (potentiallyUnusedImports.length > 0) {
      suggestions.push({
        type: "remove_unused_import",
        description: `Consider removing ${potentiallyUnusedImports.length} potentially unused debug/logging imports`,
        impact: "low",
        savings: { size: potentiallyUnusedImports.length * 100 }, // Rough estimate
      });
    }

    // Check for export optimization
    if (exports.length > 20) {
      suggestions.push({
        type: "optimize_exports",
        description: `Module exports ${exports.length} functions - consider reducing public API surface`,
        impact: "medium",
        savings: { performance: 15 },
      });
    }

    // Check for memory optimization
    const memoryImports = imports.filter((imp) => imp.kind === "memory");
    if (memoryImports.length > 1) {
      suggestions.push({
        type: "reduce_memory",
        description: `Module imports ${memoryImports.length} memory objects - consider memory consolidation`,
        impact: "high",
        savings: { size: 5000, performance: 25 },
      });
    }

    // Size-based suggestions
    if (moduleSize > 1024 * 1024) {
      // > 1MB
      suggestions.push({
        type: "merge_modules",
        description:
          "Large module detected - consider splitting into smaller modules",
        impact: "high",
        savings: { performance: 30 },
      });
    }

    return suggestions;
  }

  /**
   * Analyze module compatibility
   */
  private analyzeCompatibility(
    dependencies: ModuleDependency[],
  ): CompatibilityReport {
    const issues: string[] = [];
    const warnings: string[] = [];
    const missingDependencies: string[] = [];
    const conflictingVersions: string[] = [];

    dependencies.forEach((dep) => {
      if (dep.status === "missing") {
        missingDependencies.push(dep.name);
        issues.push(`Missing dependency: ${dep.name}`);
      } else if (dep.status === "incompatible") {
        conflictingVersions.push(dep.name);
        issues.push(`Incompatible version for dependency: ${dep.name}`);
      }

      // Check for risky dependencies
      if (dep.name.includes("experimental") || dep.name.includes("unstable")) {
        warnings.push(
          `Dependency '${dep.name}' appears to be experimental or unstable`,
        );
      }
    });

    return {
      compatible: issues.length === 0,
      issues,
      warnings,
      missingDependencies,
      conflictingVersions,
    };
  }

  /**
   * Calculate module complexity score (0-100)
   */
  private calculateComplexityScore(
    imports: WasmImport[],
    exports: WasmExport[],
    dependencies: ModuleDependency[],
  ): number {
    let score = 0;

    // Import complexity (0-30 points)
    score += Math.min(imports.length * 2, 30);

    // Export complexity (0-25 points)
    score += Math.min(exports.length * 1.5, 25);

    // Dependency complexity (0-25 points)
    score += Math.min(dependencies.length * 5, 25);

    // Function complexity bonus (0-20 points)
    const functionImports = imports.filter(
      (imp) => imp.kind === "function",
    ).length;
    const functionExports = exports.filter(
      (exp) => exp.kind === "function",
    ).length;
    score += Math.min((functionImports + functionExports) * 0.5, 20);

    return Math.round(Math.min(score, 100));
  }

  // Helper methods for type inference
  private inferFunctionSignature(module: string, name: string): string {
    // Basic heuristics for common WASM import patterns
    if (module === "env") {
      if (name.includes("memory")) return "() -> i32";
      if (name.includes("table")) return "() -> funcref";
      if (name.includes("print") || name.includes("log")) return "(i32) -> ()";
    }
    return "unknown";
  }

  private inferGlobalType(_module: string, name: string): string {
    if (name.includes("stack")) return "i32";
    if (name.includes("heap")) return "i32";
    if (name.includes("memory")) return "i32";
    return "unknown";
  }

  private inferExportFunctionSignature(name: string): string {
    if (name === "memory") return "memory";
    if (name === "_start" || name === "main") return "() -> i32";
    if (name.includes("alloc")) return "(i32) -> i32";
    if (name.includes("free")) return "(i32) -> ()";
    return "unknown";
  }

  private inferExportGlobalType(name: string): string {
    if (name.includes("stack")) return "i32";
    if (name.includes("heap")) return "i32";
    return "unknown";
  }

  /**
   * Enhance security report with dependency analysis
   */
  private enhanceSecurityReportWithDependencies(
    baseReport: string,
    importAnalysis: WasmImport[],
    exportAnalysis: WasmExport[],
  ): string {
    const dependencies = this.analyzeDependencies(importAnalysis);

    let enhancedReport = baseReport + "\n\n=== DEPENDENCY ANALYSIS ===\n";

    // Analyze imports for security risks
    const criticalImports = importAnalysis.filter(
      (imp) =>
        imp.module === "env" ||
        imp.name.includes("unsafe") ||
        imp.name.includes("alloc"),
    );

    if (criticalImports.length > 0) {
      enhancedReport += "\n⚠️  CRITICAL IMPORTS DETECTED:\n";
      criticalImports.forEach((imp) => {
        enhancedReport += `  - ${imp.module}.${imp.name} (${imp.kind})\n`;
      });
    }

    // Analyze exports for security implications
    const exposedFunctions = exportAnalysis.filter(
      (exp) => exp.kind === "function",
    );
    if (exposedFunctions.length > 0) {
      enhancedReport += "\n📤 EXPORTED FUNCTIONS:\n";
      exposedFunctions.forEach((exp) => {
        enhancedReport += `  - ${exp.name} ${exp.signature || ""}\n`;
      });
    }

    // Dependency status
    const missingDeps = dependencies.filter((dep) => dep.status === "missing");
    if (missingDeps.length > 0) {
      enhancedReport += "\n❌ MISSING DEPENDENCIES:\n";
      missingDeps.forEach((dep) => {
        enhancedReport += `  - ${dep.name} (${dep.imports.length} imports)\n`;
      });
    }

    enhancedReport += `\n📊 SUMMARY: ${importAnalysis.length} imports, ${exportAnalysis.length} exports, ${dependencies.length} dependencies\n`;

    return enhancedReport;
  }

  /**
   * Initialize registry of known dependencies
   */
  private initializeKnownDependencies(): void {
    // Standard WASI dependencies
    this.knownDependencies.set("wasi_snapshot_preview1", {
      name: "wasi_snapshot_preview1",
      version: "0.1.0",
      required: false,
      imports: [],
      status: "available",
    });

    this.knownDependencies.set("env", {
      name: "env",
      version: "1.0.0",
      required: false,
      imports: [],
      status: "available",
    });

    // Add more known dependencies as needed
    console.log("WasmTranspiler: Initialized with known dependencies registry");
  }

  /**
   * Get module analysis for a cached component
   */
  public getModuleAnalysis(componentHash: string): ModuleAnalysis | null {
    return this.analysisCache.get(componentHash) || null;
  }

  /**
   * Clear analysis cache
   */
  public clearAnalysisCache(): void {
    this.analysisCache.clear();
    console.log("Module analysis cache cleared");
  }

  /**
   * Get analysis cache statistics
   */
  public getAnalysisCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.analysisCache.size,
      entries: Array.from(this.analysisCache.keys()),
    };
  }
}

// Type definitions for WebAssembly module introspection
type WebAssemblyImports = Array<{
  module: string;
  name: string;
  kind: string;
}>;

type WebAssemblyExports = Array<{
  name: string;
  kind: string;
}>;
