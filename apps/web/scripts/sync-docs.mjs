#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const targetDir = resolve(projectRoot, 'src', 'content', 'docs');
const sourceRoot = process.env.TERMLINGS_DOCS_SOURCE
  ? resolve(process.env.TERMLINGS_DOCS_SOURCE)
  : resolve(projectRoot, '..', '..');
const sourceDocsDir = join(sourceRoot, 'docs');
const sourceReadmePath = join(sourceRoot, 'README.md');

function listMarkdownFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

const sourceDocFiles = listMarkdownFiles(sourceDocsDir);
const hasSource = existsSync(sourceReadmePath) && sourceDocFiles.length > 0;
const existingTargetFiles = listMarkdownFiles(targetDir);

if (!hasSource) {
  if (existingTargetFiles.length > 0) {
    console.log(
      `Docs source not found at ${sourceRoot}. Keeping existing mirror in ${relative(projectRoot, targetDir)}.`
    );
    process.exit(0);
  }

  throw new Error(
    `Docs source not found at ${sourceRoot}. Expected README.md and docs/*.md.`
  );
}

mkdirSync(targetDir, { recursive: true });

for (const fileName of existingTargetFiles) {
  rmSync(join(targetDir, fileName), { force: true });
}

const mirroredReadme = readFileSync(sourceReadmePath, 'utf8').replace(
  /^- \[docs\/plans\/README\.md\]\(docs\/plans\/README\.md\) - planning model and future direction\r?\n/m,
  ''
);
writeFileSync(join(targetDir, 'README.md'), mirroredReadme);

for (const fileName of sourceDocFiles) {
  cpSync(join(sourceDocsDir, fileName), join(targetDir, fileName));
}

console.log(
  `Synced ${sourceDocFiles.length + 1} markdown files from ${sourceRoot} into ${relative(projectRoot, targetDir)}.`
);
