import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { getAuthorizationHeader } from "./helpers/auth";

// Unique name per test to avoid cross-test D1 state leakage.
function nextName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

describe("Widget HTTP API", () => {
  beforeEach(async () => {
    // Clean the widgets table so each test starts fresh.
    await env.DB.prepare("DELETE FROM widgets").run();
  });

  it("returns 401 without a valid token", async () => {
    const response = await SELF.fetch("http://localhost/widgets");
    expect(response.status).toBe(401);
  });

  it("creates and lists widgets", async () => {
    const auth = await getAuthorizationHeader();
    const name = nextName("widget");

    const createResponse = await SELF.fetch("http://localhost/widgets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({ name, description: "hello" }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { data: { id: string } };
    expect(created.data.id).toBeTruthy();

    const listResponse = await SELF.fetch("http://localhost/widgets", {
      headers: { Authorization: auth },
    });
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as {
      data: Array<{ name: string }>;
    };
    expect(list.data.some((w) => w.name === name)).toBe(true);
  });

  it("rejects a duplicate widget name with 409", async () => {
    const auth = await getAuthorizationHeader();
    const name = nextName("dup");

    const first = await SELF.fetch("http://localhost/widgets", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ name }),
    });
    expect(first.status).toBe(201);

    const second = await SELF.fetch("http://localhost/widgets", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ name }),
    });
    expect(second.status).toBe(409);
  });

  it("updates and deletes a widget", async () => {
    const auth = await getAuthorizationHeader();
    const name = nextName("crud");

    const createResponse = await SELF.fetch("http://localhost/widgets", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ name }),
    });
    const created = (await createResponse.json()) as { data: { id: string } };
    const id = created.data.id;

    const updateResponse = await SELF.fetch(`http://localhost/widgets/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ description: "updated" }),
    });
    expect(updateResponse.status).toBe(200);
    const updated = (await updateResponse.json()) as {
      data: { description: string | null };
    };
    expect(updated.data.description).toBe("updated");

    const deleteResponse = await SELF.fetch(`http://localhost/widgets/${id}`, {
      method: "DELETE",
      headers: { Authorization: auth },
    });
    expect(deleteResponse.status).toBe(200);

    const getResponse = await SELF.fetch(`http://localhost/widgets/${id}`, {
      headers: { Authorization: auth },
    });
    expect(getResponse.status).toBe(404);
  });
});
