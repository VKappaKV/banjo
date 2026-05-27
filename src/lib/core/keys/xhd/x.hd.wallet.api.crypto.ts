import { Buffer } from "buffer";
import { sha512 } from "@noble/hashes/sha2.js";
import {
	crypto_core_ed25519_scalar_add,
	crypto_core_ed25519_scalar_mul,
	crypto_core_ed25519_scalar_reduce,
	crypto_scalarmult_ed25519_base_noclamp,
} from "./sumo.facade";
import { deriveChildNodePrivate } from "./bip32-ed25519";

export enum KeyContext {
	Address = 0,
	Identity = 1,
}

export enum BIP32DerivationType {
	Khovratovich = 32,
	Peikert = 9,
}

export const harden = (num: number): number => 0x80000000 + num;

function getBip44PathFromContext(context: KeyContext, account: number, keyIndex: number): number[] {
	switch (context) {
		case KeyContext.Address:
			return [harden(44), harden(283), harden(account), 0, keyIndex];
		case KeyContext.Identity:
			return [harden(44), harden(0), harden(account), 0, keyIndex];
		default:
			throw Error("Invalid context");
	}
}

export class XHDWalletAPI {
	async deriveKey(
		rootKey: Uint8Array,
		bip44Path: number[],
		isPrivate: boolean = true,
		derivationType: BIP32DerivationType,
	): Promise<Uint8Array> {
		const g: number = derivationType === BIP32DerivationType.Peikert ? 9 : 32;

		for (let i = 0; i < bip44Path.length; i++) {
			rootKey = await deriveChildNodePrivate(rootKey, bip44Path[i]!, g);
		}

		if (isPrivate) return rootKey;

		return new Uint8Array(
			Buffer.concat([
				crypto_scalarmult_ed25519_base_noclamp(rootKey.subarray(0, 32)),
				rootKey.subarray(64, 96),
			]),
		);
	}

	async keyGen(
		rootKey: Uint8Array,
		context: KeyContext,
		account: number,
		keyIndex: number,
		derivationType: BIP32DerivationType = BIP32DerivationType.Peikert,
	): Promise<Uint8Array> {
		const extendedKey: Uint8Array = await this.deriveKey(
			rootKey,
			getBip44PathFromContext(context, account, keyIndex),
			false,
			derivationType,
		);

		return extendedKey.subarray(0, 32);
	}

	private async rawSign(
		rootKey: Uint8Array,
		bip44Path: number[],
		data: Uint8Array,
		derivationType: BIP32DerivationType,
	): Promise<Uint8Array> {
		const raw: Uint8Array = await this.deriveKey(rootKey, bip44Path, true, derivationType);
		const scalar: Uint8Array = raw.slice(0, 32);
		const kR: Uint8Array = raw.slice(32, 64);
		const publicKey = crypto_scalarmult_ed25519_base_noclamp(scalar);
		const r = crypto_core_ed25519_scalar_reduce(sha512(Buffer.concat([kR, data])));
		const R = crypto_scalarmult_ed25519_base_noclamp(r);
		const h = crypto_core_ed25519_scalar_reduce(sha512(Buffer.concat([R, publicKey, data])));
		const S = crypto_core_ed25519_scalar_add(r, crypto_core_ed25519_scalar_mul(h, scalar));

		return Buffer.concat([R, S]);
	}

	async signAlgoTransaction(
		rootKey: Uint8Array,
		context: KeyContext,
		account: number,
		keyIndex: number,
		prefixEncodedTx: Uint8Array,
		derivationType: BIP32DerivationType = BIP32DerivationType.Peikert,
	): Promise<Uint8Array> {
		return this.rawSign(
			rootKey,
			getBip44PathFromContext(context, account, keyIndex),
			prefixEncodedTx,
			derivationType,
		);
	}
}
