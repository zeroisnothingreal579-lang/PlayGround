import { analyzeApk } from "./analysis";
import {
  getApkAnalysis,
  getApkUploadByProject,
  listApkAnalysisApkIds,
} from "@/lib/db/repo";

interface ApkQueueState {
  running: Set<string>;
  chain: Promise<void>;
  recovered: boolean;
}

const globalForApkQueue = globalThis as unknown as {
  __replicaApkQueue?: ApkQueueState;
};

function state(): ApkQueueState {
  globalForApkQueue.__replicaApkQueue ||= {
    running: new Set(),
    chain: Promise.resolve(),
    recovered: false,
  };
  return globalForApkQueue.__replicaApkQueue;
}

export function scheduleApkAnalysis(apkId: string) {
  const queue = state();
  if (queue.running.has(apkId)) return;
  queue.running.add(apkId);
  queue.chain = queue.chain
    .then(() => analyzeApk(apkId))
    .catch((error) => {
      console.error("[apk-analysis] unexpected worker error", error);
    })
    .finally(() => {
      queue.running.delete(apkId);
    });
}

export function ensureApkAnalysis(projectId: string) {
  const apk = getApkUploadByProject(projectId);
  if (!apk?.analysis) return;
  const analysis = getApkAnalysis(apk.id);
  if (!analysis) return;
  const staleRunning =
    analysis.status === "running" &&
    Date.now() - new Date(analysis.updatedAt).getTime() > 30_000;
  if (analysis.status === "queued" || staleRunning) scheduleApkAnalysis(apk.id);
}

export function resumeQueuedApkAnalyses() {
  const queue = state();
  if (queue.recovered) return;
  queue.recovered = true;
  for (const apkId of listApkAnalysisApkIds(0)) scheduleApkAnalysis(apkId);
}
