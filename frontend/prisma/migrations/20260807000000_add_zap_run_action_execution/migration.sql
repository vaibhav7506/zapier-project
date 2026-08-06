-- CreateEnum
CREATE TYPE "ZapRunActionExecutionStatus" AS ENUM ('PROCESSING', 'COMPLETED');

-- CreateTable
CREATE TABLE "ZapRunActionExecution" (
    "id" TEXT NOT NULL,
    "zapRunId" TEXT NOT NULL,
    "actionOrder" INTEGER NOT NULL,
    "status" "ZapRunActionExecutionStatus" NOT NULL DEFAULT 'PROCESSING',
    "solanaSignature" TEXT,
    "solanaTransaction" TEXT,
    "solanaLastValidBlockHeight" INTEGER,
    "nextStagePublishedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZapRunActionExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ZapRunActionExecution_solanaSignature_key" ON "ZapRunActionExecution"("solanaSignature");

-- CreateIndex
CREATE UNIQUE INDEX "ZapRunActionExecution_zapRunId_actionOrder_key" ON "ZapRunActionExecution"("zapRunId", "actionOrder");

-- AddForeignKey
ALTER TABLE "ZapRunActionExecution" ADD CONSTRAINT "ZapRunActionExecution_zapRunId_fkey" FOREIGN KEY ("zapRunId") REFERENCES "ZapRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
