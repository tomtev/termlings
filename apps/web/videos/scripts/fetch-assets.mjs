import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const avatarDir = path.join(root, 'public', 'avatars');

const assets = [
  {url: 'https://termlings.com/logo.svg', file: path.join(root, 'public', 'logo.svg')},
  {url: 'https://termlings.com/claude-code-logo.svg', file: path.join(root, 'public', 'claude-code-logo.svg')},
  {url: 'https://termlings.com/codex-logo.svg', file: path.join(root, 'public', 'codex-logo.svg')},
  {url: 'https://termlings.com/api/render/preview-nova.svg', file: path.join(avatarDir, 'preview-nova.svg')},
  {url: 'https://termlings.com/api/render/preview-breeze.svg', file: path.join(avatarDir, 'preview-breeze.svg')},
  {url: 'https://termlings.com/api/render/preview-clover.svg', file: path.join(avatarDir, 'preview-clover.svg')},
  {url: 'https://termlings.com/api/render/preview-frost.svg', file: path.join(avatarDir, 'preview-frost.svg')},
  {url: 'https://termlings.com/api/render/preview-pickle.svg', file: path.join(avatarDir, 'preview-pickle.svg')}
];

await mkdir(avatarDir, {recursive: true});

for (const asset of assets) {
  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${asset.url}: ${response.status}`);
  }
  const body = await response.text();
  await writeFile(asset.file, body, 'utf8');
  console.log(`saved ${path.relative(root, asset.file)}`);
}
