import { WorkerEntrypoint } from "cloudflare:workers";
import { D1WidgetRepository } from "../../../secondary/d1WidgetRepository";
import { DefaultLogger } from "../../../secondary/loggers";
import { BadRequestError, NotFoundError, Widget } from "../../../../core/domain";

export interface GetWidgetByNameInput {
  name: string;
}

export interface GetWidgetByNameResult {
  widget: Widget;
}

/**
 * Example named `WorkerEntrypoint` (RPC surface).
 *
 * Demonstrates the template's RPC conventions (ported from
 * cardy-ai-subscription):
 * - Trusted service-to-service calls — no auth middleware, no `{data}`
 *   envelope, no openapi paths.
 * - Returns typed results directly.
 * - Wires secondary adapters together (composition root). RPC entrypoints
 *   call repositories directly and bypass `AccessManagementService` — callers
 *   are trusted internal services.
 */
export class WidgetEntrypoint extends WorkerEntrypoint<CloudflareBindings> {
  async getWidgetByName(
    input: GetWidgetByNameInput,
  ): Promise<GetWidgetByNameResult> {
    const logger = new DefaultLogger();
    const repo = new D1WidgetRepository(this.env.DB, logger);

    if (!input.name || typeof input.name !== "string") {
      logger.error("Invalid name for widget lookup", { name: input.name });
      throw new BadRequestError("name must be a non-empty string");
    }

    const widget = await repo.getWidgetByName(input.name);
    if (!widget) {
      logger.error("Widget not found for name", { name: input.name });
      throw new NotFoundError(`Widget with name '${input.name}' not found`);
    }

    return { widget };
  }
}
