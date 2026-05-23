import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import toml from 'toml';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

const ACCESS_CODE = process.env.ACCESS_CODE || 'mofa2026';

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
  if (req.path.startsWith('/api/preview/')) return next();
  if (req.path.startsWith('/api/cards/')) return next();
  if (req.path.startsWith('/api/')) {
    const token = req.headers['x-access-token'];
    if (!token) return res.status(401).json({ error: '请先输入访问码' });
    try {
      const decoded = Buffer.from(token, 'base64').toString();
      if (!decoded.startsWith(ACCESS_CODE + ':')) return res.status(403).json({ error: '访问码无效' });
    } catch {
      return res.status(403).json({ error: '访问码无效' });
    }
    return next();
  }
  next();
}
app.use(authMiddleware);

const STYLES_DIR = process.env.STYLES_DIR
  ? path.resolve(process.env.STYLES_DIR)
  : path.resolve(__dirname, 'styles');
const MOFA_BIN = process.env.MOFA_BIN || 'mofa';
const OUTPUT_DIR = path.resolve(__dirname, 'output');
const UPLOAD_DIR = path.resolve(__dirname, 'uploads');
const PORT = parseInt(process.env.PORT || '3001', 10);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function resolveOpenAIKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const candidates = [
    path.join(path.dirname(MOFA_BIN), 'mofa', 'config.json'),
    path.resolve(__dirname, 'mofa', 'config.json'),
  ];
  for (const p of candidates) {
    try {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const val = cfg?.api_keys?.openai;
      if (val && !val.startsWith('env:')) return val;
      if (val?.startsWith('env:')) {
        const envKey = val.slice(4);
        if (process.env[envKey]) return process.env[envKey];
      }
    } catch { /* skip */ }
  }
  return null;
}
const OPENAI_KEY = resolveOpenAIKey();

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\//.test(file.mimetype));
  },
});

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
  try {
    const parsed = getParsedToml(styleName);
    return parsed.variants?.[variantName]?.prompt || '';
  } catch { return ''; }
}

function getStyleMeta(styleName) {
  try {
    const parsed = getParsedToml(styleName);
    return parsed.meta || {};
  } catch { return {}; }
}

function loadStyles() {
  const files = fs.readdirSync(STYLES_DIR).filter(f => f.endsWith('.toml'));
  return files.map(f => {
    const raw = fs.readFileSync(path.join(STYLES_DIR, f), 'utf-8');
    const parsed = toml.parse(raw);
    const meta = parsed.meta || {};
    const variants = parsed.variants || {};
    const variantNames = Object.keys(variants).filter(k => k !== 'default');
    return {
      id: meta.name || path.basename(f, '.toml'),
      file: f,
      displayName: meta.display_name || meta.name,
      description: meta.description || '',
      category: meta.category || 'other',
      tags: meta.tags || [],
      defaultVariant: variants.default || variantNames[0] || 'default',
      variants: variantNames.map(name => ({
        name,
        promptPreview: (variants[name]?.prompt || '').slice(0, 120) + '…',
      })),
    };
  });
}

let cachedStyles = null;

// ── Prompt construction with flexibility ──

function extractTechSpecs(variantPrompt) {
  const lines = variantPrompt.split('\n').slice(0, 2);
  return lines.filter(l => /\d+[x×]\d+|pixel|format/i.test(l)).join('\n');
}

function buildPrompt({ stylePrompt, userPrompt, flexibility, referenceDesc, styleMeta }) {
  let ref = referenceDesc ? `\n\n参考元素：${referenceDesc}` : '';
  const techSpecs = extractTechSpecs(stylePrompt);

  switch (flexibility) {
    case 'strict':
      return `${stylePrompt}\n\n${userPrompt}${ref}`;

    case 'balanced':
      return `${stylePrompt}\n\n` +
        `---\n\n` +
        `【用户创作要求】以下是用户的具体要求，请以此作为画面的核心主题和内容：\n` +
        `${userPrompt}${ref}\n\n` +
        `请在保持以上风格特征的同时，确保用户描述的场景、人物、情节是画面的主角。`;

    case 'creative':
      return `${techSpecs ? techSpecs + '\n\n' : ''}` +
        `画面风格：${styleMeta.display_name || styleMeta.name || ''}（${styleMeta.description || ''}）\n\n` +
        `${userPrompt}${ref}`;

    default:
      return `${stylePrompt}\n\n${userPrompt}${ref}`;
  }
}

// ── API routes ──

app.get('/api/styles', (_req, res) => {
  try {
    if (!cachedStyles) cachedStyles = loadStyles();
    res.json(cachedStyles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/styles/reload', (_req, res) => {
  cachedStyles = null;
  parsedTomlCache = {};
  res.json({ ok: true });
});

app.get('/api/style-prompt/:styleId/:variant', (req, res) => {
  const prompt = getVariantPrompt(req.params.styleId, req.params.variant);
  if (!prompt) return res.status(404).json({ error: 'Variant not found' });
  res.json({ prompt });
});

app.post('/api/analyze-reference', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  if (!OPENAI_KEY) {
    fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: 'OpenAI API key not found' });
  }

  try {
    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    const imageData = fs.readFileSync(req.file.path);
    const base64 = imageData.toString('base64');
    const mimeType = req.file.mimetype || 'image/png';

    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      max_completion_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '请用中文描述这张图片中可以用于贺卡设计的视觉元素：主要物体、颜色、构图、情感氛围。简洁地列出要点，不超过 150 字。' },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      }],
    });

    const description = response.choices[0]?.message?.content || '';
    res.json({ description, fileName: req.file.originalname });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlinkSync(req.file.path);
  }
});

