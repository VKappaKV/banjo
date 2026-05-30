import { createMemoryLogger, type BanjoLogger } from "$core/logging";

export interface BrowserLoggerOptions {
	isDebugEnabled?: () => boolean;
	maxEntries?: number;
}

export function createBrowserLogger(options: BrowserLoggerOptions = {}): BanjoLogger {
	return createMemoryLogger({
		maxEntries: options.maxEntries,
		consoleEnabled: () => options.isDebugEnabled?.() ?? false,
	});
}
