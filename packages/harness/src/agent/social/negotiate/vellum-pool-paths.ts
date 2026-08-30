import path from "node:path";

/** Matches `@khoralabs/vellum-client` `VellumPool` attachment data dirs. */
export function vellumPoolAttachmentDataDir(
  dataDirRoot: string,
  did: string,
  channelId: string,
): string {
  return path.join(dataDirRoot, encodeURIComponent(did), encodeURIComponent(channelId));
}
