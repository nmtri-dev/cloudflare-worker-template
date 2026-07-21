import app from "./adapters/primary/http";
import { handleCreditResetQueue } from "./adapters/primary/queue/creditResetHandler";

export default {
  fetch: app.fetch,
  queue: handleCreditResetQueue,
};
