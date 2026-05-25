import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import toml from 'toml';
import OpenAI from 'openai';

let pdfParseModule = null;
import('pdf-parse').then(m => { pdfParseModule = m; console.log('pdf-parse: loaded'); }).catch(() => { console.log('pdf-parse: not available'); });

async function parsePdf(filePath) {
  if (!pdfParseModule) return null;
  try {
    if (pdfParseModule.PDFParse) {
      const data = fs.readFileSync(filePath);
      const parser = new pdfParseModule.PDFParse({ data });
      await parser.load();
      const textResult = await parser.getText();
      const info = await parser.getInfo();
      const text = textResult?.text || (typeof textResult === 'string' ? textResult : '');
      return { text, numpages: info?.total || 0 };
    }
    if (pdfParseModule.default) {
      const result = await pdfParseModule.default(fs.readFileSync(filePath));
      return { text: result.text || '', numpages: result.numpages || 0 };
    }
  } catch (e) { console.error('PDF parse error:', e.message); }
  return null;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

const ACCESS_CODE = process.env.ACCESS_CODE || 'mofa2026';
const STYLES_DIR = process.env.STYLES_DIR ? path.resolve(process.env.STYLES_DIR) : path.resolve(__dirname, 'styles');
const MOFA_BIN = process.env.MOFA_BIN || 'mofa';
const OUTPUT_DIR = path.resolve(__dirname, 'output');
const UPLOAD_DIR = path.resolve(__dirname, 'uploads');
const PORT = parseInt(process.env.PORT || '3001', 10);
const PREVIEWS_DIR = process.env.PREVIEWS_DIR ? path.resolve(process.env.PREVIEWS_DIR) : path.resolve(__dirname, 'previews');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function resolveOpenAIKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  for (const p of [path.join(path.dirname(MOFA_BIN), 'mofa', 'config.json'), path.resolve(__dirname, 'mofa', 'config.json')]) {
    try {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const val = cfg?.api_keys?.openai;
      if (val && !val.startsWith('env:')) return val;
      if (val?.startsWith('env:') && process.env[val.slice(4)]) return process.env[val.slice(4)];
    } catch { /* skip */ }
  }
  return null;
}
const OPENAI_KEY = resolveOpenAIKey();

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => { cb(null, /^(image\/|application\/pdf)/.test(file.mimetype)); },
});

// ── Auth ──

app.post('/api/auth', (req, res) => {
  const { code } = req.body;
  if (code === ACCESS_CODE) {
    res.json({ ok: true, token: Buffer.from(`${ACCESS_CODE}:${Date.now()}`).toString('base64') });
  } else {
    res.status(403).json({ error: '访问码错误' });
  }
});

function authMiddleware(req, res, next) {
  if (req.path === '/api/auth') return next();
  if (req.path.startsWith('/api/preview/') || req.path.startsWith('/api/cards/')) return next();
  if (req.path.startsWith('/api/job/')) return next();
  if (req.path.startsWith('/api/')) {
    const token = req.headers['x-access-token'];
    if (!token) return res.status(401).json({ error: '请先输入访问码' });
    try {
      const decoded = Buffer.from(token, 'base64').toString();
      if (!decoded.startsWith(ACCESS_CODE + ':')) return res.status(403).json({ error: '访问码无效' });
    } catch { return res.status(403).json({ error: '访问码无效' }); }
    return next();
  }
  next();
}
app.use(authMiddleware);

// ── Style loading ──

