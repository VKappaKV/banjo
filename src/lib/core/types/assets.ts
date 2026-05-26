export interface TinyAsset {
	id: string;
	name: string;
	unit_name: string;
	decimals: number;
	url: string;
	total_amount: string;
	logo: {
		png: string;
		svg: string;
	};
	deleted: boolean;
}
