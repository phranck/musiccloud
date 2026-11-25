/**
 * Reads a `File` (e.g. from an `<input type="file">` or drag-drop event) and
 * resolves it to a `data:` URL (base64-encoded contents prefixed with its
 * MIME type). Used wherever an upload flow sends the image inline as JSON
 * (`{ dataUrl }`) rather than as multipart form data. The admin-user avatar
 * upload, the email-asset upload and the sponsor picture upload all POST this
 * shape.
 *
 * @param file - the file to encode.
 * @returns A promise resolving to the `data:` URL string.
 * @throws Rejects with an `Error` if the `FileReader` fails to read the file.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
