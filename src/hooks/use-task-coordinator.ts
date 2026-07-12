"use client";

import { useEffect, useRef, useState } from "react";

import { t } from "@/i18n/runtime";
import { db } from "@/lib/db";
import type { Asset, GenerationTask } from "@/lib/domain";
import {
  createKieTask,
  fetchKieCredits,
  KieClientError,
  queryKieTask,
} from "@/lib/kie-client";

const LEADER_LEASE_MS = 5_000;
const STALE_AFTER_MS = 15 * 60 * 1_000;
const SUBMIT_INTERVAL_MS = 550;

export function useTaskCoordinator(apiKey: string, keyFingerprint: string) {
  const [isLeader, setIsLeader] = useState(false);
  const ownerIdRef = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!apiKey || !keyFingerprint) {
      return;
    }

    const controller = new AbortController();
    const ownerId = ownerIdRef.current;
    let releaseLock: (() => void) | undefined;

    const runAsLeader = async (usesFallbackLease = false) => {
      setIsLeader(true);
      await recoverInterruptedTasks(keyFingerprint);
      let lastSubmissionAt = 0;
      let lastCreditsAt = 0;
      let lastLeaseRenewalAt = 0;

      while (!controller.signal.aborted) {
        const now = Date.now();
        if (
          usesFallbackLease &&
          now - lastLeaseRenewalAt >= LEADER_LEASE_MS / 2
        ) {
          if (!(await renewFallbackLease(ownerId))) break;
          lastLeaseRenewalAt = now;
        }
        if (now - lastSubmissionAt >= SUBMIT_INTERVAL_MS) {
          const submitted = await submitNextTask(apiKey, keyFingerprint, ownerId);
          if (submitted) lastSubmissionAt = now;
        }
        await pollNextTask(apiKey, keyFingerprint);
        if (now - lastCreditsAt >= 30_000) {
          await refreshCredits(apiKey, keyFingerprint);
          lastCreditsAt = now;
        }
        await sleep(700, controller.signal);
      }
      setIsLeader(false);
    };

    const acquire = async () => {
      if (navigator.locks) {
        await navigator.locks.request(
          "kie-workspace-queue-leader",
          { mode: "exclusive", signal: controller.signal },
          async () => {
            await new Promise<void>((resolve) => {
              releaseLock = resolve;
              void runAsLeader().finally(resolve);
            });
          },
        );
        return;
      }

      while (!controller.signal.aborted) {
        if (await acquireFallbackLease(ownerId)) {
          await runAsLeader(true);
        }
        await sleep(2_000, controller.signal);
      }
    };

    void acquire().catch(() => setIsLeader(false));

    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        void db.tasks
          .where("status")
          .equals("stale")
          .and((task) => task.keyFingerprint === keyFingerprint)
          .modify({ pollAfter: Date.now() });
      }
    };
    document.addEventListener("visibilitychange", handleFocus);
    window.addEventListener("focus", handleFocus);

    return () => {
      controller.abort();
      releaseLock?.();
      setIsLeader(false);
      document.removeEventListener("visibilitychange", handleFocus);
      window.removeEventListener("focus", handleFocus);
    };
  }, [apiKey, keyFingerprint]);

  return { isLeader };
}

async function recoverInterruptedTasks(keyFingerprint: string): Promise<void> {
  const now = Date.now();
  await db.tasks
    .where("status")
    .equals("submitting")
    .and((task) => task.keyFingerprint === keyFingerprint && !task.remoteTaskId)
    .modify({
      status: "unknown",
      failureCode: "SUBMISSION_INTERRUPTED",
      failureMessage: t("errors.submitUnknown"),
      updatedAt: now,
      leaseOwner: undefined,
      leaseUntil: undefined,
    });

  await db.tasks
    .where("status")
    .anyOf("waiting", "queuing", "generating", "stale")
    .and((task) => task.keyFingerprint === keyFingerprint)
    .modify({ pollAfter: now });
}

async function submitNextTask(
  apiKey: string,
  keyFingerprint: string,
  ownerId: string,
): Promise<boolean> {
  const claimed = await db.transaction("rw", db.tasks, async () => {
    const task = await db.tasks
      .where("status")
      .equals("queued")
      .and((candidate) => candidate.keyFingerprint === keyFingerprint)
      .sortBy("createdAt")
      .then((tasks) => tasks[0]);
    if (!task) return undefined;

    const submissionAttemptId = crypto.randomUUID();
    const now = Date.now();
    await db.tasks.update(task.localTaskId, {
      status: "submitting",
      submissionAttemptId,
      leaseOwner: ownerId,
      leaseUntil: now + 30_000,
      fencingToken: task.fencingToken + 1,
      requestStartedAt: now,
      updatedAt: now,
    });
    return { ...task, submissionAttemptId };
  });
  if (!claimed) return false;

  try {
    const remoteTaskId = await createKieTask(apiKey, claimed.requestSnapshot);
    await db.transaction("rw", db.tasks, async () => {
      const current = await db.tasks.get(claimed.localTaskId);
      if (
        !current ||
        current.submissionAttemptId !== claimed.submissionAttemptId ||
        current.remoteTaskId
      ) {
        return;
      }
      await db.tasks.update(claimed.localTaskId, {
        remoteTaskId,
        status: "waiting",
        pollAfter: Date.now() + 2_000,
        leaseOwner: undefined,
        leaseUntil: undefined,
        updatedAt: Date.now(),
      });
    });
  } catch (error) {
    const clientError = error instanceof KieClientError ? error : undefined;
    const isDefiniteFailure =
      clientError &&
      ["KEY_INVALID", "VALIDATION_FAILED", "TASK_CREATE_FAILED"].includes(
        clientError.code,
      );
    await db.tasks.update(claimed.localTaskId, {
      status: isDefiniteFailure ? "fail" : "unknown",
      failureCode: clientError?.code ?? "SUBMISSION_UNKNOWN",
      failureMessage:
        clientError?.message ?? t("errors.submitUnknown"),
      completedAt: isDefiniteFailure ? Date.now() : undefined,
      leaseOwner: undefined,
      leaseUntil: undefined,
      updatedAt: Date.now(),
    });
  }
  return true;
}

