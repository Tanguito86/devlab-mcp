import { chromium, type Browser, type BrowserContext, type Page, type ConsoleMessage } from "playwright";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

export type BrowserSessionOptions = {
  headless?: boolean;
  viewport?: { width: number; height: number };
  userDataDir?: string;
};

export type BrowserState = {
  url: string;
  title: string;
  consoleLogs: string[];
  pageErrors: string[];
};

export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private consoleLogs: string[] = [];
  private pageErrors: string[] = [];
  private evidenceDir: string;
  private headless: boolean;

  constructor(evidenceDir: string, options: BrowserSessionOptions = {}) {
    this.evidenceDir = evidenceDir;
    this.headless = options.headless !== false;
  }

  get isOpen(): boolean {
    return this.browser !== null && this.page !== null;
  }

  getPage(): Page {
    if (!this.page) throw new Error("Browser not open. Call open() first.");
    return this.page;
  }

  async open(options: BrowserSessionOptions = {}): Promise<void> {
    if (this.browser) await this.close();

    this.headless = options.headless !== false;
    const viewport = options.viewport ?? { width: 1280, height: 720 };

    // WSL requires full Chromium (headless shell misses shared libs).
    // Use the full browser binary which has all deps resolved.
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      undefined;

    this.browser = await chromium.launch({
      headless: this.headless,
      ...(executablePath ? { executablePath } : {})
    });

    this.context = await this.browser.newContext({
      viewport
    });

    this.page = await this.context.newPage();
    this.consoleLogs = [];
    this.pageErrors = [];

    // Capture console messages
    this.page.on("console", (msg: ConsoleMessage) => {
      const text = `[${msg.type()}] ${msg.text()}`;
      this.consoleLogs.push(text);
    });

    // Capture page errors
    this.page.on("pageerror", (error: Error) => {
      this.pageErrors.push(error.message);
    });

    await mkdir(this.evidenceDir, { recursive: true });
  }

  async navigate(url: string): Promise<void> {
    const page = this.getPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  }

  async screenshot(name: string): Promise<string> {
    const page = this.getPage();
    const filePath = path.join(this.evidenceDir, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    return filePath;
  }

  async screenshotElement(selector: string, name: string): Promise<string> {
    const page = this.getPage();
    const element = await page.$(selector);
    if (!element) throw new Error(`Element not found: ${selector}`);
    const filePath = path.join(this.evidenceDir, `${name}.png`);
    await element.screenshot({ path: filePath });
    return filePath;
  }

  async click(x: number, y: number): Promise<void> {
    const page = this.getPage();
    await page.mouse.click(x, y);
  }

  async clickText(text: string): Promise<void> {
    const page = this.getPage();
    await page.getByText(text).first().click({ timeout: 5000 });
  }

  async clickPercent(xPct: number, yPct: number): Promise<void> {
    const page = this.getPage();
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("No viewport size available");
    await page.mouse.click(
      Math.round(viewport.width * xPct / 100),
      Math.round(viewport.height * yPct / 100)
    );
  }

  async pressKey(key: string): Promise<void> {
    const page = this.getPage();
    await page.keyboard.press(key);
  }

  async typeText(text: string): Promise<void> {
    const page = this.getPage();
    await page.keyboard.type(text);
  }

  async evaluateJs<T>(expression: string): Promise<T> {
    const page = this.getPage();
    return page.evaluate(expression) as Promise<T>;
  }

  async wait(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async waitForSelector(selector: string, timeoutMs: number = 10000): Promise<void> {
    const page = this.getPage();
    await page.waitForSelector(selector, { timeout: timeoutMs });
  }

  async waitForCanvasChange(selector: string, timeoutMs: number = 10000): Promise<string> {
    const page = this.getPage();
    const canvas = await page.$(selector);
    if (!canvas) throw new Error(`Canvas not found: ${selector}`);

    // Take initial snapshot via toDataURL
    const before = await page.evaluate((sel: string) => {
      const c = document.querySelector(sel) as HTMLCanvasElement | null;
      return c ? c.toDataURL() : null;
    }, selector);

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const after = await page.evaluate((sel: string) => {
        const c = document.querySelector(sel) as HTMLCanvasElement | null;
        return c ? c.toDataURL() : null;
      }, selector);
      if (after !== before) {
        return after!;
      }
    }

    throw new Error(`Canvas did not change within ${timeoutMs}ms`);
  }

  async captureFps(): Promise<number | null> {
    const page = this.getPage();
    try {
      const fps = await page.evaluate(() => {
        // Check common FPS counter patterns in game code
        const fpsEl = document.getElementById("fps-counter") ?? document.querySelector(".fps");
        if (fpsEl) return parseInt(fpsEl.textContent ?? "0", 10);

        // Try window.__fps or similar
        const w = (window as unknown) as Record<string, unknown>;
        if (typeof w.__fps === "number") return w.__fps as number;
        if (typeof w.fpsCounter === "number") return w.fpsCounter as number;

        return null;
      });
      return typeof fps === "number" ? fps : null;
    } catch {
      return null;
    }
  }

  async getConsoleLogs(): Promise<string[]> {
    return [...this.consoleLogs];
  }

  async getPageErrors(): Promise<string[]> {
    return [...this.pageErrors];
  }

  async recordTrace(durationSec: number, outputName: string): Promise<string> {
    const page = this.getPage();
    const filePath = path.join(this.evidenceDir, `${outputName}.png`);
    const frames: Buffer[] = [];

    const deadline = Date.now() + durationSec * 1000;
    while (Date.now() < deadline) {
      const screenshot = await page.screenshot({ type: "png" });
      frames.push(screenshot);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Save as a grid/strip for simplicity — Playwright trace would need zip
    // We save the first frame as the named screenshot, plus metadata
    if (frames.length > 0) {
      await writeFile(filePath, frames[0]);
    }

    const metaPath = path.join(this.evidenceDir, `${outputName}-meta.json`);
    await writeFile(
      metaPath,
      JSON.stringify({
        frames: frames.length,
        durationSec,
        intervalMs: 100,
        savedFrame: filePath
      }, null, 2),
      "utf8"
    );

    return filePath;
  }

  async getState(): Promise<BrowserState> {
    const page = this.getPage();
    return {
      url: page.url(),
      title: await page.title(),
      consoleLogs: [...this.consoleLogs],
      pageErrors: [...this.pageErrors]
    };
  }

  async close(): Promise<void> {
    if (this.page) {
      try { await this.page.close(); } catch { /* ignore */ }
      this.page = null;
    }
    if (this.context) {
      try { await this.context.close(); } catch { /* ignore */ }
      this.context = null;
    }
    if (this.browser) {
      try { await this.browser.close(); } catch { /* ignore */ }
      this.browser = null;
    }
  }
}
