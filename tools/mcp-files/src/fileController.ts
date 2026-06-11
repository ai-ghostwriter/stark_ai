import { copyFile, cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { ToolResult } from "./types.js";
import { errorMessage, failure, success } from "./types.js";
import { defaultRoots, resolveAllowedPath, type RootConfig } from "./roots.js";

export const fileControllerSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["list", "move", "copy", "rename", "delete"] },
    path: { type: "string" },
    destination: { type: "string" },
    newName: { type: "string" },
  },
  required: ["action", "path"],
  additionalProperties: false,
};

function roots(config: RootConfig): string[] {
  return config.roots ?? defaultRoots();
}

async function entry(path: string) {
  const info = await stat(path);
  return {
    name: basename(path),
    path,
    type: info.isDirectory() ? "directory" : "file",
    sizeBytes: info.size,
    modifiedAt: info.mtime.toISOString(),
  };
}

export function createFileController(config: RootConfig) {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    const action = String(args.action ?? "").trim();
    const path = String(args.path ?? "").trim();
    if (!action || !path) return failure("INVALID_ARGUMENTS", "action and path are required.");

    const src = resolveAllowedPath(path, roots(config));
    if (!src.ok) return src;

    try {
      if (action === "list") {
        const info = await stat(src.data.path);
        if (!info.isDirectory()) return failure("NOT_A_DIRECTORY", `Not a directory: ${src.data.path}`);
        const names = await readdir(src.data.path);
        const entries = await Promise.all(names.filter((name) => !name.startsWith(".")).map((name) => entry(join(src.data.path, name))));
        return success({ path: src.data.path, entries });
      }

      if (action === "move" || action === "copy") {
        const destination = String(args.destination ?? "").trim();
        if (!destination) return failure("INVALID_ARGUMENTS", "destination is required.");
        const dst = resolveAllowedPath(destination, roots(config));
        if (!dst.ok) return dst;
        await mkdir(dirname(dst.data.path), { recursive: true });
        if (action === "move") await rename(src.data.path, dst.data.path);
        else {
          const info = await stat(src.data.path);
          if (info.isDirectory()) await cp(src.data.path, dst.data.path, { recursive: true, errorOnExist: true });
          else await copyFile(src.data.path, dst.data.path);
        }
        return success({ action, from: src.data.path, to: dst.data.path });
      }

      if (action === "rename") {
        const newName = String(args.newName ?? "").trim();
        if (!newName || newName.includes("/") || newName.includes("\\")) return failure("INVALID_ARGUMENTS", "newName must be a filename.");
        const dst = resolveAllowedPath(join(dirname(src.data.path), newName), roots(config));
        if (!dst.ok) return dst;
        await rename(src.data.path, dst.data.path);
        return success({ action, from: src.data.path, to: dst.data.path });
      }

      if (action === "delete") {
        await rm(src.data.path, { recursive: true, force: false });
        return success({ action, path: src.data.path });
      }

      return failure("UNSUPPORTED_ACTION", `Unknown file_controller action '${action}'.`);
    } catch (error) {
      return failure("FILE_OPERATION_FAILED", `file_controller ${action} failed.`, errorMessage(error));
    }
  };
}
