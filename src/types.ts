export interface StyleVariant {
  name: string;
  promptPreview: string;
}

export interface CardStyle {
  id: string;
  file: string;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  defaultVariant: string;
  variants: StyleVariant[];
}

export type FlexMode = 'strict' | 'balanced' | 'creative';

export interface GenerateRequest {
  style: string;
  variant?: string;
  prompt: string;
  referenceDescription?: string;
  genModel?: string;
  imageSize?: string;
  flexibility?: FlexMode;
  customSystemPrompt?: string;
}

export interface GenerateResult {
  jobId: string;
  success: boolean;
  output: string;
  files: string[];
}

export interface ReferenceAnalysis {
  description: string;
  fileName: string;
}

export type GenerationPhase = 'idle' | 'generating' | 'done' | 'error';
