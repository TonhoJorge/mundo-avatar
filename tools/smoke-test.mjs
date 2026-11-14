#!/usr/bin/env node
// Teste de fumaça no navegador real (Chromium via Playwright, só em desenvolvimento).
//   npm run build && npx vite preview --port 4173 &
//   node tools/smoke-test.mjs [url] [pasta-de-capturas]
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.argv[2] ?? 'http://localhost:4173/';
const shots = process.argv[3];
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  page.on('pageerror', (e) => problems.push(`erro de página: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });

  await page.goto(url);
  await page.waitForSelector('body[data-pronto="1"]', { timeout: 90000 });
  if (shots) await page.screenshot({ path: `${shots}/1-inicio.png` });

  await page.fill('#busca', 'ba sing');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#painel:not([hidden]) h2');
  check((await page.textContent('#painel h2')) === 'Ba Sing Se', 'busca não abriu Ba Sing Se');

  await page.click('.eras button[data-era="havens"]');
  await page.waitForTimeout(2500);
  check((await page.textContent('#painel h2')) === 'Nova Ba Sing Se', 'troca de era não atualizou o painel');
  check(page.url().includes('era=havens') && page.url().includes('lugar=ba-sing-se'), `URL sem estado: ${page.url()}`);
  if (shots) await page.screenshot({ path: `${shots}/2-havens.png` });

  await page.click('#btn-era');
  check((await page.textContent('#painel h2')) === 'Era de Pavi e Nisha', 'painel da era não abriu');
  await page.click('#btn-camadas');
  await page.check('#camadas input[name="clouds"]');
  await page.click('.eras button[data-era="korra"]');
  await page.waitForTimeout(2500);
  if (shots) await page.screenshot({ path: `${shots}/3-korra-nuvens.png` });
  await page.click('#btn-camadas'); // o menu fecha ao clicar fora dele
  await page.uncheck('#camadas input[name="clouds"]');
  await page.check('#camadas input[name="editor"]');
  await page.waitForSelector('.editor', { timeout: 10000 });
  await page.uncheck('#camadas input[name="editor"]');
  check((await page.$('.editor')) === null, 'editor não fechou');
  await page.keyboard.press('Escape');

  // celular
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  phone.on('pageerror', (e) => problems.push(`erro de página (celular): ${e.message}`));
  await phone.goto(`${url.split('?')[0].split('#')[0]}?era=korra&lugar=cidade-republica`);
  await phone.waitForSelector('body[data-pronto="1"]', { timeout: 90000 });
  check((await phone.textContent('#painel h2')) === 'Cidade República', 'link direto não abriu o lugar');
  await phone.waitForTimeout(3000);
  if (shots) await phone.screenshot({ path: `${shots}/4-celular.png` });
} finally {
  await browser.close();
}

if (problems.length) {
  console.error(`FALHOU (${problems.length}):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('Teste de fumaça: tudo certo.');
