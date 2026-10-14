import * as fs from 'node:fs/promises';
import path from 'node:path';
import { packageRoot, exists, readJson } from './utils.mjs';

export async function loadConfig(root) {
  const local = path.join(root, 'config.local.json');
  const example = path.join(root, 'config.example.json');
  const target = (await exists(local))
    ? local
    : (await exists(example))
      ? example
      : path.join(packageRoot, 'config.example.json');
  const config = await readJson(target);
  if (config.schema_version !== 1 || !config.agents) throw new Error('Invalid agent config');
  config.agents.video ||= { provider: 'manual' };
  return { config, source: path.relative(root, target).split(path.sep).join('/') };
}
