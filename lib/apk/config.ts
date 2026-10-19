import { DEFAULT_APK_MAX_BYTES } from "./shared";

export function getApkMaxBytes(): number {
  const value = Number(process.env.APK_MAX_UPLOAD_BYTES);
  if (!Number.isFinite(value) || value < 1024 * 1024) return DEFAULT_APK_MAX_BYTES;
  return Math.floor(value);
}
