import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { SchemaRegistry } from './schemas.mjs';
import { verifyArtifactUse } from './use-verification.mjs';
import { toolkitPath } from './utils.mjs';

export const ROLE_FOR_STAGE = Object.freeze({
  study: 'study',
  plan: 'research',
  literature: 'literature',
  review: 'research',
  revise: 'research',
  video_storyboard: 'video',
  video_render: 'video'
});

const TERMINAL = new Set(['completed', 'partial', 'failed']);
const RECEIPT_STATUSES = new Set(['completed', 'partial', 'failed']);
const USE_VERIFICATION_STAGES = new Set(['plan', 'revise', 'video_render']);
const LOCK_WAIT_MS = 10_000;
// State transactions take milliseconds; an older lock was left behind by a crashed process.
const STALE_LOCK_MS = 120_000;
const DEFAULT_LEASE_MS = 72 * 60 * 60 * 1000;
const slash = value => value.split(path.sep).join('/');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const now = () => new Date().toISOString();
const exists = target => fs.access(target).then(() => true, () => false);
const readJson = async target => JSON.parse((await fs.readFile(target, 'utf8')).replace(/^\uFEFF/, ''));

function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

const leaseExpired = task => task.status === 'running' && Boolean(task.lease_expires_at) && Date.parse(task.lease_expires_at) <= Date.now();

export class Engine {
  constructor(root, options = {}) {
    this.root = path.resolve(root);
    this.workDir = path.resolve(this.root, options.workDirName || '.research-work');
    this.statePath = path.join(this.workDir, 'state.json');
    this.lockPath = path.join(this.workDir, 'state.lock');
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  }

  async profile(id) {
    const safe = String(id || '').match(/^[a-z0-9_-]+$/i)?.[0];
    if (!safe) throw new Error('Invalid profile id');
    const target = await toolkitPath(this.root, 'profiles', safe + '.json');
    if (!await exists(target)) throw new Error(`Profile not found: ${safe}`);
    const profile = await readJson(target);
    if (profile.id !== safe || profile.schema_version !== 1) throw new Error('Invalid profile document');
    return profile;
  }

