/**
 * Canonical shape of the `/api/file` response envelope.
 *
 * Matches the JSON returned by `GET /api/file?path=<vault-path>`.
 * Previously redeclared as `FileData` in DetailPage.tsx + FileFullPage.tsx
 * and as `FileEnvelope`/`FileSection` in FilePreviewPanel.tsx — consolidated here.
 */

export interface FileSection {
  heading: string;
  level: number;
  body: string;
}

export interface FileEnvelope {
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
  content: string;
  sections: FileSection[];
}
