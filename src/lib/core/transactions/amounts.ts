export interface FormatBaseUnitsOptions {
	trimTrailingZeros?: boolean;
}

function assertDecimals(decimals: number) {
	if (!Number.isInteger(decimals) || decimals < 0) {
		throw new Error("Decimals must be a non-negative integer");
	}
}

export function amountToBaseUnits(amount: string, decimals: number): bigint {
	assertDecimals(decimals);

	const normalized = amount.trim();

	if (!/^(?:\d+|\d*\.\d*)$/.test(normalized) || normalized === ".") {
		throw new Error("Amount must be a non-negative decimal string");
	}

	const [integerPart = "0", fractionalPart = ""] = normalized.split(".");
	const scale = 10n ** BigInt(decimals);
	const whole = BigInt(integerPart || "0") * scale;
	const fractional = decimals === 0 ? "" : fractionalPart.padEnd(decimals, "0").slice(0, decimals);

	return whole + BigInt(fractional || "0");
}

export function formatBaseUnits(
	amount: bigint | number | string,
	decimals: number,
	options: FormatBaseUnitsOptions = {},
): string {
	assertDecimals(decimals);

	const value = BigInt(amount);
	const sign = value < 0n ? "-" : "";
	const absolute = value < 0n ? -value : value;
	const scale = 10n ** BigInt(decimals);
	const integerPart = absolute / scale;

	if (decimals === 0) {
		return `${sign}${integerPart.toString()}`;
	}

	let fractionalPart = (absolute % scale).toString().padStart(decimals, "0");

	if (options.trimTrailingZeros) {
		fractionalPart = fractionalPart.replace(/0+$/, "");
	}

	return fractionalPart.length > 0
		? `${sign}${integerPart.toString()}.${fractionalPart}`
		: `${sign}${integerPart.toString()}`;
}
