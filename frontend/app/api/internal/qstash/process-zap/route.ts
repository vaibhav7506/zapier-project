import { Receiver } from "@upstash/qstash";
import { google } from "googleapis";
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
  } else if (action.type.id === "discord") {
    const webhookUrl = String(metadata.webhookUrl ?? "");
    if (!webhookUrl) {
      throw new Error("Discord webhook URL is required");
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: JSON.stringify(zapRun.metadata) }),
    });
    if (!response.ok) {
      throw new Error(`Discord webhook request failed with status ${response.status}`);
    }
  } else if (action.type.id === "slack") {
    const webhookUrl = String(metadata.webhookUrl ?? "");
    if (!webhookUrl) {
      throw new Error("Slack webhook URL is required");
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: JSON.stringify(zapRun.metadata) }),
    });
    if (!response.ok) {
      throw new Error(`Slack webhook request failed with status ${response.status}`);
    }
  } else if (action.type.id === "telegram") {
    const botToken = String(metadata.botToken ?? "");
    const chatId = String(metadata.chatId ?? "");
    if (!botToken || !chatId) {
      throw new Error("Telegram bot token and chat ID are required");
    }

    const response = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: JSON.stringify(zapRun.metadata) }),
      },
    );
    if (!response.ok) {
      throw new Error(`Telegram sendMessage request failed with status ${response.status}`);
    }
  } else if (action.type.id === "sms") {
    const destination = String(metadata.phoneNumber ?? "");
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;
    if (!destination || !accountSid || !authToken || !fromNumber) {
      throw new Error("Twilio credentials and SMS destination phone number are required");
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: destination,
          From: fromNumber,
          Body: JSON.stringify(zapRun.metadata),
        }).toString(),
      },
    );
    if (!response.ok) {
      throw new Error(`Twilio Messages API request failed with status ${response.status}`);
    }
  } else if (action.type.id === "google-sheets") {
    const spreadsheetId = String(metadata.spreadsheetId ?? "");
    const sheetName = String(metadata.sheetName ?? "");
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!spreadsheetId || !sheetName || !serviceAccountKey) {
      throw new Error("Google Sheets configuration and service account key are required");
    }

    let credentials: { client_email?: string; private_key?: string; project_id?: string };
    try {
      credentials = JSON.parse(serviceAccountKey);
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY must contain valid JSON");
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const escapedSheetName = sheetName.replace(/'/g, "''");
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${escapedSheetName}'!A:A`,
      valueInputOption: "RAW",
      requestBody: { values: [[JSON.stringify(zapRun.metadata)]] },
    });
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
