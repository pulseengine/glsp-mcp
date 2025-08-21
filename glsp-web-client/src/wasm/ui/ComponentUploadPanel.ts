import {
  ComponentUploadService,
  UploadProgress as ServiceUploadProgress,
} from "../../services/ComponentUploadService.js";
import { ValidationService } from "../../services/ValidationService.js";

export interface UploadProgress {
  stage:
    | "uploading"
    | "validating"
    | "transpiling"
    | "registering"
    | "complete"
    | "error";
  progress: number; // 0-100
  message: string;
  error?: string;
}

export class ComponentUploadPanel {
  private element: HTMLElement & { _selectedFile?: File | null };
  private uploadService: ComponentUploadService;
  private validationService: ValidationService;
  private onUploadComplete?: (componentId: string) => void;
  private onUploadError?: (error: string) => void;
  private validationCache: Map<string, any> = new Map(); // Cache validation results

  constructor(
    uploadService: ComponentUploadService,
    validationService: ValidationService,
    onUploadComplete?: (componentId: string) => void,
    onUploadError?: (error: string) => void,
  ) {
    this.uploadService = uploadService;
    this.validationService = validationService;
    this.onUploadComplete = onUploadComplete;
    this.onUploadError = onUploadError;
    this.element = this.createElement();
    this.setupEventHandlers();
  }

