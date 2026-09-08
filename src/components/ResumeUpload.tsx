"use client";

import { useState } from "react";

// Resumes are PDFs/Word docs, not images, so unlike lesson photos we can't
// resize via <canvas> — just read the raw file as a base64 data URI and
// store it directly on the Applicant row (same "no separate file storage"
// pattern the app already uses for lesson images).
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

export default function ResumeUpload() {
  const [fileName, setFileName] = useState("");
  const [dataUrl, setDataUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-neutral-700">
        Resume (PDF or Word doc) *
      </label>
      <input type="hidden" name="resumeDataUrl" value={dataUrl} />
      <input type="hidden" name="resumeFileName" value={fileName} />
      <input
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        required={!dataUrl}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > MAX_BYTES) {
            setError("That file is too large (8MB max). Please choose a smaller file.");
            setDataUrl("");
            setFileName("");
            return;
          }
          setError(null);
          setFileName(file.name);
          setDataUrl(await fileToDataUrl(file));
        }}
        className="block w-full text-sm text-neutral-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      {fileName && !error && <p className="mt-1 text-sm text-neutral-500">Selected: {fileName}</p>}
    </div>
  );
}
