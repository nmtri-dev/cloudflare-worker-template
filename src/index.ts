import app from "./adapters/primary/http";
export { WidgetEntrypoint } from "./adapters/primary/rpc/entrypoints";

export default {
  fetch: app.fetch,
};
