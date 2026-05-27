#!/usr/bin/env node
// 3-cycle leak test: rapid open→navigate→screenshot→close cycles
import { chromium } from 'playwright';

const URL = 'http://localhost:5173';
const CYCLES = 3;

async function cycle(n) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
  
  // Check game loaded
  const state = await page.evaluate(() => {
    return {
      canvasCount: document.querySelectorAll('canvas').length,
      gameLoaded: typeof window !== 'undefined' && typeof GALAXY_CONFIG !== 'undefined',
      title: document.title
    };
  });
  
  // Enable debug + start game + jump to LV5
  await page.evaluate(() => { GALAXY_CONFIG.debug.showLevelSkipButton = true; });
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 1500));
  const gameState = await page.evaluate(() => {
    try {
      if (window.__GR_DEBUG_JUMP_TO_LEVEL) {
        window.__GR_DEBUG_JUMP_TO_LEVEL(5);
        return { jumped: 'LV5', level: typeof level !== 'undefined' ? level : '?' };
      }
      return { jumped: false };
    } catch(e) { return { error: e.message }; }
  });
  await new Promise(r => setTimeout(r, 1000));
  
  await browser.close();
  return { cycle: n, canvasCount: state.canvasCount, gameLoaded: state.gameLoaded, title: state.title, gameState, pageErrors: errors.length, errors };
}

console.log(`Running ${CYCLES} consecutive cycles...`);
const results = [];
for (let i = 1; i <= CYCLES; i++) {
  const r = await cycle(i);
  results.push(r);
  console.log(`  Cycle ${i}: canvas=${r.canvasCount}, game=${r.gameLoaded}, title="${r.title}", state=${JSON.stringify(r.gameState)}, errors=${r.pageErrors}`);
}
console.log(`\nAll ${CYCLES} cycles complete. ${results.filter(r => r.pageErrors === 0).length}/${CYCLES} error-free.`);
