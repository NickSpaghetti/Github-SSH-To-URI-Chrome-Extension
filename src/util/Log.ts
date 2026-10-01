const PREFIX = "[iac-module-linker]";

const textOf = (error: unknown): string => String(error);

/**
 * Writes a failure the extension recovered from to the console at the debug level.
 * @param message What could not be done.
 * @param error The error that caused it, if any.
 */
export const logRecovered = (message: string, error?: unknown): void => {
    console.debug(
        error === undefined ? `${PREFIX} ${message}` : `${PREFIX} ${message}: ${textOf(error)}`,
    );
};
