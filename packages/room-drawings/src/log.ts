// The package is built without DOM or Node typings; every JavaScript runtime has a console.
declare const console: { error(message: string): void; warn(message: string): void };

/** Logging is injected by the host (e.g. the library's logError / logWarning); defaults to the console. */
export interface Logger {
    error(message: string): void;
    warning(message: string): void;
}

export const consoleLogger: Logger = {
    error: message => console.error(message),
    warning: message => console.warn(message),
};
