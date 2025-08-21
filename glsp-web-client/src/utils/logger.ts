/**
 * Simple logging utility for the application
 * Can be configured for different environments
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private isDevelopment: boolean;

  private constructor() {
    // Determine if we're in development mode
    this.isDevelopment =
      process.env.NODE_ENV === "development" ||
      (typeof window !== "undefined" &&
        window.location.hostname === "localhost");

    // Set log level based on environment
    this.logLevel = this.isDevelopment ? LogLevel.DEBUG : LogLevel.WARN;
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public error(message: string, ...args: unknown[]): void {
    if (this.logLevel >= LogLevel.ERROR) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }

  public warn(message: string, ...args: unknown[]): void {
    if (this.logLevel >= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  public info(message: string, ...args: unknown[]): void {
    if (this.logLevel >= LogLevel.INFO) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  public debug(message: string, ...args: unknown[]): void {
    if (this.logLevel >= LogLevel.DEBUG && this.isDevelopment) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }
}

// Export a default logger instance
export const logger = Logger.getInstance();
