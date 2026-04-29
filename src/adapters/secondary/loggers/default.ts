import { getDefaultLoggingContext } from "../../../utils";

export class DefaultLogger {
  private loggingContext = {};
  constructor() {
    this.loggingContext = getDefaultLoggingContext();
  }

  info(message: string, context?: Record<string, any>) {
    console.info(`INFO: ${message}`, { ...this.loggingContext, ...context });
  }

  error(message: string, context?: Record<string, any>) {
    console.error(`ERROR: ${message}`, { ...this.loggingContext, ...context });
  }

  warn(message: string, context?: Record<string, any>) {
    console.warn(`WARN: ${message}`, { ...this.loggingContext, ...context });
  }
}
