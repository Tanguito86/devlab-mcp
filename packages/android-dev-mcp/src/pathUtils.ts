/**
 * WSL path translation for ADB commands.
 *
 * When running under WSL with a Windows adb.exe binary, file paths
 * passed to `adb pull` or `adb push` must use Windows host notation
 * (C:\Users\...) instead of WSL notation (/mnt/c/Users/...).
 *
 * `toAdbHostPath` detects WSL paths and translates them; non-WSL
 * paths (relative, Windows-native, or non-/mnt/ Linux paths) pass
 * through unchanged.
 */

export function toAdbHostPath(localPath: string): string {
  // Match /mnt/<drive>/... (WSL mount of Windows drive)
  const wslMatch = localPath.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (wslMatch) {
    const drive = wslMatch[1].toUpperCase();
    const rest = wslMatch[2].replace(/\//g, "\\");
    return `${drive}:\\${rest}`;
  }

  // Already a Windows path — leave as-is
  if (/^[a-zA-Z]:\\/.test(localPath)) {
    return localPath;
  }

  // Already a Windows path with forward slashes — normalize
  if (/^[a-zA-Z]:\//.test(localPath)) {
    return localPath.replace(/\//g, "\\");
  }

  // Relative path or non-WSL Linux path — leave as-is
  return localPath;
}
