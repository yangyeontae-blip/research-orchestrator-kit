import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const exists = target => fs.access(target).then(() => true, () => false);
export const sha256Bytes = bytes => createHash('sha256').update(bytes).digest('hex');
export const sha256File = async target => sha256Bytes(await fs.readFile(target));
export const isoNow = () => new Date().toISOString();
export const slash = value => value.split(path.sep).join('/');
export const readJson = async target => JSON.parse((await fs.readFile(target, 'utf8')).replace(/^\uFEFF/, ''));
export const writeJson = async (target, value) => {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(value, null, 2) + '\n', 'utf8');
};
export const slugify = value => String(value || 'research-project')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60) || 'research-project';
export function inside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
export async function atomicWrite(target, content) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, content);
  await fs.rename(temp, target).catch(async error => {
    if (!['EPERM', 'EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
    await fs.copyFile(temp, target);
    await fs.unlink(temp).catch(() => {});
  });
}