let parsedTomlCache = {};
function getParsedToml(styleName) {
  if (!parsedTomlCache[styleName]) {
    const file = path.join(STYLES_DIR, `${styleName}.toml`);
    parsedTomlCache[styleName] = toml.parse(fs.readFileSync(file, 'utf-8'));
  }
  return parsedTomlCache[styleName];
}
function getVariantPrompt(styleName, variantName) {
  try { return getParsedToml(styleName).variants?.[variantName]?.prompt || ''; } catch { return ''; }
}
function getStyleMeta(styleName) {
  try { return getParsedToml(styleName).meta || {}; } catch { return {}; }
}
function loadStyles() {
  const files = fs.readdirSync(STYLES_DIR).filter(f => f.endsWith('.toml'));
  return files.map(f => {
    const parsed = toml.parse(fs.readFileSync(path.join(STYLES_DIR, f), 'utf-8'));
    const meta = parsed.meta || {};
    const variants = parsed.variants || {};
    const variantNames = Object.keys(variants).filter(k => k !== 'default');
    return {
      id: meta.name || path.basename(f, '.toml'), file: f,
      displayName: meta.display_name || meta.name, description: meta.description || '',
      category: meta.category || 'other', tags: meta.tags || [],
      defaultVariant: variants.default || variantNames[0] || 'default',
      variants: variantNames.map(name => ({ name, promptPreview: (variants[name]?.prompt || '').slice(0, 120) + '…' })),
    };
  });
}
let cachedStyles = null;

// ── Prompt construction ──

function extractTechSpecs(variantPrompt) {
  const lines = variantPrompt.split('\n').slice(0, 2);
  return lines.filter(l => /\d+[x×]\d+|pixel|format/i.test(l)).join('\n');
}

function buildPrompt({ stylePrompt, userPrompt, flexibility, referenceDesc, styleMeta }) {
  const ref = referenceDesc ? `\n\n参考元素：${referenceDesc}` : '';
  const techSpecs = extractTechSpecs(stylePrompt);
  switch (flexibility) {
    case 'strict':
      return `${stylePrompt}\n\n${userPrompt}${ref}`;
    case 'balanced':
      return `${stylePrompt}\n\n---\n\n【用户创作要求】以下是用户的具体要求，请以此作为画面的核心主题和内容：\n${userPrompt}${ref}\n\n请在保持以上风格特征的同时，确保用户描述的场景、人物、情节是画面的主角。`;
    case 'creative':
      return `${techSpecs ? techSpecs + '\n\n' : ''}画面风格：${styleMeta.display_name || styleMeta.name || ''}（${styleMeta.description || ''}）\n\n${userPrompt}${ref}`;
    default:
      return `${stylePrompt}\n\n${userPrompt}${ref}`;
  }
}

// ── Job Queue ──

const jobStore = new Map();
const jobQueue = [];
let processing = false;

