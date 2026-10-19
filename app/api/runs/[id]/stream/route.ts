import { getProject, getRun, listLogs, listSteps } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

function snapshot(runId: string) {
  const run = getRun(runId);
  if (!run) return null;
  return {
    run,
    steps: listSteps(runId),
    logs: listLogs(runId, undefined, 800),
    project: run.projectId ? getProject(run.projectId) : null,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let lastSerialized = "";
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      send("connected", { runId: id });
      const tick = () => {
        const data = snapshot(id);
        if (!data) {
          send("error", { message: "Run not found" });
          cleanup();
          return;
        }
        const serialized = JSON.stringify(data);
        if (serialized !== lastSerialized) {
          lastSerialized = serialized;
          send("snapshot", data);
        }
        if (["completed", "failed", "cancelled"].includes(data.run.status)) {
          send("done", { status: data.run.status });
          cleanup();
        }
      };
      tick();
      interval = setInterval(tick, 700);
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 15000);
      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      if (interval) clearInterval(interval);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