  private createElement(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "component-upload-panel";
    panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 500px;
            background: var(--bg-secondary, #151B2C);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            z-index: 1000;
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: var(--text-primary, #E5E9F0);
        `;

    panel.innerHTML = `
            <div class="upload-header">
                <h3 style="margin: 0 0 15px 0; color: var(--text-primary, #E5E9F0);">Upload WASM Component</h3>
                <button class="close-btn" style="
                    position: absolute;
                    top: 15px;
                    right: 15px;
                    background: none;
                    border: none;
                    color: var(--text-secondary, #A0A9BA);
                    font-size: 18px;
                    cursor: pointer;
                    padding: 5px;
                ">×</button>
            </div>

            <div class="upload-area" style="
                border: 2px dashed var(--border-color, #2A3441);
                border-radius: 8px;
                padding: 40px 20px;
                text-align: center;
                margin-bottom: 20px;
                transition: all 0.3s ease;
                cursor: pointer;
            ">
                <div class="upload-icon" style="
                    font-size: 48px;
                    color: var(--text-secondary, #A0A9BA);
                    margin-bottom: 15px;
                ">📁</div>
                <div class="upload-text" style="
                    color: var(--text-secondary, #A0A9BA);
                    margin-bottom: 10px;
                ">Drop WASM file here or click to browse</div>
                <div class="upload-hint" style="
                    font-size: 12px;
                    color: var(--text-tertiary, #6B7280);
                ">Supports .wasm files up to 50MB</div>
                <input type="file" accept=".wasm" style="display: none;" />
            </div>

            <div class="component-info" style="display: none; margin-bottom: 20px;">
                <div class="info-row" style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: var(--text-secondary, #A0A9BA);">File:</span>
                    <span class="file-name" style="color: var(--text-primary, #E5E9F0);"></span>
                </div>
                <div class="info-row" style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: var(--text-secondary, #A0A9BA);">Size:</span>
                    <span class="file-size" style="color: var(--text-primary, #E5E9F0);"></span>
                </div>
                <div class="name-input-row" style="margin-top: 15px;">
                    <label style="display: block; color: var(--text-secondary, #A0A9BA); margin-bottom: 5px;">Component Name:</label>
                    <input type="text" class="component-name-input" placeholder="Enter component name..." style="
                        width: 100%;
                        padding: 8px 12px;
                        background: var(--bg-primary, #0F1419);
                        border: 1px solid var(--border-color, #2A3441);
                        border-radius: 4px;
                        color: var(--text-primary, #E5E9F0);
                        font-size: 14px;
                        box-sizing: border-box;
                    " />
                </div>
            </div>

            <div class="progress-section" style="display: none; margin-bottom: 20px;">
                <div class="progress-text" style="
                    color: var(--text-primary, #E5E9F0);
                    margin-bottom: 8px;
                    font-size: 14px;
                "></div>
                <div class="progress-bar-container" style="
                    background: var(--bg-primary, #0F1419);
                    border-radius: 10px;
                    height: 20px;
                    overflow: hidden;
                ">
                    <div class="progress-bar" style="
                        background: linear-gradient(90deg, #4A9EFF, #00D4AA);
                        height: 100%;
                        width: 0%;
                        transition: width 0.3s ease;
                        border-radius: 10px;
                    "></div>
                </div>
                <div class="progress-details" style="
                    font-size: 12px;
                    color: var(--text-tertiary, #6B7280);
                    margin-top: 5px;
                "></div>
            </div>

            <div class="error-section" style="display: none; margin-bottom: 20px;">
                <div class="error-message" style="
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 6px;
                    padding: 12px;
                    color: #FCA5A5;
                    font-size: 14px;
                "></div>
            </div>

            <div class="validation-section" style="display: none; margin-bottom: 20px;">
                <div class="validation-header" style="
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 8px;
                ">
                    <span class="validation-icon">🔍</span>
                    <span style="font-weight: 500; color: var(--text-primary, #E5E9F0);">Validation Results</span>
                </div>
                <div class="validation-details" style="
                    background: var(--bg-primary, #0F1419);
                    border: 1px solid var(--border-color, #2A3441);
                    border-radius: 6px;
                    padding: 12px;
                    font-size: 13px;
                ">
                    <div class="security-score" style="display: none; margin-bottom: 8px;">
                        Security Score: <span class="score-value" style="font-weight: 600;"></span>/100
                    </div>
                    <div class="validation-warnings" style="display: none;">
                        <div style="color: var(--accent-warning, #F0B72F); margin-bottom: 4px;">⚠️ Warnings:</div>
                        <ul style="margin: 0; padding-left: 20px; color: var(--text-secondary, #A0A9BA);"></ul>
                    </div>
                    <div class="validation-errors" style="display: none;">
                        <div style="color: var(--accent-error, #F85149); margin-bottom: 4px;">❌ Errors:</div>
                        <ul style="margin: 0; padding-left: 20px; color: var(--text-secondary, #A0A9BA);"></ul>
                    </div>
                </div>
            </div>

            <div class="action-buttons" style="
                display: flex;
                gap: 10px;
                justify-content: flex-end;
            ">
                <button class="cancel-btn" style="
                    padding: 8px 16px;
                    background: var(--bg-primary, #0F1419);
                    border: 1px solid var(--border-color, #2A3441);
                    border-radius: 4px;
                    color: var(--text-secondary, #A0A9BA);
                    cursor: pointer;
                    font-size: 14px;
                ">Cancel</button>
                <button class="upload-btn" style="
                    padding: 8px 16px;
                    background: linear-gradient(90deg, #4A9EFF, #00D4AA);
                    border: none;
                    border-radius: 4px;
                    color: white;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    disabled: true;
                " disabled>Upload Component</button>
            </div>
        `;

    return panel;
  }

  private setupEventHandlers(): void {
    const uploadArea = this.element.querySelector(
      ".upload-area",
    ) as HTMLElement;
    const fileInput = this.element.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const closeBtn = this.element.querySelector(
      ".close-btn",
    ) as HTMLButtonElement;
    const cancelBtn = this.element.querySelector(
      ".cancel-btn",
    ) as HTMLButtonElement;
    const uploadBtn = this.element.querySelector(
      ".upload-btn",
    ) as HTMLButtonElement;
    const componentNameInput = this.element.querySelector(
      ".component-name-input",
    ) as HTMLInputElement;

    // File drop and click handlers
    uploadArea.addEventListener("click", () => fileInput.click());
    uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = "var(--accent-color, #4A9EFF)";
      uploadArea.style.backgroundColor = "rgba(74, 158, 255, 0.05)";
    });
    uploadArea.addEventListener("dragleave", (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = "var(--border-color, #2A3441)";
      uploadArea.style.backgroundColor = "transparent";
    });
    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = "var(--border-color, #2A3441)";
      uploadArea.style.backgroundColor = "transparent";

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        this.handleFileSelection(files[0]);
      }
    });

    fileInput.addEventListener("change", (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        this.handleFileSelection(files[0]);
      }
    });

    // Button handlers
    closeBtn.addEventListener("click", () => this.hide());
    cancelBtn.addEventListener("click", () => this.hide());
    uploadBtn.addEventListener("click", () => this.handleUpload());

    // Enable upload button when name is entered
    componentNameInput.addEventListener("input", () => {
      uploadBtn.disabled = !componentNameInput.value.trim();
    });

    // Bring to front on click
    this.element.addEventListener("mousedown", () => {
      this.bringToFront();
    });
  }

  private handleFileSelection(file: File): void {
    if (!file.name.endsWith(".wasm")) {
      this.showError("Please select a valid .wasm file");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      this.showError("File too large. Maximum size is 50MB");
      return;
    }

    // Show file info
    const componentInfo = this.element.querySelector(
      ".component-info",
    ) as HTMLElement;
    const fileName = this.element.querySelector(".file-name") as HTMLElement;
    const fileSize = this.element.querySelector(".file-size") as HTMLElement;
    const componentNameInput = this.element.querySelector(
      ".component-name-input",
    ) as HTMLInputElement;

    fileName.textContent = file.name;
    fileSize.textContent = this.formatFileSize(file.size);

    // Auto-generate component name from filename
    const baseName = file.name
      .replace(".wasm", "")
      .replace(/[^a-zA-Z0-9-_]/g, "-");
    componentNameInput.value = baseName;

    componentInfo.style.display = "block";

    // Store file for upload
    this.element._selectedFile = file;

    // Enable upload button
    const uploadBtn = this.element.querySelector(
      ".upload-btn",
    ) as HTMLButtonElement;
    uploadBtn.disabled = false;

    // Hide error if showing
    this.hideError();
  }

  private async handleUpload(): Promise<void> {
    const file = this.element._selectedFile;
    const componentNameInput = this.element.querySelector(
      ".component-name-input",
    ) as HTMLInputElement;
    const componentName = componentNameInput.value.trim();

    if (!file || !componentName) {
      this.showError("Please select a file and enter a component name");
      return;
    }

    // Disable upload button during upload
    const uploadBtn = this.element.querySelector(
      ".upload-btn",
    ) as HTMLButtonElement;
    uploadBtn.disabled = true;

    try {
      // First, validate the component and show results
      const fileArrayBuffer = await this.readFileAsArrayBuffer(file);
      const base64 = this.arrayBufferToBase64(fileArrayBuffer);

      // Show validation progress
      this.showProgress({
        stage: "validating",
        progress: 10,
        message: "Validating component...",
      });

      const validationResult =
        await this.uploadService.validateComponent(base64);

      // Show validation results in UI
      await this.showValidationResults(validationResult);

      // If validation failed with errors, stop here
      if (!validationResult.isValid) {
        uploadBtn.disabled = false;
        return;
      }

      // Continue with upload if validation passed
      const componentId = await this.uploadService.uploadComponent(
        file,
        componentName,
        undefined, // description
        "1.0.0", // version
        (progress: ServiceUploadProgress) => {
          // Map service progress to UI progress
          const uiProgress: UploadProgress = {
            stage:
              progress.stage === "complete"
                ? "complete"
                : progress.stage === "error"
                  ? "error"
                  : progress.stage,
            progress: progress.progress,
            message: progress.message,
            error: progress.error,
          };

          if (progress.stage === "uploading" && progress.progress === 0) {
            this.showProgress(uiProgress);
          } else {
            this.updateProgress(uiProgress);
          }
        },
      );

      // Complete
      setTimeout(() => {
        this.onUploadComplete?.(componentId);
        this.hide();
      }, 1500);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      this.showError(errorMessage);
      this.onUploadError?.(errorMessage);
      uploadBtn.disabled = false;
    }
  }

  private showProgress(progress: UploadProgress): void {
    const progressSection = this.element.querySelector(
      ".progress-section",
    ) as HTMLElement;
    progressSection.style.display = "block";
    this.updateProgress(progress);

    // Hide other sections
    this.element
      .querySelector(".component-info")!
      .setAttribute("style", "display: none !important");
    this.element
      .querySelector(".action-buttons")!
      .setAttribute("style", "display: none !important");
    this.hideError();
  }

  private updateProgress(progress: UploadProgress): void {
    const progressText = this.element.querySelector(
      ".progress-text",
    ) as HTMLElement;
    const progressBar = this.element.querySelector(
      ".progress-bar",
    ) as HTMLElement;
    const progressDetails = this.element.querySelector(
      ".progress-details",
    ) as HTMLElement;

    progressText.textContent = progress.message;
    progressBar.style.width = `${progress.progress}%`;
    progressDetails.textContent = `${progress.stage} (${progress.progress}%)`;
  }

  private showError(message: string): void {
    const errorSection = this.element.querySelector(
      ".error-section",
    ) as HTMLElement;
    const errorMessage = this.element.querySelector(
      ".error-message",
    ) as HTMLElement;

    errorMessage.textContent = message;
    errorSection.style.display = "block";

    // Hide validation section when showing error
    this.hideValidation();
  }

  private hideError(): void {
    const errorSection = this.element.querySelector(
      ".error-section",
    ) as HTMLElement;
    errorSection.style.display = "none";
  }

  private showValidation(validation: {
    isValid: boolean;
    warnings?: string[];
    errors?: string[];
    securityScan?: any;
    witAnalysis?: any;
  }): void {
    const validationSection = this.element.querySelector(
      ".validation-section",
    ) as HTMLElement;
    const validationIcon = this.element.querySelector(
      ".validation-icon",
    ) as HTMLElement;
    const securityScoreDiv = this.element.querySelector(
      ".security-score",
    ) as HTMLElement;
    const scoreValue = this.element.querySelector(
      ".score-value",
    ) as HTMLElement;
    const warningsDiv = this.element.querySelector(
      ".validation-warnings",
    ) as HTMLElement;
    const warningsList = warningsDiv.querySelector("ul") as HTMLElement;
    const errorsDiv = this.element.querySelector(
      ".validation-errors",
    ) as HTMLElement;
    const errorsList = errorsDiv.querySelector("ul") as HTMLElement;

    // Show validation section
    validationSection.style.display = "block";

    // Update validation icon based on result
    if (validation.isValid) {
      validationIcon.textContent =
        validation.warnings && validation.warnings.length > 0 ? "⚠️" : "✅";
    } else {
      validationIcon.textContent = "❌";
    }

    // Show security score if available
    if (validation.securityScan) {
      securityScoreDiv.style.display = "block";
      scoreValue.textContent = validation.securityScan.score.toString();

      // Color code the score
      if (validation.securityScan.score >= 80) {
        scoreValue.style.color = "var(--accent-success, #3FB950)";
      } else if (validation.securityScan.score >= 60) {
        scoreValue.style.color = "var(--accent-warning, #F0B72F)";
      } else {
        scoreValue.style.color = "var(--accent-error, #F85149)";
      }
    } else {
      securityScoreDiv.style.display = "none";
    }

    // Show warnings
    if (validation.warnings && validation.warnings.length > 0) {
      warningsDiv.style.display = "block";
      warningsList.innerHTML = validation.warnings
        .map((w: string) => `<li>${this.escapeHtml(w)}</li>`)
        .join("");
    } else {
      warningsDiv.style.display = "none";
    }

    // Show errors
    if (validation.errors && validation.errors.length > 0) {
      errorsDiv.style.display = "block";
      errorsList.innerHTML = validation.errors
        .map((e: string) => `<li>${this.escapeHtml(e)}</li>`)
        .join("");
    } else {
      errorsDiv.style.display = "none";
    }

    // Add success message if no issues
    if (
      validation.isValid &&
      (!validation.warnings || validation.warnings.length === 0) &&
      (!validation.errors || validation.errors.length === 0)
    ) {
      const successMsg = document.createElement("div");
      successMsg.style.cssText = `
                color: var(--accent-success, #3FB950);
                text-align: center;
                padding: 8px;
                font-weight: 500;
            `;
      successMsg.textContent = "✅ Component validation passed successfully!";
      validationSection
        .querySelector(".validation-details")
        ?.appendChild(successMsg);
    }

    // Hide error section when showing validation
    this.hideError();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private hideValidation(): void {
    const validationSection = this.element.querySelector(
      ".validation-section",
    ) as HTMLElement;
    validationSection.style.display = "none";
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Helper methods for file processing
  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    });
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private async showValidationResults(validation: any): Promise<void> {
    // Hide progress temporarily to show validation
    const progressSection = this.element.querySelector(
      ".progress-section",
    ) as HTMLElement;
    progressSection.style.display = "none";

    // Get security analysis and WIT analysis from backend if available
    let securityScan = null;
    let witAnalysis = null;

    try {
      // Try to get additional validation data
      if (validation.metadata?.interfaces) {
        // Component has interfaces, get more detailed analysis
        securityScan = await this.getSecurityAnalysis(validation);
        witAnalysis = await this.getWitAnalysis(validation);
      }
    } catch (error) {
      console.warn("Could not fetch additional validation data:", error);
    }

    // Prepare validation data for display
    const validationDisplay = {
      isValid: validation.isValid,
      warnings: validation.warnings || [],
      errors: validation.errors || [],
      securityScan: securityScan
        ? {
            score:
              securityScan.overall_risk === "Low"
                ? 85
                : securityScan.overall_risk === "Medium"
                  ? 65
                  : securityScan.overall_risk === "High"
                    ? 45
                    : 25,
          }
        : null,
      witAnalysis,
    };

    // Show validation section
    this.showValidation(validationDisplay);

    // Add retry button if validation failed
    if (!validation.isValid) {
      this.addRetryButton();
    }

    // Show progress again after a delay
    setTimeout(() => {
      if (validation.isValid) {
        progressSection.style.display = "block";
        this.updateProgress({
          stage: "validating",
          progress: 100,
          message: "Validation passed! Proceeding with upload...",
        });
      }
    }, 2000);
  }

  private async getSecurityAnalysis(_validation: any) {
    try {
      // Use file name as component identifier for now
      const file = this.element._selectedFile;
      if (!file) return null;

      const componentName = file.name.replace(".wasm", "");
      const cacheKey = `security_${componentName}`;

      // Check cache first
      if (this.validationCache.has(cacheKey)) {
        return this.validationCache.get(cacheKey);
      }

      // Integrate validation data into security analysis
      // const securityData = {
      //   componentName,
      //   validationResults: validation || {},
      //   timestamp: Date.now(),
      // };

      // Request security analysis from backend with validation context
      const securityAnalysis =
        await this.validationService.requestSecurityAnalysis(componentName);

      // Cache the result
      if (securityAnalysis) {
        this.validationCache.set(cacheKey, securityAnalysis);
      }

      return securityAnalysis;
    } catch (error) {
      console.warn("Failed to get security analysis:", error);
      return null;
    }
  }

  private async getWitAnalysis(_validation: any) {
    try {
      // Use file name as component identifier for now
      const file = this.element._selectedFile;
      if (!file) return null;

      const componentName = file.name.replace(".wasm", "");
      const cacheKey = `wit_${componentName}`;

      // Check cache first
      if (this.validationCache.has(cacheKey)) {
        return this.validationCache.get(cacheKey);
      }

      // Integrate validation data into WIT analysis
      // const witData = {
      //   componentName,
      //   validationResults: validation || {},
      //   timestamp: Date.now(),
      //   includeInterfaces: true,
      //   includeTypes: true,
      // };

      // Request WIT analysis from backend with validation context
      const witAnalysis =
        await this.validationService.requestWitValidation(componentName);

      // Cache the result
      if (witAnalysis) {
        this.validationCache.set(cacheKey, witAnalysis);
      }

      return witAnalysis;
    } catch (error) {
      console.warn("Failed to get WIT analysis:", error);
      return null;
    }
  }

  private addRetryButton(): void {
    const actionButtons = this.element.querySelector(
      ".action-buttons",
    ) as HTMLElement;

    // Check if retry button already exists
    if (this.element.querySelector(".retry-btn")) return;

    const retryBtn = document.createElement("button");
    retryBtn.className = "retry-btn";
    retryBtn.textContent = "Retry Validation";
    retryBtn.style.cssText = `
            padding: 8px 16px;
            background: linear-gradient(90deg, #F59E0B, #D97706);
            border: none;
            border-radius: 4px;
            color: white;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            margin-right: 8px;
        `;

    retryBtn.addEventListener("click", async () => {
      // Clear validation display and retry
      this.hideValidation();
      this.hideError();
      retryBtn.remove();

      // Re-trigger upload
      await this.handleUpload();
    });

    // Insert before upload button
    const uploadBtn = actionButtons.querySelector(".upload-btn");
    actionButtons.insertBefore(retryBtn, uploadBtn);
    actionButtons.style.display = "flex";
  }

  show(): void {
    this.element.style.display = "block";
    this.bringToFront();
    document.body.appendChild(this.element);
  }

  private bringToFront(): void {
    // Find highest z-index among all floating panels
    const panels = document.querySelectorAll(
      ".floating-panel, .ai-assistant-panel, .wasm-component-panel, .component-upload-panel",
    );
    let maxZ = 1000;

    panels.forEach((panel) => {
      if (panel !== this.element) {
        const z = parseInt((panel as HTMLElement).style.zIndex || "0");
        if (z >= maxZ) maxZ = z;
      }
    });

    this.element.style.zIndex = (maxZ + 1).toString();
  }

  hide(): void {
    this.element.style.display = "none";

    // Reset form
    const componentInfo = this.element.querySelector(
      ".component-info",
    ) as HTMLElement;
    const progressSection = this.element.querySelector(
      ".progress-section",
    ) as HTMLElement;
    const actionButtons = this.element.querySelector(
      ".action-buttons",
    ) as HTMLElement;
    const componentNameInput = this.element.querySelector(
      ".component-name-input",
    ) as HTMLInputElement;
    const uploadBtn = this.element.querySelector(
      ".upload-btn",
    ) as HTMLButtonElement;

    componentInfo.style.display = "none";
    progressSection.style.display = "none";
    actionButtons.style.display = "flex";
    componentNameInput.value = "";
    uploadBtn.disabled = true;

    this.hideError();
    this.hideValidation();
    this.element._selectedFile = null;
  }

  getElement(): HTMLElement {
    return this.element;
  }
}
