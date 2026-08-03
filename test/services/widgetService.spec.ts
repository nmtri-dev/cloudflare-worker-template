import { describe, it, expect, vi } from "vitest";
import { WidgetService } from "../../src/core/services/widgetService";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  Widget,
} from "../../src/core/domain";

function makeWidget(overrides: Partial<Widget> = {}): Widget {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    name: "Test Widget",
    description: null,
    createdAt: 1700000000,
    updatedAt: null,
    ...overrides,
  };
}

function makeService() {
  const repo = {
    listWidgets: vi.fn(),
    getWidgetById: vi.fn(),
    getWidgetByName: vi.fn(),
    createWidget: vi.fn(),
    updateWidget: vi.fn(),
    deleteWidget: vi.fn(),
  };
  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const accessMgmt = { authorize: vi.fn() };
  const service = new WidgetService(repo, logger, accessMgmt);
  return { repo, logger, accessMgmt, service };
}

const principalType = "user";
const principalRoles = ["admin"];

describe("WidgetService", () => {
  it("authorizes before listing widgets", async () => {
    const { repo, accessMgmt, service } = makeService();
    repo.listWidgets.mockResolvedValue([makeWidget()]);

    await service.listWidgets(principalType, principalRoles);

    expect(accessMgmt.authorize).toHaveBeenCalledWith(
      principalType,
      principalRoles,
      "widget",
      "read",
    );
    expect(repo.listWidgets).toHaveBeenCalled();
  });

  it("throws NotFoundError when getting a missing widget", async () => {
    const { repo, service } = makeService();
    repo.getWidgetById.mockResolvedValue(null);

    await expect(
      service.getWidget("missing", principalType, principalRoles),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects empty widget names on create", async () => {
    const { service } = makeService();

    await expect(
      service.createWidget(
        { name: "   " },
        principalType,
        principalRoles,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("throws ConflictError when creating a duplicate widget name", async () => {
    const { repo, service } = makeService();
    repo.getWidgetByName.mockResolvedValue(makeWidget());

    await expect(
      service.createWidget(
        { name: "Test Widget" },
        principalType,
        principalRoles,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("creates a widget successfully", async () => {
    const { repo, accessMgmt, service } = makeService();
    const widget = makeWidget();
    repo.getWidgetByName.mockResolvedValue(null);
    repo.createWidget.mockResolvedValue(widget);

    const result = await service.createWidget(
      { name: "Test Widget" },
      principalType,
      principalRoles,
    );

    expect(accessMgmt.authorize).toHaveBeenCalledWith(
      principalType,
      principalRoles,
      "widget",
      "create",
    );
    expect(result).toEqual(widget);
  });

  it("throws NotFoundError when updating a missing widget", async () => {
    const { repo, service } = makeService();
    repo.updateWidget.mockResolvedValue(null);

    await expect(
      service.updateWidget(
        "missing",
        { name: "New" },
        principalType,
        principalRoles,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError when deleting a missing widget", async () => {
    const { repo, service } = makeService();
    repo.deleteWidget.mockResolvedValue(false);

    await expect(
      service.deleteWidget("missing", principalType, principalRoles),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
