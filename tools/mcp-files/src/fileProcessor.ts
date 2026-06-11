import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { ToolResult } from "./types.js";
import { errorMessage, failure, success } from "./types.js";
import { defaultRoots, resolveAllowedPath, type RootConfig } from "./roots.js";

export const fileProcessorSchema = {
  type: "object",
  properties: {
    path: { type: "string" },
    maxChars: { type: "number", minimum: 1, maximum: 100000 },
  },
  required: ["path"],
  additionalProperties: false,
};

function roots(config: RootConfig): string[] {
  return config.roots ?? defaultRoots();
}

function detectType(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".md" || ext === ".markdown") return "markdown";
  if (ext === ".txt" || ext === ".log") return "text";
  if (ext === ".json") return "json";
  if (ext === ".csv" || ext === ".tsv") return "csv";
  if (ext === ".pdf") return "pdf";
  return "unknown";
}

function countCsvRows(text: string): number {
  return text.trim() ? text.trim().split(/\r?\n/).length - 1 : 0;
}

export function createFileProcessor(config: RootConfig) {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    const rawPath = String(args.path ?? "").trim();
    if (!rawPath) return failure("INVALID_ARGUMENTS", "path is required.");
    const allowed = resolveAllowedPath(rawPath, roots(config));
    if (!allowed.ok) return allowed;

    try {
      const info = await stat(allowed.data.path);
      if (!info.isFile()) return failure("NOT_A_FILE", `Not a file: ${allowed.data.path}`);
      const maxChars = Math.max(1, Math.min(100000, Number(args.maxChars ?? 20000)));
      const type = detectType(allowed.data.path);

      const metadata = {
        name: basename(allowed.data.path),
        path: allowed.data.path,
        extension: extname(allowed.data.path),
        sizeBytes: info.size,
        modifiedAt: info.mtime.toISOString(),
      };

      if (type === "pdf") {
        return success({ type, metadata, text: "", note: "PDF text extraction is not enabled in this light server yet." });
      }

      if (!["markdown", "text", "json", "csv"].includes(type)) {
        return failure("UNSUPPORTED_FILE_TYPE", `Unsupported file type: ${metadata.extension || "(none)"}`, { metadata });
      }

      const fullText = await readFile(allowed.data.path, "utf8");
      const text = fullText.slice(0, maxChars);

      if (type === "json") {
        const data = JSON.parse(fullText);
        return success({ type, metadata, text, truncated: fullText.length > maxChars, jsonType: Array.isArray(data) ? "array" : typeof data });
      }

      if (type === "csv") {
        return success({ type, metadata, text, truncated: fullText.length > maxChars, rows: countCsvRows(fullText) });
      }

      return success({ type, metadata, text, truncated: fullText.length > maxChars });
    } catch (error) {
      return failure("FILE_PROCESSING_FAILED", "file_processor failed.", errorMessage(error));
    }
  };
}
