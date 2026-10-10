import * as fs from 'node:fs/promises';
import path from 'node:path';

const exists = target => fs.access(target).then(() => true, () => false);

export async function loadConfig(root) {
  const local = path.join(root, 'config.local.json');
  const example = path.join(root, 'config.example.json');
  const target = await exists(local) ? local : example;
  const config = JSON.parse((await fs.readFile(target, 'utf8')).replace(/^\uFEFF/, ''));
  if (config.schema_version !== 1 || !config.agents) throw new Error('Invalid agent config');
  config.agents.video ||= { provider: 'manual' };
  return { config, source: path.relative(root, target).split(path.sep).join('/') };
}
