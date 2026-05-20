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

const STYLES_DIR = process.env.STYLES_DIR
  ? path.resolve(process.env.STYLES_DIR)
  : path.resolve(__dirname, 'styles');
const MOFA_BIN = process.env.MOFA_BIN || 'mofa';
const OUTPUT_DIR = path.resolve(__dirname, 'output');
const UPLOAD_DIR = path.resolve(__dirname, 'uploads');
const PORT = parseInt(process.env.PORT || '3001', 10);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Auto-resolve OpenAI key from mofa config if not in env
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
  res.json({ ok: true });
});

app.post('/api/analyze-reference', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  if (!OPENAI_KEY) {
    fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: 'OpenAI API key not found in env or mofa config' });
  }

  try {
    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    const imageData = fs.readFileSync(req.file.path);
    const base64 = imageData.toString('base64');
    const mimeType = req.file.mimetype || 'image/png';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请用中文描述这张图片中可以用于贺卡设计的视觉元素：主要物体、颜色、构图、情感氛围。简洁地列出要点，不超过 150 字。',
            },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
    });

    const description = response.choices[0]?.message?.content || '';
    res.json({ description, fileName: req.file.originalname });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlinkSync(req.file.path);
  }
});

app.post('/api/generate', async (req, res) => {
  const { style, variant, prompt, referenceDescription, genModel, imageSize } = req.body;

  if (!style || !prompt) {
    return res.status(400).json({ error: 'style and prompt are required' });
  }

  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const jobDir = path.join(OUTPUT_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  let fullPrompt = prompt;
  if (referenceDescription) {
    fullPrompt += `\n\n参考元素：${referenceDescription}`;
  }

  const input = {
    cards: [{ name: 't', prompt: fullPrompt, style: variant || undefined }],
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
      success: result.success,
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

function runMofa(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(MOFA_BIN, ['mofa_cards'], {
      cwd: path.dirname(MOFA_BIN),
      env: { ...process.env, RUST_LOG: 'warn' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });

    child.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`mofa exited with code ${code}: ${stderr}`));
      }
      try {
        // New mofa outputs multiple JSON lines (progress + result). Find the result line.
        const lines = stdout.trim().split('\n');
        let parsed = null;
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const obj = JSON.parse(lines[i]);
            if ('success' in obj || 'output' in obj) { parsed = obj; break; }
          } catch { /* skip non-JSON or progress lines */ }
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

// Serve static frontend in production
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
});
