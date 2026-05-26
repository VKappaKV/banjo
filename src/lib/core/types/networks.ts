export interface NetworkClient {
	url: string;
	port: string;
	token: string;
}

export interface Network {
	name: string;
	algod: NetworkClient;
	indexer?: NetworkClient;
	kmd?: NetworkClient;
	fallback?: {
		algod: NetworkClient;
		indexer: NetworkClient;
	};
	genesisID: string;
	genesisHash?: string;
	explorer: string;
	nfdUrl?: string;
	inboxRouter?: number;
	lutier?: { app: number; asset: number };
}
