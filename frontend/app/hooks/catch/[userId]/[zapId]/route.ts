import { NextResponse } from "next/server";
import { prismaClient } from "@/lib/server/db";
import { publishZapRun } from "@/lib/server/qstash";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string; zapId: string }> },
) {
  const { zapId } = await params;
  const metadata = await request.json();

  const run = await prismaClient.$transaction(async (transaction) => {
    const run = await transaction.zapRun.create({
      data: { zapId, metadata },
    });
    await transaction.zapRunOutbox.create({
      data: { zapRunId: run.id },
    });
    return run;
  });

  await publishZapRun({ zapRunId: run.id, stage: 0 });
  await prismaClient.zapRunOutbox.deleteMany({ where: { zapRunId: run.id } });

  return NextResponse.json({ message: "Webhook received" });
}
