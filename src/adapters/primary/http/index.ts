import { Hono } from "hono";
import { logger } from "hono/logger";
import { handleError, requestIdMiddleware } from "./middlewares";

import { secureHeaders } from "hono/secure-headers";
import { cors } from "hono/cors";
import { AppEnv } from "./types";
import { creditRoutes } from "./routes/credits";

const app = new Hono<AppEnv>();

app.use(logger());
app.use(requestIdMiddleware());
app.use(secureHeaders());
app.use("*", (c, next) =>
  cors({
    origin: c.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })(c, next),
);

app.onError(handleError);

app.get("/message", (c) => {
  return c.text("Hello Hono!");
});

app.route("/admin/credits", creditRoutes);

export default app;
