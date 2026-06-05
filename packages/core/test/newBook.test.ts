import { describe, it, expect, vi } from "vitest";
import { makeNewBook } from "../src/tools/builtins/newBook.js";
import { PROJECT_DIRS } from "../src/core/kdpPhases.js";
import { join } from "node:path";

describe("new_book", () => {
  it("path vuoto → errore", async () => {
    const def = makeNewBook({ exists: () => false, mkdir: vi.fn() });
    expect(String(await def.handler({ path: "" }))).toMatch(/errore/i);
  });

  it("tutte da creare → mkdir per ogni dir con join(root, dir)", async () => {
    const mkdir = vi.fn();
    const def = makeNewBook({ exists: () => false, mkdir });
    const r = String(await def.handler({ path: "/proj" }));
    expect(mkdir).toHaveBeenCalledTimes(PROJECT_DIRS.length);
    for (const d of PROJECT_DIRS) {
      expect(mkdir).toHaveBeenCalledWith(join("/proj", d));
    }
    expect(r).toMatch(/Create \(4\)/);
  });

  it("alcune già presenti → non ricreate, reply distingue", async () => {
    const present = join("/proj", PROJECT_DIRS[0]!);
    const mkdir = vi.fn();
    const def = makeNewBook({ exists: (p) => p === present, mkdir });
    const r = String(await def.handler({ path: "/proj" }));
    expect(mkdir).toHaveBeenCalledTimes(PROJECT_DIRS.length - 1);
    expect(r).toMatch(/Già presenti \(1\)/);
    expect(r).toMatch(/Create \(3\)/);
  });
});