function createJob(params) {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const jobDir = path.join(OUTPUT_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  const job = {
    id: jobId, dir: jobDir, status: 'queued', params,
    files: [], error: null, createdAt: Date.now(),
  };
  jobStore.set(jobId, job);
  jobQueue.push(jobId);
  processQueue();
  return jobId;
}

async function processQueue() {
  if (processing) return;
  processing = true;
  while (jobQueue.length > 0) {
    const jobId = jobQueue.shift();
    const job = jobStore.get(jobId);
    if (!job) continue;
    job.status = 'generating';
    try {
      if (job.params.type === 'transform') {
        await executeTransform(job);
      } else {
        await executeGenerate(job);
      }
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
    }
  }
  processing = false;
}

async function executeGenerate(job) {
  const { style, variant, prompt, referenceDescription, genModel, imageSize, flexibility, customSystemPrompt } = job.params;
  const mode = flexibility || 'balanced';
  const stylePrompt = customSystemPrompt || getVariantPrompt(style, variant || 'front');
  const styleMeta = getStyleMeta(style);
  const fullPrompt = buildPrompt({ stylePrompt, userPrompt: prompt, flexibility: mode, referenceDesc: referenceDescription, styleMeta });

  const input = {
    cards: [{ name: 't', prompt: fullPrompt, style: '_bypass' }],
    style, card_dir: job.dir,
    gen_model: genModel || 'gpt-image-2', image_size: imageSize || '1K',
    api: 'rt', concurrency: 1,
  };

  const result = await runMofa(input);
  const pngFiles = fs.readdirSync(job.dir).filter(f => f.endsWith('.png'));
  if (result.success && pngFiles.length > 0) {
    job.status = 'done';
    job.files = pngFiles.map(f => `/api/cards/${job.id}/${f}`);
  } else {
    job.status = 'error';
    job.error = result.output || '生成失败';
  }
}

async function executeTransform(job) {
  const { prompt, style, variant, flexibility, imagePath, originalName, mimeType } = job.params;
  if (!OPENAI_KEY) throw new Error('OpenAI API key not found');

  const openai = new OpenAI({ apiKey: OPENAI_KEY });
  let transformPrompt = prompt;
  if (style && variant && flexibility !== 'creative') {
    const stylePrompt = getVariantPrompt(style, variant);
    const styleMeta = getStyleMeta(style);
    if (flexibility === 'strict' && stylePrompt) {
      transformPrompt = `${stylePrompt}\n\nTransform the provided image according to the style above.\n\n${prompt}`;
    } else {
      transformPrompt = `Transform the provided image in the style of: ${styleMeta.display_name || styleMeta.name || ''} (${styleMeta.description || ''}).\n\n${prompt}`;
    }
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const imageFile = new File([imageBuffer], originalName || 'image.png', { type: mimeType || 'image/png' });

  const response = await openai.images.edit({
    model: 'gpt-image-1', image: imageFile, prompt: transformPrompt, n: 1, size: '1024x1024',
  });

  const b64 = response.data?.[0]?.b64_json;
  if (b64) {
    fs.writeFileSync(path.join(job.dir, 'card-t.png'), Buffer.from(b64, 'base64'));
    job.status = 'done';
    job.files = [`/api/cards/${job.id}/card-t.png`];
  } else {
    job.status = 'error';
    job.error = 'No image generated';
  }
  try { fs.unlinkSync(imagePath); } catch { /* ok */ }
}

// Cleanup old jobs (>24h)
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, job] of jobStore) {
    if (job.createdAt < cutoff) {
      try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch { /* ok */ }
      jobStore.delete(id);
    }
  }
}, 60 * 60 * 1000);

// ── API routes ──

app.get('/api/styles', (_req, res) => {
  try { if (!cachedStyles) cachedStyles = loadStyles(); res.json(cachedStyles); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/styles/reload', (_req, res) => { cachedStyles = null; parsedTomlCache = {}; res.json({ ok: true }); });
app.get('/api/style-prompt/:styleId/:variant', (req, res) => {
  const prompt = getVariantPrompt(req.params.styleId, req.params.variant);
  if (!prompt) return res.status(404).json({ error: 'Variant not found' });
  res.json({ prompt });
});

app.post('/api/analyze-reference', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!OPENAI_KEY) { fs.unlinkSync(req.file.path); return res.status(500).json({ error: 'OpenAI API key not found' }); }

  const isPdf = req.file.mimetype === 'application/pdf';
  try {
    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    let messages;

    if (isPdf) {
      const pdf = await parsePdf(req.file.path);
      if (!pdf) { fs.unlinkSync(req.file.path); return res.status(500).json({ error: 'PDF parsing not available' }); }
      messages = [{ role: 'user', content: `这是一份 PDF 文档（${pdf.numpages} 页）的文字内容，请提取适合卡片设计的关键信息：\n- 主题\n- 核心文案（原文保留）\n- 情感基调\n- 推荐的视觉元素\n不超过 200 字。\n\n文档内容：\n${pdf.text.slice(0, 2000)}` }];
    } else {
      const base64 = fs.readFileSync(req.file.path).toString('base64');
      const mimeType = req.file.mimetype || 'image/png';
      messages = [{ role: 'user', content: [
        { type: 'text', text: '请用中文详细描述这张图片，分四个维度：\n1. 主体物件与人物\n2. 色彩方案与光影\n3. 构图与空间关系\n4. 情感氛围与意境\n每个维度一行，总共不超过 250 字。输出将用于指导 AI 图片生成。' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
      ] }];
    }

    const response = await openai.chat.completions.create({ model: 'gpt-5.4-mini', max_completion_tokens: 500, messages });
    const description = response.choices[0]?.message?.content || '';
    res.json({ description, fileName: req.file.originalname, type: isPdf ? 'pdf' : 'image' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(req.file.path); } catch { /* ok */ }
  }
});

// Async generate — returns jobId immediately
app.post('/api/generate', (req, res) => {
  const { style, prompt } = req.body;
  if (!style || !prompt) return res.status(400).json({ error: 'style and prompt are required' });
  const jobId = createJob({ type: 'generate', ...req.body });
  res.json({ jobId, status: 'queued' });
});

// Async transform — returns jobId immediately
app.post('/api/transform', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  if (!req.body.prompt) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'prompt is required' }); }
  const jobId = createJob({
    type: 'transform', prompt: req.body.prompt,
    style: req.body.style, variant: req.body.variant, flexibility: req.body.flexibility,
    imagePath: req.file.path, originalName: req.file.originalname, mimeType: req.file.mimetype,
  });
  res.json({ jobId, status: 'queued' });
});

