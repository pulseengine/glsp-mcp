/**
 * Interface Compatibility System for WASM Component Interface Linking
 * Handles WIT interface matching and connection validation
 */

export interface WitInterface {
  name: string;
  interface_type: "import" | "export";
  functions: WitFunction[];
  types?: WitType[];
}

export interface WitFunction {
  name: string;
  params: WitParam[];
  results?: WitParam[];
}

export interface WitParam {
  name: string;
  param_type: string | WitTypeRef;
}

export interface WitType {
  name: string;
  kind: "record" | "enum" | "variant" | "flags" | "resource" | "alias";
  fields?: Array<{ name: string; type: string | WitTypeRef }>;
}

export interface WitTypeRef {
  type: string;
  namespace?: string;
}

export interface InterfaceCompatibility {
  isValid: boolean;
  score: number; // 0-100, higher is better match
  issues: string[];
  matchedFunctions: number;
  totalFunctions: number;
}

export interface InterfaceConnection {
  sourceComponentId: string;
  sourceInterface: WitInterface;
  targetComponentId: string;
  targetInterface: WitInterface;
  compatibility: InterfaceCompatibility;
}

export class InterfaceCompatibilityChecker {
  /**
   * Check if two interfaces can be connected
   * Export interfaces can connect to Import interfaces
   */
  static canConnect(
    sourceInterface: WitInterface,
    targetInterface: WitInterface,
  ): boolean {
    // Rule 1: Export can connect to Import (but not the reverse)
    if (
      sourceInterface.interface_type === "export" &&
      targetInterface.interface_type === "import"
    ) {
      return true;
    }

    // Rule 2: Import can also connect to Export (bidirectional for flexibility)
    if (
      sourceInterface.interface_type === "import" &&
      targetInterface.interface_type === "export"
    ) {
      return true;
    }

    return false;
  }

  /**
   * Calculate compatibility between two interfaces
   */
  static calculateCompatibility(
    sourceInterface: WitInterface,
    targetInterface: WitInterface,
  ): InterfaceCompatibility {
    const issues: string[] = [];
    let score = 0;
    let matchedFunctions = 0;

    // Basic connection rule check
    if (!this.canConnect(sourceInterface, targetInterface)) {
      return {
        isValid: false,
        score: 0,
        issues: [
          "Incompatible interface types: cannot connect " +
            sourceInterface.interface_type +
            " to " +
            targetInterface.interface_type,
        ],
        matchedFunctions: 0,
        totalFunctions: Math.max(
          sourceInterface.functions?.length || 0,
          targetInterface.functions?.length || 0,
        ),
      };
    }

    // Interface name compatibility
    if (
      this.areInterfaceNamesCompatible(
        sourceInterface.name,
        targetInterface.name,
      )
    ) {
      score += 30;
    } else {
      issues.push(
        `Interface names don't match: "${sourceInterface.name}" vs "${targetInterface.name}"`,
      );
    }

    // Function compatibility
    const functionResult = this.compareFunctions(
      sourceInterface.functions || [],
      targetInterface.functions || [],
    );
    matchedFunctions = functionResult.matched;
    score += functionResult.score;
    issues.push(...functionResult.issues);

    // Calculate final validity
    const isValid =
      issues.length === 0 || (score >= 50 && matchedFunctions > 0);

    return {
      isValid,
      score: Math.min(100, score),
      issues,
      matchedFunctions,
      totalFunctions: Math.max(
        sourceInterface.functions?.length || 0,
        targetInterface.functions?.length || 0,
      ),
    };
  }

  /**
   * Check if interface names are compatible
   */
  private static areInterfaceNamesCompatible(
    name1: string,
    name2: string,
  ): boolean {
    // Exact match
    if (name1 === name2) return true;

    // Normalize names (remove common prefixes/suffixes, convert - to _)
    const normalize = (name: string) =>
      name
        .toLowerCase()
        .replace(/[-_]/g, "")
        .replace(/^(wasi|adas|component):?/, "")
        .replace(/(interface|api|service)$/, "");

    return normalize(name1) === normalize(name2);
  }

  /**
   * Compare function signatures between interfaces
   */
  private static compareFunctions(
    sourceFunctions: WitFunction[],
    targetFunctions: WitFunction[],
  ): { matched: number; score: number; issues: string[] } {
    const issues: string[] = [];
    let matched = 0;
    let score = 0;

    if (sourceFunctions.length === 0 && targetFunctions.length === 0) {
      return {
        matched: 0,
        score: 20,
        issues: ["Both interfaces have no functions"],
      };
    }

    for (const sourceFunc of sourceFunctions) {
      const targetFunc = targetFunctions.find(
        (f) => f.name === sourceFunc.name,
      );

      if (targetFunc) {
        matched++;
        const funcCompatibility = this.compareFunctionSignatures(
          sourceFunc,
          targetFunc,
        );
        if (funcCompatibility.isCompatible) {
          score += 10; // Each matching function adds 10 points
        } else {
          issues.push(
            `Function "${sourceFunc.name}": ${funcCompatibility.issue}`,
          );
        }
      } else {
        issues.push(
          `Function "${sourceFunc.name}" not found in target interface`,
        );
      }
    }

    // Bonus for having all functions match
    if (
      matched === sourceFunctions.length &&
      matched === targetFunctions.length
    ) {
      score += 20;
    }

    return { matched, score, issues };
  }

  /**
   * Compare individual function signatures
   */
  private static compareFunctionSignatures(
    sourceFunc: WitFunction,
    targetFunc: WitFunction,
  ): { isCompatible: boolean; issue?: string } {
    // For now, do basic parameter count checking
    // In a full implementation, this would do deep type checking

    const sourceParamCount = sourceFunc.params?.length || 0;
    const targetParamCount = targetFunc.params?.length || 0;

    if (sourceParamCount !== targetParamCount) {
      return {
        isCompatible: false,
        issue: `Parameter count mismatch: ${sourceParamCount} vs ${targetParamCount}`,
      };
    }

    const sourceResultCount = sourceFunc.results?.length || 0;
    const targetResultCount = targetFunc.results?.length || 0;

    if (sourceResultCount !== targetResultCount) {
      return {
        isCompatible: false,
        issue: `Return value count mismatch: ${sourceResultCount} vs ${targetResultCount}`,
      };
    }

    return { isCompatible: true };
  }

  /**
   * Alias for calculateCompatibility for backward compatibility
   */
  static checkCompatibility(
    sourceInterface: WitInterface,
    targetInterface: WitInterface,
  ): InterfaceCompatibility {
    return this.calculateCompatibility(sourceInterface, targetInterface);
  }

  /**
   * Find all compatible interfaces for a given source interface
   */
  static findCompatibleInterfaces(
    sourceInterface: WitInterface,
    availableInterfaces: { componentId: string; interface: WitInterface }[],
  ): Array<{
    componentId: string;
    interface: WitInterface;
    compatibility: InterfaceCompatibility;
  }> {
    return availableInterfaces
      .filter((target) => target.interface.name !== sourceInterface.name) // Don't connect to self
      .map((target) => ({
        componentId: target.componentId,
        interface: target.interface,
        compatibility: this.calculateCompatibility(
          sourceInterface,
          target.interface,
        ),
      }))
      .filter(
        (result) =>
          result.compatibility.isValid || result.compatibility.score > 30,
      )
      .sort((a, b) => b.compatibility.score - a.compatibility.score); // Best matches first
  }
}
