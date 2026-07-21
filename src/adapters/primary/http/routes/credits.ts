import { Hono } from "hono";
import { sValidator } from "@hono/standard-validator";
import { Context } from "hono";
import { authenticationMiddleware } from "../middlewares";
import { AppEnv } from "../types";
import { CreditService } from "../../../../core/services/creditService";
import { D1CreditRepository } from "../../../secondary/d1CreditRepository";
import { DefaultLogger } from "../../../secondary/loggers";
import {
  grantMonthlySchema,
  grantPermanentSchema,
  recallMonthlySchema,
  recallPermanentSchema,
  resetMonthlyByUserSchema,
  resetMonthlyForAllUsersSchema,
} from "../models/requestSchemas";

// ── DI helper ──

function getCreditService(c: Context<AppEnv>): CreditService {
  return new CreditService(
    new D1CreditRepository(c.env.CREDIT_DB),
    new DefaultLogger(),
  );
}

// ── Routes ──

const creditRoutes = new Hono<AppEnv>();

// All routes require authentication
creditRoutes.use("*", authenticationMiddleware());

// POST /admin/credits/grant/monthly
creditRoutes.post(
  "/grant/monthly",
  sValidator("json", grantMonthlySchema),
  async (c) => {
    const principalType = c.get("principalType");
    const principalRoles = c.get("principalRoles");

    await c.env.ACCESS_MGMT.authorize(
      principalType,
      principalRoles,
      "credit",
      "grant_monthly",
    );

    const body = c.req.valid("json");
    const creditService = getCreditService(c);
    const result = await creditService.grantMonthly(body);

    return c.json({ data: result }, 201);
  },
);

// POST /admin/credits/grant/permanent
creditRoutes.post(
  "/grant/permanent",
  sValidator("json", grantPermanentSchema),
  async (c) => {
    const principalType = c.get("principalType");
    const principalRoles = c.get("principalRoles");

    await c.env.ACCESS_MGMT.authorize(
      principalType,
      principalRoles,
      "credit",
      "grant_permanent",
    );

    const body = c.req.valid("json");
    const creditService = getCreditService(c);
    const result = await creditService.grantPermanent(body);

    return c.json({ data: result }, 201);
  },
);

// POST /admin/credits/recall/monthly
creditRoutes.post(
  "/recall/monthly",
  sValidator("json", recallMonthlySchema),
  async (c) => {
    const principalType = c.get("principalType");
    const principalRoles = c.get("principalRoles");

    await c.env.ACCESS_MGMT.authorize(
      principalType,
      principalRoles,
      "credit",
      "recall_monthly",
    );

    const body = c.req.valid("json");
    const creditService = getCreditService(c);
    const result = await creditService.recallMonthly(body);

    return c.json({ data: result }, 200);
  },
);

// POST /admin/credits/recall/permanent
creditRoutes.post(
  "/recall/permanent",
  sValidator("json", recallPermanentSchema),
  async (c) => {
    const principalType = c.get("principalType");
    const principalRoles = c.get("principalRoles");

    await c.env.ACCESS_MGMT.authorize(
      principalType,
      principalRoles,
      "credit",
      "recall_permanent",
    );

    const body = c.req.valid("json");
    const creditService = getCreditService(c);
    const result = await creditService.recallPermanent(body);

    return c.json({ data: result }, 200);
  },
);

// POST /admin/credits/reset/monthly
creditRoutes.post(
  "/reset/monthly",
  sValidator("json", resetMonthlyByUserSchema),
  async (c) => {
    const principalType = c.get("principalType");
    const principalRoles = c.get("principalRoles");

    await c.env.ACCESS_MGMT.authorize(
      principalType,
      principalRoles,
      "credit",
      "reset_monthly",
    );

    const { userId } = c.req.valid("json");

    await c.env.CREDIT_RESET_QUEUE.send({ userId });

    return c.json({ data: { userId, status: "queued" } }, 202);
  },
);

// POST /admin/credits/reset/monthly-all
creditRoutes.post(
  "/reset/monthly-all",
  sValidator("json", resetMonthlyForAllUsersSchema),
  async (c) => {
    const principalType = c.get("principalType");
    const principalRoles = c.get("principalRoles");

    await c.env.ACCESS_MGMT.authorize(
      principalType,
      principalRoles,
      "credit",
      "reset_monthly_all",
    );

    const creditService = getCreditService(c);
    const creditRepo = new D1CreditRepository(c.env.CREDIT_DB);

    // Compute current month period
    const now = new Date();
    const effectiveFrom = Math.floor(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000,
    );
    const expiredAt = Math.floor(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59) /
        1000,
    );

    // Get all monthly accounts for current period
    const accounts = await creditRepo.getMonthlyAccountsByPeriod(
      effectiveFrom,
      expiredAt,
    );

    // Enqueue each user's reset
    const enqueued: string[] = [];
    for (const account of accounts) {
      await c.env.CREDIT_RESET_QUEUE.send({ userId: account.userId });
      enqueued.push(account.userId);
    }

    return c.json(
      { data: { enqueuedCount: enqueued.length, status: "queued" } },
      202,
    );
  },
);

export { creditRoutes };
