import { chromium } from 'playwright-core';
import fs from 'fs';

const BASE = 'https://cards.mofa.ai';
const SHOTS = '/tmp/e2e-shots';
const CODE = 'mofa2026';
fs.mkdirSync(SHOTS, { recursive: true });

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message.split('\n')[0]}`);
    failed++;
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // ── 1. Auth Gate ──
  console.log('\n🔐 认证流程');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${SHOTS}/01-auth.png` });

  await test('显示访问码输入页', async () => {
    await page.locator('input[type="password"]').waitFor({ state: 'visible', timeout: 5000 });
  });

  await test('错误码提示', async () => {
    await page.locator('input[type="password"]').fill('wrong');
    await page.locator('button[type="submit"]').click();
    await page.locator('text=访问码错误').waitFor({ state: 'visible', timeout: 5000 });
  });

  await test('正确码进入画廊', async () => {
    await page.locator('input[type="password"]').fill(CODE);
    await page.locator('button[type="submit"]').click();
    await page.locator('text=纸上').first().waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SHOTS}/02-gallery.png` });
  });

  // ── 2. Gallery ──
  console.log('\n📋 画廊页面');

  await test('风格卡片显示', async () => {
    // Wait for styles API to return and render
    await page.locator('button:has(h3)').first().waitFor({ state: 'visible', timeout: 20000 });
    const cards = await page.locator('button:has(h3)').count();
    if (cards < 10) throw new Error(`Only ${cards} cards`);
  });

  await test('预览图加载', async () => {
    const img = page.locator('button:has(h3) img').first();
    await img.waitFor({ state: 'visible', timeout: 10000 });
  });

  await test('分类筛选', async () => {
    await page.locator('nav button', { hasText: '节庆贺卡' }).click();
    await page.waitForTimeout(500);
    await page.locator('nav button', { hasText: '全部' }).click();
    await page.waitForTimeout(300);
  });

  await test('历史按钮可见', async () => {
    const btn = page.locator('button', { hasText: '历史' });
    await btn.waitFor({ state: 'visible', timeout: 3000 });
  });

  await test('历史抽屉打开/关闭', async () => {
    await page.locator('button', { hasText: '历史' }).click();
    await page.locator('text=创作历史').waitFor({ state: 'visible', timeout: 3000 });
    await page.screenshot({ path: `${SHOTS}/03-history.png` });
    await page.locator('.fixed.inset-0 .absolute.inset-0').click();
    await page.waitForTimeout(300);
  });

  // ── 3. Studio ──
  console.log('\n🎨 工作台页面');
  await page.locator('button:has(h3)', { hasText: '贤二漫画' }).click();
  await page.waitForURL(/\/studio\//, { timeout: 5000 });

  await test('工作台加载', async () => {
    // Studio fetches styles, finds the matching one, then renders — this can take time over CF Tunnel
    await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.screenshot({ path: `${SHOTS}/04-studio.png` });
  });

  await test('变体选择器', async () => {
    const btns = page.locator('button', { hasText: /正面|祝语|场景|封面|标准/ });
    await btns.first().waitFor({ state: 'visible', timeout: 5000 });
    const count = await btns.count();
    if (count < 2) throw new Error(`Only ${count} variant buttons`);
  });

  await test('创作模式切换', async () => {
    await page.locator('button', { hasText: '自由创作' }).click();
    await page.waitForTimeout(200);
    await page.locator('button', { hasText: '平衡' }).click();
    await page.waitForTimeout(200);
  });

  await test('系统提示词编辑器', async () => {
    await page.locator('button', { hasText: '高级：系统提示词' }).click();
    await page.waitForTimeout(300);
    const editors = await page.locator('textarea').count();
    if (editors < 2) throw new Error('Prompt editor not visible');
    await page.locator('button', { hasText: '高级：系统提示词' }).click();
  });

  await test('参考图模式切换', async () => {
    const inspire = await page.locator('button', { hasText: '作为灵感' }).count();
    const transform = await page.locator('button', { hasText: '风格转换' }).count();
    if (inspire < 1 || transform < 1) throw new Error('Ref mode toggles missing');
  });

  await test('空 prompt 禁用按钮', async () => {
    const btn = page.locator('button', { hasText: '请先输入描述' });
    if (!await btn.isDisabled()) throw new Error('Should be disabled');
  });

  // ── 4. Generation with Queue ──
  console.log('\n🖼️  异步生成（队列）');

  await page.locator('textarea').first().fill('小和尚在冬天的竹林里打坐，雪花飘落');
  await page.screenshot({ path: `${SHOTS}/05-ready.png` });

  await test('提交生成（立即返回）', async () => {
    const btn = page.locator('button', { hasText: '开始创作' });
    if (await btn.isDisabled()) throw new Error('Button should be enabled');
    await btn.click();
    // Should show ink loader immediately without waiting for HTTP response
    await page.locator('text=研墨中').waitFor({ state: 'visible', timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/06-generating.png` });
  });

  await test('生成完成', async () => {
    const img = page.locator('img[alt="Generated card"]');
    await img.waitFor({ state: 'visible', timeout: 180000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SHOTS}/07-result.png` });
  });

  await test('下载按钮', async () => {
    const card = page.locator('.result-reveal');
    await card.hover();
    await page.waitForTimeout(300);
    const dl = page.locator('text=下载高清图');
    if (!await dl.isVisible()) throw new Error('Download button not visible');
  });

  // ── 5. Prompt Preservation ──
  console.log('\n🔄 上下文保留');

  await test('再来一张保留 prompt', async () => {
    await page.locator('button', { hasText: '再来一张' }).click();
    await page.waitForTimeout(500);
    const textarea = page.locator('textarea').first();
    const value = await textarea.inputValue();
    if (!value.includes('竹林')) throw new Error(`Prompt not preserved: ${value}`);
  });

  // ── 6. History ──
  console.log('\n📜 历史记录');

  await test('返回画廊', async () => {
    await page.locator('button', { hasText: '画廊' }).click();
    await page.waitForTimeout(1000);
  });

  await test('历史中有刚才的记录', async () => {
    await page.locator('button', { hasText: '历史' }).click();
    await page.waitForTimeout(500);
    const historyItem = page.locator('text=贤二漫画').last();
    await historyItem.waitFor({ state: 'visible', timeout: 3000 });
    await page.screenshot({ path: `${SHOTS}/08-history-with-item.png` });
  });

  await test('点击历史恢复上下文', async () => {
    // Click the history item (the one with truncated prompt text)
    const items = page.locator('.fixed .cursor-pointer');
    await items.first().waitFor({ timeout: 8000 });
    await items.first().click();
    // Wait for Studio to load after navigation
    await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30000 });
    const value = await page.locator('textarea').first().inputValue();
    if (!value.includes('竹林')) throw new Error(`Prompt not restored: "${value}"`);
    await page.screenshot({ path: `${SHOTS}/09-restored.png` });
  });

  // ── Summary ──
  await browser.close();
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ✅ ${passed} passed  ❌ ${failed} failed`);
  console.log(`  Screenshots: ${SHOTS}/`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
