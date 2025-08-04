/**
 * Workspace Operation Result Management
 * Handles operation feedback, progress tracking, and result notification
 */

export interface WorkspaceOperationResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: Error;
  retryable?: boolean;
  duration?: number;
}

export interface WorkspaceOperation {
  id: string;
  type:
    | "create"
    | "select"
    | "delete"
    | "validate"
    | "browse"
    | "import"
    | "export";
  timestamp: number;
  result?: WorkspaceOperationResult;
  progress?: {
    current: number;
    total: number;
    message: string;
  };
}

export interface OperationProgress {
  current: number;
  total: number;
  message: string;
  percentage: number;
}

export class WorkspaceOperationManager {
  private static instance: WorkspaceOperationManager;
  private operations: Map<string, WorkspaceOperation> = new Map();
  private progressCallbacks: Map<
    string,
    (progress: OperationProgress) => void
  > = new Map();
  private resultCallbacks: Map<
    string,
    (result: WorkspaceOperationResult) => void
  > = new Map();

  private constructor() {}

  public static getInstance(): WorkspaceOperationManager {
    if (!WorkspaceOperationManager.instance) {
      WorkspaceOperationManager.instance = new WorkspaceOperationManager();
    }
    return WorkspaceOperationManager.instance;
  }

  /**
   * Start a new workspace operation
   */
  public startOperation(
    type: WorkspaceOperation["type"],
    _metadata?: any,
  ): string {
    const operation: WorkspaceOperation = {
      id: this.generateOperationId(),
      type,
      timestamp: Date.now(),
      progress: {
        current: 0,
        total: 100,
        message: this.getInitialMessage(type),
      },
    };

    this.operations.set(operation.id, operation);
    this.notifyProgress(operation.id);

    console.log(
      `[WorkspaceOperation] Started ${type} operation:`,
      operation.id,
    );
    return operation.id;
  }

  /**
   * Update operation progress
   */
  public updateProgress(
    operationId: string,
    current: number,
    total: number = 100,
    message?: string,
  ): void {
    const operation = this.operations.get(operationId);
    if (!operation) {
      console.warn(`[WorkspaceOperation] Operation not found: ${operationId}`);
      return;
    }

    operation.progress = {
      current: Math.min(current, total),
      total,
      message: message || operation.progress?.message || "Processing...",
    };

    this.notifyProgress(operationId);
  }

  /**
   * Complete operation with result
   */
  public completeOperation(
    operationId: string,
    result: WorkspaceOperationResult,
  ): void {
    const operation = this.operations.get(operationId);
    if (!operation) {
      console.warn(`[WorkspaceOperation] Operation not found: ${operationId}`);
      return;
    }

    operation.result = {
      ...result,
      duration: Date.now() - operation.timestamp,
    };

    // Set progress to 100% on completion
    if (operation.progress) {
      operation.progress.current = operation.progress.total;
      operation.progress.message = result.success
        ? "Completed successfully"
        : "Operation failed";
    }

    this.notifyProgress(operationId);
    this.notifyResult(operationId, operation.result);

    console.log(`[WorkspaceOperation] Completed ${operation.type} operation:`, {
      id: operationId,
      success: result.success,
      duration: operation.result.duration,
    });
  }

  /**
   * Register progress callback
   */
  public onProgress(
    operationId: string,
    callback: (progress: OperationProgress) => void,
  ): void {
    this.progressCallbacks.set(operationId, callback);
  }

  /**
   * Register result callback
   */
  public onResult(
    operationId: string,
    callback: (result: WorkspaceOperationResult) => void,
  ): void {
    this.resultCallbacks.set(operationId, callback);
  }

  /**
   * Remove callbacks for completed operation
   */
  public cleanupOperation(operationId: string): void {
    this.progressCallbacks.delete(operationId);
    this.resultCallbacks.delete(operationId);

    // Keep operation in history for debugging but remove callbacks
    console.log(
      `[WorkspaceOperation] Cleaned up callbacks for: ${operationId}`,
    );
  }

  /**
   * Get operation by ID
   */
  public getOperation(operationId: string): WorkspaceOperation | undefined {
    return this.operations.get(operationId);
  }

  /**
   * Get all operations (for debugging/history)
   */
  public getAllOperations(): WorkspaceOperation[] {
    return Array.from(this.operations.values()).sort(
      (a, b) => b.timestamp - a.timestamp,
    );
  }

  /**
   * Get operations by type
   */
  public getOperationsByType(
    type: WorkspaceOperation["type"],
  ): WorkspaceOperation[] {
    return this.getAllOperations().filter((op) => op.type === type);
  }

  /**
   * Get recent operations (last 24 hours)
   */
  public getRecentOperations(hours: number = 24): WorkspaceOperation[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this.getAllOperations().filter((op) => op.timestamp > cutoff);
  }

  /**
   * Get failed operations
   */
  public getFailedOperations(): WorkspaceOperation[] {
    return this.getAllOperations().filter(
      (op) => op.result && !op.result.success,
    );
  }

  /**
   * Get retryable failed operations
   */
  public getRetryableOperations(): WorkspaceOperation[] {
    return this.getFailedOperations().filter((op) => op.result?.retryable);
  }

  /**
   * Clear operation history
   */
  public clearHistory(): void {
    this.operations.clear();
    this.progressCallbacks.clear();
    this.resultCallbacks.clear();
    console.log("[WorkspaceOperation] Cleared operation history");
  }

  /**
   * Get operation statistics
   */
  public getStatistics(): {
    total: number;
    successful: number;
    failed: number;
    pending: number;
    averageDuration: number;
    operationTypes: Record<string, number>;
  } {
    const operations = this.getAllOperations();
    const completed = operations.filter((op) => op.result);
    const successful = completed.filter((op) => op.result!.success);
    const failed = completed.filter((op) => op.result && !op.result.success);
    const pending = operations.filter((op) => !op.result);

    const totalDuration = completed.reduce(
      (sum, op) => sum + (op.result!.duration || 0),
      0,
    );
    const averageDuration =
      completed.length > 0 ? totalDuration / completed.length : 0;

    const operationTypes: Record<string, number> = {};
    operations.forEach((op) => {
      operationTypes[op.type] = (operationTypes[op.type] || 0) + 1;
    });

    return {
      total: operations.length,
      successful: successful.length,
      failed: failed.length,
      pending: pending.length,
      averageDuration,
      operationTypes,
    };
  }

  // Private helper methods

  private generateOperationId(): string {
    return `workspace_op_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }

  private getInitialMessage(type: WorkspaceOperation["type"]): string {
    const messages: Record<WorkspaceOperation["type"], string> = {
      create: "Creating workspace...",
      select: "Selecting workspace...",
      delete: "Deleting workspace...",
      validate: "Validating workspace...",
      browse: "Browsing workspaces...",
      import: "Importing workspace...",
      export: "Exporting workspace...",
    };
    return messages[type] || "Processing...";
  }

  private notifyProgress(operationId: string): void {
    const operation = this.operations.get(operationId);
    const callback = this.progressCallbacks.get(operationId);

    if (operation?.progress && callback) {
      const progress: OperationProgress = {
        ...operation.progress,
        percentage: Math.round(
          (operation.progress.current / operation.progress.total) * 100,
        ),
      };
      callback(progress);
    }
  }

  private notifyResult(
    operationId: string,
    result: WorkspaceOperationResult,
  ): void {
    const callback = this.resultCallbacks.get(operationId);
    if (callback) {
      callback(result);
    }
  }
}

// Singleton instance export
export const workspaceOperationManager =
  WorkspaceOperationManager.getInstance();
