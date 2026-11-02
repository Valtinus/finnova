import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ContractFactory, formatEther, JsonRpcProvider, Wallet, type Signer } from "ethers";
import { FINNOVA_BANK_ABI, FINNOVA_BANK_BYTECODE } from "../src";

/**
 * Deploy FinNovaBank to a local chain and point the DApp at it.
 *
 *   RPC_URL      default http://127.0.0.1:8545 (`bun run chain`); the Ganache desktop app uses :7545
 *   PRIVATE_KEY  optional deployer key; without it the node's first unlocked account deploys
 */
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const DAPP_ENV = join(import.meta.dir, "..", "..", "..", "apps", "dapp", ".env.local");

const provider = new JsonRpcProvider(RPC_URL);
let network;
try {
  network = await provider.getNetwork();
} catch {
  console.error(`No blockchain node at ${RPC_URL}. Start one with \`bun run chain\` or set RPC_URL.`);
  process.exit(1);
}

const deployer: Signer = process.env.PRIVATE_KEY ? new Wallet(process.env.PRIVATE_KEY, provider) : await provider.getSigner(0);
const deployerAddress = await deployer.getAddress();

const factory = new ContractFactory(FINNOVA_BANK_ABI, FINNOVA_BANK_BYTECODE, deployer);
const contract = await factory.deploy();
const receipt = await contract.deploymentTransaction()!.wait();
const address = await contract.getAddress();

console.log(`FinNovaBank deployed
  network   chain id ${network.chainId} (${RPC_URL})
  address   ${address}
  deployer  ${deployerAddress} (${formatEther(await provider.getBalance(deployerAddress))} ETH left)
  tx        ${receipt!.hash} in block ${receipt!.blockNumber}, ${receipt!.gasUsed} gas`);

// Keep any other settings in apps/dapp/.env.local and replace only the contract address
const kept = existsSync(DAPP_ENV)
  ? readFileSync(DAPP_ENV, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("VITE_CONTRACT_ADDRESS="))
  : [];
writeFileSync(DAPP_ENV, [...kept, `VITE_CONTRACT_ADDRESS=${address}`, ""].join("\n"));
console.log(`\nWrote VITE_CONTRACT_ADDRESS to apps/dapp/.env.local (restart \`bun run dev:dapp\` to pick it up).`);