// Job status polling
app.get('/api/job/:id', (req, res) => {
  const job = jobStore.get(req.params.id);
  if (!job) {
    // Check if output dir exists (server restarted but files remain)
    const jobDir = path.join(OUTPUT_DIR, req.params.id);
    if (fs.existsSync(jobDir)) {
      const pngFiles = fs.readdirSync(jobDir).filter(f => f.endsWith('.png'));
      if (pngFiles.length > 0) {
        return res.json({ id: req.params.id, status: 'done', files: pngFiles.map(f => `/api/cards/${req.params.id}/${f}`), error: null });
      }
    }
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({ id: job.id, status: job.status, files: job.files, error: job.error });
});

app.get('/api/cards/:jobId/:filename', (req, res) => {
  const filePath = path.join(OUTPUT_DIR, req.params.jobId, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.sendFile(filePath);
});

app.get('/api/preview/:styleId', (req, res) => {
  const styleId = req.params.styleId;
  for (const p of [path.join(PREVIEWS_DIR, styleId, 'card-preview.png'), path.join(PREVIEWS_DIR, `${styleId}.png`)]) {
    if (fs.existsSync(p)) return res.sendFile(p);
  }
  res.status(404).json({ error: 'No preview' });
});

function runMofa(input, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(MOFA_BIN, ['mofa_cards'], {
      cwd: path.dirname(MOFA_BIN), env: { ...process.env, RUST_LOG: 'warn' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('生成超时（120秒），请重试')); }, timeoutMs);
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`mofa exited ${code}: ${stderr.slice(-200)}`));
      try {
        const lines = stdout.trim().split('\n');
        let parsed = null;
        for (let i = lines.length - 1; i >= 0; i--) {
          try { const obj = JSON.parse(lines[i]); if ('success' in obj || 'output' in obj) { parsed = obj; break; } } catch { /* skip */ }
        }
        if (!parsed) parsed = JSON.parse(lines[lines.length - 1]);
        resolve({ success: parsed.success !== false, output: parsed.output || '', files: parsed.files_to_send || [] });
      } catch { resolve({ success: stdout.length > 0, output: stdout, files: [] }); }
    });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

const DIST = path.resolve(__dirname, 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (req, res, next) => { if (req.path.startsWith('/api/')) return next(); res.sendFile(path.join(DIST, 'index.html')); });
}

app.listen(PORT, () => {
  console.log(`Card Studio on http://localhost:${PORT}`);
  console.log(`Styles: ${STYLES_DIR}`);
  console.log(`Mofa:   ${MOFA_BIN}`);
  console.log(`OpenAI: ${OPENAI_KEY ? 'resolved' : 'NOT FOUND'}`);
});
