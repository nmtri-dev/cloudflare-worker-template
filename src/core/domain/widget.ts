/**
 * Generic "widget" example domain.
 *
 * Demonstrates the template's domain conventions (ported from
 * cardy-ai-subscription):
 * - Domain types are camelCase and define the wire format.
 * - Secondary adapters keep raw D1 rows snake_case and map to camelCase.
 * - `createdAt`/`updatedAt` are unix seconds; `updatedAt` is null when never
 *   updated.
 */

export interface Widget {
  id: string; // UUID
  name: string; // unique
  description: string | null;
  createdAt: number; // unix seconds
  updatedAt: number | null; // unix seconds, null when never updated
}

export interface CreateWidgetInput {
  name: string;
  description?: string | null;
}

export interface UpdateWidgetInput {
  name?: string;
  description?: string | null;
}
