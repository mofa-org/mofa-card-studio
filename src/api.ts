import type { CardStyle, GenerateRequest, GenerateResult, ReferenceAnalysis } from './types';

const BASE = '/api';

export async function fetchStyles(): Promise<CardStyle[]> {
  const res = await fetch(`${BASE}/styles`);
  if (!res.ok) throw new Error('Failed to load styles');
  return res.json();
}

export async function fetchStylePrompt(styleId: string, variant: string): Promise<string> {
  const res = await fetch(`${BASE}/style-prompt/${styleId}/${variant}`);
  if (!res.ok) return '';
  const data = await res.json();
  return data.prompt || '';
}

export async function analyzeReference(file: File): Promise<ReferenceAnalysis> {
  const form = new FormData();
  form.append('image', file);
  const res = await fetch(`${BASE}/analyze-reference`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function generateCard(req: GenerateRequest): Promise<GenerateResult> {
  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Generation failed' }));
    throw new Error(err.error);
  }
  return res.json();
}
