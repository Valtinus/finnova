import { createRoute, z } from "@hono/zod-openapi";
import { bearer, createRouter } from "../lib/router";
import { requireAuth } from "../middleware/auth";
import {
  ChainAccountSchema,
  ChainPartySchema,
  EthAddressSchema,
  LinkChallengeSchema,
  errorJson,
  errorResponses,
  json,
} from "../schemas";
import {
  createLinkChallenge,
  getChainAccount,
  isEthAddress,
  linkChainAccount,
  lookupChainParty,
  toChainAccountDto,
  unlinkChainAccount,
} from "../services/chain-accounts";

const TAG = "Blockchain";

/** Mixed-case addresses must carry a valid EIP-55 checksum (catches typos). */
const Address = EthAddressSchema.refine(isEthAddress, "Invalid address checksum");

const AccountResponse = z.object({ account: ChainAccountSchema.nullable() });

const getAccount = createRoute({
  method: "get",
  path: "/account",
  tags: [TAG],
  summary: "My linked blockchain wallet",
  security: bearer,
  responses: {
    200: json(AccountResponse, "The linked wallet, or null"),
    401: errorResponses[401],
  },
});

const challenge = createRoute({
  method: "post",
  path: "/account/challenge",
  tags: [TAG],
  summary: "Start linking a wallet: get the message to sign",
  description:
    "Returns a message that names you, the wallet address and the time. Sign it in MetaMask (`personal_sign`) and send the signature to `PUT /blockchain/account` before `expiresAt`.",
  security: bearer,
  request: {
    body: { required: true, content: { "application/json": { schema: z.object({ address: Address }) } } },
  },
  responses: {
    200: json(LinkChallengeSchema, "Message to sign"),
    400: errorResponses[400],
    401: errorResponses[401],
  },
});

const link = createRoute({
  method: "put",
  path: "/account",
  tags: [TAG],
  summary: "Finish linking a wallet with the signed message",
  description: "Replaces any wallet linked before. A wallet can be linked to one FinNova account only.",
  security: bearer,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            address: Address,
            issuedAt: z.string().openapi({ description: "From the challenge" }),
            signature: z.string().regex(/^0x[0-9a-fA-F]+$/, "Not a hex signature"),
          }),
        },
      },
    },
  },
  responses: {
    200: json(ChainAccountSchema, "Linked wallet"),
    400: errorJson("Invalid or expired signature (INVALID_SIGNATURE, LINK_EXPIRED) or validation error"),
    401: errorResponses[401],
    409: errorJson("Wallet already linked to another customer"),
  },
});

const unlink = createRoute({
  method: "delete",
  path: "/account",
  tags: [TAG],
  summary: "Unlink my blockchain wallet",
  security: bearer,
  responses: {
    200: json(AccountResponse, "No wallet linked any more"),
    401: errorResponses[401],
  },
});

const lookup = createRoute({
  method: "get",
  path: "/lookup",
  tags: [TAG],
  summary: "Find a customer's wallet by email, phone or address",
  description: "Used to send on-chain transfers to FinNova customers, and to show names instead of addresses.",
  security: bearer,
  request: {
    query: z.object({ q: z.string().min(3).openapi({ example: "bob@finnova.test" }) }),
  },
  responses: {
    200: json(ChainPartySchema, "Customer and wallet"),
    401: errorResponses[401],
    404: errorJson("No such customer, or no wallet linked"),
  },
});

const router = createRouter();
router.use("*", requireAuth);

export const blockchainRoutes = router
  .openapi(getAccount, (c) => {
    const account = getChainAccount(c.var.deps.db, c.var.customerId);
    return c.json({ account: account && toChainAccountDto(account) }, 200);
  })
  .openapi(challenge, (c) => {
    const { db, config } = c.var.deps;
    return c.json(createLinkChallenge(db, config, c.var.customerId, c.req.valid("json").address), 200);
  })
  .openapi(link, (c) => {
    const { db, config } = c.var.deps;
    return c.json(toChainAccountDto(linkChainAccount(db, config, c.var.customerId, c.req.valid("json"))), 200);
  })
  .openapi(unlink, (c) => {
    unlinkChainAccount(c.var.deps.db, c.var.customerId);
    return c.json({ account: null }, 200);
  })
  .openapi(lookup, (c) => {
    return c.json(lookupChainParty(c.var.deps.db, c.req.valid("query").q), 200);
  });
