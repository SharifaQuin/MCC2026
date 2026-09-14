import { getGraphAccessToken } from "@/lib/msGraph";

// Uploads to the same mailbox already used for outbound email
// (MS_GRAPH_SENDER_EMAIL) — this app's own OneDrive, not a shared drive,
// since every document exported here is ADMIN-only sensitive HR data.
// Graph's simple upload endpoint tops out at 4MB, which every document
// this app generates (rendered PDFs, uploaded compliance files) comfortably
// fits under.
function sanitizePathSegment(segment: string): string {
  return segment.replace(/[\\/:*?"<>|]/g, "-").trim();
}

async function uploadOneFile(
  accessToken: string,
  senderEmail: string,
  folderPath: string[],
  fileName: string,
  dataUrl: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const commaIndex = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || commaIndex === -1) {
    return { ok: false, error: `"${fileName}" isn't a valid data URL.` };
  }
  const base64 = dataUrl.slice(commaIndex + 1);
  const bytes = Buffer.from(base64, "base64");

  const fullPath = [...folderPath.map(sanitizePathSegment), sanitizePathSegment(fileName)]
    .map((seg) => encodeURIComponent(seg))
    .join("/");

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/drive/root:/${fullPath}:/content`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/octet-stream" },
      body: bytes,
    }
  );

  if (!res.ok) {
    return { ok: false, error: `"${fileName}" failed to upload: ${await res.text()}` };
  }
  return { ok: true };
}

export interface OneDriveExportFile {
  folderPath: string[];
  fileName: string;
  dataUrl: string;
}

export interface OneDriveExportResult {
  ok: boolean;
  error?: string;
  uploaded: number;
  failed: { fileName: string; error: string }[];
}

export async function exportFilesToOneDrive(files: OneDriveExportFile[]): Promise<OneDriveExportResult> {
  const tokenResult = await getGraphAccessToken();
  if (!tokenResult.ok) {
    return { ok: false, error: tokenResult.error, uploaded: 0, failed: [] };
  }

  const failed: { fileName: string; error: string }[] = [];
  let uploaded = 0;
  for (const file of files) {
    const result = await uploadOneFile(
      tokenResult.accessToken,
      tokenResult.senderEmail,
      file.folderPath,
      file.fileName,
      file.dataUrl
    );
    if (result.ok) uploaded++;
    else failed.push({ fileName: file.fileName, error: result.error });
  }

  return { ok: failed.length === 0, uploaded, failed };
}
