import { Buffer } from "buffer";
import BN from "bn.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import {
	crypto_core_ed25519_add,
	crypto_scalarmult_ed25519_base_noclamp,
} from "./sumo.facade";

export function fromSeed(seed: Buffer): Uint8Array {
	let k: Uint8Array = sha512(seed);
	let kL: Uint8Array = k.subarray(0, 32);
	let kR: Uint8Array = k.subarray(32, 64);

	while ((kL[31]! & 0b0010_0000) !== 0) {
		k = hmac(sha512, kL, kR);
		kL = k.subarray(0, 32);
		kR = k.subarray(32, 64);
	}

	kL[0]! &= 0b1111_1000;
	kL[31]! &= 0b0111_1111;
	kL[31]! |= 0b0100_0000;

	const c: Uint8Array = sha256(Buffer.concat([new Uint8Array([0x01]), seed]));
	return new Uint8Array(Buffer.concat([kL, kR, c]));
}

export function trunc_256_minus_g_bits(array: Uint8Array, g: number): Uint8Array {
	if (g < 0 || g > 256) {
		throw Error("Number of bits to zero must be between 0 and 256.");
	}

	const truncated = new Uint8Array(array);
	let remainingBits = g;

	for (let i = truncated.length - 1; i >= 0 && remainingBits > 0; i--) {
		if (remainingBits >= 8) {
			truncated[i] = 0;
			remainingBits -= 8;
		} else {
			truncated[i]! &= 0xff >> remainingBits;
			break;
		}
	}

	return truncated;
}

export async function deriveChildNodePrivate(
	extendedKey: Uint8Array,
	index: number,
	g: number = 9,
): Promise<Uint8Array> {
	const kL: Buffer = Buffer.from(extendedKey.subarray(0, 32));
	const kR: Buffer = Buffer.from(extendedKey.subarray(32, 64));
	const cc: Uint8Array = extendedKey.subarray(64, 96);

	const { z, childChainCode } =
		index < 0x80000000 ? derivedNonHardened(kL, cc, index) : deriveHardened(kL, kR, cc, index);

	const zLeft = z.subarray(0, 32);
	const zRight = z.subarray(32, 64);
	const zL: Uint8Array = trunc_256_minus_g_bits(zLeft, g);
	const klBigNum = new BN(kL, 16, "le");
	const zlBigNum = new BN(zL, 16, "le");
	const zlBigNumMul8 = klBigNum.add(zlBigNum.mul(new BN(8)));

	if (zlBigNumMul8.cmp(new BN(2).pow(new BN(255))) >= 0) {
		throw Error("zL * 8 is larger than 2^255, which is not safe");
	}

	const left = klBigNum.add(zlBigNum.mul(new BN(8))).toArrayLike(Buffer, "le", 32);
	const right = new BN(kR, 16, "le").add(new BN(zRight, 16, "le")).toArrayLike(Buffer, "le").slice(0, 32);
	const rightBuffer = Buffer.alloc(32);
	Buffer.from(right).copy(rightBuffer, 0, 0, right.length);

	return new Uint8Array(Buffer.concat([left, rightBuffer, childChainCode]));
}

export async function deriveChildNodePublic(
	extendedKey: Uint8Array,
	index: number,
	g: number = 9,
): Promise<Uint8Array> {
	if (index > 0x80000000) throw Error("can not derive public key with harden");

	const pk: Buffer = Buffer.from(extendedKey.subarray(0, 32));
	const cc: Buffer = Buffer.from(extendedKey.subarray(32, 64));
	const data: Buffer = Buffer.allocUnsafe(1 + 32 + 4);
	data.writeUInt32LE(index, 1 + 32);
	pk.copy(data, 1);

	data[0] = 0x02;
	const z: Uint8Array = hmac(sha512, cc, data);
	const zL: Uint8Array = trunc_256_minus_g_bits(z.subarray(0, 32), g);
	const left = new BN(zL, 16, "le").mul(new BN(8)).toArrayLike(Buffer, "le", 32);
	const p: Uint8Array = crypto_scalarmult_ed25519_base_noclamp(left);

	data[0] = 0x03;
	const fullChildChainCode: Uint8Array = hmac(sha512, cc, data);
	const childChainCode: Uint8Array = fullChildChainCode.subarray(32, 64);

	return new Uint8Array(Buffer.concat([crypto_core_ed25519_add(p, pk), childChainCode]));
}

function derivedNonHardened(
	kl: Uint8Array,
	cc: Uint8Array,
	index: number,
): { z: Uint8Array; childChainCode: Uint8Array } {
	const data: Buffer = Buffer.allocUnsafe(1 + 32 + 4);
	data.writeUInt32LE(index, 1 + 32);

	const pk = Buffer.from(crypto_scalarmult_ed25519_base_noclamp(kl));
	pk.copy(data, 1);

	data[0] = 0x02;
	const z: Uint8Array = hmac(sha512, cc, data);
	data[0] = 0x03;
	const fullChildChainCode: Uint8Array = hmac(sha512, cc, data);
	const childChainCode: Uint8Array = fullChildChainCode.subarray(32, 64);

	return { z, childChainCode };
}

function deriveHardened(
	kl: Uint8Array,
	kr: Uint8Array,
	cc: Uint8Array,
	index: number,
): { z: Uint8Array; childChainCode: Uint8Array } {
	const data: Buffer = Buffer.allocUnsafe(1 + 64 + 4);
	data.writeUInt32LE(index, 1 + 64);
	Buffer.from(kl).copy(data, 1);
	Buffer.from(kr).copy(data, 1 + 32);

	data[0] = 0x00;
	const z: Uint8Array = hmac(sha512, cc, data);
	data[0] = 0x01;
	const fullChildChainCode: Uint8Array = hmac(sha512, cc, data);
	const childChainCode: Uint8Array = fullChildChainCode.subarray(32, 64);

	return { z, childChainCode };
}
