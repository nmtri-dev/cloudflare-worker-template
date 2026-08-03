import { Logger, WidgetRepository } from "../../core/ports";
import {
  CreateWidgetInput,
  InternalError,
  UpdateWidgetInput,
  Widget,
} from "../../core/domain";

/**
 * Raw D1 row shape — snake_case, matching the SQL columns exactly.
 * SQL columns are never renamed; mapping to camelCase happens here.
 */
interface WidgetRow {
  id: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number | null;
}

function mapRowToWidget(row: WidgetRow): Widget {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * D1-backed implementation of `WidgetRepository`.
 *
 * Demonstrates the template's secondary-adapter conventions (ported from
 * cardy-ai-subscription): raw snake_case rows are mapped to camelCase domain
 * types, and `db.batch()` is used for atomic multi-statement writes.
 */
export class D1WidgetRepository implements WidgetRepository {
  constructor(
    private readonly db: D1Database,
    private readonly logger: Logger,
  ) {}

  async listWidgets(): Promise<Widget[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM widgets ORDER BY created_at DESC")
      .all<WidgetRow>();
    return results.map(mapRowToWidget);
  }

  async getWidgetById(id: string): Promise<Widget | null> {
    const row = await this.db
      .prepare("SELECT * FROM widgets WHERE id = ?")
      .bind(id)
      .first<WidgetRow>();
    return row ? mapRowToWidget(row) : null;
  }

  async getWidgetByName(name: string): Promise<Widget | null> {
    const row = await this.db
      .prepare("SELECT * FROM widgets WHERE name = ?")
      .bind(name)
      .first<WidgetRow>();
    return row ? mapRowToWidget(row) : null;
  }

  async createWidget(input: CreateWidgetInput): Promise<Widget> {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const description = input.description ?? null;

    await this.db
      .prepare(
        "INSERT INTO widgets (id, name, description, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(id, input.name, description, now)
      .run();

    const created = await this.getWidgetById(id);
    if (!created) {
      this.logger.error("Failed to read back created widget", { widgetId: id });
      throw new InternalError("Failed to read back created widget");
    }
    return created;
  }

  async updateWidget(id: string, input: UpdateWidgetInput): Promise<Widget | null> {
    const existing = await this.getWidgetById(id);
    if (!existing) return null;

    const name = input.name ?? existing.name;
    const description =
      input.description !== undefined ? input.description : existing.description;
    const updatedAt = Math.floor(Date.now() / 1000);

    await this.db
      .prepare(
        "UPDATE widgets SET name = ?, description = ?, updated_at = ? WHERE id = ?",
      )
      .bind(name, description, updatedAt, id)
      .run();

    return this.getWidgetById(id);
  }

  async deleteWidget(id: string): Promise<boolean> {
    const result = await this.db
      .prepare("DELETE FROM widgets WHERE id = ?")
      .bind(id)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }
}
