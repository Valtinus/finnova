import { beforeEach, describe, expect, test } from "bun:test";
import { BrowserProvider, ContractFactory, parseEther, ZeroAddress, type EventLog, type JsonRpcSigner } from "ethers";
import ganache from "ganache";
import { compile } from "../scripts/compile";
import { FINNOVA_BANK_ABI, FINNOVA_BANK_BYTECODE, describeError, revertReason, type FinNovaBank } from "../src";

// Every test gets a fresh in-process Ganache chain with the 10 deterministic, pre-funded accounts.
let provider: BrowserProvider;
let alice: JsonRpcSigner;
let bob: JsonRpcSigner;
let bank: FinNovaBank;

beforeEach(async () => {
  const chain = ganache.provider({ logging: { quiet: true }, wallet: { deterministic: true }, chain: { chainId: 1337 } });
  // ethers caches identical reads for 250ms; Ganache mines instantly, so the cache would hide changes
  provider = new BrowserProvider(chain as never, undefined, { cacheTimeout: -1 });
  alice = await provider.getSigner(0);
  bob = await provider.getSigner(1);
  const factory = new ContractFactory(FINNOVA_BANK_ABI, FINNOVA_BANK_BYTECODE, alice);
  bank = (await (await factory.deploy()).waitForDeployment()) as FinNovaBank;
});

/** The bank contract as seen by `signer` (msg.sender). */
const as = (signer: JsonRpcSigner) => bank.connect(signer) as FinNovaBank;

async function send(promise: Promise<{ wait(): Promise<unknown> }>) {
  return (await promise).wait() as Promise<{ logs: EventLog[]; gasUsed: bigint; gasPrice: bigint }>;
}

async function expectRevert(promise: Promise<unknown>, reason: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).not.toBeNull();
  expect(revertReason(error)).toBe(reason);
}

describe("artifact", () => {
  test("committed ABI and bytecode match a fresh compile of FinNovaBank.sol", () => {
    const fresh = compile();
    expect(FINNOVA_BANK_BYTECODE).toBe(fresh.bytecode);
    expect(FINNOVA_BANK_ABI).toEqual(fresh.abi as typeof FINNOVA_BANK_ABI);
  });
});

describe("deposit", () => {
  test("credits the caller and emits Deposited", async () => {
    const receipt = await send(as(alice).deposit({ value: parseEther("1.5") }));

    expect(await as(alice).checkBalance()).toBe(parseEther("1.5"));
    expect(await bank.totalDeposits()).toBe(parseEther("1.5"));
    expect(await provider.getBalance(await bank.getAddress())).toBe(parseEther("1.5"));

    const event = receipt.logs[0]!;
    expect(event.eventName).toBe("Deposited");
    expect(event.args.account).toBe(alice.address);
    expect(event.args.amount).toBe(parseEther("1.5"));
    expect(event.args.newBalance).toBe(parseEther("1.5"));
  });

  test("deposits add up", async () => {
    await send(as(alice).deposit({ value: parseEther("1") }));
    await send(as(alice).deposit({ value: parseEther("0.25") }));
    expect(await as(alice).checkBalance()).toBe(parseEther("1.25"));
  });

  test("plain ether sent to the contract counts as a deposit", async () => {
    await send(alice.sendTransaction({ to: await bank.getAddress(), value: parseEther("2") }));
    expect(await as(alice).checkBalance()).toBe(parseEther("2"));
  });

  test("a zero deposit is rejected", async () => {
    await expectRevert(as(alice).deposit({ value: 0 }), "Deposit must be greater than zero");
  });
});

describe("withdraw", () => {
  test("debits the account and sends the ether back to the caller", async () => {
    await send(as(alice).deposit({ value: parseEther("3") }));
    const walletBefore = await provider.getBalance(alice.address);

    const receipt = await send(as(alice).withdraw(parseEther("1")));
    const gas = receipt.gasUsed * receipt.gasPrice;

    expect(await as(alice).checkBalance()).toBe(parseEther("2"));
    expect(await bank.totalDeposits()).toBe(parseEther("2"));
    expect(await provider.getBalance(alice.address)).toBe(walletBefore + parseEther("1") - gas);
    expect(receipt.logs[0]!.eventName).toBe("Withdrawn");
    expect(receipt.logs[0]!.args.newBalance).toBe(parseEther("2"));
  });

  test("cannot withdraw more than the balance", async () => {
    await send(as(alice).deposit({ value: parseEther("1") }));
    await expectRevert(as(alice).withdraw(parseEther("1.01")), "Insufficient balance");
    expect(await as(alice).checkBalance()).toBe(parseEther("1"));
  });

  test("a zero withdrawal is rejected", async () => {
    await expectRevert(as(alice).withdraw(0), "Amount must be greater than zero");
  });
});

