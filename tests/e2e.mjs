import { chromium } from 'playwright-core';
import fs from 'fs';

const BASE = 'https://cards.mofa.ai';
const SHOTS = '/tmp/e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // ── Gallery page ──
  console.log('\n📋 Gallery page');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${SHOTS}/01-gallery.png`, fullPage: true });

  await test('Page title contains 纸上', async () => {
    const title = await page.title();
    if (!title.includes('纸上')) throw new Error(`Got: ${title}`);
  });

  await test('Shows style cards', async () => {
    const cards = await page.locator('button:has(h3)').count();
    if (cards < 10) throw new Error(`Only ${cards} cards`);
  });

  await test('Category filters visible', async () => {
    const filters = await page.locator('nav button').count();
    if (filters < 4) throw new Error(`Only ${filters} filters`);
  });

  await test('Category filter works', async () => {
    await page.locator('nav button', { hasText: '水墨画韵' }).click();
    await page.waitForTimeout(300);
    const sections = await page.locator('section h2').count();
    if (sections !== 1) throw new Error(`Expected 1 section, got ${sections}`);
    await page.locator('nav button', { hasText: '全部' }).click();
    await page.waitForTimeout(300);
  });

  await test('Preview images load', async () => {
    const img = page.locator('button:has(h3) img').first();
    await img.waitFor({ state: 'visible', timeout: 10000 });
    const naturalWidth = await img.evaluate(el => el.naturalWidth);
    if (naturalWidth < 100) throw new Error(`Image too small: ${naturalWidth}px`);
  });

  // ── Studio page ──
  console.log('\n🎨 Studio page');
  await page.locator('button:has(h3)', { hasText: '童趣水墨' }).click();
  await page.waitForURL(/\/studio\//, { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/02-studio.png` });

  await test('Studio loads with style name', async () => {
    const header = await page.locator('h1').textContent();
    if (!header.includes('童趣水墨')) throw new Error(`Got: ${header}`);
  });

  await test('Variant picker visible', async () => {
    const variants = await page.locator('button:has(span.font-serif)').count();
    if (variants < 2) throw new Error(`Only ${variants} variants`);
  });

  await test('Flexibility modes visible', async () => {
    const modes = await page.locator('text=忠于风格').count();
    if (modes < 1) throw new Error('Flexibility modes missing');
  });

  await test('Generate button disabled when no prompt', async () => {
    const btn = page.locator('button', { hasText: '请先输入描述' });
    const disabled = await btn.isDisabled();
    if (!disabled) throw new Error('Button should be disabled');
  });

  await test('Type prompt enables generate button', async () => {
    await page.locator('textarea').first().fill('春天来了，小朋友在草地上放风筝');
    await page.waitForTimeout(200);
    const btn = page.locator('button', { hasText: '开始创作' });
    const disabled = await btn.isDisabled();
    if (disabled) throw new Error('Button should be enabled');
  });

  await test('Flexibility mode switch works', async () => {
    await page.locator('button', { hasText: '自由创作' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/03-creative-mode.png` });
    // Verify summary shows the mode
    const summary = await page.locator('text=自由创作').count();
    if (summary < 1) throw new Error('Creative mode not reflected');
  });

  await test('System prompt editor opens', async () => {
    await page.locator('button', { hasText: '高级：系统提示词' }).click();
    await page.waitForTimeout(300);
    const editor = page.locator('textarea').nth(1);
    const visible = await editor.isVisible();
    if (!visible) throw new Error('Prompt editor not visible');
    await page.screenshot({ path: `${SHOTS}/04-prompt-editor.png` });
  });

  await test('Reference image mode toggle visible', async () => {
    const inspire = await page.locator('button', { hasText: '作为灵感' }).count();
    const transform = await page.locator('button', { hasText: '风格转换' }).count();
    if (inspire < 1 || transform < 1) throw new Error('Ref mode toggles missing');
  });

  await test('Back button returns to gallery', async () => {
    await page.locator('button', { hasText: '画廊' }).click();
    await page.waitForTimeout(1000);
    const url = page.url();
    if (!url.endsWith('/') && !url.endsWith(':41722') && !url.endsWith('.ai')) throw new Error(`URL: ${url}`);
    const cards = await page.locator('button:has(h3)').count();
    if (cards < 5) throw new Error(`Only ${cards} cards`);
  });

  // ── Generation E2E (balanced mode) ──
  console.log('\n🖼️  Generation E2E (balanced)');
  await page.locator('button:has(h3)', { hasText: '民国文人水墨' }).click();
  await page.waitForURL(/\/studio\//, { timeout: 5000 });
  await page.waitForTimeout(500);

  await page.locator('textarea').first().fill('早日康复，窗外飘着小雨，桌上放着一杯热茶');
  // Default is balanced mode
  await page.locator('button', { hasText: '开始创作' }).click();
  await page.screenshot({ path: `${SHOTS}/05-generating.png` });

  await test('InkLoader appears', async () => {
    const loader = page.locator('text=研墨中');
    await loader.waitFor({ state: 'visible', timeout: 5000 });
  });

  await test('Card generates successfully', async () => {
    const img = page.locator('img[alt="Generated card"]');
    await img.waitFor({ state: 'visible', timeout: 180000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SHOTS}/06-result.png` });
  });

  await test('Download overlay appears on hover', async () => {
    const card = page.locator('.result-reveal');
    await card.hover();
    await page.waitForTimeout(300);
    const dl = page.locator('text=下载高清图');
    const visible = await dl.isVisible();
    if (!visible) throw new Error('Download button not visible on hover');
  });

  await test('Regenerate button works', async () => {
    await page.locator('button', { hasText: '再来一张' }).click();
    await page.waitForTimeout(300);
    const textarea = page.locator('textarea').first();
    const visible = await textarea.isVisible();
    if (!visible) throw new Error('Workspace not restored');
  });

  // ── Generation E2E (creative mode) ──
  console.log('\n✨ Generation E2E (creative)');
  await page.locator('button', { hasText: '自由创作' }).click();
  await page.locator('textarea').first().fill('一只橘猫坐在窗台上看雪，窗外是北方的冬天');
  await page.locator('button', { hasText: '开始创作' }).click();

  await test('Creative card generates', async () => {
    const img = page.locator('img[alt="Generated card"]');
    await img.waitFor({ state: 'visible', timeout: 180000 });
    await page.screenshot({ path: `${SHOTS}/07-creative-result.png` });
  });

  // ── Summary ──
  await browser.close();
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ✅ ${passed} passed  ❌ ${failed} failed`);
  console.log(`  Screenshots: ${SHOTS}/`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
