import { ABIContract } from "algosdk";
import msigAppArc4 from "./msig-app.arc4.json";

export const msigAbiContract = new ABIContract(msigAppArc4);
