/**
 * Tests de convenciones del frontend.
 *
 * Automatizan el check manual de CLAUDE.md:
 * "ninguna página web debe importar desde @basketball-clipper/shared (root)".
 *
 * Si este test falla, busca el import sin /api ni /types y corrígelo.
 * Antecedente: ya causó un bug en producción (auditoría sesión 16).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

// Raíz del monorepo (web/lib/__tests__/ → ../../../)
const REPO_ROOT = join(__dirname, "..", "..", "..");
const WEB_APP = join(REPO_ROOT, "web", "app");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Recorre recursivamente un directorio y devuelve todos los archivos .tsx */
function findTsxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...findTsxFiles(fullPath));
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Devuelve las líneas que contienen el patrón, con contexto de archivo y línea */
function grepFiles(files: string[], pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf-8").split("\n");
    lines.forEach((line, idx) => {
      if (pattern.test(line)) {
        const rel = relative(REPO_ROOT, file);
        hits.push(`${rel}:${idx + 1}: ${line.trim()}`);
      }
    });
  }
  return hits;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Convenciones de imports en web/app/", () => {
  const files = findTsxFiles(WEB_APP);

  it("no hay imports desde el root de @basketball-clipper/shared", () => {
    // Coincide con: from '@basketball-clipper/shared'  (sin /api ni /types)
    const rootImport = /from\s+['"]@basketball-clipper\/shared['"]/;
    const violations = grepFiles(files, rootImport);

    expect(violations, violations.join("\n")).toHaveLength(0);
  });
});
