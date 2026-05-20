import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREVIEWS_DIR = path.resolve(__dirname, '../previews');

const openai = new OpenAI();

const styles = {
  'cny-guochao': '中国新年国潮风格的纯装饰画面：大面积红色和金色，祥云纹样，几何化的龙或凤图案，大胆的图形设计感。无文字。',
  'cny-shuimo': '中国新年水墨风格的装饰画面：宣纸质感底色，淡墨晕染的梅花枝干，几点朱砂红梅，远处隐约的山影。留白大方。无文字。',
  'feng-zikai': '童趣水墨风格：温暖的米白底色上，几笔简单的墨线画出一个圆头小孩和一只猫在树下，淡淡的粉色和琥珀色晕染，大量留白。无文字。',
  'laoshu': '民国文人水墨风格：宣纸底上一个穿长衫马褂的简笔小人站在一棵开满红花的树下，墨线极简，鲜红的花朵是唯一的彩色点缀，大量空白。无文字。',
  'lingnan': '岭南画派茶文化风格：工笔与写意结合，翠绿的茶园山丘，几朵精细的茶花，远处薄雾缭绕的山峦，色彩清新雅致。无文字。',
  'shuimo': '传统水墨画风格：黑白灰为主调的山水画，几笔浓墨画出近处松树，淡墨远山层层叠叠，一抹朱红点缀（印章或亭子），宣纸质感。无文字。',
  'xianer': '贤二小和尚卡通风格：温暖的奶油色背景上，一个可爱的光头小和尚穿着橙色僧袍，大眼睛，圆脸蛋，旁边有一只小猫，柔和温馨的配色。无文字。',
  'web': '现代网页设计风格：干净的浅蓝白渐变背景，几何形状的装饰元素，流畅的曲线，科技感与简约感并存，专业的数字设计美感。无文字。',
  'tshirt-artdeco': 'Art Deco T-shirt design style: geometric symmetrical patterns in gold and deep navy, elegant fan shapes, bold angular lines, 1920s glamour aesthetic. No text.',
  'tshirt-cubism': 'Cubist T-shirt design: fragmented geometric shapes forming a guitar and wine bottle, earth tones with bold blue and ochre accents, Picasso-inspired abstract composition. No text.',
  'tshirt-lautrec': 'Toulouse-Lautrec poster art style: a silhouette of a dancer with flowing fabric, bold flat colors in red and black, theatrical spotlight atmosphere, vintage cabaret feel. No text.',
  'tshirt-matisse': 'Matisse cut-out style: bold organic shapes in vibrant blue, coral, and green against white, dancing figure forms, joyful and free composition. No text.',
  'tshirt-moebius': 'Moebius / Ligne Claire illustration style: fine clean ink lines, a desert landscape with strange rock formations, subtle watercolor washes, sci-fi exploration mood. No text.',
  'tshirt-symbolism': 'Symbolist painting style: a dreamy moonlit garden scene, dark rich colors with gold highlights, mysterious ethereal atmosphere, pre-Raphaelite beauty. No text.',
  'tshirt-woodcut': 'Modern woodcut print style: bold black carved lines forming a mountain landscape with an eagle, strong contrast, handmade print texture, raw and graphic. No text.',
};

async function generatePreview(styleId, prompt) {
  const dir = path.join(PREVIEWS_DIR, styleId);
  fs.mkdirSync(dir, { recursive: true });
  const outFile = path.join(dir, 'card-preview.png');

  process.stderr.write(`[${styleId}] generating... `);
  try {
    const response = await openai.images.generate({
      model: 'gpt-image-2',
      prompt,
      n: 1,
      size: '1536x1024',
    });
    const b64 = response.data[0].b64_json;
    fs.writeFileSync(outFile, Buffer.from(b64, 'base64'));
    process.stderr.write(`OK (${Math.round(fs.statSync(outFile).size / 1024)}KB)\n`);
    return true;
  } catch (e) {
    process.stderr.write(`FAIL: ${e.message}\n`);
    return false;
  }
}

const entries = Object.entries(styles);
for (const [id, prompt] of entries) {
  const ok = await generatePreview(id, prompt);
  if (!ok) {
    process.stderr.write(`  retrying ${id}...\n`);
    await generatePreview(id, prompt);
  }
}
console.log('DONE');
