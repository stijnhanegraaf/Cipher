/** Build an `obsidian://open` deep link for the given vault + file path. */
export function buildObsidianUri(vaultName: string | undefined, filePath: string): string {
  const name = vaultName && vaultName.trim() ? vaultName : "Obsidian";
  return `obsidian://open?vault=${encodeURIComponent(name)}&file=${encodeURIComponent(filePath)}`;
}
