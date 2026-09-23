/** Drain a body stream to text ("" for null). */
export async function readText(body: ReadableStream<Uint8Array> | null): Promise<string> {
  return body === null ? "" : new Response(body).text();
}

/** UTF-8 bytes of `text` as a standalone ArrayBuffer. */
export async function bytes(text: string): Promise<ArrayBuffer> {
  return new Blob([text]).arrayBuffer();
}

/** A one-chunk body stream. */
export function textStream(text: string): ReadableStream<Uint8Array> {
  return new Blob([text]).stream();
}
