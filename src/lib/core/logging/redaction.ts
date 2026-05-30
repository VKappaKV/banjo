import type { BanjoLogError } from "./types";

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 5;
const MAX_ARRAY_LENGTH = 20;
const MAX_STRING_LENGTH = 300;

const sensitiveKeyPattern = /(^|_|-|\b)(password|passphrase|mnemonic|seed|secret|private|sk|xprv|prf|signature|sig|signedblob|signedtxn|signedtransaction|unsignedtxn|unsignedtransaction|rawtxn|rawtransaction|authdata|authenticatordata|credential)(_|-|\b|$)/i;
const addressKeyPattern = /(^|_|-)(addr|address|sender|receiver|signer|account)(_|-|$)/i;
const algorandAddressPattern = /^[A-Z2-7]{58}$/;

export function shortenAddress(address: string): string {
	if (!algorandAddressPattern.test(address)) return address;
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function sanitizeError(error: unknown): BanjoLogError | undefined {
	if (!error) return undefined;
	if (error instanceof Error) {
		const maybeCode = (error as Error & { code?: unknown }).code;
		return {
			name: error.name,
			message: error.message,
			...(typeof maybeCode === "string" || typeof maybeCode === "number" ? { code: maybeCode } : {}),
		};
	}
	if (typeof error === "string") return { message: error };
	return { message: "Unknown error" };
}

export function redactLogFields(fields: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	if (!fields) return undefined;
	return sanitizeValue(fields, 0, undefined, new WeakSet<object>()) as Record<string, unknown>;
}

function sanitizeString(value: string, key?: string): string {
	const shortened = key && isAddressKey(key) ? shortenAddress(value) : value;
	if (shortened.length <= MAX_STRING_LENGTH) return shortened;
	return `${shortened.slice(0, MAX_STRING_LENGTH)}...[truncated ${shortened.length - MAX_STRING_LENGTH}]`;
}

function sanitizeValue(value: unknown, depth: number, key?: string, seen: WeakSet<object> = new WeakSet()): unknown {
	if (key && isSensitiveKey(key)) return REDACTED;
	if (value == null || typeof value === "number" || typeof value === "boolean") return value;
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "string") return sanitizeString(value, key);
	if (value instanceof Uint8Array) return `[Uint8Array length=${value.byteLength}]`;
	if (value instanceof ArrayBuffer) return `[ArrayBuffer byteLength=${value.byteLength}]`;
	if (value instanceof Error) return sanitizeError(value);
	if (depth >= MAX_DEPTH) return "[MaxDepth]";
	if (typeof value === "object") {
		if (seen.has(value)) return "[Circular]";
		seen.add(value);
	}

	if (Array.isArray(value)) {
		const result = value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item, depth + 1, undefined, seen));
		if (value.length > MAX_ARRAY_LENGTH) result.push(`[truncated ${value.length - MAX_ARRAY_LENGTH}]`);
		return result;
	}

	if (typeof value === "object") {
		const result: Record<string, unknown> = {};
		for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
			result[childKey] = sanitizeValue(childValue, depth + 1, childKey, seen);
		}
		return result;
	}

	return String(value);
}

function isSensitiveKey(key: string): boolean {
	const normalized = key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`).toLowerCase();
	return sensitiveKeyPattern.test(key) || sensitiveKeyPattern.test(normalized);
}

function isAddressKey(key: string): boolean {
	const normalized = key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`).toLowerCase();
	return addressKeyPattern.test(key) || addressKeyPattern.test(normalized);
}
