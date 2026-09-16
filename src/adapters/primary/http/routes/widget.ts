import { Hono } from "hono";
import { sValidator } from "@hono/standard-validator";
import { AppEnv } from "../types";
import { authenticationMiddleware, rateLimitMiddleware } from "../middlewares";
import { DefaultLogger } from "../../../secondary/loggers";
import { D1WidgetRepository } from "../../../secondary/d1WidgetRepository";
import { WidgetService } from "../../../../core/services/widgetService";
import {
  createWidgetSchema,
  updateWidgetSchema,
} from "../models";

export const widgetRoutes = new Hono<AppEnv>();

// All widget routes require a valid JWT.
widgetRoutes.use(authenticationMiddleware());
// Rate limit per authenticated principal (keyed on the principal ID set by
// the authentication middleware above). MUST stay after authentication.
widgetRoutes.use(rateLimitMiddleware());

widgetRoutes.get("/", async (c) => {
  const logger = new DefaultLogger();
  const repo = new D1WidgetRepository(c.env.DB, logger);
  const service = new WidgetService(repo, logger, c.env.ACCESS_MGMT);

  const widgets = await service.listWidgets(
    c.get("principalType"),
    c.get("principalRoles"),
  );
  return c.json({ data: widgets });
});

widgetRoutes.get("/:id", async (c) => {
  const logger = new DefaultLogger();
  const repo = new D1WidgetRepository(c.env.DB, logger);
  const service = new WidgetService(repo, logger, c.env.ACCESS_MGMT);

  const widget = await service.getWidget(
    c.req.param("id"),
    c.get("principalType"),
    c.get("principalRoles"),
  );
  return c.json({ data: widget });
});

widgetRoutes.post("/", sValidator("json", createWidgetSchema), async (c) => {
  const logger = new DefaultLogger();
  const repo = new D1WidgetRepository(c.env.DB, logger);
  const service = new WidgetService(repo, logger, c.env.ACCESS_MGMT);

  const body = c.req.valid("json");
  const widget = await service.createWidget(
    body,
    c.get("principalType"),
    c.get("principalRoles"),
  );
  return c.json({ data: widget }, 201);
});

widgetRoutes.put("/:id", sValidator("json", updateWidgetSchema), async (c) => {
  const logger = new DefaultLogger();
  const repo = new D1WidgetRepository(c.env.DB, logger);
  const service = new WidgetService(repo, logger, c.env.ACCESS_MGMT);

  const body = c.req.valid("json");
  const widget = await service.updateWidget(
    c.req.param("id"),
    body,
    c.get("principalType"),
    c.get("principalRoles"),
  );
  return c.json({ data: widget });
});

widgetRoutes.delete("/:id", async (c) => {
  const logger = new DefaultLogger();
  const repo = new D1WidgetRepository(c.env.DB, logger);
  const service = new WidgetService(repo, logger, c.env.ACCESS_MGMT);

  await service.deleteWidget(
    c.req.param("id"),
    c.get("principalType"),
    c.get("principalRoles"),
  );
  return c.json({ data: { id: c.req.param("id") } });
});
