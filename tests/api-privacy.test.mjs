import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { runApiTask } from '../src/adapters/api.mjs';
import { prepareCloudFiles } from '../src/privacy.mjs';
import { toolkitFixture } from './helpers.mjs';

async function apiFixture(t) {
  const root = await toolkitFixture(t);
  await fs.mkdir(path.join(root, 'workspace', 'api'), { recursive: true });
  await fs.writeFile(path.join(root, 'workspace', 'api', 'input.md'), '# Synthetic input');
  return {
    root,
    task: {
      id: 'task-api', token: 'tok', stage: 'plan', role: 'research', workflow_id: 'workflow-api', cycle: 1,
      inputs: [{ path: 'workspace/api/input.md', sha256: 'ignored-by-adapter' }], context: 'synthetic'
    }
  };
}

test('cloud adapters require per-call confirmation and never send PDFs', async t => {
  const { root, task } = await apiFixture(t);
  let called = false;
  await assert.rejects(runApiTask(root, task, { provider: 'openai_api', model: 'test-model' }, {
    confirm: async () => false,
    fetchImpl: async () => { called = true; }
  }), /confirmation/);
  assert.equal(called, false);
  await fs.writeFile(path.join(root, 'workspace', 'api', 'paper.pdf'), '%PDF-1.4');
  await assert.rejects(prepareCloudFiles(root, [{ path: 'workspace/api/paper.pdf' }]), /blocked/);
});

test('OpenAI adapter uses Responses structured output and logs hashes instead of content', async t => {
  const { root, task } = await apiFixture(t);
  const old = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = ['test', 'key', 'not', 'real'].join('-');
  t.after(() => { if (old == null) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = old; });
  let requestBody;
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    const output = {
      status: 'completed', handoff_state: null, reason: null,
      artifacts: [{ kind: 'plan', path: 'workspace/api/plan.md', content: '# Generated synthetic plan' }]
    };
    return {
      ok: true, status: 200, headers: { get: () => 'request-test' },
      json: async () => ({ id: 'response-test', output_text: JSON.stringify(output), usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } })
    };
  };
  const result = await runApiTask(root, task, { provider: 'openai_api', model: 'test-model', base_url: 'https://local.invalid/v1/responses' }, { confirm: async () => true, fetchImpl });
  assert.equal(requestBody.text.format.type, 'json_schema');
  assert.equal(result.receipt.artifacts[0].kind, 'plan');
  const log = await fs.readFile(path.join(root, '.research-work', 'api-calls.ndjson'), 'utf8');
  assert.doesNotMatch(log, /Synthetic input|Generated synthetic plan/);
  assert.match(log, /request_hash/);
});

test('Anthropic adapter uses Messages output_config and parses text content', async t => {
  const { root, task } = await apiFixture(t);
  const old = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = ['test', 'key', 'not', 'real'].join('-');
  t.after(() => { if (old == null) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = old; });
  let requestBody;
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    const output = { status: 'completed', handoff_state: null, reason: null, artifacts: [{ kind: 'plan', path: 'workspace/api/claude-plan.md', content: '# Plan' }] };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ id: 'message-test', content: [{ type: 'text', text: JSON.stringify(output) }], usage: { input_tokens: 8, output_tokens: 4 } }) };
  };
  const result = await runApiTask(root, task, { provider: 'anthropic_api', model: 'test-model', base_url: 'https://local.invalid/v1/messages' }, { confirm: async () => true, fetchImpl });
  assert.equal(requestBody.output_config.format.type, 'json_schema');
  assert.equal(result.receipt.artifacts.length, 1);
});
