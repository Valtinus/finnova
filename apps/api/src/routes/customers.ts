import { createRoute, z } from "@hono/zod-openapi";
import { notFound } from "../lib/errors";
import { maskEmail } from "../lib/format";
import { bearer, createRouter } from "../lib/router";
import { requireAuth } from "../middleware/auth";
import { PartySchema, errorJson, errorResponses, json } from "../schemas";
import { findCustomerByIdentifier } from "../services/customers";

const lookup = createRoute({
  method: "get",
  path: "/lookup",
  tags: ["P2P Transfers"],
  summary: "Find a recipient by email or phone (shows name before sending)",
  security: bearer,
  request: {
    query: z.object({ q: z.string().min(3).openapi({ example: "bob@finnova.test" }) }),
  },
  responses: {
    200: json(PartySchema, "Recipient"),
    401: errorResponses[401],
    404: errorJson("No customer with that email/phone"),
  },
});

const router = createRouter();
router.use("*", requireAuth);

export const customerRoutes = router.openapi(lookup, (c) => {
  const found = findCustomerByIdentifier(c.var.deps.db, c.req.valid("query").q);
  if (!found) throw notFound("Customer");
  return c.json({ customerId: found.id, name: found.fullName, email: maskEmail(found.email) }, 200);
});
