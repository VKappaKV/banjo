import { mod } from "@noble/curves/abstract/modular.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToNumberLE, numberToBytesLE } from "@noble/curves/utils.js";

const crypto_scalarmult_ed25519_SCALARBYTES = 32;

export function crypto_scalarmult_ed25519_base_noclamp(scalar: Uint8Array): Uint8Array {
	if (scalar.length !== crypto_scalarmult_ed25519_SCALARBYTES) {
		throw new Error(`scalar must be ${crypto_scalarmult_ed25519_SCALARBYTES} bytes`);
	}

	const scalarBigint = bytesToNumberLE(scalar);

	if (scalarBigint === 0n) {
		throw new Error("scalar is 0");
	}

	try {
		return ed25519.Point.BASE.multiply(scalarBigint).toBytes();
	} catch {
		const clearedTopBitScalar = scalarBigint & ((1n << 255n) - 1n);
		const reducedScalar = mod(clearedTopBitScalar, ed25519.Point.Fn.ORDER);

		if (reducedScalar === 0n) {
			throw new Error("scalar is 0");
		}

		return ed25519.Point.BASE.multiply(reducedScalar).toBytes();
	}
}

export function crypto_core_ed25519_add(pointA: Uint8Array, pointB: Uint8Array): Uint8Array {
	try {
		const a = ed25519.Point.fromBytes(pointA);
		const b = ed25519.Point.fromBytes(pointB);
		return a.add(b).toBytes();
	} catch {
		throw new Error("invalid point");
	}
}

export function crypto_core_ed25519_scalar_add(scalarA: Uint8Array, scalarB: Uint8Array): Uint8Array {
	const a = bytesToNumberLE(scalarA);
	const b = bytesToNumberLE(scalarB);

	return numberToBytesLE(mod(a + b, ed25519.Point.Fn.ORDER), 32);
}

export function crypto_core_ed25519_scalar_mul(scalarA: Uint8Array, scalarB: Uint8Array): Uint8Array {
	const a = bytesToNumberLE(scalarA);
	const b = bytesToNumberLE(scalarB);

	return numberToBytesLE(mod(a * b, ed25519.Point.Fn.ORDER), 32);
}

export function crypto_core_ed25519_scalar_reduce(scalar: Uint8Array): Uint8Array {
	return numberToBytesLE(mod(bytesToNumberLE(scalar), ed25519.Point.Fn.ORDER), 32);
}
