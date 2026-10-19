export const DEFAULT_APK_MAX_BYTES = 500 * 1024 * 1024;

export function isApkFilename(name: string): boolean {
  return /\.apk$/i.test(name.trim());
}

export function validateApkFile(
  file: { name: string; size: number },
  maxBytes = DEFAULT_APK_MAX_BYTES,
): string | null {
  if (!isApkFilename(file.name)) return "Only .apk files are accepted.";
  if (file.size <= 0) return "The selected APK is empty.";
  if (file.size > maxBytes) {
    return `APK is too large. Maximum size is ${formatBytes(maxBytes)}.`;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}
