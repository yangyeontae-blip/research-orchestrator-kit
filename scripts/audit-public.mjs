import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditRepository } from '../src/audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = await auditRepository(root);
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
if (!result.ok) process.exitCode = 1;
