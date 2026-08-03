import { CreateWidgetInput, UpdateWidgetInput, Widget } from "../domain";

export interface WidgetRepository {
  listWidgets(): Promise<Widget[]>;
  getWidgetById(id: string): Promise<Widget | null>;
  getWidgetByName(name: string): Promise<Widget | null>;
  createWidget(input: CreateWidgetInput): Promise<Widget>;
  updateWidget(id: string, input: UpdateWidgetInput): Promise<Widget | null>;
  deleteWidget(id: string): Promise<boolean>;
}
