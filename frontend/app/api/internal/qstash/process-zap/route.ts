import { Receiver } from "@upstash/qstash";
import { NextResponse } from "next/server";
import { prismaClient } from "@/lib/server/db";
import { sendEmail } from "@/lib/server/email";
import { parse } from "@/lib/server/parser";
import { publishZapRun } from "@/lib/server/qstash";
import { prepareSolanaTransfer, submitPreparedSolanaTransfer } from "@/lib/server/solana";

export const runtime = "nodejs";

type ZapRunMessage = {
  zapRunId: string;
  stage: number;
};

async function publishNextStage(
  executionId: string,
  zapRunId: string,
  stage: number,
  actionCount: number,
) {
  if (stage >= actionCount - 1) {
    return;
  }

  const execution = await prismaClient.zapRunActionExecution.findUniqueOrThrow({
    where: { id: executionId },
  });
  if (execution.nextStagePublishedAt) {
    return;
  }

  await publishZapRun({ zapRunId, stage: stage + 1 });
  await prismaClient.zapRunActionExecution.update({
    where: { id: executionId },
    data: { nextStagePublishedAt: new Date() },
  });
}

async function processZapRun(message: ZapRunMessage) {
  if (!message.zapRunId || !Number.isInteger(message.stage) || message.stage < 0) {
    return NextResponse.json({ message: "Invalid queue message" }, { status: 400 });
  }

  const zapRun = await prismaClient.zapRun.findFirst({
    where: { id: message.zapRunId },
    include: {
      zap: {
        include: {
          actions: { include: { type: true }, orderBy: { sortingOrder: "asc" } },
        },
      },
    },
  });
  const action = zapRun?.zap.actions.find(
    (candidate) => candidate.sortingOrder === message.stage,
  );
  if (!zapRun || !action) {
    return NextResponse.json({ message: "Zap run action not found" }, { status: 404 });
  }

  let execution = await prismaClient.zapRunActionExecution.findUnique({
    where: {
      zapRunId_actionOrder: {
        zapRunId: message.zapRunId,
        actionOrder: message.stage,
      },
    },
  });
  let claimedExecution = false;

  if (execution?.status === "COMPLETED") {
    await publishNextStage(
      execution.id,
      message.zapRunId,
      message.stage,
      zapRun.zap.actions.length,
    );
    return NextResponse.json({ status: "already-completed" });
  }

  if (!execution) {
    try {
      execution = await prismaClient.zapRunActionExecution.create({
        data: { zapRunId: message.zapRunId, actionOrder: message.stage },
      });
      claimedExecution = true;
    } catch {
      execution = await prismaClient.zapRunActionExecution.findUniqueOrThrow({
        where: {
          zapRunId_actionOrder: {
            zapRunId: message.zapRunId,
            actionOrder: message.stage,
          },
        },
      });
    }
  }

  if (!claimedExecution && execution.status === "PROCESSING" && action.type.id !== "send-sol") {
    return NextResponse.json(
      { status: "manual-review-required" },
      { status: 500 },
    );
  }

  const metadata = action.metadata as Record<string, unknown>;
  if (action.type.id === "email") {
    const body = parse(String(metadata.body ?? ""), zapRun.metadata);
    const recipient = parse(String(metadata.email ?? ""), zapRun.metadata);
    await sendEmail(
      recipient,
      body,
      `<zap-run-${execution.id}@automation.local>`,
    );
  } else if (action.type.id === "send-sol") {
    if (!execution.solanaTransaction || !execution.solanaSignature || !execution.solanaLastValidBlockHeight) {
      const recipient = parse(String(metadata.address ?? ""), zapRun.metadata);
      const amount = parse(String(metadata.amount ?? ""), zapRun.metadata);
      const preparedTransfer = await prepareSolanaTransfer(recipient, amount);
      execution = await prismaClient.zapRunActionExecution.update({
        where: { id: execution.id },
        data: {
          solanaTransaction: preparedTransfer.serializedTransaction,
          solanaSignature: preparedTransfer.signature,
          solanaLastValidBlockHeight: preparedTransfer.lastValidBlockHeight,
        },
      });
    }

    await submitPreparedSolanaTransfer({
      serializedTransaction: execution.solanaTransaction,
      signature: execution.solanaSignature,
      lastValidBlockHeight: execution.solanaLastValidBlockHeight,
    });
  }

  execution = await prismaClient.zapRunActionExecution.update({
    where: { id: execution.id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  await publishNextStage(
    execution.id,
    message.zapRunId,
    message.stage,
    zapRun.zap.actions.length,
  );

  return NextResponse.json({ status: "completed" });
}

export async function POST(request: Request) {
  const signature = request.headers.get("upstash-signature");
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!signature || !currentSigningKey || !nextSigningKey) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();
  const receiver = new Receiver({ currentSigningKey, nextSigningKey });
  try {
    await receiver.verify({ signature, body, url: request.url });
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return processZapRun(JSON.parse(body) as ZapRunMessage);
}
