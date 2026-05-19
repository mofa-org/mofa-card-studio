interface StyleVisual {
  gradient: string;
  accent: string;
  textColor: string;
  icon: string;
}

const visuals: Record<string, StyleVisual> = {
  'cny-guochao': {
    gradient: 'linear-gradient(135deg, #C41E3A 0%, #8B1A2B 60%, #6B0F1F 100%)',
    accent: '#FFD700',
    textColor: '#FFD700',
    icon: '龙',
  },
  'cny-shuimo': {
    gradient: 'linear-gradient(135deg, #FFF8F0 0%, #F0E6D4 50%, #E8D5BB 100%)',
    accent: '#C41E3A',
    textColor: '#3C3226',
    icon: '春',
  },
  'feng-zikai': {
    gradient: 'linear-gradient(135deg, #FFF8F0 0%, #FFEFD5 50%, #FFE4C4 100%)',
    accent: '#B8860B',
    textColor: '#3C3226',
    icon: '童',
  },
  'laoshu': {
    gradient: 'linear-gradient(135deg, #FFFAF2 0%, #F5EFE6 50%, #E8DCC8 100%)',
    accent: '#E63946',
    textColor: '#2C2C2C',
    icon: '树',
  },
  'lingnan': {
    gradient: 'linear-gradient(135deg, #F0F7ED 0%, #E0EDD8 50%, #C8DEB8 100%)',
    accent: '#4A7C59',
    textColor: '#2D4A35',
    icon: '茶',
  },
  'shuimo': {
    gradient: 'linear-gradient(135deg, #F5F5F0 0%, #E8E4DD 50%, #D0CCC5 100%)',
    accent: '#C41E3A',
    textColor: '#2C2C2C',
    icon: '墨',
  },
  'web': {
    gradient: 'linear-gradient(135deg, #EBF4FF 0%, #DBEAFE 50%, #BFDBFE 100%)',
    accent: '#3B82F6',
    textColor: '#1E3A5F',
    icon: 'W',
  },
  'xianer': {
    gradient: 'linear-gradient(135deg, #FFF8F0 0%, #FFEDD5 50%, #FED7AA 100%)',
    accent: '#EA580C',
    textColor: '#7C2D12',
    icon: '僧',
  },
  'tshirt-artdeco': {
    gradient: 'linear-gradient(135deg, #1A1A2E 0%, #16213E 50%, #0F3460 100%)',
    accent: '#E94560',
    textColor: '#D4AF37',
    icon: 'A',
  },
  'tshirt-cubism': {
    gradient: 'linear-gradient(135deg, #F5E6CA 0%, #E8D5B0 50%, #C4A87C 100%)',
    accent: '#2E5090',
    textColor: '#2C2C2C',
    icon: '立',
  },
  'tshirt-lautrec': {
    gradient: 'linear-gradient(135deg, #FFF5E1 0%, #FFE8C0 50%, #F5D09A 100%)',
    accent: '#B22222',
    textColor: '#3C3226',
    icon: 'T',
  },
  'tshirt-matisse': {
    gradient: 'linear-gradient(135deg, #1A3C6E 0%, #2B5BA5 50%, #3B7DD8 100%)',
    accent: '#FF6B35',
    textColor: '#FFF8F0',
    icon: '剪',
  },
  'tshirt-moebius': {
    gradient: 'linear-gradient(135deg, #F0E6D4 0%, #E0D5C0 50%, #C8B8A0 100%)',
    accent: '#6B4E37',
    textColor: '#3C3226',
    icon: 'M',
  },
  'tshirt-symbolism': {
    gradient: 'linear-gradient(135deg, #2C1810 0%, #3D2317 50%, #4E2E20 100%)',
    accent: '#D4AF37',
    textColor: '#E8D5B0',
    icon: '象',
  },
  'tshirt-woodcut': {
    gradient: 'linear-gradient(135deg, #F5F0E8 0%, #E8E0D0 50%, #D4C8B0 100%)',
    accent: '#2C2C2C',
    textColor: '#2C2C2C',
    icon: '刻',
  },
};

const fallback: StyleVisual = {
  gradient: 'linear-gradient(135deg, #F5F5F0 0%, #E8E4DD 100%)',
  accent: '#6B5E50',
  textColor: '#3C3226',
  icon: '卡',
};

export function getVisual(styleId: string): StyleVisual {
  return visuals[styleId] || fallback;
}

const categoryLabels: Record<string, string> = {
  art: '水墨画韵',
  festive: '节庆贺卡',
  character: '趣味角色',
  web: '网页素材',
  tshirt: 'T恤印花',
  other: '其他',
};

export function getCategoryLabel(category: string): string {
  if (category.startsWith('tshirt')) return categoryLabels.tshirt;
  return categoryLabels[category] || categoryLabels.other;
}

const categoryOrder = ['art', 'festive', 'character', 'tshirt', 'web'];

export function getCategoryOrder(category: string): number {
  const normalized = category.startsWith('tshirt') ? 'tshirt' : category;
  const idx = categoryOrder.indexOf(normalized);
  return idx === -1 ? 99 : idx;
}

const variantLabels: Record<string, { label: string; desc: string }> = {
  front: { label: '正面', desc: '核心插画，视觉主导' },
  greeting: { label: '祝语', desc: '文字为主，温馨问候' },
  scene: { label: '场景', desc: '完整情境，故事感' },
  content: { label: '内容', desc: '信息排版，图文并茂' },
  emotion: { label: '意境', desc: '极简诗意，留白至上' },
  hero: { label: '首屏', desc: '大横幅，视觉冲击' },
  'no-text': { label: '纯图', desc: '无文字背景素材' },
  banner: { label: '横幅', desc: '宽幅装饰条' },
  portrait: { label: '人像', desc: '人物肖像风格' },
  light: { label: '浅色', desc: '浅底配色方案' },
  cover: { label: '封面', desc: '主视觉封面图' },
  day1: { label: '第一天', desc: '系列第一张' },
  day2: { label: '第二天', desc: '系列第二张' },
  day3: { label: '第三天', desc: '系列第三张' },
  info: { label: '信息', desc: '资讯排版页' },
  normal: { label: '标准', desc: '通用幻灯片' },
  data: { label: '数据', desc: '数据可视化页' },
  section: { label: '板块', desc: '内容板块背景' },
  feature: { label: '特性', desc: '功能展示区' },
  spring: { label: '春', desc: '春日时节' },
  summer: { label: '夏', desc: '盛夏时节' },
  autumn: { label: '秋', desc: '金秋时节' },
  winter: { label: '冬', desc: '寒冬时节' },
  night: { label: '夜', desc: '夜幕氛围' },
};

export function getVariantLabel(name: string): { label: string; desc: string } {
  return variantLabels[name] || { label: name, desc: '' };
}
