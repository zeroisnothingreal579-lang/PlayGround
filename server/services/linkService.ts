import type { LinkInspection, LinkRecord } from "../../shared/types.js";
import { HttpError, newId, nowIso } from "../lib/util.js";
import { realtime } from "../realtime.js";
import type { Store } from "../store/types.js";
import { inspectDestination, normalizeUrl, type InspectorDeps } from "./urlInspector.js";

export interface LinkInput {
  original: string;
  normalized: string;
  valid: boolean;
  error?: string;
}

export function prepareLinkInputs(inputs: string[]): LinkInput[] {
  const seen = new Set<string>();
  const prepared: LinkInput[] = [];
  for (const raw of inputs) {
    const trimmed = String(raw).trim();
    if (!trimmed) continue;
    try {
      const normalized = normalizeUrl(trimmed);
      if (seen.has(normalized.href)) continue;
      seen.add(normalized.href);
      prepared.push({ original: trimmed, normalized: normalized.href, valid: true });
    } catch (error) {
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      prepared.push({
        original: trimmed,
        normalized: trimmed,
        valid: false,
        error: error instanceof HttpError ? error.message : "Invalid URL",
      });
    }
  }
  return prepared;
}

function invalidInspection(message: string): LinkInspection {
  return {
    finalUrl: null,
    finalDomain: null,
    httpStatus: null,
    title: null,
    description: null,
    contentType: null,
    chain: [],
    durationMs: 0,
    risk: "low",
    flags: ["invalid_url"],
    adNetworks: [],
    captcha: false,
    loop: false,
    blocked: false,
    suspicious: false,
    pageBytes: 0,
    error: message,
    payoutNotes: ["This URL could not be validated and was not requested."],
  };
}

export async function createLinkRecords(store: Store, inputs: string[], source = "manual"): Promise<LinkRecord[]> {
  const prepared = prepareLinkInputs(inputs);
  if (prepared.length === 0) throw new HttpError(400, "No valid URL input was provided", "no_urls");
  if (prepared.length > 100) throw new HttpError(400, "A maximum of 100 URLs can be submitted per request", "too_many_urls");
  const records: LinkRecord[] = [];
  const timestamp = nowIso();
  for (const item of prepared) {
    const record: LinkRecord = {
      id: newId("lnk"),
      originalUrl: item.original,
      normalizedUrl: item.normalized,
      status: item.valid ? "pending" : "error",
      source,
      createdAt: timestamp,
      updatedAt: timestamp,
      inspection: item.valid ? null : invalidInspection(item.error ?? "Invalid URL"),
    };
    await store.createLink(record);
    records.push(record);
  }
  return records;
}

export async function inspectLinkById(
  store: Store,
  id: string,
  deps: InspectorDeps = {},
): Promise<LinkRecord> {
  const link = await store.getLink(id);
  if (!link) throw new HttpError(404, "Link not found", "link_not_found");
  const inspecting = await store.updateLink(id, { status: "inspecting", updatedAt: nowIso() });
  if (inspecting) realtime.emit({ type: "link.updated", link: inspecting });

  let inspection: LinkInspection;
  try {
    inspection = await inspectDestination(link.normalizedUrl, deps);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    inspection = invalidInspection(message);
    const flags = error instanceof HttpError ? error.code ?? "inspection_error" : "inspection_error";
    inspection.flags = [flags];
    inspection.error = message;
  }
  const failed = Boolean(inspection.error && (!inspection.finalUrl || inspection.flags.includes("invalid_url")));
  const updated = await store.updateLink(id, {
    status: failed ? "error" : "ready",
    inspection,
    updatedAt: nowIso(),
  });
  if (updated) {
    realtime.emit({ type: "link.updated", link: updated });
    realtime.emit({ type: "overview.updated", at: nowIso() });
    realtime.emit({ type: "analytics.updated", at: nowIso() });
  }
  return updated!;
}

export async function createAndInspectLinks(
  store: Store,
  inputs: string[],
  source = "manual",
  deps: InspectorDeps = {},
): Promise<LinkRecord[]> {
  const records = await createLinkRecords(store, inputs, source);
  for (const record of records) realtime.emit({ type: "link.updated", link: record });
  const validRecords = records.filter((record) => record.status === "pending");
  const concurrency = 3;
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < validRecords.length) {
      const index = cursor;
      cursor += 1;
      const record = validRecords[index];
      await inspectLinkById(store, record.id, deps).catch((error) => {
        console.error("[links] inspection failed", error);
      });
    }
  };
  void Promise.all(Array.from({ length: Math.min(concurrency, validRecords.length) }, worker));
  return records;
}
