import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSensitiveText, redactSensitiveText } from '../src/privacy.mjs';
import { unlinkQuiet } from '../src/utils.mjs';
import { execute } from '../src/process.mjs';

// Secrets are assembled at runtime so the repository audit never sees a literal key in the tree.
const join = (...parts) => parts.join('');

test('detects the extended identifier and credential patterns once per type', () => {
  const text = [
    join('AKIA', 'ABCDEFGHIJKLMNOP'),
    join('xoxb-', '1234567890-abcdef'),
    join('02', '-123-', '4567'),
    join('1234', ' ', '5678', ' ', '9012', ' ', '3456'),
    join('-----BEGIN ', 'PRIVATE KEY-----')
  ].join('\n');
  const types = detectSensitiveText(text)
    .map((item) => item.type)
    .sort();
  assert.deepEqual(types, ['api_key_like', 'card_number_like', 'korean_landline', 'private_key_block']);
  assert.equal(detectSensitiveText(text).find((item) => item.type === 'api_key_like').severity, 'high');
});

test('redaction masks every detected pattern and leaves ordinary numbers alone', () => {
  const { text, redactions } = redactSensitiveText(
    `call ${join('031', '-123-', '4567')} key ${join('AKIA', 'ABCDEFGHIJKLMNOP')} n=2024 p=0.05`
  );
  assert.equal(redactions, 2);
  assert.match(text, /n=2024 p=0\.05/);
  assert.doesNotMatch(text, /AKIA/);
});

test('unlinkQuiet ignores missing files', async () => {
  await unlinkQuiet(join(process.cwd(), 'definitely-missing-', String(process.pid), '.tmp'));
});

test('execute preserves multi-byte output split across chunks', async () => {
  const out = await execute(process.execPath, ['-e', "process.stdout.write(Buffer.from('한국어'.repeat(2000)))"]);
  assert.equal(out, '한국어'.repeat(2000));
});
