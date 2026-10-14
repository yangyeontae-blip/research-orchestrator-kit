import * as fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import { resolve4 } from 'node:dns/promises';
import { Engine } from './engine.mjs';
import { ingestLiteraturePdf } from './pdf.mjs';
import { readJson, writeJson, sha256Bytes } from './utils.mjs';
export function publicIPv4(ip) {
  const p = ip.split('.').map(Number);
  return (
    p.length === 4 &&
    p.every((n) => Number.isInteger(n) && n >= 0 && n < 256) &&
    !(
      [0, 10, 127].includes(p[0]) ||
      p[0] >= 224 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && [0, 168].includes(p[1])) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      (p[0] === 198 && [18, 19, 51].includes(p[1])) ||
      (p[0] === 203 && p[1] === 0)
    )
  );
}
// Pin the vetted public address; newer Node asks for every address ({all:true}) and needs an array back.
export const pinnedLookup = (ip) => (_host, options, cb) =>
  options?.all ? cb(null, [{ address: ip, family: 4 }]) : cb(null, ip, 4);
export async function downloadPublic(url, { maxBytes = 20000000, redirects = 4 } = {}) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443'))
    throw new Error('Only public HTTPS locations allowed');
  const ips = await resolve4(u.hostname);
  if (!ips.length || !ips.every(publicIPv4)) throw new Error('Non-public download target');
  return new Promise((resolve, reject) => {
    const req = https.get(
      u,
      { lookup: pinnedLookup(ips[0]), headers: { 'User-Agent': 'research-orchestrator-kit' } },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          if (redirects <= 0) return reject(new Error('Redirect limit'));
          downloadPublic(new URL(res.headers.location, u).href, { maxBytes, redirects: redirects - 1 }).then(
            resolve,
            reject
          );
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let size = 0;
        const chunks = [];
        res.on('data', (b) => {
          size += b.length;
          if (size > maxBytes) req.destroy(new Error('Download size limit'));
          else chunks.push(b);
        });
        res.on('error', reject);
        res.on('end', () => resolve({ bytes: Buffer.concat(chunks), url: u.href }));
      }
    );
    req.setTimeout(15000, () => req.destroy(new Error('Download timeout')));
    req.on('error', reject);
  });
}
export async function collectOpenAccess(root, project, { limit = 15, email, download = downloadPublic } = {}) {
  const engine = new Engine(root);
  await engine.artifact(path.join(project, 'literature-manifest.json'));
  const manifest = await readJson(path.join(root, project, 'literature-manifest.json'));
  const logPath = path.join(root, project, 'acquisition-log.json');
  const log = await readJson(logPath).catch(() => ({ items: [] }));
  let attempts = log.items.filter((x) => x.attempted).length;
  async function parseSaved(record, item) {
    const parsed = await ingestLiteraturePdf(root, project, path.join(root, record.file.path), { id: item.id });
    record.verification = parsed.verification;
    record.parsed_path = parsed.parsed_path;
    record.parsed = await engine.artifact(parsed.parsed_path, 'parsed_text');
    record.pages = await engine.artifact(path.join(path.dirname(parsed.parsed_path), 'pages.json'), 'parsed_pages');
    // Coarse title matching is not human bibliographic verification.
    const text = await fs.readFile(path.join(root, parsed.parsed_path), 'utf8');
    const words = item.normalized_title.split(' ').filter((w) => w.length > 2);
    const normalized = text.normalize('NFKC').toLowerCase();
    record.identity_checked =
      words.length > 0 && words.filter((w) => normalized.includes(w)).length / words.length >= 0.8;
    if (!record.identity_checked) {
      record.verification = 'metadata_mismatch';
      const current = await readJson(path.join(root, project, 'literature-manifest.json'));
      current.items.find((x) => x.id === item.id).verification = 'metadata_mismatch';
      await writeJson(path.join(root, project, 'literature-manifest.json'), current);
    }
  }
  for (const item of manifest.items.filter((i) => i.decision !== 'excluded').slice(0, 50)) {
    const old = log.items.find((x) => x.id === item.id && x.file);
    if (old) {
      await engine.artifact(old.file);
      if (old.verification === 'pdf_ingested' && old.identity_checked && old.parsed && old.pages) {
        await engine.artifact(old.parsed);
        await engine.artifact(old.pages);
        continue;
      }
      try {
        await parseSaved(old, item);
        delete old.error;
      } catch (e) {
        old.error = e.message;
      }
      await writeJson(logPath, log);
      continue;
    }
    if (attempts >= limit) break;
    const locations = [...(item.oa_locations || [])];
    if (!locations.length && email && item.doi) {
      try {
        const result = await download(
          `https://api.unpaywall.org/v2/${encodeURIComponent(item.doi)}?email=${encodeURIComponent(email)}`
        );
        const data = JSON.parse(result.bytes.toString('utf8'));
        for (const x of data.oa_locations || [])
          if (x.url_for_pdf)
            locations.push({
              url: x.url_for_pdf,
              license: x.license || null,
              version: x.version || null,
              source: 'unpaywall'
            });
      } catch {}
    }
    if (!locations.length) {
      if (!log.items.some((x) => x.id === item.id))
        log.items.push({ id: item.id, verification: 'unavailable', attempted: false });
      continue;
    }
    attempts++;
    const record = { id: item.id, attempted: true, at: new Date().toISOString(), verification: 'unavailable' };
    log.items.push(record);
    await writeJson(logPath, log);
    try {
      const location = locations[0];
      const result = await download(location.url);
      const bytes = result.bytes;
      if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Downloaded content is not PDF');
      const relative = path.join(project, 'downloads', sha256Bytes(bytes) + '.pdf');
      await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
      await fs.writeFile(path.join(root, relative), bytes, { flag: 'wx' }).catch((e) => {
        if (e.code !== 'EEXIST') throw e;
      });
      record.file = await engine.artifact(relative);
      record.source = { ...location, resolved_url: result.url };
      await parseSaved(record, item);
    } catch (e) {
      record.error = e.message;
    }
    await writeJson(logPath, log);
  }
  await writeJson(logPath, log);
  return log;
}
