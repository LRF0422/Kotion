/**
 * Logger utility for the application
 * Provides different log levels and can be configured for production/development
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

class Logger {
  private currentLevel: LogLevel = LogLevel.INFO;

  constructor() {
    // Set log level based on environment
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
      this.currentLevel = LogLevel.WARN;
    } else {
      this.currentLevel = LogLevel.DEBUG;
    }
  }

  setLevel(level: LogLevel) {
    this.currentLevel = level;
  }

  debug(message: string, ...args: any[]) {
    if (this.currentLevel <= LogLevel.DEBUG) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]) {
    if (this.currentLevel <= LogLevel.INFO) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]) {
    if (this.currentLevel <= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]) {
    if (this.currentLevel <= LogLevel.ERROR) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }

  table(data: any) {
    if (this.currentLevel <= LogLevel.INFO) {
      console.table(data);
    }
  }
}

export const logger = new Logger();
