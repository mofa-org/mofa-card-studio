import type { CardStyle, GenerateRequest, GenerateResult, ReferenceAnalysis } from './types';
import { getToken } from './components/AuthGate';

const BASE = '/api';

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { 'X-Access-Token': token } : {};
}

export async function fetchStyles(): Promise<CardStyle[]> {
  const res = await fetch(`${BASE}/styles`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load styles');
  return res.json();
}

export async function fetchStylePrompt(styleId: string, variant: string): Promise<string> {
  const res = await fetch(`${BASE}/style-prompt/${styleId}/${variant}`, { headers: authHeaders() });
  if (!res.ok) return '';
  const data = await res.json();
  return data.prompt || '';
}

export async function analyzeReference(file: File): Promise<ReferenceAnalysis> {
  const form = new FormData();
  form.append('image', file);
  const res = await fetch(`${BASE}/analyze-reference`, { method: 'POST', headers: authHeaders(), body: form });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Upload failed' })); throw new Error(err.error); }
  return res.json();
}

// Submit generation job — returns immediately with jobId
export async function submitGenerate(req: GenerateRequest): Promise<{ jobId: string }> {
  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(req),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Submit failed' })); throw new Error(err.error); }
  return res.json();
}

export async function submitTransform(
  imageFile: File, prompt: string, style?: string, variant?: string, flexibility?: string,
): Promise<{ jobId: string }> {
  const form = new FormData();
  form.append('image', imageFile);
  form.append('prompt', prompt);
  if (style) form.append('style', style);
  if (variant) form.append('variant', variant);
  if (flexibility) form.append('flexibility', flexibility);
  const res = await fetch(`${BASE}/transform`, { method: 'POST', headers: authHeaders(), body: form });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Submit failed' })); throw new Error(err.error); }
  return res.json();
}

export interface JobStatus {
  id: string;
  status: 'queued' | 'generating' | 'done' | 'error';
  files: string[];
  error: string | null;
}

export async function pollJob(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${BASE}/job/${jobId}`);
  if (!res.ok) throw new Error('Job not found');
  return res.json();
}

// Poll until job completes, calling onProgress each tick
export function watchJob(
  jobId: string,
  onProgress: (status: JobStatus) => void,
  intervalMs = 2000,
): () => void {
  let stopped = false;
  const poll = async () => {
    while (!stopped) {
      try {
        const status = await pollJob(jobId);
        onProgress(status);
        if (status.status === 'done' || status.status === 'error') return;
      } catch { /* retry */ }
      await new Promise(r => setTimeout(r, intervalMs));
    }
  };
  poll();
  return () => { stopped = true; };
}

// Legacy compat
export async function generateCard(req: GenerateRequest): Promise<GenerateResult> {
  const { jobId } = await submitGenerate(req);
  return new Promise((resolve, reject) => {
    watchJob(jobId, status => {
      if (status.status === 'done') resolve({ jobId, success: true, output: '', files: status.files });
      if (status.status === 'error') reject(new Error(status.error || '生成失败'));
    });
  });
}

export async function transformImage(
  imageFile: File, prompt: string, style?: string, variant?: string, flexibility?: string,
): Promise<GenerateResult> {
  const { jobId } = await submitTransform(imageFile, prompt, style, variant, flexibility);
  return new Promise((resolve, reject) => {
    watchJob(jobId, status => {
      if (status.status === 'done') resolve({ jobId, success: true, output: '', files: status.files });
      if (status.status === 'error') reject(new Error(status.error || '转换失败'));
    });
  });
}
