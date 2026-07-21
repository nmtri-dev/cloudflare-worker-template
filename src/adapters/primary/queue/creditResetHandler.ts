import { CreditService } from "../../../core/services/creditService";
import { D1CreditRepository } from "../../secondary/d1CreditRepository";
import { DefaultLogger } from "../../secondary/loggers";

export async function handleCreditResetQueue(
  batch: MessageBatch<{ userId: string }>,
  env: { CREDIT_DB: D1Database },
): Promise<void> {
  const repo = new D1CreditRepository(env.CREDIT_DB);
  const logger = new DefaultLogger();
  const service = new CreditService(repo, logger);

  for (const message of batch.messages) {
    const { userId } = message.body;
    try {
      logger.info("Processing credit reset from queue", { userId, messageId: message.id });
      await service.resetMonthlyByUser({ userId });
      message.ack();
    } catch (error) {
      logger.error("Failed to process credit reset from queue", { userId, messageId: message.id, error });
      message.retry();
    }
  }
}
