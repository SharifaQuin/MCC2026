// Client-only helper: read an uploaded file (e.g. a PDF) as a base64 data
// URI, unmodified — unlike fileToResizedDataUrl (imageResize.ts) this does
// no image decoding/resizing, since a PDF isn't a canvas-drawable image.
export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
