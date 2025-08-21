/**
 * File Service - Handles file operations across web and desktop environments
 */

import { detectEnvironment, getTauriAPI } from "../utils/environment.js";

export interface FileOpenResult {
  name: string;
  path?: string;
  content: ArrayBuffer;
  type?: string;
}

export interface FileSaveResult {
  path?: string;
  saved: boolean;
}

export class FileService {
  private env = detectEnvironment();
  private tauriAPI = getTauriAPI();

  /**
   * Open a file using the appropriate method for the current environment
   */
  async openFile(options?: {
    accept?: string;
    multiple?: boolean;
  }): Promise<FileOpenResult | null> {
    if (this.env.isTauri && this.tauriAPI) {
      return this.openFileTauri(options);
    } else {
      return this.openFileWeb(options);
    }
  }

  /**
   * Save content to a file using the appropriate method
   */
  async saveFile(
    content: string | ArrayBuffer,
    options?: {
      suggestedName?: string;
      types?: Array<{
        description: string;
        accept: Record<string, string[]>;
      }>;
    },
  ): Promise<FileSaveResult> {
    if (this.env.isTauri && this.tauriAPI) {
      return this.saveFileTauri(content, options);
    } else {
      return this.saveFileWeb(content, options);
    }
  }

  /**
   * Open file using Tauri file dialog
   */
  private async openFileTauri(options?: {
    accept?: string;
    multiple?: boolean;
  }): Promise<FileOpenResult | null> {
    try {
      const result = await this.tauriAPI!.invoke("open_local_file", {
        extension: options?.accept?.split(".").pop(),
      });

      if (result.path && result.contents) {
        return {
          name: result.path.split("/").pop() || "unknown",
          path: result.path,
          content: new Uint8Array(result.contents).buffer,
          type: options?.accept,
        };
      }
      return null;
    } catch (error) {
      console.error("Failed to open file in Tauri:", error);
      return null;
    }
  }

  /**
   * Save file using Tauri file dialog
   */
  private async saveFileTauri(
    content: string | ArrayBuffer,
    options?: {
      suggestedName?: string;
      types?: Array<{
        description: string;
        accept: Record<string, string[]>;
      }>;
    },
  ): Promise<FileSaveResult> {
    try {
      const contentStr =
        typeof content === "string"
          ? content
          : new TextDecoder().decode(content);

      const extension = options?.types?.[0]?.accept
        ? Object.keys(options.types[0].accept)[0].split(".").pop()
        : undefined;

      const result = await this.tauriAPI!.invoke("save_to_file", {
        content: contentStr,
        defaultName: options?.suggestedName,
        extension,
      });

      return {
        path: result,
        saved: !!result,
      };
    } catch (error) {
      console.error("Failed to save file in Tauri:", error);
      return { saved: false };
    }
  }

  /**
   * Open file using Web File System Access API or file input fallback
   */
  private async openFileWeb(options?: {
    accept?: string;
    multiple?: boolean;
  }): Promise<FileOpenResult | null> {
    try {
      // Try File System Access API first (Chrome)
      if ("showOpenFilePicker" in window) {
        const [fileHandle] = await (window as any).showOpenFilePicker({
          multiple: false,
          types: options?.accept
            ? [
                {
                  description: "Files",
                  accept: { [options.accept]: [options.accept] },
                },
              ]
            : undefined,
        });

        const file = await fileHandle.getFile();
        const arrayBuffer = await file.arrayBuffer();

        return {
          name: file.name,
          content: arrayBuffer,
          type: file.type,
        };
      } else {
        // Fallback to input file
        return this.openFileWithInput(options?.accept);
      }
    } catch (error) {
      console.error("Failed to open file in web:", error);
      return null;
    }
  }

  /**
   * Save file using Web File System Access API or download fallback
   */
  private async saveFileWeb(
    content: string | ArrayBuffer,
    options?: {
      suggestedName?: string;
      types?: Array<{
        description: string;
        accept: Record<string, string[]>;
      }>;
    },
  ): Promise<FileSaveResult> {
    try {
      // Try File System Access API first (Chrome)
      if ("showSaveFilePicker" in window) {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: options?.suggestedName,
          types: options?.types,
        });

        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();

        return { saved: true };
      } else {
        // Fallback to download
        this.downloadFile(content, options?.suggestedName || "download");
        return { saved: true };
      }
    } catch (error) {
      console.error("Failed to save file in web:", error);
      return { saved: false };
    }
  }

  /**
   * Open file using traditional input element
   */
  private openFileWithInput(accept?: string): Promise<FileOpenResult | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      if (accept) {
        input.accept = accept;
      }

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const arrayBuffer = await file.arrayBuffer();
          resolve({
            name: file.name,
            content: arrayBuffer,
            type: file.type,
          });
        } else {
          resolve(null);
        }
      };

      input.click();
    });
  }

  /**
   * Download file as blob (fallback for web)
   */
  private downloadFile(content: string | ArrayBuffer, filename: string): void {
    const blob = new Blob([content]);
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  }

  /**
   * Get app data directory (Tauri only)
   */
  async getAppDataDirectory(): Promise<string | null> {
    if (this.env.isTauri && this.tauriAPI) {
      try {
        return await this.tauriAPI.invoke("get_app_data_dir");
      } catch (error) {
        console.error("Failed to get app data directory:", error);
        return null;
      }
    }
    return null;
  }

  /**
   * Create directory (Tauri only)
   */
  async createDirectory(relativePath: string): Promise<string | null> {
    if (this.env.isTauri && this.tauriAPI) {
      try {
        return await this.tauriAPI.invoke("create_directory", { relativePath });
      } catch (error) {
        console.error("Failed to create directory:", error);
        return null;
      }
    }
    return null;
  }
}
