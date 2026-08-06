import { Client } from "@upstash/qstash";

type ZapRunMessage = {
  zapRunId: string;
  stage: number;
};

function getProcessorUrl(): string {
  const baseUrl = process.env.QSTASH_CALLBACK_URL;
  if (!baseUrl) {
    throw new Error("QSTASH_CALLBACK_URL must be set");
  }

  return new URL("/api/internal/qstash/process-zap", baseUrl).toString();
}

function getClient(): Client {
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    throw new Error("QSTASH_TOKEN must be set");
  }

  return new Client({ token });
}

export async function publishZapRun(message: ZapRunMessage) {
  return getClient().publishJSON({
    url: getProcessorUrl(),
    body: message,
    retries: 5,
  });
}
