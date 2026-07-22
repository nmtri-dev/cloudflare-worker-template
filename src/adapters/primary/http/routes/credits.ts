import { Hono } from "hono";
import { sValidator } from "@hono/standard-validator";
import { Context } from "hono";
import { authenticationMiddleware } from "../middlewares";
import { AppEnv } from "../types";
import { CreditService } from "../../../../core/services/creditService";
import { D1CreditRepository } from "../../../secondary/d1CreditRepository";
import { DefaultLogger } from "../../../secondary/loggers";
import { getCurrentMonthlyPeriodUTC } from "../../../../utils/dateUtils";
import {
  grantMonthlySchema,
  grantPermanentSchema,
  recallMonthlySchema,
  recallPermanentSchema,
  recallPermanentPartialSchema,
  resetMonthlyByUserSchema,
  resetMonthlyForAllUsersSchema,
} from "../models/requestSchemas";

// ── DI helper ──

function getCreditService(c: Context<AppEnv>): CreditService {
  return new CreditService(
    new D1CreditRepository(c.env.CREDIT_DB, new DefaultLogger()),
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
    const result = await creditService.grantMonthly({
      ...body,
      referenceType: "admin",
      referenceId: c.get("principalId"),
    });

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
    const result = await creditService.grantPermanent({
      ...body,
      referenceType: "admin",
      referenceId: c.get("principalId"),
    });

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
    const result = await creditService.recallMonthly({
      ...body,
      referenceType: "admin",
      referenceId: c.get("principalId"),
    });

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
    const result = await creditService.recallPermanent({
      ...body,
      referenceType: "admin",
      referenceId: c.get("principalId"),
    });

    return c.json({ data: result }, 200);
  },
);

// POST /admin/credits/recall/permanent/partial
creditRoutes.post(
  "/recall/permanent/partial",
  sValidator("json", recallPermanentPartialSchema),
  async (c) => {
    const principalType = c.get("principalType");
    const principalRoles = c.get("principalRoles");

    await c.env.ACCESS_MGMT.authorize(
      principalType,
      principalRoles,
      "credit",
      "recall_permanent_partial",
    );

    const body = c.req.valid("json");
    const creditService = getCreditService(c);
    const result = await creditService.recallPermanentPartial({
      ...body,
      referenceType: "admin",
      referenceId: c.get("principalId"),
    });

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

    await c.env.CREDIT_RESET_QUEUE.send({
      userId,
      referenceType: "admin",
      referenceId: c.get("principalId"),
    });

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

    const creditRepo = new D1CreditRepository(
      c.env.CREDIT_DB,
      new DefaultLogger(),
    );

    const { effectiveFrom, expiredAt } = getCurrentMonthlyPeriodUTC();

    // Get all monthly accounts for current period
    const accounts = await creditRepo.getMonthlyAccountsByPeriod(
      effectiveFrom,
      expiredAt,
    );

    // Enqueue each user's reset in chunks of 50
    const CHUNK_SIZE = 50;
    const bodies = accounts.map((account) => ({
      body: {
        userId: account.userId,
        referenceType: "admin" as const,
        referenceId: c.get("principalId"),
      },
    }));
    for (let i = 0; i < bodies.length; i += CHUNK_SIZE) {
      await c.env.CREDIT_RESET_QUEUE.sendBatch(bodies.slice(i, i + CHUNK_SIZE));
    }

    return c.json(
      { data: { enqueuedCount: accounts.length, status: "queued" } },
      202,
    );
  },
);

// GET /credits/user/:userId
creditRoutes.get("/user/:userId", async (c) => {
  const principalType = c.get("principalType");
  const principalRoles = c.get("principalRoles");

  await c.env.ACCESS_MGMT.authorize(
    principalType,
    principalRoles,
    "credit",
    "read",
  );

  const userId = c.req.param("userId");

  const creditService = getCreditService(c);
  const result = await creditService.getUserCredits(userId);

  return c.json({ data: result }, 200);
});

export { creditRoutes };
