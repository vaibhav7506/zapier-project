import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { createToken, getAuthenticatedUserId } from "@/lib/server/auth";
import { prismaClient } from "@/lib/server/db";
import { SigninSchema, SignupSchema, ZapCreateSchema } from "@/lib/server/schemas";

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json({ message: "You are not logged in" }, { status: 403 });

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const route = path.join("/");

  if (route === "trigger/available") {
    const availableTriggers = await prismaClient.availableTrigger.findMany({});
    return NextResponse.json({ availableTriggers });
  }

  if (route === "action/available") {
    const availableActions = await prismaClient.availableAction.findMany({});
    return NextResponse.json({ availableActions });
  }

  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return unauthorized();
  }

  if (route === "user") {
    const user = await prismaClient.user.findFirst({
      where: { id: userId },
      select: { name: true, email: true },
    });
    return NextResponse.json({ user });
  }

  if (route === "zap") {
    const zaps = await prismaClient.zap.findMany({
      where: { userId },
      include: {
        actions: { include: { type: true } },
        trigger: { include: { type: true } },
      },
    });
    return NextResponse.json({ zaps });
  }

  if (path[0] === "zap" && path[2] === "runs" && path.length === 3) {
    const zap = await prismaClient.zap.findFirst({
      where: { id: path[1], userId },
      select: { id: true },
    });
    if (!zap) {
      return NextResponse.json({ message: "Zap not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));
    const [total, runs] = await prismaClient.$transaction([
      prismaClient.zapRun.count({ where: { zapId: zap.id } }),
      prismaClient.zapRun.findMany({
        where: { zapId: zap.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          executions: { orderBy: { actionOrder: "asc" } },
        },
      }),
    ]);

    return NextResponse.json({
      runs: runs.map((run) => ({
        ...run,
        status:
          run.executions.length === 0
            ? "PENDING"
            : run.executions.some((execution) => execution.status === "PROCESSING")
              ? "PROCESSING"
              : "COMPLETED",
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }

  if (path[0] === "zap" && path.length === 2) {
    const zap = await prismaClient.zap.findFirst({
      where: { id: path[1], userId },
      include: {
        actions: { include: { type: true } },
        trigger: { include: { type: true } },
      },
    });
    return NextResponse.json({ zap });
  }

  return NextResponse.json({ message: "Not found" }, { status: 404 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const route = path.join("/");
  const body = await readJson(request);

  if (route === "user/signup") {
    const parsedData = SignupSchema.safeParse(body);
    if (!parsedData.success) {
      return NextResponse.json({ message: "Incorrect inputs" }, { status: 411 });
    }

    const userExists = await prismaClient.user.findFirst({
      where: { email: parsedData.data.username },
    });
    if (userExists) {
      return NextResponse.json({ message: "User already exists" }, { status: 403 });
    }

    const hashedPassword = await bcrypt.hash(parsedData.data.password, 10);
    await prismaClient.user.create({
      data: {
        email: parsedData.data.username,
        password: hashedPassword,
        name: parsedData.data.name,
      },
    });
    return NextResponse.json({
      message: "Please verify your account by checking your email",
    });
  }

  if (route === "user/signin") {
    const parsedData = SigninSchema.safeParse(body);
    if (!parsedData.success) {
      return NextResponse.json({ message: "Incorrect inputs" }, { status: 411 });
    }

    const user = await prismaClient.user.findFirst({
      where: { email: parsedData.data.username },
    });
    if (!user || !(await bcrypt.compare(parsedData.data.password, user.password))) {
      return NextResponse.json(
        { message: "Sorry credentials are incorrect" },
        { status: 403 },
      );
    }
    return NextResponse.json({ token: createToken(user.id) });
  }

  if (route === "zap") {
    const userId = getAuthenticatedUserId(request);
    if (!userId) {
      return unauthorized();
    }

    const parsedData = ZapCreateSchema.safeParse(body);
    if (!parsedData.success) {
      return NextResponse.json({ message: "Incorrect inputs" }, { status: 411 });
    }

    const zapId = await prismaClient.$transaction(async (transaction) => {
      const zap = await transaction.zap.create({
        data: {
          userId,
          triggerId: "",
          actions: {
            create: parsedData.data.actions.map((action, index) => ({
              type: { connect: { id: action.availableActionId } },
              sortingOrder: index,
              metadata: action.actionMetadata as Prisma.InputJsonValue,
            })),
          },
        },
      });
      const trigger = await transaction.trigger.create({
        data: {
          triggerId: parsedData.data.availableTriggerId,
          zapId: zap.id,
        },
      });
      await transaction.zap.update({
        where: { id: zap.id },
        data: { triggerId: trigger.id },
      });
      return zap.id;
    });

    return NextResponse.json({ zapId });
  }

  return NextResponse.json({ message: "Not found" }, { status: 404 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return unauthorized();
  }

  if (path[0] === "zap" && path[2] === "toggle" && path.length === 3) {
    const zap = await prismaClient.zap.findFirst({
      where: { id: path[1], userId },
      select: { id: true, isActive: true },
    });

    if (!zap) {
      return NextResponse.json({ message: "Zap not found" }, { status: 404 });
    }

    const updatedZap = await prismaClient.zap.update({
      where: { id: zap.id },
      data: { isActive: !zap.isActive },
      select: { id: true, isActive: true },
    });

    return NextResponse.json({ zap: updatedZap });
  }

  return NextResponse.json({ message: "Not found" }, { status: 404 });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return unauthorized();
  }

  if (path[0] !== "zap" || path.length !== 2) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const body = await readJson(request);
  const parsedData = ZapCreateSchema.safeParse(body);
  if (!parsedData.success) {
    return NextResponse.json({ message: "Incorrect inputs" }, { status: 411 });
  }

  const zap = await prismaClient.zap.findFirst({
    where: { id: path[1], userId },
    select: { id: true },
  });
  if (!zap) {
    return NextResponse.json({ message: "Zap not found" }, { status: 404 });
  }

  await prismaClient.$transaction(async (transaction) => {
    await transaction.action.deleteMany({ where: { zapId: zap.id } });
    await transaction.zap.update({
      where: { id: zap.id },
      data: {
        trigger: {
          update: {
            triggerId: parsedData.data.availableTriggerId,
            metadata: parsedData.data.triggerMetadata as Prisma.InputJsonValue,
          },
        },
        actions: {
          create: parsedData.data.actions.map((action, index) => ({
            type: { connect: { id: action.availableActionId } },
            sortingOrder: index,
            metadata: action.actionMetadata as Prisma.InputJsonValue,
          })),
        },
      },
    });
  });

  return NextResponse.json({ zapId: zap.id });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return unauthorized();
  }

  if (path[0] !== "zap" || path.length !== 2) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const zap = await prismaClient.zap.findFirst({
    where: { id: path[1], userId },
    select: { id: true },
  });
  if (!zap) {
    return NextResponse.json({ message: "Zap not found" }, { status: 404 });
  }

  await prismaClient.$transaction(async (transaction) => {
    await transaction.zapRunActionExecution.deleteMany({
      where: { zapRun: { zapId: zap.id } },
    });
    await transaction.zapRunOutbox.deleteMany({
      where: { zapRun: { zapId: zap.id } },
    });
    await transaction.zapRun.deleteMany({ where: { zapId: zap.id } });
    await transaction.action.deleteMany({ where: { zapId: zap.id } });
    await transaction.trigger.deleteMany({ where: { zapId: zap.id } });
    await transaction.zap.delete({ where: { id: zap.id } });
  });

  return NextResponse.json({ message: "Zap deleted" });
}
