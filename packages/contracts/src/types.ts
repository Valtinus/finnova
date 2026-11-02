import type { BigNumberish, Contract, ContractTransactionResponse } from "ethers";

/** FinNovaBank's functions with their real types (ethers' Contract only knows them at runtime). */
export interface FinNovaBankFunctions {
  deposit(overrides: { value: BigNumberish }): Promise<ContractTransactionResponse>;
  withdraw(amount: BigNumberish): Promise<ContractTransactionResponse>;
  transfer(to: string, amount: BigNumberish): Promise<ContractTransactionResponse>;
  checkBalance(): Promise<bigint>;
  balanceOf(account: string): Promise<bigint>;
  totalDeposits(): Promise<bigint>;
}

/** A FinNovaBank contract instance: `new Contract(address, FINNOVA_BANK_ABI, runner) as FinNovaBank`. */
export type FinNovaBank = Contract & FinNovaBankFunctions;
