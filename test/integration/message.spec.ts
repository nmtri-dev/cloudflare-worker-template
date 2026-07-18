import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getAuthorizationHeader } from "../helpers/auth";

// Example integration test pattern.
// Integration tests use SELF.fetch() to test against live Hono routes
// running inside the Vitest pool-workers environment.

describe("GET /message", () => {
  it("should return 200 with greeting", async () => {
    const response = await SELF.fetch("http://localhost/message");
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe("Hello Hono!");
  });
});