async function pollNextTask(
  apiKey: string,
  keyFingerprint: string,
): Promise<void> {
  const now = Date.now();
  const task = await db.tasks
    .where("status")
    .anyOf("waiting", "queuing", "generating", "stale")
    .and(
      (candidate) =>
        candidate.keyFingerprint === keyFingerprint &&
        Boolean(candidate.remoteTaskId) &&
        (candidate.pollAfter ?? 0) <= now,
    )
    .sortBy("pollAfter")
    .then((tasks) => tasks[0]);
  if (!task?.remoteTaskId) return;

  if (task.status !== "stale" && now - task.createdAt > STALE_AFTER_MS) {
    await db.tasks.update(task.localTaskId, {
      status: "stale",
      pollAfter: Number.MAX_SAFE_INTEGER,
      updatedAt: now,
    });
    return;
  }

  try {
    const result = await queryKieTask(apiKey, task.remoteTaskId);
    await applyTaskResult(task, result);
  } catch (error) {
    const clientError = error instanceof KieClientError ? error : undefined;
    await db.tasks.update(task.localTaskId, {
      failureCode: clientError?.code ?? "POLL_FAILED",
      failureMessage: clientError?.message ?? t("errors.statusUnavailable"),
      pollAfter: Date.now() + 15_000,
      updatedAt: Date.now(),
    });
  }
}

async function applyTaskResult(
  task: GenerationTask,
  result: Awaited<ReturnType<typeof queryKieTask>>,
): Promise<void> {
  const now = Date.now();
  const terminal = result.state === "success" || result.state === "fail";
  const pollAfter = terminal ? undefined : now + nextPollDelay(task);

  await db.transaction("rw", db.tasks, db.assets, async () => {
    await db.tasks.update(task.localTaskId, {
      status: result.state,
      failureCode: result.failCode,
      failureMessage: result.failMessage,
      creditsConsumed: result.creditsConsumed,
      pollAfter,
      completedAt: terminal ? result.completedAt ?? now : undefined,
      updatedAt: now,
    });

    if (result.state !== "success") return;
    const existingAssets = await db.assets
      .where("localTaskId")
      .equals(task.localTaskId)
      .toArray();
    const existingByOrdinal = new Map(
      existingAssets.map((asset) => [asset.outputOrdinal, asset]),
    );
    if (
      existingAssets.length > 0 &&
      existingAssets.length !== result.resultUrls.length
    ) {
      await db.tasks.update(task.localTaskId, {
        failureCode: "RESULT_CONTRACT_CHANGED",
        failureMessage: t("errors.resultCountChanged"),
      });
      return;
    }
    const assets: Asset[] = result.resultUrls.map((entry, outputOrdinal) => {
      const existing = existingByOrdinal.get(outputOrdinal);
      return {
        id: `${task.localTaskId}:${outputOrdinal}`,
        localTaskId: task.localTaskId,
        roomId: task.roomId,
        outputOrdinal,
        url: entry.url,
        isRenderable: entry.isRenderable,
        availability:
          existing?.url === entry.url ? existing.availability : "unchecked",
        favorite: existing?.favorite ?? false,
        tags: existing?.tags ?? [],
        collectionIds: existing?.collectionIds ?? [],
        width: existing?.width,
        height: existing?.height,
        createdAt: existing?.createdAt ?? result.completedAt ?? now,
        lastCheckedAt: existing?.lastCheckedAt,
      };
    });
    await db.assets.bulkPut(assets);
  });
}

async function refreshCredits(
  apiKey: string,
  keyFingerprint: string,
): Promise<void> {
  try {
    const result = await fetchKieCredits(apiKey);
    await db.accountSnapshots.put({
      id: `${keyFingerprint}:${result.checkedAt}`,
      keyFingerprint,
      ...result,
    });
  } catch {
    // The previous official snapshot remains visible and is marked stale by the UI.
  }
}

async function acquireFallbackLease(ownerId: string): Promise<boolean> {
  return db.transaction("rw", db.coordinatorLeases, async () => {
    const now = Date.now();
    const current = await db.coordinatorLeases.get("queue-leader");
    if (current && current.ownerId !== ownerId && current.leaseUntil > now) {
      return false;
    }
    await db.coordinatorLeases.put({
      id: "queue-leader",
      ownerId,
      leaseUntil: now + LEADER_LEASE_MS,
      fencingToken: (current?.fencingToken ?? 0) + 1,
    });
    return true;
  });
}

async function renewFallbackLease(ownerId: string): Promise<boolean> {
  return db.transaction("rw", db.coordinatorLeases, async () => {
    const current = await db.coordinatorLeases.get("queue-leader");
    if (!current || current.ownerId !== ownerId) return false;
    await db.coordinatorLeases.update("queue-leader", {
      leaseUntil: Date.now() + LEADER_LEASE_MS,
    });
    return true;
  });
}

function nextPollDelay(task: GenerationTask): number {
  const elapsed = Date.now() - task.createdAt;
  if (elapsed < 30_000) return 2_500;
  if (elapsed < 2 * 60_000) return 5_000;
  if (elapsed < 5 * 60_000) return 10_000;
  return 15_000;
}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}
