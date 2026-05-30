export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface BanjoLogError {
	name?: string;
	message: string;
	code?: string | number;
}

export interface BanjoLogEvent {
	ts: string;
	level: LogLevel;
	namespace: string;
	event: string;
	correlationId?: string;
	durationMs?: number;
	fields?: Record<string, unknown>;
	error?: BanjoLogError;
}

export interface LogInput {
	namespace: string;
	event: string;
	correlationId?: string;
	durationMs?: number;
	fields?: Record<string, unknown>;
	error?: unknown;
}

export interface BanjoLogger {
	trace(input: LogInput): void;
	debug(input: LogInput): void;
	info(input: LogInput): void;
	warn(input: LogInput): void;
	error(input: LogInput): void;
	entries(): BanjoLogEvent[];
	export(): string;
	clear(): void;
}
