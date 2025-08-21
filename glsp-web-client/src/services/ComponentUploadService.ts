import { McpService } from "./McpService.js";

export interface UploadProgress {
  stage: "uploading" | "validating" | "complete" | "error";
  progress: number;
  message: string;
  error?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    size: number;
    checksum: string;
    format?: string;
    type?: string;
    interfaces?: string[];
  };
}

export interface UploadedComponent {
  name: string;
  version: string;
  description?: string;
  uploadedAt: string;
  size: number;
  checksum: string;
}

export class ComponentUploadService {
  private mcpService: McpService;

  constructor(mcpService: McpService) {
    this.mcpService = mcpService;
  }

  /**
   * Upload a WASM component to the backend
   */
  async uploadComponent(
    file: File,
    componentName: string,
    description?: string,
    version: string = "1.0.0",
    onProgress?: (progress: UploadProgress) => void,
  ): Promise<string> {
    try {
      // Read file as ArrayBuffer
      onProgress?.({
        stage: "uploading",
        progress: 0,
        message: "Reading file...",
      });

      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      const base64 = this.arrayBufferToBase64(arrayBuffer);

      // Validate component first
      onProgress?.({
        stage: "validating",
        progress: 25,
        message: "Validating component...",
      });

      const validation = await this.validateComponent(base64);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }

      // Upload component
      onProgress?.({
        stage: "uploading",
        progress: 50,
        message: "Uploading to server...",
      });

      const result = await this.mcpService.callTool("upload_wasm_component", {
        componentName,
        wasmBase64: base64,
        description,
        version,
      });

      if (result.is_error) {
        throw new Error(result.content?.[0]?.text || "Upload failed");
      }

      onProgress?.({
        stage: "complete",
        progress: 100,
        message: "Component uploaded successfully!",
      });

      return componentName;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      onProgress?.({
        stage: "error",
        progress: 0,
        message: errorMessage,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Validate a WASM component before upload
   */
  async validateComponent(wasmBase64: string): Promise<ValidationResult> {
    const result = await this.mcpService.callTool("validate_wasm_component", {
      wasmBase64,
    });

    if (result.is_error) {
      return {
        isValid: false,
        errors: [result.content?.[0]?.text || "Validation failed"],
        warnings: [],
      };
    }

    try {
      const validation = JSON.parse(result.content?.[0]?.text || "{}");
      return validation;
    } catch {
      return {
        isValid: false,
        errors: ["Failed to parse validation result"],
        warnings: [],
      };
    }
  }

  /**
   * List all uploaded components
   */
  async listUploadedComponents(
    includeMetadata: boolean = true,
  ): Promise<UploadedComponent[]> {
    const result = await this.mcpService.callTool("list_uploaded_components", {
      includeMetadata,
    });

    if (result.is_error) {
      throw new Error(result.content?.[0]?.text || "Failed to list components");
    }

    try {
      const response = JSON.parse(result.content?.[0]?.text || "{}");
      return response.components || [];
    } catch {
      return [];
    }
  }

  /**
   * Delete an uploaded component
   */
  async deleteComponent(componentName: string): Promise<void> {
    const result = await this.mcpService.callTool("delete_uploaded_component", {
      componentName,
    });

    if (result.is_error) {
      throw new Error(
        result.content?.[0]?.text || "Failed to delete component",
      );
    }
  }

  /**
   * Read file as ArrayBuffer
   */
  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
