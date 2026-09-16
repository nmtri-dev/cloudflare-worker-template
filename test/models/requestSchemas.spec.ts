import { describe, it, expect } from "vitest";
import {
  createWidgetSchema,
  updateWidgetSchema,
} from "../../src/adapters/primary/http/models";

describe("createWidgetSchema", () => {
  it("accepts a valid payload", () => {
    const result = createWidgetSchema.safeParse({
      name: "My Widget",
      description: "A widget",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a payload without description", () => {
    const result = createWidgetSchema.safeParse({ name: "My Widget" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = createWidgetSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a name without letters or digits", () => {
    const result = createWidgetSchema.safeParse({ name: "!!!" });
    expect(result.success).toBe(false);
  });
});

describe("updateWidgetSchema", () => {
  it("accepts a partial payload", () => {
    const result = updateWidgetSchema.safeParse({ description: "updated" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = updateWidgetSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});
