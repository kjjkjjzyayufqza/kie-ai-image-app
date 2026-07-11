export async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export function openExternalUrl(url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.referrerPolicy = "no-referrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function downloadTextFile(
  filename: string,
  contents: string,
  mimeType = "application/json",
): void {
  const objectUrl = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
