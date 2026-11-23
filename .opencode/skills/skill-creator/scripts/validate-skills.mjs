#!/usr/bin/env node
// Valida la estructura de Skills de OpenCode. Sin dependencias externas.
// Uso: node validate-skills.mjs [raiz] [id1 id2 ...]
// Por defecto, raiz = ~/.config/opencode/skills y se validan todos los IDs.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.argv[2] || path.join(os.homedir(), ".config", "opencode", "skills");
const filter = process.argv.slice(3);
const ids = filter.length
  ? filter
  : fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

const problems = [];
const checked = [];

for (const id of ids.sort()) {
  const dir = path.join(root, id);
  const file = path.join(dir, "SKILL.md");
  if (!fs.existsSync(file)) {
    problems.push(`${id}: falta SKILL.md`);
    continue;
  }

  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    problems.push(`${id}: frontmatter inválido (debe empezar con --- name/description ---)`);
    continue;
  }

  const frontmatter = match[1];
  const name = /^name:\s*\S+/m.test(frontmatter);
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim() || "";
  if (!name) problems.push(`${id}: falta el campo name`);
  if (description.length < 40) problems.push(`${id}: description demasiado corta o ausente (mínimo 40 caracteres)`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) problems.push(`${id}: el ID del directorio no es kebab-case`);
  if (lines.length > 500) problems.push(`${id}: SKILL.md tiene ${lines.length} líneas (máximo ~500)`);
  if (!/^##\s+(Cuándo usarlo|Método|Objetivo)/m.test(text)) problems.push(`${id}: falta una sección de activación o método`);

  for (const link of text.matchAll(/\]\((?!https?:\/\/|#)([^)]+)\)/g)) {
    const target = link[1].split("#")[0].trim();
    if (!target) continue;
    if (!fs.existsSync(path.resolve(dir, target))) problems.push(`${id}: referencia rota ${target}`);
  }

  if (/[A-Za-z]:\\Users\\|\/Users\/[A-Za-z]/.test(text)) {
    problems.push(`${id}: contiene una ruta absoluta de usuario`);
  }

  checked.push(`${id} (${lines.length} líneas)`);
}

console.log(`Validados ${checked.length} skills:`);
console.log(checked.map((line) => `  - ${line}`).join("\n") || "  (ninguno)");
if (problems.length) {
  console.error("\nErrores:");
  console.error(problems.map((line) => `  - ${line}`).join("\n"));
  process.exit(1);
}
console.log("\nOK: frontmatter, IDs, longitud, referencias y rutas correctos.");
