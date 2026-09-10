import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { createServer } from "vite";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultOutputDirectory = path.join(packageRoot, "exports");

function printHelp() {
  process.stdout.write(`
Exporta as composições visuais do Jaci UI em WebP.

Uso:
  npm run export:gallery -- [opções]

Opções:
  --out <diretório>       Diretório de saída (padrão: packages/ui/exports)
  --scene <ids>           IDs separados por vírgula (padrão: todas)
  --theme <tema>          light, dark ou all (padrão: all)
  --quality <1-100>       Qualidade do WebP (padrão: 92; 100 é lossless)
  --scale <número>        Escala de pixels do navegador (padrão: 2)
  --list                  Lista as cenas disponíveis sem exportar
  --help                  Exibe esta ajuda

Exemplo:
  npm run export:gallery -- --scene actions,cards --theme dark --out ./portfolio
`);
}

function readOption(args, name) {
  const directIndex = args.indexOf(name);
  if (directIndex >= 0) return args[directIndex + 1];

  const prefix = `${name}=`;
  const inlineOption = args.find(argument => argument.startsWith(prefix));
  return inlineOption?.slice(prefix.length);
}

function parseNumber(value, fallback, { min, max, label }) {
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} deve ser um número entre ${min} e ${max}.`);
  }

  return parsed;
}

function resolveServerUrl(server) {
  const resolvedUrl = server.resolvedUrls?.local[0];
  if (resolvedUrl) return resolvedUrl;

  const address = server.httpServer?.address();
  if (address && typeof address !== "string") {
    return `http://127.0.0.1:${address.port}/`;
  }

  throw new Error("Não foi possível determinar a URL da galeria.");
}

async function waitForStableCanvas(page, sceneId) {
  await page.locator(`[data-capture-ready="${sceneId}"]`).waitFor({
    state: "visible",
  });

  return page.evaluate(async () => {
    const fontStylesheet = document.querySelector("[data-gallery-fonts]");
    if (
      fontStylesheet instanceof HTMLLinkElement &&
      !fontStylesheet.dataset.loaded
    ) {
      await Promise.race([
        new Promise(resolve => {
          fontStylesheet.addEventListener("load", resolve, { once: true });
          fontStylesheet.addEventListener("error", resolve, { once: true });
        }),
        new Promise(resolve => setTimeout(resolve, 10_000)),
      ]);
    }

    await document.fonts.ready;
    await new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });

    return fontStylesheet?.dataset.loaded === "true";
  });
}

