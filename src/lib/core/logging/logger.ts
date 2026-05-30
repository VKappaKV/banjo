import { redactLogFields, sanitizeError } from "./redaction";
import type { BanjoLogEvent, BanjoLogger, LogInput, LogLevel } from "./types";

export interface CreateLoggerOptions {
	maxEntries?: number;
	consoleEnabled?: () => boolean;
	consoleSink?: Pick<Console, "debug" | "info" | "warn" | "error">;
}

const DEFAULT_MAX_ENTRIES = 500;

export function createMemoryLogger(options: CreateLoggerOptions = {}): BanjoLogger {
	const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
	const buffer: BanjoLogEvent[] = [];

	function write(level: LogLevel, input: LogInput) {
		const event: BanjoLogEvent = {
			ts: new Date().toISOString(),
			level,
			namespace: input.namespace,
			event: input.event,
			...(input.correlationId ? { correlationId: input.correlationId } : {}),
			...(input.durationMs != null ? { durationMs: input.durationMs } : {}),
			...(input.fields ? { fields: redactLogFields(input.fields) } : {}),
			...(input.error ? { error: sanitizeError(input.error) } : {}),
		};

		buffer.push(event);
		if (buffer.length > maxEntries) buffer.splice(0, buffer.length - maxEntries);
		if (options.consoleEnabled?.()) writeConsole(options.consoleSink ?? console, event);
	}

	return {
		trace: (input) => write("trace", input),
		debug: (input) => write("debug", input),
		info: (input) => write("info", input),
		warn: (input) => write("warn", input),
		error: (input) => write("error", input),
		entries: () => buffer.map((entry) => ({ ...entry, fields: entry.fields ? { ...entry.fields } : undefined })),
		export: () => JSON.stringify(buffer, null, 2),
		clear: () => { buffer.length = 0; },
	};
}

export function createLogCorrelationId(prefix = "flow"): string {
	const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
	return `${prefix}-${random}`;
}

export const noopLogger: BanjoLogger = {
	trace() {},
	debug() {},
	info() {},
	warn() {},
	error() {},
	entries: () => [],
	export: () => "[]",
	clear() {},
};

function writeConsole(sink: Pick<Console, "debug" | "info" | "warn" | "error">, event: BanjoLogEvent) {
	const args = [`[Banjo:${event.namespace}] ${event.event}`, event];
	if (event.level === "error") sink.error(...args);
	else if (event.level === "warn") sink.warn(...args);
	else if (event.level === "info") sink.info(...args);
	else sink.debug(...args);
}