  async artifact(binding, defaultKind = 'artifact') {
    const source = typeof binding === 'string' ? { path: binding } : binding;
    required(source?.path, 'Artifact path is required');
    const requested = path.resolve(this.root, source.path);
    const relative = path.relative(this.root, requested);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Artifacts must stay inside the project root');
    let cursor = this.root;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, segment);
      const entry = await fs.lstat(cursor);
      if (entry.isSymbolicLink()) throw new Error('Artifact paths may not traverse symbolic links or junctions');
    }
    const stat = await fs.stat(requested);
    if (!stat.isFile()) throw new Error('Artifact must be a file');
    const sha256 = digest(await fs.readFile(requested));
    if (source.sha256 && source.sha256.toLowerCase() !== sha256) throw new Error(`Artifact hash mismatch: ${slash(relative)}`);
    return { kind: source.kind || defaultKind, path: slash(relative), sha256 };
  }

  async init(options = {}) {
    const profile = await this.profile(options.profile || 'generic');
    await fs.mkdir(this.workDir, { recursive: true });
    return this.#transaction(async state => {
      if (state) {
        if (state.profile !== profile.id) throw new Error(`Workflow already uses profile ${state.profile}`);
        return state;
      }
      return {
        schema_version: 1,
        workflow_id: options.workflow_id || randomUUID(),
        profile: profile.id,
        current_stage: 'initialized',
        cycle: 1,
        tasks: [],
        artifacts: {},
        approvals: { collection: null, revision: null, video: null },
        supplemental_collection: null,
        revision_lineage: null,
        finalization: null,
        branches: { video: { status: 'idle', requested_plan_sha256: null } },
        project_dir: options.project_dir || null,
        errors: [],
        history: [{ event: 'initialized', at: now() }],
        created_at: now(),
        updated_at: now()
      };
    }, { allowMissing: true });
  }

  async enqueue(request) {
    return this.#transaction(async state => this.#enqueue(state, request, false));
  }

  async claim(taskId, claimant = 'agent') {
    return this.#transaction(async state => {
      const task = state.tasks.find(item => item.id === taskId);
      if (!task || task.status !== 'queued') throw new Error('Task is not available to claim');
      this.#expireLeases(state, task.role);
      this.#assertRoleFree(state, task);
      await this.#verifyTaskBindings(state, task);
      task.status = 'running';
      task.claimant = claimant;
      task.token = randomUUID();
      task.claimed_at = now();
      task.lease_expires_at = new Date(Date.now() + this.leaseMs).toISOString();
      if (task.branch !== 'video') state.current_stage = task.stage;
      state.history.push({ event: 'claimed', task_id: task.id, stage: task.stage, role: task.role, at: now() });
      return { ...task };
    });
  }

  async complete(receipt) {
    return this.#transaction(async state => {
      const task = state.tasks.find(item => item.id === receipt.task_id);
      if (!task || task.status !== 'running' || task.token !== receipt.token) throw new Error('Task token or running state does not match');
      if (!RECEIPT_STATUSES.has(receipt.status)) throw new Error('Receipt status must be completed, partial, or failed');
      if (receipt.status === 'completed') await this.#verifyTaskBindings(state, task);
      else {
        // A failure report is always accepted, even when an input changed under the agent.
        try {
          await this.#verifyTaskBindings(state, task);
          task.binding_warning = null;
        } catch (error) {
          task.binding_warning = error.message;
        }
      }
      const incoming = [];
      for (const item of receipt.artifacts || []) incoming.push(await this.artifact(item));
      task.artifacts = this.#mergeArtifacts(task.artifacts || [], incoming);
      task.reason = receipt.reason || null;
      task.completed_at = now();

      if (receipt.status === 'failed' || receipt.status === 'partial') {
        if (!task.reason) throw new Error(`${receipt.status} receipts require a reason`);
        task.status = receipt.status;
        task.token = null;
        if (task.branch === 'video') state.branches.video = { ...state.branches.video, status: `${task.stage}_${receipt.status}`, task_id: task.id };
        else state.current_stage = `${task.stage}_${receipt.status}`;
        state.errors.push({ task_id: task.id, stage: task.stage, status: receipt.status, reason: task.reason, at: now() });
        state.history.push({ event: receipt.status, task_id: task.id, stage: task.stage, at: now() });
        return this.#publicTask(task);
      }

      await this.#requireArtifacts(state, task);
      if (task.stage === 'video_render') await this.#validateVideoManifest(task);
      task.status = 'completed';
      task.token = null;
      task.completion_level = 'generated';
      state.history.push({ event: 'completed', task_id: task.id, stage: task.stage, at: now() });
      if (USE_VERIFICATION_STAGES.has(task.stage)) {
        if (task.branch === 'video') state.branches.video = { ...state.branches.video, status: 'use_verification', task_id: task.id };
        else state.current_stage = `${task.stage}_use_verification`;
        state.history.push({ event: 'use_verification_required', task_id: task.id, stage: task.stage, at: now() });
        return this.#publicTask(task);
      }
      await this.#advance(state, task, receipt);
      return this.#publicTask(task);
    });
  }

  async verifyUse(taskId, specification) {
    return this.#transaction(async state => {
      const task = state.tasks.find(item => item.id === taskId);
      if (!task || task.status !== 'completed' || !USE_VERIFICATION_STAGES.has(task.stage)) {
        throw new Error('Use verification requires a completed plan, revision, or video render task');
      }
      if (task.completion_level === 'use_verified') return this.#publicTask(task);
      if (!['generated', 'automated_verified'].includes(task.completion_level)) throw new Error('Artifact generation must finish before use verification');
      await this.#verifyTaskBindings(state, task);
      const expected = this.#findArtifact(task, task.stage === 'video_render' ? 'video_file' : 'plan');
      if (specification?.task_id !== task.id) throw new Error('Use verification task id does not match');
      if (specification?.kind !== (task.stage === 'video_render' ? 'video' : 'plan')) throw new Error('Use verification kind does not match the task');
      const actual = await this.artifact(specification.artifact);
      this.#sameBinding(actual, expected, 'Use verification is bound to another artifact version');
      const report = await verifyArtifactUse(this.root, specification);
      if (report.status === 'use_verified'
        && String(report.human_confirmation?.verified_by || '').trim().toLowerCase() === String(task.claimant || '').trim().toLowerCase()) {
        throw new Error('Independent use reviewer must differ from the task claimant');
      }
      task.use_verification = report;
      task.completion_level = report.status;
      if (report.status !== 'use_verified') {
        state.history.push({ event: 'use_verification_incomplete', task_id: task.id, stage: task.stage, at: now() });
        return this.#publicTask(task);
      }
      task.completion_level = 'use_verified';
      task.use_verified_at = now();
      state.history.push({ event: 'use_verified', task_id: task.id, stage: task.stage, at: now() });
      await this.#advance(state, task, {});
      return this.#publicTask(task);
    });
  }

  async approve(kind, approval) {
    if (!['collection', 'revision', 'video'].includes(kind)) throw new Error('Approval kind must be collection, revision, or video');
    return this.#transaction(async state => {
      state.approvals ||= { collection: null, revision: null, video: null };
      state.branches ||= { video: { status: 'idle', requested_plan_sha256: null } };
      if (approval.workflow_id && approval.workflow_id !== state.workflow_id) throw new Error('Workflow id mismatch');
      if (approval.human_confirmed !== true) throw new Error('Explicit human confirmation is required');
      const plan = await this.artifact(required(approval.plan, 'Plan binding is required'), 'plan');
      this.#sameBinding(plan, state.artifacts.plan, 'Plan version does not match the current workflow');

      if (kind === 'video') {
        if (state.branches.video?.status !== 'storyboard_approval') throw new Error('Video branch is not waiting for storyboard approval');
        const storyboard = await this.artifact(required(approval.storyboard, 'Storyboard binding is required'), 'video_storyboard');
        const sourceMap = await this.artifact(required(approval.source_map, 'Video source-map binding is required'), 'video_source_map');
        this.#sameBinding(storyboard, state.artifacts.video_storyboard, 'Storyboard version does not match the current video branch');
        this.#sameBinding(sourceMap, state.artifacts.video_source_map, 'Video source-map version does not match the current video branch');
        state.approvals.video = {
          id: approval.approval_id || randomUUID(),
          plan_sha256: plan.sha256,
          storyboard_sha256: storyboard.sha256,
          source_map_sha256: sourceMap.sha256,
          approved_by: approval.approved_by || 'human',
          approved_at: now()
        };
        const task = await this.#enqueue(state, {
          request_id: `video-render-${state.cycle}-${Date.now()}`,
          workflow_id: state.workflow_id,
          stage: 'video_render',
          branch: 'video',
          inputs: [plan, storyboard, sourceMap],
          plan,
          user_decisions: [`Storyboard approved by ${state.approvals.video.approved_by} for plan ${plan.sha256}.`],
          context: 'Render only the approved storyboard. Preserve the source map, privacy decisions, and license manifest.'
        }, true);
        state.branches.video = { ...state.branches.video, status: 'rendering', task_id: task.id };
        state.history.push({ event: 'video_storyboard_approved', plan_sha256: plan.sha256, storyboard_sha256: storyboard.sha256, task_id: task.id, at: now() });
        return { approval: state.approvals.video, task: this.#publicTask(task) };
      }

      if (kind === 'collection') {
        if (state.current_stage !== 'collection_approval') throw new Error('Workflow is not waiting for collection approval');
        const quality = await this.#validateCollectionGate(state, approval, plan);
        state.approvals.collection = {
          id: approval.approval_id || randomUUID(),
          plan_sha256: plan.sha256,
          approved_by: approval.approved_by || 'human',
          quality,
          approved_at: now()
        };
        state.approvals.revision = null;
        const task = await this.#enqueue(state, {
          request_id: `literature-${state.cycle}-${plan.sha256.slice(0, 12)}`,
          workflow_id: state.workflow_id,
          stage: 'literature',
          inputs: state.supplemental_collection?.status === 'approval_pending' ? [plan, state.supplemental_collection.report] : [plan],
          plan,
          user_decisions: [`Collection approved by ${state.approvals.collection.approved_by} for plan ${plan.sha256}.`],
          context: state.supplemental_collection?.status === 'approval_pending'
            ? `Supplemental collection requested for these evidence gaps: ${state.supplemental_collection.gaps.join('; ')}. Compare with review report ${state.supplemental_collection.report.path}; preserve previous literature.`
            : ''
        }, true);
        if (state.supplemental_collection?.status === 'approval_pending') state.supplemental_collection = { ...state.supplemental_collection, status: 'collecting', task_id: task.id };
        state.current_stage = 'literature';
        state.history.push({ event: 'collection_approved', plan_sha256: plan.sha256, task_id: task.id, at: now() });
        return { approval: state.approvals.collection, task: this.#publicTask(task) };
      }

      if (state.current_stage !== 'revision_approval') throw new Error('Workflow is not waiting for revision approval');
      const declineAll = approval.decline_all === true;
      if (!Array.isArray(approval.approved_items)) throw new Error('Revision approval requires approved_items');
      if (declineAll && approval.approved_items.length > 0) throw new Error('decline_all cannot be combined with approved items');
      if (!declineAll && approval.approved_items.length === 0) throw new Error('Revision approval requires at least one approved item, or decline_all: true');
      const report = await this.artifact(required(approval.report, 'Review report binding is required'), 'review_report');
      this.#sameBinding(report, state.artifacts.review_report, 'Review report version does not match the current workflow');
      if (declineAll) {
        // Keep the current plan and open a new collection round for it.
        state.approvals.revision = {
          id: approval.approval_id || randomUUID(),
          plan_sha256: plan.sha256,
          report_sha256: report.sha256,
          approved_items: [],
          declined_all: true,
          approved_by: approval.approved_by || 'human',
          approved_at: now()
        };
        state.approvals.collection = null;
        state.cycle += 1;
        state.current_stage = 'collection_approval';
        state.history.push({ event: 'revision_declined', report_sha256: report.sha256, at: now() });
        return { approval: state.approvals.revision, task: null };
      }
      state.approvals.revision = {
        id: approval.approval_id || randomUUID(),
        plan_sha256: plan.sha256,
        report_sha256: report.sha256,
        approved_items: [...new Set(approval.approved_items.map(String))],
        approved_by: approval.approved_by || 'human',
        approved_at: now()
      };
      const task = await this.#enqueue(state, {
        request_id: `revise-${state.cycle}-${report.sha256.slice(0, 12)}`,
        workflow_id: state.workflow_id,
        stage: 'revise',
        inputs: [plan, report],
        plan,
        report,
        user_decisions: [`Revision approved by ${state.approvals.revision.approved_by}; items: ${state.approvals.revision.approved_items.join(', ')}.`],
        context: `Apply only approved review items: ${state.approvals.revision.approved_items.join(', ')}`
      }, true);
      state.current_stage = 'revise';
      state.history.push({ event: 'revision_approved', report_sha256: report.sha256, task_id: task.id, at: now() });
      return { approval: state.approvals.revision, task: this.#publicTask(task) };
    });
  }

  async collectMore(request = {}) {
    return this.#transaction(async state => {
      if (state.current_stage !== 'revision_approval') throw new Error('Supplemental collection requires a completed evidence review');
      if (request.human_confirmed !== true) throw new Error('Explicit human confirmation is required');
      const gaps = [...new Set((request.gaps || []).map(value => String(value).trim()).filter(Boolean))];
      if (!gaps.length) throw new Error('Name at least one evidence gap or search question');
      const plan = await this.artifact(required(request.plan, 'Plan binding is required'), 'plan');
      const report = await this.artifact(required(request.report, 'Review report binding is required'), 'review_report');
      this.#sameBinding(plan, state.artifacts.plan, 'Plan version does not match the current workflow');
      this.#sameBinding(report, state.artifacts.review_report, 'Review report version does not match the current workflow');
      state.cycle += 1;
      state.approvals.collection = null;
      state.approvals.revision = null;
      state.supplemental_collection = { plan_sha256: plan.sha256, report, gaps, requested_by: request.requested_by || 'human', requested_at: now(), status: 'approval_pending' };
      state.current_stage = 'collection_approval';
      state.history.push({ event: 'supplemental_collection_requested', plan_sha256: plan.sha256, report_sha256: report.sha256, gaps, at: now() });
      return state.supplemental_collection;
    });
  }

  async finalize(request = {}) {
    return this.#transaction(async state => {
      if (state.current_stage !== 'collection_approval' || !state.revision_lineage) throw new Error('Finalization requires a reviewed and revised plan awaiting a new collection decision');
      if (state.supplemental_collection) throw new Error('Finish the requested supplemental collection, review, and revision before finalization');
      if (request.human_confirmed !== true || !String(request.finalized_by || '').trim()) throw new Error('Explicit researcher confirmation and identity are required');
      const plan = await this.artifact(required(request.plan, 'Plan binding is required'), 'plan');
      this.#sameBinding(plan, state.artifacts.plan, 'Plan version does not match the current workflow');
      if (state.revision_lineage.plan_sha256 !== plan.sha256) throw new Error('Current plan is not the reviewed revision');
      const report = await this.artifact(required(request.report, 'Review report binding is required'), 'review_report');
      this.#sameBinding(report, state.revision_lineage.report, 'Review report changed since the approved revision');
      const revisionTask = state.tasks.find(task => task.id === state.revision_lineage.task_id);
      if (revisionTask?.completion_level !== 'use_verified') throw new Error('Revised plan requires independent use verification');
      if (state.tasks.some(task => task.branch !== 'video' && ['queued', 'running', 'partial', 'failed'].includes(task.status) && task.cycle === state.cycle)) {
        throw new Error('Finish or resolve current-cycle tasks before finalization');
      }
      const project = state.project_dir ? path.resolve(this.root, state.project_dir) : path.dirname(path.resolve(this.root, plan.path));
      const quality = await this.artifact(required(request.quality_report, 'Current quality report binding is required'), 'quality_report');
      const expectedQuality = await this.artifact(path.relative(this.root, path.join(project, 'quality-report.json')), 'quality_report');
      this.#sameBinding(quality, expectedQuality, 'Quality report is not current');
      const qualityData = await readJson(path.resolve(this.root, quality.path));
      await new SchemaRegistry(this.root).assert('quality-report', qualityData);
      if (qualityData.plan.sha256 !== plan.sha256 || qualityData.automated.hard_checks_passed !== true) throw new Error('Current plan quality checks must pass');
      for (const id of ['evidence_status', 'method_alignment', 'citation_reference']) {
        if (!qualityData.automated.checks.some(check => check.id === id && check.passed === true)) throw new Error(`Finalization requires passing ${id} check`);
      }
      const researchChecks = request.research_checks || [];
      for (const name of ['evidence_reviewed', 'method_reviewed', 'citations_reviewed']) {
        const check = researchChecks.find(item => item.name === name);
        if (check?.result !== 'passed' || !String(check.method || '').trim() || !String(check.evidence || '').trim()) {
          throw new Error(`Researcher must record a passed ${name} check with method and observation`);
        }
      }
      const manifest = await this.artifact(required(request.document_manifest, 'Document manifest binding is required'), 'document_manifest');
      const expectedManifest = await this.artifact(path.relative(this.root, path.join(project, 'document-manifest.json')), 'document_manifest');
      this.#sameBinding(manifest, expectedManifest, 'Document manifest is not current');
      const documentData = await readJson(path.resolve(this.root, manifest.path));
      await new SchemaRegistry(this.root).assert('document-manifest', documentData);
      if (documentData.markdown.path !== plan.path || documentData.markdown.sha256 !== plan.sha256
        || documentData.quality_report?.sha256 !== quality.sha256) throw new Error('Document manifest is not bound to the current plan and quality report');
      const kind = request.document_kind;
      if (!['docx', 'hwpx'].includes(kind) || !documentData[kind]) throw new Error('Choose an exported DOCX or HWPX for final document review');
      const document = await this.artifact(documentData[kind], kind);
      const checkedAt = now();
      const documentVerification = await verifyArtifactUse(this.root, {
        task_id: revisionTask.id, kind, artifact: document, manifest_path: manifest.path,
        human_confirmation: { confirmed: true, verified_by: request.finalized_by, checked_at: checkedAt },
        human_checks: request.document_checks || []
      });
      if (documentVerification.status !== 'use_verified') throw new Error('Open the exported document and record passed layout and content checks before finalization');
      const limitations = String(request.limitations || '').trim();
      if (!limitations) throw new Error('Record remaining limitations, or explicitly state none after review');
      state.finalization = {
        plan, report, quality_report: quality, document_manifest: manifest, document,
        document_verification: documentVerification, revision_task_id: revisionTask.id,
        research_checks: researchChecks,
        approved_items: state.revision_lineage.approved_items,
        limitations, finalized_by: request.finalized_by.trim(), finalized_at: checkedAt
      };
      state.current_stage = 'finalized';
      state.history.push({ event: 'finalized', plan_sha256: plan.sha256, report_sha256: report.sha256, at: checkedAt });
      return state.finalization;
    });
  }

  async reopen(request = {}) {
    return this.#transaction(async state => {
      if (state.current_stage !== 'finalized' || !state.finalization) throw new Error('Only a finalized workflow can be reopened');
      if (request.human_confirmed !== true || !String(request.reason || '').trim()) throw new Error('Explicit human confirmation and a reason are required');
      const previous = state.finalization;
      const currentPlan = await this.artifact({ path: previous.plan.path, kind: 'plan' });
      state.previous_finalizations ||= [];
      state.previous_finalizations.push(previous);
      state.finalization = null;
      state.approvals.collection = null;
      state.approvals.revision = null;
      state.cycle += 1;
      let task = null;
      if (currentPlan.sha256 === previous.plan.sha256) state.current_stage = 'collection_approval';
      else {
        state.revision_lineage = null;
        task = await this.#enqueue(state, {
          request_id: `reopen-plan-${state.cycle}`, workflow_id: state.workflow_id,
          stage: 'plan', inputs: [currentPlan],
          context: `Reassess the changed former final plan. Earlier approvals and finalization cannot be reused. Reason: ${request.reason}`
        }, true);
      }
      state.history.push({ event: 'reopened', reason: request.reason, changed_plan: currentPlan.sha256 !== previous.plan.sha256, at: now() });
      return { current_stage: state.current_stage, task: task && this.#publicTask(task) };
    });
  }

  async requestVideo(request = {}) {
    return this.#transaction(async state => {
      if (request.human_requested !== true) throw new Error('Video generation begins only after an explicit human request');
      if (!state.artifacts.plan) throw new Error('A completed research plan is required before requesting a video');
      state.approvals ||= { collection: null, revision: null, video: null };
      state.branches ||= { video: { status: 'idle', requested_plan_sha256: null } };
      const plan = await this.artifact(request.plan || state.artifacts.plan, 'plan');
      this.#sameBinding(plan, state.artifacts.plan, 'Video request must use the current plan version');
      const active = state.tasks.find(task => task.branch === 'video' && ['queued', 'running'].includes(task.status));
      if (active) return this.#publicTask(active);
      state.approvals.video = null;
      const task = await this.#enqueue(state, {
        request_id: request.request_id || `video-storyboard-${state.cycle}-${Date.now()}`,
        workflow_id: state.workflow_id,
        stage: 'video_storyboard',
        branch: 'video',
        inputs: [plan],
        plan,
        user_decisions: [`User requested a research-flow video for plan ${plan.sha256}.`],
        context: JSON.stringify({
          audience: request.audience || 'research audience',
          duration_seconds: request.duration_seconds || 90,
          aspect_ratio: request.aspect_ratio || '16:9',
          language: request.language || 'ko',
          notes: request.notes || ''
        })
      }, true);
      state.branches.video = { status: 'storyboarding', requested_plan_sha256: plan.sha256, task_id: task.id };
      state.history.push({ event: 'video_requested', plan_sha256: plan.sha256, task_id: task.id, at: now() });
      return this.#publicTask(task);
    });
  }

  async retry(taskId, options = {}) {
    return this.#transaction(async state => {
      const task = state.tasks.find(item => item.id === taskId);
      const queuedRebind = options.rebind && task?.status === 'queued';
      if (!task || !(['partial', 'failed'].includes(task.status) || queuedRebind)) {
        throw new Error('Only partial or failed tasks can be retried (queued tasks only with --rebind)');
      }
      this.#expireLeases(state, task.role);
      if (!queuedRebind) this.#assertRoleFree(state, task);
      task.attempts ||= [];
      const attempt = { status: task.status, reason: task.reason, artifacts: task.artifacts || [], ended_at: task.completed_at };
      if (options.rebind) {
        // Approval-bound files must go back through their gate; only free inputs are re-hashed.
        for (const [binding, label] of [[task.plan, 'plan'], [task.report, 'review report']]) {
          if (!binding) continue;
          await this.artifact(binding).catch(() => {
            throw new Error(`The approved ${label} changed; restore ${binding.path} or request rework instead of rebinding`);
          });
        }
        const bound = new Set([task.plan, task.report].filter(Boolean).map(item => `${item.path}|${item.sha256}`));
        const inputs = [];
        for (const input of task.inputs) {
          inputs.push(bound.has(`${input.path}|${input.sha256}`) ? input : await this.artifact({ kind: input.kind, path: input.path }));
        }
        attempt.inputs = task.inputs;
        task.inputs = inputs;
        task.artifacts = [];
      }
      task.attempts.push(attempt);
      task.status = 'queued';
      task.reason = null;
      task.binding_warning = null;
      task.claimant = null;
      task.token = null;
      task.claimed_at = null;
      task.lease_expires_at = null;
      task.completed_at = null;
      if (task.branch === 'video') state.branches.video = { ...state.branches.video, status: task.stage, task_id: task.id };
      else state.current_stage = task.stage;
      state.history.push({ event: 'retried', task_id: task.id, stage: task.stage, rebind: Boolean(options.rebind), at: now() });
      return this.#publicTask(task);
    });
  }

  async release(taskId, reason = '') {
    return this.#transaction(async state => {
      const task = state.tasks.find(item => item.id === taskId);
      if (!task || task.status !== 'running') throw new Error('Only a running task can be released');
      this.#failTask(state, task, String(reason).trim() || 'Released by the user before completion', 'released');
      return this.#publicTask(task);
    });
  }

  async rework(taskId, request = {}) {
    const feedback = String(request.feedback || '').trim();
    if (!feedback) throw new Error('Rework requires feedback describing what must change');
    return this.#transaction(async state => {
      const task = state.tasks.find(item => item.id === taskId);
      if (!task || task.status !== 'completed') throw new Error('Only a completed task can be sent back for rework');
      if (task.superseded_by) throw new Error(`Task was already sent back for rework: ${task.superseded_by}`);
      const requestedBy = request.requested_by || 'human';
      let next;
      if (['plan', 'revise'].includes(task.stage)) {
        const plan = this.#findArtifact(task, 'plan');
        const awaitingUse = state.current_stage === `${task.stage}_use_verification` && task.completion_level !== 'use_verified';
        const awaitingCollection = state.current_stage === 'collection_approval' && state.artifacts.plan?.sha256 === plan.sha256;
        if (!awaitingUse && !awaitingCollection) throw new Error('Plan rework is possible only while its use verification or collection approval is pending');
        // A rework is a fresh plan task, so it does not depend on the earlier revision approval.
        next = { stage: 'plan', inputs: [...task.inputs, plan] };
        state.approvals.collection = null;
        state.approvals.revision = null;
      } else if (task.stage === 'review') {
        const report = this.#findArtifact(task, 'review_report');
        if (state.current_stage !== 'revision_approval' || state.artifacts.review_report?.sha256 !== report.sha256) {
          throw new Error('Review rework is possible only while its revision approval is pending');
        }
        next = { stage: 'review', inputs: task.inputs, plan: task.plan };
        state.approvals.revision = null;
      } else if (task.stage === 'video_storyboard') {
        if (state.branches.video?.status !== 'storyboard_approval' || state.branches.video.task_id !== task.id) {
          throw new Error('Storyboard rework is possible only while its approval is pending');
        }
        next = { stage: 'video_storyboard', branch: 'video', inputs: task.inputs, plan: task.plan };
        state.approvals.video = null;
      } else if (task.stage === 'video_render') {
        if (state.branches.video?.status !== 'use_verification' || state.branches.video.task_id !== task.id) {
          throw new Error('Render rework is possible only while its use verification is pending');
        }
        next = { stage: 'video_render', branch: 'video', inputs: task.inputs, plan: task.plan };
      } else throw new Error(`Rework is not supported for stage: ${task.stage}`);
      const round = state.tasks.filter(item => item.rework_of === task.id).length + 1;
      const created = await this.#enqueue(state, {
        ...next,
        request_id: `${next.stage}-rework-${task.id}-${round}`,
        workflow_id: state.workflow_id,
        user_decisions: [...(task.user_decisions || []), `Rework requested by ${requestedBy}: ${feedback}`],
        unresolved_items: task.unresolved_items || [],
        context: [task.context, `Rework of task ${task.id} requested by ${requestedBy}: ${feedback}`].filter(Boolean).join('\n\n')
      }, true);
      created.rework_of = task.id;
      task.superseded_by = created.id;
      if (created.branch === 'video') {
        state.branches.video = { ...state.branches.video, status: next.stage === 'video_render' ? 'rendering' : 'storyboarding', task_id: created.id };
      }
      state.history.push({ event: 'rework_requested', task_id: task.id, new_task_id: created.id, stage: created.stage, at: now() });
      return this.#publicTask(created);
    });
  }

  // Literature commands write outside task receipts, so they check the collection gate themselves.
  async collectionGate() {
    const state = await this.#load();
    const task = state.tasks.find(item => item.stage === 'literature' && ['queued', 'running'].includes(item.status));
    if (!task) {
      throw new Error(`Literature search and ingest need an approved, open literature task (current stage: ${state.current_stage}). Approve collection or retry the literature task first.`);
    }
    const plan = await this.artifact(task.plan, 'plan');
    for (const input of task.inputs) await this.artifact(input);
    const approval = state.approvals.collection;
    if (!approval || approval.plan_sha256 !== plan.sha256) throw new Error('Collection approval is missing or bound to another plan hash');
    return { task_id: task.id, plan_sha256: plan.sha256, gaps: state.supplemental_collection?.task_id === task.id ? state.supplemental_collection.gaps : [] };
  }

  async status() {
    const state = await this.#load();
    let finalization = state.finalization || null;
    if (finalization) {
      try {
        for (const binding of [finalization.plan, finalization.report, finalization.quality_report, finalization.document_manifest, finalization.document]) await this.artifact(binding);
        finalization = { ...finalization, valid: true };
      } catch (error) { finalization = { ...finalization, valid: false, stale_reason: error.message }; }
    }
    return {
      schema_version: state.schema_version,
      workflow_id: state.workflow_id,
      profile: state.profile,
      current_stage: state.current_stage === 'finalized' && finalization?.valid === false ? 'finalization_stale' : state.current_stage,
      cycle: state.cycle,
      tasks: state.tasks.map(task => ({ ...this.#publicTask(task), ...(leaseExpired(task) ? { lease_expired: true } : {}) })),
      artifacts: state.artifacts,
      approvals: state.approvals,
      can_finalize: state.current_stage === 'collection_approval' && Boolean(state.revision_lineage) && !state.supplemental_collection,
      supplemental_collection: state.supplemental_collection || null,
      finalization,
      branches: state.branches || { video: { status: 'idle', requested_plan_sha256: null } },
      project_dir: state.project_dir || null,
      errors: state.errors,
      created_at: state.created_at,
      updated_at: state.updated_at
    };
  }

  async completionTemplate(taskId) {
    const state = await this.#load();
    const task = state.tasks.find(item => item.id === taskId);
    if (!task || task.status !== 'running') throw new Error('Only a running task can be finished');
    const profile = await this.profile(state.profile);
    return {
      task_id: task.id,
      token: task.token,
      stage: task.stage,
      required_kinds: profile.required_artifacts?.[task.stage] || [],
      existing_artifacts: task.artifacts || []
    };
  }

  async #enqueue(state, request, internal) {
    required(state, 'Run init before enqueue');
    if (request.workflow_id && request.workflow_id !== state.workflow_id) throw new Error('Workflow id mismatch');
    const stage = request.stage;
    if (!ROLE_FOR_STAGE[stage]) throw new Error(`Unknown stage: ${stage}`);
    if (!internal && !['study', 'plan'].includes(stage)) throw new Error('Later stages are created by approvals and completed tasks');
    const inputs = [];
    for (const item of request.inputs || []) inputs.push(await this.artifact(item));
    if (inputs.length === 0) throw new Error('At least one input artifact is required');
    const plan = request.plan ? await this.artifact(request.plan, 'plan') : null;
    const report = request.report ? await this.artifact(request.report, 'review_report') : null;
    const requestId = required(request.request_id, 'request_id is required');
    const userDecisions = request.user_decisions || [];
    const unresolvedItems = request.unresolved_items || [];
    const key = digest(JSON.stringify({ workflow_id: state.workflow_id, requestId, stage, inputs, plan, report, context: request.context || '', userDecisions, unresolvedItems, cycle: state.cycle }));
    const sameId = state.tasks.find(task => task.request_id === requestId);
    if (sameId) {
      const legacyKey = digest(JSON.stringify({ workflow_id: state.workflow_id, requestId, stage, inputs, plan, report, cycle: state.cycle }));
      const legacyMatch = sameId.key === legacyKey && sameId.context === (request.context || '')
        && userDecisions.length === 0 && unresolvedItems.length === 0;
      if (sameId.key !== key && !legacyMatch) throw new Error(`request_id was already used with different content: ${requestId}`);
      return sameId;
    }
    const duplicate = state.tasks.find(task => task.key === key);
    if (duplicate) return duplicate;
    if (!internal && !['initialized', 'study_completed'].includes(state.current_stage)) throw new Error(`Cannot manually enqueue ${stage} while workflow is at ${state.current_stage}`);
    const task = {
      id: randomUUID(),
      key,
      request_id: requestId,
      workflow_id: state.workflow_id,
      cycle: state.cycle,
      stage,
      branch: request.branch || 'main',
      role: ROLE_FOR_STAGE[stage],
      status: 'queued',
      inputs,
      plan,
      report,
      context: request.context || '',
      user_decisions: userDecisions,
      unresolved_items: unresolvedItems,
      artifacts: [],
      attempts: [],
      created_at: now()
    };
    state.tasks.push(task);
    if (task.branch !== 'video') state.current_stage = stage;
    state.history.push({ event: 'enqueued', task_id: task.id, stage, role: task.role, at: now() });
    return task;
  }

  async #advance(state, task, receipt) {
    if (task.stage === 'video_storyboard') {
      const storyboard = this.#findArtifact(task, 'video_storyboard');
      const sourceMap = this.#findArtifact(task, 'video_source_map');
      state.artifacts.video_storyboard = storyboard;
      state.artifacts.video_source_map = sourceMap;
      state.approvals.video = null;
      state.branches.video = { status: 'storyboard_approval', requested_plan_sha256: task.plan.sha256, task_id: task.id };
      return;
    }
    if (task.stage === 'video_render') {
      state.artifacts.video_file = this.#findArtifact(task, 'video_file');
      state.artifacts.video_manifest = this.#findArtifact(task, 'video_manifest');
      state.branches.video = { status: 'completed', requested_plan_sha256: task.plan.sha256, task_id: task.id, completed_at: now() };
      return;
    }
    if (task.stage === 'study') {
      state.artifacts.study = task.artifacts;
      if (receipt.handoff_state === 'ready') {
        await this.#enqueue(state, {
          request_id: `plan-${state.cycle}`,
          workflow_id: state.workflow_id,
          stage: 'plan',
          inputs: task.artifacts,
          context: 'Evaluate the research connection, then draft a plan if adopted.'
        }, true);
      } else {
        state.current_stage = 'study_completed';
      }
      return;
    }
    if (task.stage === 'plan' || task.stage === 'revise') {
      const plan = this.#findArtifact(task, 'plan');
      const priorVideoPlan = state.branches?.video?.requested_plan_sha256;
      state.revision_lineage = task.stage === 'revise' ? {
        plan_sha256: plan.sha256, source_plan_sha256: task.plan.sha256,
        report: task.report, approved_items: [...(state.approvals.revision?.approved_items || [])], task_id: task.id
      } : null;
      state.artifacts.plan = plan;
      state.artifacts.plan_support = task.artifacts.filter(item => item.path !== plan.path);
      state.approvals.collection = null;
      state.approvals.revision = null;
      state.supplemental_collection = null;
      state.finalization = null;
      if (priorVideoPlan && priorVideoPlan !== plan.sha256) {
        state.approvals.video = null;
        state.branches.video = { status: 'stale_plan', requested_plan_sha256: priorVideoPlan, current_plan_sha256: plan.sha256 };
      }
      if (task.stage === 'revise') state.cycle += 1;
      state.current_stage = 'collection_approval';
      return;
    }
    if (task.stage === 'literature') {
      state.artifacts.literature = this.#mergeArtifacts(state.artifacts.literature || [], task.artifacts);
      if (state.supplemental_collection?.task_id === task.id) state.supplemental_collection.status = 'reviewing';
      await this.#enqueue(state, {
        request_id: `review-${state.cycle}-${task.id}`,
        workflow_id: state.workflow_id,
        stage: 'review',
        inputs: state.artifacts.literature,
        plan: state.artifacts.plan,
        context: `Compare all collected and parsed evidence with the current plan; report exact support, gaps, and conflicts.${state.supplemental_collection?.status === 'reviewing' ? ` Recheck requested gaps: ${state.supplemental_collection.gaps.join('; ')}.` : ''}`
      }, true);
      return;
    }
    if (task.stage === 'review') {
      state.artifacts.review_report = this.#findArtifact(task, 'review_report');
      if (state.supplemental_collection?.status === 'reviewing') state.supplemental_collection.status = 'reviewed';
      state.approvals.revision = null;
      state.current_stage = 'revision_approval';
    }
  }

  async #validateCollectionGate(state, approval, plan) {
    const profile = await this.profile(state.profile);
    const gate = profile.collection_gate || {};
    const needsReport = gate.minimum_score_exclusive != null || Boolean(gate.require_hard_checks);
    if (!needsReport && gate.minimum_rubric_total == null) return null;
    const quality = { score: null, hard_checks_passed: null, rubric_total: null, report: null };
    if (needsReport) {
      // Automated scores come from the hash-bound report written by `rok validate`, never from the approver.
      const project = state.project_dir ? path.resolve(this.root, state.project_dir) : path.dirname(path.resolve(this.root, plan.path));
      const reportArtifact = await this.artifact(path.relative(this.root, path.join(project, 'quality-report.json')), 'quality_report')
        .catch(() => { throw new Error('Collection gate needs quality-report.json; run rok validate for the current plan'); });
      const report = await readJson(path.resolve(this.root, reportArtifact.path));
      await new SchemaRegistry(this.root).assert('quality-report', report);
      if (report.plan.sha256 !== plan.sha256) throw new Error('quality-report.json is bound to another plan hash; run rok validate again');
      Object.assign(quality, { score: report.automated.score, hard_checks_passed: report.automated.hard_checks_passed, report: reportArtifact });
    }
    if (gate.minimum_score_exclusive != null && !(Number(quality.score) > gate.minimum_score_exclusive)) {
      throw new Error(`Quality score must be greater than ${gate.minimum_score_exclusive}`);
    }
    if (gate.minimum_rubric_total != null) {
      // The rubric total is a human judgement recorded with the approval itself.
      quality.rubric_total = Number(approval.quality?.rubric_total);
      if (!(quality.rubric_total >= gate.minimum_rubric_total)) throw new Error(`Rubric total must be at least ${gate.minimum_rubric_total}`);
    }
    if (gate.require_hard_checks && quality.hard_checks_passed !== true) throw new Error('Hard checks must pass');
    return quality;
  }

  async #requireArtifacts(state, task) {
    const profile = await this.profile(state.profile);
    for (const kind of profile.required_artifacts?.[task.stage] || []) this.#findArtifact(task, kind);
  }

  async #validateVideoManifest(task) {
    const video = this.#findArtifact(task, 'video_file');
    const manifestArtifact = this.#findArtifact(task, 'video_manifest');
    const manifest = await readJson(path.resolve(this.root, manifestArtifact.path));
    await new SchemaRegistry(this.root).assert('video-manifest', manifest);
    const storyboard = task.inputs.find(item => item.kind === 'video_storyboard');
    const sourceMap = task.inputs.find(item => item.kind === 'video_source_map');
    if (manifest.plan_sha256 !== task.plan.sha256 || manifest.storyboard_sha256 !== storyboard?.sha256 || manifest.source_map_sha256 !== sourceMap?.sha256) {
      throw new Error('Video manifest is bound to different plan, storyboard, or source-map hashes');
    }
    if (manifest.video.path !== video.path || manifest.video.sha256 !== video.sha256) throw new Error('Video manifest file binding does not match the rendered video');
    if (!Object.values(manifest.technical_checks).every(Boolean)) throw new Error('Video technical and licensing checks must all pass');
  }

  #assertRoleFree(state, task) {
    const busy = state.tasks.find(item => item.id !== task.id && item.role === task.role && item.status === 'running');
    if (busy) throw new Error(`Role is busy: ${task.role} (task ${busy.id}; finish it or run rok release ${busy.id})`);
  }

  #expireLeases(state, role) {
    for (const task of state.tasks) {
      if (task.role === role && leaseExpired(task)) this.#failTask(state, task, `Lease expired at ${task.lease_expires_at} without a receipt`, 'lease_expired');
    }
  }

  #failTask(state, task, reason, event) {
    task.status = 'failed';
    task.reason = reason;
    task.token = null;
    task.completed_at = now();
    if (task.branch === 'video') state.branches.video = { ...state.branches.video, status: `${task.stage}_failed`, task_id: task.id };
    else state.current_stage = `${task.stage}_failed`;
    state.errors.push({ task_id: task.id, stage: task.stage, status: 'failed', reason, at: now() });
    state.history.push({ event, task_id: task.id, stage: task.stage, at: now() });
  }

  #findArtifact(task, kind) {
    const artifact = (task.artifacts || []).find(item => item.kind === kind);
    if (!artifact) throw new Error(`${task.stage} completion requires artifact kind: ${kind}`);
    return artifact;
  }

  #mergeArtifacts(current, incoming) {
    const merged = [...current];
    for (const item of incoming) {
      const index = merged.findIndex(existing => existing.kind === item.kind && existing.path === item.path);
      if (index >= 0) merged[index] = item;
      else merged.push(item);
    }
    return merged;
  }

  #sameBinding(actual, expected, message) {
    if (!expected || actual.path !== expected.path || actual.sha256 !== expected.sha256) throw new Error(message);
  }

  async #verifyTaskBindings(state, task) {
    for (const input of task.inputs) await this.artifact(input);
    for (const output of task.artifacts || []) await this.artifact(output);
    if (task.plan) {
      const plan = await this.artifact(task.plan, 'plan');
      if (task.stage === 'literature') {
        const approval = state.approvals.collection;
        if (!approval || approval.plan_sha256 !== plan.sha256) throw new Error('Collection approval is missing or bound to another plan hash');
      }
      if (task.stage === 'revise') {
        const approval = state.approvals.revision;
        if (!approval || approval.plan_sha256 !== plan.sha256) throw new Error('Revision approval is missing or bound to another plan hash');
        const report = await this.artifact(task.report, 'review_report');
        if (approval.report_sha256 !== report.sha256) throw new Error('Revision approval is bound to another review report hash');
      }
      if (task.stage === 'video_render') {
        const approval = state.approvals.video;
        if (!approval || approval.plan_sha256 !== plan.sha256) throw new Error('Video approval is missing or bound to another plan hash');
        const storyboard = await this.artifact(task.inputs.find(item => item.kind === 'video_storyboard'), 'video_storyboard');
        const sourceMap = await this.artifact(task.inputs.find(item => item.kind === 'video_source_map'), 'video_source_map');
        if (approval.storyboard_sha256 !== storyboard.sha256 || approval.source_map_sha256 !== sourceMap.sha256) {
          throw new Error('Video approval is bound to another storyboard or source map hash');
        }
      }
    }
  }

  #publicTask(task) {
    const { token, key, ...safe } = task;
    return safe;
  }

  async #load() {
    if (!await exists(this.statePath)) throw new Error('Workflow is not initialized');
    return readJson(this.statePath);
  }

  async #transaction(fn, options = {}) {
    await fs.mkdir(this.workDir, { recursive: true });
    const lock = await this.#acquireLock();
    try {
      const state = await exists(this.statePath) ? await readJson(this.statePath) : null;
      if (!state && !options.allowMissing) throw new Error('Workflow is not initialized');
      if (state) {
        state.approvals ||= { collection: null, revision: null, video: null };
        if (!Object.hasOwn(state.approvals, 'video')) state.approvals.video = null;
        state.branches ||= { video: { status: 'idle', requested_plan_sha256: null } };
        for (const task of state.tasks || []) task.branch ||= 'main';
      }
      const result = await fn(state);
      const next = state || result;
      next.updated_at = now();
      const temp = this.statePath + '.' + randomUUID() + '.tmp';
      await fs.writeFile(temp, JSON.stringify(next, null, 2) + '\n', 'utf8');
      if (await exists(this.statePath)) {
        const backupDir = path.join(this.workDir, 'backups');
        await fs.mkdir(backupDir, { recursive: true });
        await fs.copyFile(this.statePath, path.join(backupDir, `state.${Date.now()}.${randomUUID()}.json`));
        try {
          await fs.rename(temp, this.statePath);
        } catch (error) {
          if (!['EPERM', 'EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
          await fs.copyFile(temp, this.statePath);
          await fs.unlink(temp).catch(() => {});
        }
      } else {
        try {
          await fs.rename(temp, this.statePath);
        } catch (error) {
          if (!['EPERM', 'EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
          await fs.copyFile(temp, this.statePath);
          await fs.unlink(temp).catch(() => {});
        }
      }
      return result;
    } finally {
      await lock.close();
      await fs.unlink(this.lockPath).catch(() => {});
    }
  }

  async #acquireLock() {
    const deadline = Date.now() + LOCK_WAIT_MS;
    for (;;) {
      try {
        const handle = await fs.open(this.lockPath, 'wx');
        await handle.writeFile(JSON.stringify({ pid: process.pid, host: os.hostname(), at: now() }));
        return handle;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      if (await this.#removeStaleLock()) continue;
      if (Date.now() >= deadline) {
        throw new Error(`Workflow state is locked by another rok command. If none is running, delete ${slash(path.relative(this.root, this.lockPath))}.`);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  async #removeStaleLock() {
    let stat;
    try {
      stat = await fs.stat(this.lockPath);
    } catch (error) {
      if (error.code === 'ENOENT') return true;
      throw error;
    }
    let owner = null;
    try { owner = JSON.parse(await fs.readFile(this.lockPath, 'utf8')); } catch { /* the owner may still be writing it */ }
    const deadOwner = owner?.host === os.hostname() && Number.isInteger(owner.pid) && owner.pid !== process.pid && !processAlive(owner.pid);
    if (!deadOwner && Date.now() - stat.mtimeMs < STALE_LOCK_MS) return false;
    await fs.unlink(this.lockPath).catch(() => {});
    return true;
  }
}
