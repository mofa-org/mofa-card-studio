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
  const res = await fetch(`${BASE}/analyze-reference`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function generateCard(req: GenerateRequest): Promise<GenerateResult> {
  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Generation failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function transformImage(
  imageFile: File,
  prompt: string,
  style?: string,
  variant?: string,
  flexibility?: string,
): Promise<GenerateResult> {
  const form = new FormData();
  form.append('image', imageFile);
  form.append('prompt', prompt);
  if (style) form.append('style', style);
  if (variant) form.append('variant', variant);
  if (flexibility) form.append('flexibility', flexibility);
  const res = await fetch(`${BASE}/transform`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Transform failed' }));
    throw new Error(err.error);
  }
  return res.json();
}
