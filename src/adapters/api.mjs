import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SchemaRegistry } from '../schemas.mjs';
import { prepareCloudFiles } from '../privacy.mjs';
import { inside, isoNow, sha256Bytes } from '../utils.mjs';

const responseSchema = {
  type: 'object',
  properties: {
    status: { enum: ['completed', 'partial', 'failed'] },
    handoff_state: { type: ['string', 'null'] },
    reason: { type: ['string', 'null'] },
    artifacts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string' },
          path: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['kind', 'path', 'content'],
        additionalProperties: false
      }
    }
  },
  required: ['status', 'handoff_state', 'reason', 'artifacts'],
  additionalProperties: false
};

function taskPrompt(task, files) {
  return [
    'Complete this research-workflow task without inventing experiences, results, citations, page numbers, or reading status.',
    'Return only schema-conforming JSON. Artifact paths must stay under workspace/.',
    `<task>${JSON.stringify({ ...task, token: undefined })}</task>`,
    ...files.map(file => `<document path="${file.path}" sha256="${file.sha256}">\n${file.text}\n</document>`)
  ].join('\n\n');
}

function openAIText(body) {
  if (typeof body.output_text === 'string') return body.output_text;
  for (const item of body.output || []) for (const block of item.content || []) if (block.type === 'output_text' && block.text) return block.text;
  throw new Error('OpenAI response did not contain output text');
}

function anthropicText(body) {
  const block = (body.content || []).find(item => item.type === 'text');
  if (!block?.text) throw new Error('Anthropic response did not contain text');
  return block.text;
}

async function appendLog(root, entry) {
  const target = path.join(root, '.research-work', 'api-calls.ndjson');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, JSON.stringify(entry) + '\n', 'utf8');
}

export async function runApiTask(root, task, agent, options = {}) {
  const provider = agent.provider;
  if (!['openai_api', 'anthropic_api'].includes(provider)) throw new Error(`Unsupported API provider: ${provider}`);
  if (!agent.model) throw new Error(`${provider} requires a model in config.local.json`);
  const prepared = await prepareCloudFiles(root, task.inputs);
  const summary = {
    provider, model: agent.model,
    files: prepared.files.map(({ path: filePath, bytes, sha256 }) => ({ path: filePath, bytes, sha256 })),
    total_bytes: prepared.total_bytes,
    sensitive_findings: prepared.findings
  };
  const confirmed = await options.confirm?.(summary);
  if (confirmed !== true) throw new Error('Cloud call cancelled: interactive human confirmation is required for every call');
  const fetchImpl = options.fetchImpl || fetch;
  const prompt = taskPrompt(task, prepared.files);
  let url;
  let request;
  if (provider === 'openai_api') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is not set');
    url = agent.base_url || 'https://api.openai.com/v1/responses';
    request = {
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: {
        model: agent.model,
        input: [{ role: 'system', content: 'You are a research workflow agent. Follow evidence labels and protect participant privacy.' }, { role: 'user', content: prompt }],
        text: { format: { type: 'json_schema', name: 'research_task_receipt', strict: true, schema: responseSchema } }
      },
      parse: openAIText
    };
  } else {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
    url = agent.base_url || 'https://api.anthropic.com/v1/messages';
    request = {
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: {
        model: agent.model, max_tokens: agent.max_tokens || 4096,
        system: 'You are a research workflow agent. Follow evidence labels and protect participant privacy.',
        messages: [{ role: 'user', content: prompt }],
        output_config: { format: { type: 'json_schema', schema: responseSchema } }
      },
      parse: anthropicText
    };
  }
  const response = await fetchImpl(url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body) });
  const responseBody = await response.json();
  if (!response.ok) throw new Error(`${provider} returned ${response.status}: ${responseBody.error?.message || response.statusText}`);
  const parsed = JSON.parse(request.parse(responseBody));
  const validate = (await new SchemaRegistry(root).validator('receipt'));
  const receiptLike = { schema_version: 1, task_id: task.id, token: task.token, status: parsed.status, artifacts: [] };
  const artifacts = [];
  for (const artifact of parsed.artifacts) {
    const target = path.resolve(root, artifact.path);
    if (!inside(path.join(root, 'workspace'), target)) throw new Error(`API artifact path must stay under workspace/: ${artifact.path}`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, artifact.content, 'utf8');
    artifacts.push({ kind: artifact.kind, path: artifact.path });
  }
  Object.assign(receiptLike, { artifacts });
  if (parsed.handoff_state) receiptLike.handoff_state = parsed.handoff_state;
  if (parsed.reason) receiptLike.reason = parsed.reason;
  if (!validate(receiptLike)) throw new Error(`API receipt failed validation: ${validate.errors.map(item => item.message).join(', ')}`);
  const usage = responseBody.usage || {};
  await appendLog(root, {
    id: randomUUID(), provider, model: agent.model, task_id: task.id,
    request_hash: sha256Bytes(Buffer.from(prompt)), input_files: summary.files,
    usage: { input_tokens: usage.input_tokens ?? null, output_tokens: usage.output_tokens ?? null, total_tokens: usage.total_tokens ?? null },
    request_id: response.headers?.get?.('x-request-id') || responseBody.id || null,
    at: isoNow()
  });
  return { summary, receipt: receiptLike };
}
