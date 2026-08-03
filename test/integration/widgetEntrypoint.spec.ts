import { env, createExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import {
  GetWidgetByNameInput,
  GetWidgetByNameResult,
} from "../../src/adapters/primary/rpc/entrypoints/widgetEntrypoint";

// The `WidgetEntrypoint` named `WorkerEntrypoint` is exported from the main
// worker and exposed by the vitest-pool-workers integration via `ctx.exports`.
interface CtxWithExports {
  exports?: {
    WidgetEntrypoint?: {
      getWidgetByName(input: GetWidgetByNameInput): Promise<GetWidgetByNameResult>;
    };
  };
}

function getEntrypoint(): NonNullable<
  NonNullable<CtxWithExports["exports"]>["WidgetEntrypoint"]
> {
  const ctx = createExecutionContext() as CtxWithExports;
  const entrypoint = ctx.exports?.WidgetEntrypoint;
  if (!entrypoint) {
    throw new Error(
      "WidgetEntrypoint not found on ctx.exports. " +
        "Check that it is exported from src/index.ts.",
    );
  }
  return entrypoint;
}

const SEEDED_NAME = "Example Widget";

describe("WidgetEntrypoint.getWidgetByName", () => {
  beforeEach(async () => {
    // Ensure the seeded widget exists (migration 0002) for the happy path.
    await env.DB.prepare(
      `INSERT OR IGNORE INTO widgets (id, name, description)
       VALUES ('11111111-2222-3333-4444-555555555555', ?, 'Seeded by migration 0002')`,
    )
      .bind(SEEDED_NAME)
      .run();
  });

  it("returns the widget for a known name", async () => {
    const entrypoint = getEntrypoint();
    const result = await entrypoint.getWidgetByName({ name: SEEDED_NAME });
    expect(result.widget.name).toBe(SEEDED_NAME);
  });

  it("throws for an unknown name", async () => {
    const entrypoint = getEntrypoint();

    let error: unknown;
    try {
      await entrypoint.getWidgetByName({ name: "does-not-exist" });
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect((error as Error).message).toContain("not found");
  });

  it("throws for an empty name", async () => {
    const entrypoint = getEntrypoint();

    let error: unknown;
    try {
      await entrypoint.getWidgetByName({ name: "" });
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect((error as Error).message).toContain("non-empty string");
  });
});