describe("transfer", () => {
  test("moves funds between accounts without leaving the bank", async () => {
    await send(as(alice).deposit({ value: parseEther("5") }));

    const receipt = await send(as(alice).transfer(bob.address, parseEther("2")));

    expect(await as(alice).checkBalance()).toBe(parseEther("3"));
    expect(await as(bob).checkBalance()).toBe(parseEther("2"));
    expect(await bank.balanceOf(bob.address)).toBe(parseEther("2"));
    expect(await bank.totalDeposits()).toBe(parseEther("5"));

    const event = receipt.logs[0]!;
    expect(event.eventName).toBe("Transferred");
    expect([event.args.from, event.args.to, event.args.amount]).toEqual([alice.address, bob.address, parseEther("2")]);
  });

  test("the recipient can withdraw what they received", async () => {
    await send(as(alice).deposit({ value: parseEther("1") }));
    await send(as(alice).transfer(bob.address, parseEther("1")));
    await send(as(bob).withdraw(parseEther("1")));
    expect(await as(bob).checkBalance()).toBe(0n);
    expect(await bank.totalDeposits()).toBe(0n);
  });

  test("cannot transfer more than the balance", async () => {
    await send(as(alice).deposit({ value: parseEther("1") }));
    await expectRevert(as(alice).transfer(bob.address, parseEther("2")), "Insufficient balance");
  });

  test("rejects the zero address, yourself and zero amounts", async () => {
    await send(as(alice).deposit({ value: parseEther("1") }));
    await expectRevert(as(alice).transfer(ZeroAddress, 1n), "Invalid recipient");
    await expectRevert(as(alice).transfer(alice.address, 1n), "Cannot transfer to yourself");
    await expectRevert(as(alice).transfer(bob.address, 0n), "Amount must be greater than zero");
  });
});

describe("checkBalance", () => {
  test("returns the balance of whoever calls it", async () => {
    await send(as(alice).deposit({ value: parseEther("1") }));
    await send(as(bob).deposit({ value: parseEther("0.3") }));
    expect(await as(alice).checkBalance()).toBe(parseEther("1"));
    expect(await as(bob).checkBalance()).toBe(parseEther("0.3"));
  });

  test("is zero for a new account", async () => {
    expect(await as(bob).checkBalance()).toBe(0n);
  });
});

describe("history", () => {
  test("every operation is recorded on chain as an event", async () => {
    await send(as(alice).deposit({ value: parseEther("2") }));
    await send(as(alice).transfer(bob.address, parseEther("0.5")));
    await send(as(alice).withdraw(parseEther("1")));

    const deposits = await bank.queryFilter(bank.filters.Deposited!(alice.address));
    const sent = await bank.queryFilter(bank.filters.Transferred!(alice.address));
    const received = await bank.queryFilter(bank.filters.Transferred!(null, bob.address));
    const withdrawals = await bank.queryFilter(bank.filters.Withdrawn!(alice.address));

    expect([deposits.length, sent.length, received.length, withdrawals.length]).toEqual([1, 1, 1, 1]);
    expect(await as(alice).checkBalance()).toBe(parseEther("0.5"));
  });
});

describe("error messages", () => {
  test("revert reasons are found in MetaMask's wrapped node errors", () => {
    const metamask = {
      code: -32603,
      message: "Internal JSON-RPC error.",
      data: { code: -32000, message: "VM Exception while processing transaction: revert Insufficient balance" },
    };
    expect(revertReason(metamask)).toBe("Insufficient balance");
    expect(revertReason({ message: "execution reverted: Invalid recipient" })).toBe("Invalid recipient");
    expect(revertReason(new Error("network down"))).toBeNull();
  });

  test("a rejected MetaMask prompt gets a friendly message", () => {
    const rejected = Object.assign(new Error("user rejected action"), { code: "ACTION_REJECTED" });
    expect(describeError(rejected)).toBe("You rejected the request in MetaMask.");
  });
});