async function readGallery(page, baseUrl) {
  await page.goto(new URL("visual/", baseUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => Array.isArray(window.__JACI_GALLERY__));
  return page.evaluate(() => window.__JACI_GALLERY__);
}

function observePage(page) {
  page.on("pageerror", error => {
    process.stderr.write(`Erro na vitrine: ${error.message}\n`);
  });
  page.on("console", message => {
    if (message.type() === "error") {
      process.stderr.write(`Console da vitrine: ${message.text()}\n`);
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    printHelp();
    return;
  }

  const outputDirectory = path.resolve(
    packageRoot,
    readOption(args, "--out") ?? defaultOutputDirectory,
  );
  const requestedSceneIds = new Set(
    (readOption(args, "--scene") ?? "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean),
  );
  const requestedTheme = readOption(args, "--theme") ?? "all";
  const quality = parseNumber(readOption(args, "--quality"), 92, {
    min: 1,
    max: 100,
    label: "quality",
  });
  const deviceScaleFactor = parseNumber(readOption(args, "--scale"), 2, {
    min: 1,
    max: 3,
    label: "scale",
  });

  if (!["light", "dark", "all"].includes(requestedTheme)) {
    throw new Error("theme deve ser light, dark ou all.");
  }

  const server = await createServer({
    configFile: path.join(packageRoot, "visual/vite.config.ts"),
    configLoader: "runner",
    logLevel: "error",
    server: {
      host: "127.0.0.1",
      port: 4177,
      strictPort: false,
    },
  });

  let browser;

  try {
    await server.listen();
    const baseUrl = resolveServerUrl(server);
    browser = await chromium.launch();
    const context = await browser.newContext({
      deviceScaleFactor,
      reducedMotion: "reduce",
      viewport: { width: 1200, height: 900 },
    });
    const indexPage = await context.newPage();
    observePage(indexPage);
    const gallery = await readGallery(indexPage, baseUrl);
    let warnedAboutFonts = false;

    if (args.includes("--list")) {
      for (const scene of gallery) {
        process.stdout.write(
          `${scene.id.padEnd(14)} ${scene.title} (${scene.themes.join(", ")})\n`,
        );
      }
      return;
    }

    await indexPage.close();

    const availableIds = new Set(gallery.map(scene => scene.id));
    const unknownIds = [...requestedSceneIds].filter(id => !availableIds.has(id));
    if (unknownIds.length > 0) {
      throw new Error(`Cenas não encontradas: ${unknownIds.join(", ")}.`);
    }

    const selectedScenes = gallery.filter(
      scene => requestedSceneIds.size === 0 || requestedSceneIds.has(scene.id),
    );

    await mkdir(outputDirectory, { recursive: true });
    const files = [];

    for (const scene of selectedScenes) {
      const themes =
        requestedTheme === "all"
          ? scene.themes
          : scene.themes.filter(theme => theme === requestedTheme);

      for (const theme of themes) {
        const page = await context.newPage();
        observePage(page);
        try {
          await page.setViewportSize(scene.viewport);

          const sceneUrl = new URL("visual/", baseUrl);
          sceneUrl.searchParams.set("scene", scene.id);
          sceneUrl.searchParams.set("theme", theme);

          await page.goto(sceneUrl.toString(), { waitUntil: "domcontentloaded" });
          const fontsLoaded = await waitForStableCanvas(page, scene.id);
          if (!fontsLoaded && !warnedAboutFonts) {
            process.stderr.write(
              "Aviso: Google Fonts não respondeu; as capturas usarão a fonte de fallback.\n",
            );
            warnedAboutFonts = true;
          }

          const filename = `${scene.id}--${theme}.webp`;
          const outputPath = path.join(outputDirectory, filename);

          await page.screenshot({
            path: outputPath,
            type: "webp",
            quality,
            animations: "disabled",
            caret: "hide",
            fullPage: false,
            scale: "device",
          });

          files.push({
            file: filename,
            scene: scene.id,
            title: scene.title,
            description: scene.description,
            theme,
            width: scene.viewport.width * deviceScaleFactor,
            height: scene.viewport.height * deviceScaleFactor,
          });
          process.stdout.write(`✓ ${filename}\n`);
        } catch (error) {
          const pageState = await page.locator("body").innerText().catch(() => "");
          process.stderr.write(
            `Falha ao montar ${scene.id} em ${page.url()}. Conteúdo: ${pageState.slice(0, 240)}\n`,
          );
          throw error;
        } finally {
          await page.close();
        }
      }
    }

    if (files.length === 0) {
      throw new Error("Nenhuma combinação de cena e tema foi selecionada.");
    }

    const manifest = {
      generatedAt: new Date().toISOString(),
      format: "webp",
      quality,
      deviceScaleFactor,
      files,
    };

    await writeFile(
      path.join(outputDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    const imageLabel = files.length === 1 ? "imagem exportada" : "imagens exportadas";
    process.stdout.write(
      `\n${files.length} ${imageLabel} para ${outputDirectory}\n`,
    );
  } finally {
    await browser?.close();
    await server.close();
  }
}

main().catch(error => {
  let message = error instanceof Error ? error.message : String(error);
  if (message.includes("Executable doesn't exist")) {
    message += "\nExecute `npx playwright install chromium` e tente novamente.";
  }
  process.stderr.write(`Falha ao exportar a galeria: ${message}\n`);
  process.exitCode = 1;
});
