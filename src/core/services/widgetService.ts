import {
  AccessManagementService,
  Logger,
  WidgetRepository,
} from "../ports";
import {
  BadRequestError,
  ConflictError,
  CreateWidgetInput,
  NotFoundError,
  UpdateWidgetInput,
  Widget,
} from "../domain";

/**
 * CRUD service for the generic "widget" example domain.
 *
 * Demonstrates the template's service conventions (ported from
 * cardy-ai-subscription):
 * - Dependencies are constructor-injected (no global state).
 * - Every method authorizes via `AccessManagementService` first.
 * - Every method logs with structured context.
 * - Domain errors are thrown (never raw strings / generic Errors).
 */
export class WidgetService {
  constructor(
    private readonly repo: WidgetRepository,
    private readonly logger: Logger,
    private readonly accessMgmt: AccessManagementService,
  ) {}

  async listWidgets(
    principalType: string,
    principalRoles: string[],
  ): Promise<Widget[]> {
    await this.accessMgmt.authorize(principalType, principalRoles, "widget", "read");
    const widgets = await this.repo.listWidgets();
    this.logger.info("Listed widgets", { count: widgets.length });
    return widgets;
  }

  async getWidget(
    id: string,
    principalType: string,
    principalRoles: string[],
  ): Promise<Widget> {
    await this.accessMgmt.authorize(principalType, principalRoles, "widget", "read");
    const widget = await this.repo.getWidgetById(id);
    if (!widget) {
      this.logger.error("Widget not found", { widgetId: id });
      throw new NotFoundError(`Widget with id '${id}' not found`);
    }
    this.logger.info("Got widget", { widgetId: id });
    return widget;
  }

  async getWidgetByName(
    name: string,
    principalType: string,
    principalRoles: string[],
  ): Promise<Widget | null> {
    await this.accessMgmt.authorize(principalType, principalRoles, "widget", "read");
    const widget = await this.repo.getWidgetByName(name);
    this.logger.info("Got widget by name", { name, found: !!widget });
    return widget;
  }

  async createWidget(
    input: CreateWidgetInput,
    principalType: string,
    principalRoles: string[],
  ): Promise<Widget> {
    await this.accessMgmt.authorize(principalType, principalRoles, "widget", "create");

    const name = input.name?.trim();
    if (!name) {
      this.logger.error("Widget name must be a non-empty string");
      throw new BadRequestError("Widget name must be a non-empty string");
    }

    const existing = await this.repo.getWidgetByName(name);
    if (existing) {
      this.logger.error("Widget already exists", { name });
      throw new ConflictError(`Widget with name '${name}' already exists`);
    }

    const widget = await this.repo.createWidget({ ...input, name });
    this.logger.info("Created widget", { widgetId: widget.id, name });
    return widget;
  }

  async updateWidget(
    id: string,
    input: UpdateWidgetInput,
    principalType: string,
    principalRoles: string[],
  ): Promise<Widget> {
    await this.accessMgmt.authorize(principalType, principalRoles, "widget", "update");

    if (input.name !== undefined && !input.name.trim()) {
      this.logger.error("Widget name must be a non-empty string");
      throw new BadRequestError("Widget name must be a non-empty string");
    }

    const widget = await this.repo.updateWidget(id, input);
    if (!widget) {
      this.logger.error("Widget not found for update", { widgetId: id });
      throw new NotFoundError(`Widget with id '${id}' not found`);
    }
    this.logger.info("Updated widget", { widgetId: id });
    return widget;
  }

  async deleteWidget(
    id: string,
    principalType: string,
    principalRoles: string[],
  ): Promise<void> {
    await this.accessMgmt.authorize(principalType, principalRoles, "widget", "delete");
    const deleted = await this.repo.deleteWidget(id);
    if (!deleted) {
      this.logger.error("Widget not found for delete", { widgetId: id });
      throw new NotFoundError(`Widget with id '${id}' not found`);
    }
    this.logger.info("Deleted widget", { widgetId: id });
  }
}
