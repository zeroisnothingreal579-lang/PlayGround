import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import yauzl from "yauzl";
import { getApkMaxBytes } from "./config";

export class ApkUploadError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface ApkEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  isDirectory: boolean;
}

export interface StoredApk {
  storageKey: string;
  filePath: string;
  sizeBytes: number;
  sha256: string;
}

export function getApkStorageRoot(): string {
  return path.resolve(
    /* turbopackIgnore: true */
    process.env.APK_STORAGE_DIR || path.join(process.cwd(), "data", "apk-storage"),
  );
}

export function sanitizeApkFilename(value: string): string {
  const base = path.basename(value.replace(/\\/g, "/")).trim();
  const cleaned = base.replace(/[^\w. ()[\]-]+/g, "_").slice(0, 180);
  if (!/\.apk$/i.test(cleaned)) throw new ApkUploadError("Only .apk files are accepted.");
  return cleaned;
}

function resolveStorageKey(storageKey: string): string {
  const root = getApkStorageRoot();
  const resolved = path.resolve(root, storageKey);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new ApkUploadError("Invalid APK storage key.");
  }
  return resolved;
}

export async function storeApkStream(input: {
  projectId: string;
  uploadId?: string;
  stream: ReadableStream<Uint8Array> | null;
  maxBytes?: number;
}): Promise<StoredApk> {
  if (!input.stream) throw new ApkUploadError("The upload body is empty.");
  const maxBytes = input.maxBytes ?? getApkMaxBytes();
  const uploadId = input.uploadId || randomUUID();
  const root = getApkStorageRoot();
  const directory = path.join(/* turbopackIgnore: true */ root, input.projectId);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  await fs.chmod(root, 0o700).catch(() => undefined);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });

  const storageKey = path.join(input.projectId, `${uploadId}.apk`);
  const filePath = resolveStorageKey(storageKey);
  const temporaryPath = `${filePath}.uploading`;
  const reader = input.stream.getReader();
  const hash = createHash("sha256");
  let sizeBytes = 0;

  await fs.rm(temporaryPath, { force: true });
  const handle = await fs.open(temporaryPath, "wx", 0o600);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      sizeBytes += value.byteLength;
      if (sizeBytes > maxBytes) {
        throw new ApkUploadError(
          `APK exceeds the maximum upload size of ${Math.floor(maxBytes / (1024 * 1024))} MB.`,
          413,
        );
      }
      hash.update(value);
      await handle.write(value);
    }
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await fs.rm(temporaryPath, { force: true });
    await reader.cancel().catch(() => undefined);
    if (error instanceof ApkUploadError) throw error;
    throw new ApkUploadError(
      error instanceof Error ? `Upload failed: ${error.message}` : "Upload failed.",
      400,
    );
  } finally {
    await handle.close().catch(() => undefined);
    reader.releaseLock();
  }

  if (sizeBytes === 0) {
    await fs.rm(temporaryPath, { force: true });
    throw new ApkUploadError("The selected APK is empty.");
  }

  await fs.rename(temporaryPath, filePath);
  await fs.chmod(filePath, 0o600).catch(() => undefined);
  return {
    storageKey,
    filePath,
    sizeBytes,
    sha256: hash.digest("hex"),
  };
}

export function getStoredApkPath(storageKey: string) {
  return resolveStorageKey(storageKey);
}

export function readApkStream(storageKey: string) {
  return createReadStream(/* turbopackIgnore: true */ resolveStorageKey(storageKey));
}

export async function removeStoredApk(storageKey: string | null | undefined) {
  if (!storageKey) return;
  const filePath = resolveStorageKey(storageKey);
  await fs.rm(filePath, { force: true });
  await fs.rmdir(path.dirname(filePath)).catch(() => undefined);
}

export function listApkEntries(filePath: string): Promise<ApkEntry[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(new ApkUploadError("The file is not a readable APK/ZIP archive."));
        return;
      }
      const entries: ApkEntry[] = [];
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        zipFile.close();
        reject(
          error instanceof ApkUploadError
            ? error
            : new ApkUploadError("The APK archive could not be read."),
        );
      };
      zipFile.on("error", fail);
      zipFile.on("entry", (entry) => {
        entries.push({
          name: entry.fileName,
          compressedSize: entry.compressedSize,
          uncompressedSize: entry.uncompressedSize,
          isDirectory: /\/$/.test(entry.fileName),
        });
        if (entries.length > 250_000) {
          fail(new ApkUploadError("The APK contains too many archive entries."));
          return;
        }
        zipFile.readEntry();
      });
      zipFile.on("end", () => {
        if (settled) return;
        settled = true;
        resolve(entries);
      });
      zipFile.readEntry();
    });
  });
}

export async function validateApkArchive(filePath: string): Promise<ApkEntry[]> {
  const handle = await fs.open(filePath, "r");
  const signature = Buffer.alloc(4);
  try {
    await handle.read(signature, 0, 4, 0);
  } finally {
    await handle.close();
  }
  if (signature.toString("hex") !== "504b0304" && signature.toString("hex") !== "504b0506") {
    throw new ApkUploadError("The selected file is not a valid APK/ZIP archive.");
  }
  const entries = await listApkEntries(filePath);
  const manifest = entries.find(
    (entry) => !entry.isDirectory && entry.name.toLowerCase() === "androidmanifest.xml",
  );
  if (!manifest) {
    throw new ApkUploadError("The archive does not contain AndroidManifest.xml.");
  }
  return entries;
}
