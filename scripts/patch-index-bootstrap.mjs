import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

const rootDir = process.cwd();
const indexHtmlPath = path.join(rootDir, "dist", "index.html");

function createBootstrapRetryLoader(entryPath) {
  return `  <script>
    (() => {
      const APP_ENTRY_URL = ${JSON.stringify(entryPath)};
      const APP_BOOTSTRAP_RETRY_DELAYS_MS = [2000, 5000, 10000, 30000, 60000];
      const RETRYABLE_BOOTSTRAP_ERROR_PATTERN = /(Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|module script)/i;
      const retryParamName = "app-bootstrap-retry";
      const retryReasonParamName = "app-bootstrap-reason";
      const statusElement = document.getElementById("startup-splash-status");
      const actionsElement = document.getElementById("startup-splash-actions");
      const reloadButton = document.getElementById("startup-splash-reload");

      function showSplashStatus(message, options) {
        const showActions = Boolean(options && options.showActions);
        document.body.classList.add("splash-rich");
        if (statusElement) {
          statusElement.textContent = message;
          statusElement.setAttribute("data-visible", "true");
        }
        if (actionsElement) {
          actionsElement.setAttribute("data-visible", showActions ? "true" : "false");
        }
      }

      function hideSplashStatus() {
        if (statusElement) {
          statusElement.textContent = "";
          statusElement.setAttribute("data-visible", "false");
        }
        if (actionsElement) {
          actionsElement.setAttribute("data-visible", "false");
        }
      }

      function readRetryAttempt(url) {
        const raw = Number.parseInt(url.searchParams.get(retryParamName) || "0", 10);
        return Number.isFinite(raw) && raw > 0 ? raw : 0;
      }

      function buildRetryUrl(nextAttempt, reason) {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set(retryParamName, String(nextAttempt));
        nextUrl.searchParams.set(retryReasonParamName, reason);
        return nextUrl.toString();
      }

      function clearRetryParams() {
        try {
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete(retryParamName);
          cleanUrl.searchParams.delete(retryReasonParamName);
          window.history.replaceState(window.history.state, "", cleanUrl.toString());
        } catch {
          // Ignore URL/history cleanup failures.
        }
      }

      function isRetryableBootstrapError(error) {
        if (error instanceof Event) {
          const target = error.target;
          if (target && typeof target === "object") {
            const scriptSource = typeof target.src === "string" ? target.src : "";
            return scriptSource.includes("/assets/") || scriptSource.includes("/src/main.ts");
          }
        }

        const message = error instanceof Error
          ? \`\${error.name}: \${error.message}\`
          : String(error || "");
        return RETRYABLE_BOOTSTRAP_ERROR_PATTERN.test(message);
      }

      const currentUrl = new URL(window.location.href);
      const currentRetryAttempt = readRetryAttempt(currentUrl);
      const isUpdatedRefresh = currentUrl.searchParams.has("app-updated");

      if (isUpdatedRefresh || currentRetryAttempt > 0) {
        showSplashStatus(
          currentRetryAttempt > 0
            ? \`Finishing the update. Startup retry \${currentRetryAttempt} is in progress...\`
            : "Finishing the latest app update..."
        );
      }

      if (reloadButton) {
        reloadButton.addEventListener("click", () => {
          window.location.replace(buildRetryUrl(currentRetryAttempt + 1, "manual"));
        });
      }

      import(APP_ENTRY_URL)
        .then(() => {
          hideSplashStatus();
          clearRetryParams();
        })
        .catch((error) => {
          const retryable = isRetryableBootstrapError(error);
          if (!retryable) {
            showSplashStatus("The app hit a startup error. Reload the page to try again.", { showActions: true });
            console.error("[bootstrap] Non-retryable startup error.", error);
            return;
          }

          const nextDelayMs = APP_BOOTSTRAP_RETRY_DELAYS_MS[currentRetryAttempt];
          if (typeof nextDelayMs !== "number") {
            showSplashStatus("The latest update is still unavailable. Please reload in a moment.", { showActions: true });
            console.error("[bootstrap] Exhausted startup retries after module load failure.", error);
            return;
          }

          const nextAttempt = currentRetryAttempt + 1;
          const retryUrl = buildRetryUrl(nextAttempt, "module-load");
          const nextDelaySeconds = Math.round(nextDelayMs / 1000);
          showSplashStatus(\`The latest update is still loading. Retrying in \${nextDelaySeconds}s...\`, { showActions: true });
          console.warn(\`[bootstrap] Module load failed. Retrying app startup in \${nextDelaySeconds}s (attempt \${nextAttempt}).\`, error);
          window.setTimeout(() => {
            window.location.replace(retryUrl);
          }, nextDelayMs);
        });
    })();
  </script>`;
}

const htmlSource = await readFile(indexHtmlPath, "utf8");
const entryScriptMatch = htmlSource.match(/  <script type="module" crossorigin src="(\.\/assets\/[^"]+\.js)"><\/script>\r?\n/);

if (!entryScriptMatch) {
  throw new Error(`Could not find the built entry script tag in ${indexHtmlPath}.`);
}

const [, entryPath] = entryScriptMatch;
const loaderScript = createBootstrapRetryLoader(entryPath);
const googleScriptTag = '  <script src="https://accounts.google.com/gsi/client" async defer></script>';

let nextHtml = htmlSource.replace(entryScriptMatch[0], "");

if (nextHtml.includes(googleScriptTag)) {
  nextHtml = nextHtml.replace(googleScriptTag, `${loaderScript}\n${googleScriptTag}`);
} else {
  nextHtml = nextHtml.replace("</body>", `${loaderScript}\n</body>`);
}

await writeFile(indexHtmlPath, nextHtml, "utf8");