// Image style transfer — sends actual image to OpenAI for transformation
app.post('/api/transform', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  if (!OPENAI_KEY) {
    fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: 'OpenAI API key not found' });
  }

  const { prompt: userPrompt, style: styleName, variant: variantName, flexibility } = req.body;
  if (!userPrompt) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'prompt is required' });
  }

  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const jobDir = path.join(OUTPUT_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  try {
    const openai = new OpenAI({ apiKey: OPENAI_KEY });

    let transformPrompt = userPrompt;
    if (styleName && variantName && flexibility !== 'creative') {
      const stylePrompt = getVariantPrompt(styleName, variantName);
      const styleMeta = getStyleMeta(styleName);
      if (flexibility === 'strict' && stylePrompt) {
        transformPrompt = `${stylePrompt}\n\nTransform the provided image according to the style above.\n\n${userPrompt}`;
      } else {
        transformPrompt = `Transform the provided image in the style of: ${styleMeta.display_name || styleMeta.name || ''} (${styleMeta.description || ''}).\n\n${userPrompt}`;
      }
    }

    const imageBuffer = fs.readFileSync(req.file.path);
    const imageFile = new File(
      [imageBuffer],
      req.file.originalname || 'image.png',
      { type: req.file.mimetype || 'image/png' }
    );

    const response = await openai.images.edit({
      model: 'gpt-image-1',
      image: imageFile,
      prompt: transformPrompt,
      n: 1,
      size: '1024x1024',
    });

    const b64 = response.data?.[0]?.b64_json;
    if (b64) {
      const outPath = path.join(jobDir, 'card-t.png');
      fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
      res.json({
        jobId,
        success: true,
        output: 'Image transformed',
        files: [`/api/cards/${jobId}/card-t.png`],
      });
    } else {
      res.json({ jobId, success: false, output: 'No image generated', files: [] });
    }
  } catch (err) {
    res.status(500).json({ error: err.message, jobId });
  } finally {
    fs.unlinkSync(req.file.path);
  }
});

app.post('/api/generate', async (req, res) => {
  const {
    style, variant, prompt, referenceDescription,
    genModel, imageSize, flexibility, customSystemPrompt,
  } = req.body;

  if (!style || !prompt) {
    return res.status(400).json({ error: 'style and prompt are required' });
  }

  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const jobDir = path.join(OUTPUT_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const mode = flexibility || 'balanced';
  const stylePrompt = customSystemPrompt || getVariantPrompt(style, variant || 'front');
  const styleMeta = getStyleMeta(style);

  const fullPrompt = buildPrompt({
    stylePrompt,
    userPrompt: prompt,
    flexibility: mode,
    referenceDesc: referenceDescription,
    styleMeta,
  });

  // Use '_bypass' variant so mofa doesn't prepend its own style prompt
  const input = {
    cards: [{ name: 't', prompt: fullPrompt, style: '_bypass' }],
    style,
    card_dir: jobDir,
    gen_model: genModel || 'gpt-image-2',
    image_size: imageSize || '1K',
    api: 'rt',
    concurrency: 1,
  };

  try {
    const result = await runMofa(input);
    const pngFiles = fs.readdirSync(jobDir).filter(f => f.endsWith('.png'));

    res.json({
      jobId,
      success: result.success && pngFiles.length > 0,
      output: result.output,
      files: pngFiles.map(f => `/api/cards/${jobId}/${f}`),
    });
  } catch (err) {
    res.status(500).json({ error: err.message, jobId });
  }
});

app.get('/api/cards/:jobId/:filename', (req, res) => {
  const filePath = path.join(OUTPUT_DIR, req.params.jobId, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.sendFile(filePath);
});

const PREVIEWS_DIR = process.env.PREVIEWS_DIR
  ? path.resolve(process.env.PREVIEWS_DIR)
  : path.resolve(__dirname, 'previews');

app.get('/api/preview/:styleId', (req, res) => {
  const styleId = req.params.styleId;
  const candidates = [
    path.join(PREVIEWS_DIR, styleId, 'card-preview.png'),
    path.join(PREVIEWS_DIR, `${styleId}.png`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return res.sendFile(p);
  }
  res.status(404).json({ error: 'No preview' });
});

function runMofa(input, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(MOFA_BIN, ['mofa_cards'], {
      cwd: path.dirname(MOFA_BIN),
      env: { ...process.env, RUST_LOG: 'warn' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('生成超时（120秒），请重试'));
    }, timeoutMs);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });

    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(`mofa exited with code ${code}: ${stderr}`));
      }
      try {
        const lines = stdout.trim().split('\n');
        let parsed = null;
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const obj = JSON.parse(lines[i]);
            if ('success' in obj || 'output' in obj) { parsed = obj; break; }
          } catch { /* skip */ }
        }
        if (!parsed) parsed = JSON.parse(lines[lines.length - 1]);
        resolve({
          success: parsed.success !== false,
          output: parsed.output || '',
          files: parsed.files_to_send || [],
        });
      } catch {
        resolve({ success: stdout.length > 0, output: stdout, files: [] });
      }
    });

    child.on('error', reject);
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

const DIST = path.resolve(__dirname, 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Card Studio on http://localhost:${PORT}`);
  console.log(`Styles: ${STYLES_DIR}`);
  console.log(`Mofa:   ${MOFA_BIN}`);
  console.log(`OpenAI: ${OPENAI_KEY ? 'resolved' : 'NOT FOUND'}`);
});
