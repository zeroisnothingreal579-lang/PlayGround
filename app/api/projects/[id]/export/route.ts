import { buildProjectZip } from "@/lib/export";
import { handleApiError, jsonError } from "@/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { buffer, filename, fileCount } = await buildProjectZip(id);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "X-Replica-File-Count": String(fileCount),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof Error && /not found/i.test(error.message)) {
      return jsonError("Project not found", 404);
    }
    return handleApiError(error);
  }
}
