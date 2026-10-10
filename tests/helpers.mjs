import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

export const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function toolkitFixture(t) {
  const base = path.join(os.tmpdir(), 'research-orchestrator-kit-v02-tests');
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'fixture-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const directory of ['profiles', 'schemas', 'prompts']) {
    await fs.cp(path.join(sourceRoot, directory), path.join(root, directory), { recursive: true });
  }
  await fs.copyFile(path.join(sourceRoot, 'config.example.json'), path.join(root, 'config.example.json'));
  return root;
}

export function makePdf(text = 'Synthetic research text', metadata = {}) {
  const escape = value => String(value).replace(/([\\()])/g, '\\$1');
  const stream = text == null ? '0 0 m 100 100 l S' : `BT /F1 12 Tf 72 720 Td (${escape(text)}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    `<< /Title (${escape(metadata.title || 'Synthetic Study')}) /Author (${escape(metadata.author || 'Synthetic Author')}) >>`
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'binary');
}

export function zipEntry(buffer, wanted) {
  let offset = 0;
  while (offset + 30 < buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressed = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    const data = buffer.subarray(start, start + compressed);
    if (name === wanted) return method === 0 ? data : inflateRawSync(data);
    offset = start + compressed;
  }
  return null;
}

