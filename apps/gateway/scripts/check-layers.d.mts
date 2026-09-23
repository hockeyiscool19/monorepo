/** Return every layering violation under `srcDir` as "relative/path.ts: detail"; empty means clean. */
export function checkLayers(srcDir: string): string[];
