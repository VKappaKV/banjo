import { signingErrorCodes, toSigningError } from "../signing";
import type { ProtocolErrorResponse } from "./models";

export const protocolErrorCodes = {
	transactionSentByWallet: 4000,
	userRejected: signingErrorCodes.userRejected,
	modalRejected: 4100,
	multisigUnsupported: 4200,
	tooManyTransactions: signingErrorCodes.tooManyTransactions,
	invalidRequest: signingErrorCodes.invalidRequest,
	invalidSignDataScope: signingErrorCodes.invalidSignDataScope,
	failedSignDataDecoding: signingErrorCodes.failedSignDataDecoding,
	invalidSignDataSigner: signingErrorCodes.invalidSignDataSigner,
	badSignDataJson: signingErrorCodes.badSignDataJson,
	failedDomainAuthentication: signingErrorCodes.failedDomainAuthentication,
} as const;

export class ProtocolError extends Error {
	constructor(
		message: string,
		public readonly code: number = protocolErrorCodes.invalidRequest,
		public readonly data?: unknown,
	) {
		super(message);
		this.name = "ProtocolError";
	}
}

export function toProtocolError(error: unknown): ProtocolError {
	if (error instanceof ProtocolError) {
		return error;
	}

	const signingError = toSigningError(error);

	return new ProtocolError(signingError.message, signingError.code, signingError.data);
}

export function normalizeProtocolError(error: unknown): ProtocolErrorResponse {
	const protocolError = toProtocolError(error);

	return {
		action: "error",
		code: protocolError.code,
		error: protocolError.message,
		...(protocolError.data === undefined ? {} : { data: protocolError.data }),
	};
}
