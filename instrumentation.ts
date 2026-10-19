export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { resumeQueuedApkAnalyses } = await import("./lib/apk/queue");
  resumeQueuedApkAnalyses();
}
