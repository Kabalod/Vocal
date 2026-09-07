import { randomUUID } from "crypto";
import type { Job } from "@prisma/client";
import { prisma } from "@/lib/db";

export const JOB_MAX_ATTEMPTS = 3;
export const JOB_LEASE_MS = 120_000;

const RUNNING_STATUSES = ["converting", "transcribing", "analyzing"] as const;

export type JobClaimReason = "claimed" | "missing" | "busy" | "exhausted" | "done";

export type JobClaimResult =
  | { ok: true; reason: "claimed"; job: Job; leaseOwner: string }
  | { ok: false; reason: Exclude<JobClaimReason, "claimed">; job: Job | null };

export async function heartbeatJob(jobId: string, leaseOwner: string, now = new Date()) {
  await prisma.job.updateMany({
    where: { id: jobId, leaseOwner },
    data: { leaseUntil: new Date(now.getTime() + JOB_LEASE_MS) },
  });
}

export async function releaseJobLease(jobId: string) {
  await prisma.job.updateMany({
    where: { id: jobId },
    data: { leaseUntil: null, leaseOwner: null },
  });
}

export async function claimJob(jobId: string, now = new Date()): Promise<JobClaimResult> {
  const current = await prisma.job.findUnique({ where: { id: jobId } });
  if (!current) return { ok: false, reason: "missing", job: null };
  if (current.status === "done") return { ok: false, reason: "done", job: current };
  if (current.attempts >= current.maxAttempts) {
    return { ok: false, reason: "exhausted", job: current };
  }

  const leaseActive =
    Boolean(current.leaseOwner) &&
    current.leaseUntil !== null &&
    current.leaseUntil.getTime() > now.getTime();
  if (leaseActive) {
    return { ok: false, reason: "busy", job: current };
  }

  const leaseOwner = randomUUID();
  const leaseUntil = new Date(now.getTime() + JOB_LEASE_MS);
  const claimed = await prisma.job.updateMany({
    where: {
      id: jobId,
      attempts: current.attempts,
      status: { not: "done" },
      OR: [{ leaseOwner: null }, { leaseOwner: current.leaseOwner }],
    },
    data: {
      attempts: { increment: 1 },
      leaseOwner,
      leaseUntil,
    },
  });

  if (claimed.count !== 1) {
    const again = await prisma.job.findUnique({ where: { id: jobId } });
    if (again && again.attempts >= again.maxAttempts) {
      return { ok: false, reason: "exhausted", job: again };
    }
    return { ok: false, reason: "busy", job: again };
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, reason: "missing", job: null };
  return { ok: true, reason: "claimed", job, leaseOwner };
}

export async function completeJob(jobId: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "done",
      stage: "done",
      errorCode: null,
      errorMessage: null,
      leaseUntil: null,
      leaseOwner: null,
    },
  });
}

export async function listRecoverableJobIds(now = new Date()): Promise<string[]> {
  const rows = await prisma.job.findMany({
    where: { status: { in: ["queued", ...RUNNING_STATUSES] } },
    select: { id: true, leaseUntil: true, leaseOwner: true, status: true },
  });
  const nowMs = now.getTime();
  return rows
    .filter((row) => {
      if (row.status === "queued") {
        return !row.leaseOwner || !row.leaseUntil || row.leaseUntil.getTime() <= nowMs;
      }
      if (!row.leaseOwner || !row.leaseUntil) return true;
      return row.leaseUntil.getTime() <= nowMs;
    })
    .map((row) => row.id);
}
