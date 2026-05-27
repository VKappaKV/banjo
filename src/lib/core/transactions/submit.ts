import { waitForConfirmation, type Algodv2, type modelsv2 } from "algosdk";

export interface SubmitSignedTransactionsOptions {
	algod: Algodv2;
	signedTransactions: Uint8Array | Uint8Array[];
	waitRounds?: number;
}

interface SendRawTransactionResponse {
	txid?: string;
	txId?: string;
}

export async function submitSignedTransactions({
	algod,
	signedTransactions,
	waitRounds = 10,
}: SubmitSignedTransactionsOptions): Promise<modelsv2.PendingTransactionResponse> {
	const response = (await algod.sendRawTransaction(signedTransactions).do()) as SendRawTransactionResponse;
	const txId = response.txid ?? response.txId;

	if (!txId) {
		throw new Error("Algod did not return a transaction ID");
	}

	return waitForConfirmation(algod, txId, waitRounds);
}
