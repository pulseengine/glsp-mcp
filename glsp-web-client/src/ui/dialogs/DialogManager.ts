/**
 * Dialog Manager Service
 * Central service for managing all application dialogs with professional styling
 */

import { BaseDialog } from "./base/BaseDialog.js";

export interface DialogResult<T = unknown> {
  confirmed: boolean;
  value?: T;
  cancelled?: boolean;
}

export interface DialogQueueItem {
  id: string;
  dialog: BaseDialog;
  resolve: (result: DialogResult<unknown>) => void;
  reject: (error: Error) => void;
}

export class DialogManager {
  private static instance: DialogManager;
  private dialogQueue: DialogQueueItem[] = [];
  private activeDialog: DialogQueueItem | null = null;
  private nextDialogId: number = 1;
  private baseZIndex: number = 10000;

  private constructor() {
    // Singleton pattern
  }

  public static getInstance(): DialogManager {
    if (!DialogManager.instance) {
      DialogManager.instance = new DialogManager();
    }
    return DialogManager.instance;
  }

  /**
   * Show a dialog and return a promise that resolves with the result
   */
  public async showDialog<T = unknown>(
    dialog: BaseDialog,
  ): Promise<DialogResult<T>> {
    return new Promise((resolve, reject) => {
      const dialogId = `dialog-${this.nextDialogId++}`;

      const queueItem: DialogQueueItem = {
        id: dialogId,
        dialog,
        resolve: resolve as (result: DialogResult<unknown>) => void,
        reject,
      };

      // Set up dialog event handlers
      this.setupDialogEvents(queueItem);

      // Add to queue
      this.dialogQueue.push(queueItem);

      // Process queue
      this.processQueue();
    });
  }

  /**
   * Close the active dialog with a result
   */
  public closeActiveDialog(result: DialogResult): void {
    if (this.activeDialog) {
      this.activeDialog.dialog.close();
      this.activeDialog.resolve(result);
      this.activeDialog = null;

      // Process next dialog in queue
      this.processQueue();
    }
  }

  /**
   * Cancel the active dialog
   */
  public cancelActiveDialog(): void {
    if (this.activeDialog) {
      this.closeActiveDialog({ confirmed: false, cancelled: true });
    }
  }

  /**
   * Close all dialogs
   */
  public closeAllDialogs(): void {
    // Cancel active dialog
    if (this.activeDialog) {
      this.cancelActiveDialog();
    }

    // Cancel all queued dialogs
    this.dialogQueue.forEach((item) => {
      item.reject(new Error("Dialog cancelled - all dialogs closed"));
    });
    this.dialogQueue = [];
  }

  /**
   * Get the number of dialogs in queue
   */
  public getQueueLength(): number {
    return this.dialogQueue.length + (this.activeDialog ? 1 : 0);
  }

  /**
   * Check if a dialog is currently active
   */
  public isDialogActive(): boolean {
    return this.activeDialog !== null;
  }

  private setupDialogEvents(queueItem: DialogQueueItem): void {
    const { dialog } = queueItem;

    // Handle dialog close
    dialog.setOnCloseCallback(() => {
      if (this.activeDialog === queueItem) {
        this.closeActiveDialog({ confirmed: false, cancelled: true });
      }
    });

    // Handle ESC key globally when dialog is active
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && this.activeDialog === queueItem) {
        this.cancelActiveDialog();
      }
    };

    // Add escape listener when dialog becomes active
    dialog.setOnShowCallback(() => {
      document.addEventListener("keydown", handleEscape);
    });

    // Remove escape listener when dialog closes
    dialog.setOnCloseCallback(() => {
      document.removeEventListener("keydown", handleEscape);
    });
  }

  private processQueue(): void {
    // If there's already an active dialog, wait
    if (this.activeDialog) {
      return;
    }

    // Get next dialog from queue
    const nextDialog = this.dialogQueue.shift();
    if (!nextDialog) {
      return;
    }

    // Set as active and show
    this.activeDialog = nextDialog;

    // Set z-index higher than any existing dialogs
    const zIndex = this.baseZIndex + this.nextDialogId;
    nextDialog.dialog.setZIndex(zIndex);

    // Show the dialog
    nextDialog.dialog.show();
  }

  /**
   * Create a backdrop element for modal behavior
   */
  public createBackdrop(onClick?: () => void): HTMLElement {
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";
    backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: ${this.baseZIndex - 1};
            /* backdrop-filter: blur(2px); */ /* Removed to prevent dialog blur issues */
            animation: fadeIn 0.2s ease-out;
        `;

    if (onClick) {
      backdrop.addEventListener("click", onClick);
    }

    // Add CSS animation
    const style = document.createElement("style");
    style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        `;
    document.head.appendChild(style);

    document.body.appendChild(backdrop);
    return backdrop;
  }

  /**
   * Remove backdrop element
   */
  public removeBackdrop(backdrop: HTMLElement): void {
    backdrop.style.animation = "fadeOut 0.2s ease-out";
    setTimeout(() => {
      if (backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop);
      }
    }, 200);
  }
}

// Export singleton instance
export const dialogManager = DialogManager.getInstance();
