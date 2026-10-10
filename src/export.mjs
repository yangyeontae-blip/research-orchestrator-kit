import * as fs from 'node:fs/promises';
import path from 'node:path';
import {
  AlignmentType, Document, HeadingLevel, LevelFormat, Packer, Paragraph, Table, TableCell, TableRow,
  TextRun, WidthType
} from 'docx';
import { SchemaRegistry } from './schemas.mjs';
import { exists, isoNow, readJson, sha256File, slash, writeJson } from './utils.mjs';
import { KORDOC_VERSION, markdownToHwpx, parseKoreanOfficeFile } from './kordoc.mjs';

function parseMarkdown(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] }); index += 1; continue; }
    if (/^\s*[-*]\s+/.test(line)) { blocks.push({ type: 'bullet', text: line.replace(/^\s*[-*]\s+/, '') }); index += 1; continue; }
    if (/^\s*\d+\.\s+/.test(line)) { blocks.push({ type: 'number', text: line.replace(/^\s*\d+\.\s+/, '') }); index += 1; continue; }
    if (/^\|.*\|\s*$/.test(line) && /^\|?\s*:?-+/.test(lines[index + 1] || '')) {
      const rows = [];
      const cells = value => value.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      rows.push(cells(line));
      index += 2;
      while (/^\|.*\|\s*$/.test(lines[index] || '')) { rows.push(cells(lines[index])); index += 1; }
      blocks.push({ type: 'table', rows });
      continue;
    }
    if (!line.trim()) { index += 1; continue; }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,6})\s+/.test(lines[index]) && !/^\s*(?:[-*]|\d+\.)\s+/.test(lines[index]) && !/^\|.*\|\s*$/.test(lines[index])) {
      paragraph.push(lines[index].trim()); index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }
  return blocks;
}

const inlineRuns = text => {
  const runs = [];
  for (const part of String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)) {
    if (part.startsWith('**')) runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
    else if (part.startsWith('`')) runs.push(new TextRun({ text: part.slice(1, -1), font: 'Consolas' }));
    else runs.push(new TextRun(part));
  }
  return runs;
};

function docxStyles(profile) {
  const base = profile === 'jqi' ? { font: 'ShinMyeongJo', size: 21 } : { font: 'Arial', size: 24 };
  return {
    default: { document: { run: base, paragraph: { spacing: { line: profile === 'jqi' ? 408 : 480 } } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { ...base, size: profile === 'jqi' ? 36 : 28, bold: true }, paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 360 } } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', run: { ...base, size: profile === 'jqi' ? 30 : 28, bold: true }, paragraph: { spacing: { before: 360, after: 180 } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', run: { ...base, size: 24, bold: true }, paragraph: { spacing: { before: 240, after: 120 } } }
    ]
  };
}

async function baseExportContext(root, projectDir, planPath) {
  const project = path.resolve(root, projectDir);
  const brief = await readJson(path.join(project, 'research-brief.json'));
  const absolutePlan = path.resolve(root, planPath);
  const markdown = await fs.readFile(absolutePlan, 'utf8');
  return { project, brief, absolutePlan, markdown };
}

async function writeDocumentManifest(root, context, binding, options = {}) {
  const { project, brief, absolutePlan } = context;
  const manifestPath = path.join(project, 'document-manifest.json');
  const previous = await exists(manifestPath) ? await readJson(manifestPath) : {};
  const markdownBinding = { path: slash(path.relative(root, absolutePlan)), sha256: await sha256File(absolutePlan) };
  const qualityPath = path.join(project, 'quality-report.json');
  const quality = await exists(qualityPath) ? { path: slash(path.relative(root, qualityPath)), sha256: await sha256File(qualityPath) } : null;
  const manifest = {
    schema_version: 1,
    project_id: brief.project_id,
    profile: brief.profile,
    markdown: markdownBinding,
    ...(previous.markdown?.sha256 === markdownBinding.sha256 && previous.docx ? { docx: previous.docx } : {}),
    ...(previous.markdown?.sha256 === markdownBinding.sha256 && previous.hwpx ? { hwpx: previous.hwpx } : {}),
    ...binding,
    quality_report: quality,
    generated_at: isoNow(),
    visual_verification: options.visualVerification || 'not_completed'
  };
  await new SchemaRegistry(root).assert('document-manifest', manifest);
  await writeJson(manifestPath, manifest);
  return { manifestPath, manifest };
}

export async function exportPlanDocx(root, projectDir, planPath, options = {}) {
  const context = await baseExportContext(root, projectDir, planPath);
  const { project, brief, absolutePlan, markdown } = context;
  const blocks = parseMarkdown(markdown);
  const children = [];
  for (const block of blocks) {
    if (block.type === 'heading') {
      children.push(new Paragraph({
        text: block.text,
        heading: block.level === 1 ? HeadingLevel.TITLE : block.level === 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2
      }));
    } else if (block.type === 'bullet' || block.type === 'number') {
      children.push(new Paragraph({ children: inlineRuns(block.text), numbering: { reference: block.type, level: 0 } }));
    } else if (block.type === 'table') {
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: block.rows.map((row, rowIndex) => new TableRow({
          children: row.map(cell => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cell, bold: rowIndex === 0 })] })] }))
        }))
      }));
    } else {
      children.push(new Paragraph({ children: inlineRuns(block.text), indent: { firstLine: brief.profile === 'jqi' ? 200 : 720 } }));
    }
  }
  const margins = brief.profile === 'jqi'
    ? { top: 1134, bottom: 850, left: 1701, right: 1701, header: 850, footer: 850 }
    : { top: 1440, bottom: 1440, left: 1440, right: 1440, header: 720, footer: 720 };
  const document = new Document({
    styles: docxStyles(brief.profile),
    numbering: {
      config: [
        { reference: 'bullet', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: 'number', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }
      ]
    },
    sections: [{ properties: { page: { margin: margins } }, children }]
  });
  const outputPath = path.resolve(root, options.output || path.join(projectDir, `${path.basename(planPath, path.extname(planPath))}.docx`));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, await Packer.toBuffer(document));
  const { manifestPath, manifest } = await writeDocumentManifest(root, context, {
    docx: { path: slash(path.relative(root, outputPath)), sha256: await sha256File(outputPath) }
  }, options);
  return { docx_path: manifest.docx.path, document_manifest: slash(path.relative(root, manifestPath)), manifest };
}

export async function exportPlanHwpx(root, projectDir, planPath, options = {}) {
  const context = await baseExportContext(root, projectDir, planPath);
  const { project, absolutePlan, markdown } = context;
  const outputPath = path.resolve(root, options.output || path.join(projectDir, `${path.basename(planPath, path.extname(planPath))}.hwpx`));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, await markdownToHwpx(markdown, options));
  let roundtripStatus = 'not_verified';
  try {
    const parsed = await parseKoreanOfficeFile(outputPath, path.join(project, 'parsed'), { resume: false });
    if (parsed.sha256 === await sha256File(outputPath)) roundtripStatus = 'parsed';
  } catch { /* preserve the generated file and state its verification limit */ }
  const { manifestPath, manifest } = await writeDocumentManifest(root, context, {
    hwpx: {
      path: slash(path.relative(root, outputPath)), sha256: await sha256File(outputPath),
      generator: `kordoc@${KORDOC_VERSION}`, roundtrip_status: roundtripStatus
    }
  }, options);
  return { hwpx_path: manifest.hwpx.path, document_manifest: slash(path.relative(root, manifestPath)), manifest };
}

export { parseMarkdown };
