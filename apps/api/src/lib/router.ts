import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../env";

/** OpenAPIHono with our error format for request-validation failures. */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Request validation failed",
              details: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            },
          },
          400,
        );
      }
    },
  });
}

export const bearer = [{ bearerAuth: [] }];
