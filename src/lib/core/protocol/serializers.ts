import algosdk from "algosdk";
import type {
	SignDataWalletProtocolResponse,
	SignTransactionsProtocolResponse,
} from "./models";

export interface ExtensionSignTransactionsResponse {
	action: "signed";
	txns: Array<string | null>;
}

export interface ExtensionSignDataResponse {
	action: "signed";
	signature: string;
	signer: string;
	authenticatorData: string;
}

export interface PageSignDataResponse {
	action: "signed";
	signature: Uint8Array;
	signer: Uint8Array;
	authenticatorData: Uint8Array;
}

export function bytesToBase64(bytes: Uint8Array): string {
	return algosdk.bytesToBase64(bytes);
}

export function base64ToBytes(value: string): Uint8Array {
	try {
		return algosdk.base64ToBytes(value);
	} catch (error) {
		throw new Error("Invalid base64 value", { cause: error });
	}
}

export function bytesToBase64Url(bytes: Uint8Array): string {
	return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
	const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

	return base64ToBytes(padded);
}

export function serializeSignTransactionsResponseForExtension(
	response: SignTransactionsProtocolResponse,
): ExtensionSignTransactionsResponse {
	return {
		action: response.action,
		txns: response.txns.map((transaction) => (transaction ? bytesToBase64(transaction) : null)),
	};
}

export function deserializeSignTransactionsResponseFromExtension(
	response: ExtensionSignTransactionsResponse,
): SignTransactionsProtocolResponse {
	return {
		action: response.action,
		txns: response.txns.map((transaction) => (transaction ? base64ToBytes(transaction) : null)),
	};
}

export function serializeSignDataResponseForExtension(
	response: SignDataWalletProtocolResponse,
): ExtensionSignDataResponse {
	return {
		action: response.action,
		signature: bytesToBase64(response.signature),
		signer: bytesToBase64(algosdk.decodeAddress(response.signer).publicKey),
		authenticatorData: bytesToBase64(response.authenticatorData),
	};
}

export function deserializeSignDataResponseFromExtension(response: ExtensionSignDataResponse): PageSignDataResponse {
	return {
		action: response.action,
		signature: base64ToBytes(response.signature),
		signer: base64ToBytes(response.signer),
		authenticatorData: base64ToBytes(response.authenticatorData),
	};
}
