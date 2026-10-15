/**
 * Browser entry point: coordinates the editor, settings dialog, and review panel.
 * core.js owns request/validation logic; this module owns DOM updates and state.
 * Only connection settings are persisted. Contract and review text stay in memory
 * unless the user explicitly downloads a review.
 */
import {
  DEFAULT_SETTINGS,
  normalizeServer,
  buildReviewRequest,
  requestJSON,
  parseModels,
  parseReview,
} from "./core.js";
// All IDs refer to elements in index.html; the module script runs after parsing.
const $ = (id) => document.getElementById(id);
// Version the key so a future settings format can migrate independently.
const STORAGE_KEY = "contract-pal.settings.v1";
let settings = { ...DEFAULT_SETTINGS };
// Treat saved settings as untrusted input. Invalid JSON, invalid server values,
// or blocked browser storage leave the usable defaults in place.
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (saved) {
    const server = normalizeServer(saved.host, saved.port);
    settings = {
      host: server.host,
      port: server.port,
      model: typeof saved.model === "string" ? saved.model : "",
    };
  }
} catch {
  /* Storage may be unavailable or contain invalid settings. */
}
// Controllers identify active requests and allow cancellation. loadedServer ties
// the model list to the server that returned it, preventing cross-server reuse.
// reviewedContract is the exact input snapshot used to detect an outdated review.
let reviewController,
  modelsController,
  connectionTestController,
  loadedServer = "",
  reviewText = "",
  reviewedContract = "",
  toastTimer;
/** Show one temporary status message; a newer message replaces its timer. */
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 4000);
}
/** Set an error region safely; an empty message hides it. */
function showError(id, message) {
  $(id).textContent = message;
  $(id).hidden = !message;
}
/** Reflect saved configuration, without implying that the server is reachable. */
function updateConnection() {
  const { baseUrl } = normalizeServer(settings.host, settings.port);
  $("server-label").textContent = new URL(baseUrl).host;
  $("model-status").textContent = settings.model
    ? `Model: ${settings.model}`
    : "No model selected";
  $("connection-dot").classList.toggle("configured", Boolean(settings.model));
  $("connection-dot").title = settings.model
    ? "Model configured; connection is checked when used"
    : "Choose a model to get started";
}
/** Recompute counts, action availability, and whether the visible review is stale. */
function updateEditor() {
  const text = $("contract").value.trim();
  $("word-count").textContent =
    `${text ? text.split(/\s+/u).length.toLocaleString() : 0} words · ${$("contract").value.length.toLocaleString()} characters`;
  $("analyze-button").disabled = !text || Boolean(reviewController);
  $("clear-button").disabled = !text || Boolean(reviewController);
  $("stale-notice").hidden =
    !reviewText || $("contract").value === reviewedContract;
}
/**
 * Keep loading, empty, and result states mutually consistent during a review.
 * Lock input/settings so the submitted document and model cannot change mid-flight;
 * cancellation remains available and aria-busy describes the pending update.
 */
function setBusy(busy) {
  $("review-loading").hidden = !busy;
  $("review-empty").hidden = busy || Boolean(reviewText);
  $("review-result").hidden = busy || !reviewText;
  document
    .querySelector(".review-panel")
    .setAttribute("aria-busy", String(busy));
  $("review-badge").textContent = busy
    ? "REVIEW IN PROGRESS"
    : reviewText
      ? "REVIEW COMPLETE"
      : "READY WHEN YOU ARE";
  $("analyze-button").hidden = busy;
  $("cancel-button").hidden = !busy;
  $("contract").readOnly = busy;
  $("sample-button").disabled = busy;
  $("settings-button").disabled = busy;
  $("select-model-main").disabled = busy;
  updateEditor();
}
/**
 * Start a fresh settings draft from the committed settings. Closing without Save
 * discards field edits. The main Select Model button also starts model discovery.
 */
function openSettings(load = false) {
  resetConnectionTest();
  $("server-host").value = settings.host;
  $("server-port").value = settings.port;
  $("app-origin").textContent = location.origin;
  $("model-select").replaceChildren(
    new Option(
      settings.model || "Connect to load available models",
      settings.model,
    ),
  );
  $("model-select").disabled = true;
  $("settings-status").textContent =
    "Models are loaded from your server’s /v1/models endpoint.";
  loadedServer = "";
  showError("settings-error", "");
  $("settings-dialog").showModal();
  if (load) loadModels();
}
/** Abort a discovery request and relinquish its ownership of the dialog state. */
function cancelModels() {
  modelsController?.abort();
  modelsController = undefined;
}
/**
 * Clear the last connection result when its draft server changes or the dialog
 * closes. Releasing ownership prevents an old response from updating a new draft.
 */
function resetConnectionTest() {
  connectionTestController?.abort();
  connectionTestController = undefined;
  $("test-connection").disabled = false;
  $("test-connection").textContent = "Test Connection";
  $("connection-test-status").dataset.state = "idle";
  $("connection-test-status").textContent =
    "Check that your server is reachable before choosing a model.";
}

/**
 * Probe the draft address with OpenAI-compatible model discovery. A valid empty
 * list still means the server is reachable; no model is selected or settings saved.
 * This checks API connectivity, not whether a model can successfully run inference.
 */
async function testConnection() {
  resetConnectionTest();
  const status = $("connection-test-status");
  let server;
  try {
    server = normalizeServer($("server-host").value, $("server-port").value);
  } catch (error) {
    status.dataset.state = "error";
    status.textContent = error.message;
    return;
  }
  const controller = new AbortController();
  connectionTestController = controller;
  $("test-connection").disabled = true;
  $("test-connection").textContent = "Testing…";
  status.dataset.state = "pending";
  status.textContent = `Connecting to ${server.baseUrl}…`;
  try {
    const models = parseModels(
      await requestJSON(`${server.baseUrl}/v1/models`, {
        signal: controller.signal,
      }),
    );
    // Ignore results from a test cancelled by an edit, close, or newer test.
    if (connectionTestController !== controller) return;
    status.dataset.state = "success";
    status.textContent = models.length
      ? `Connection successful to ${server.baseUrl}. ${models.length} model${models.length === 1 ? "" : "s"} available.`
      : `Connection successful to ${server.baseUrl}. No models are installed yet; install a chat model in Ollama.`;
  } catch (error) {
    if (connectionTestController !== controller || error.name === "AbortError")
      return;
    status.dataset.state = "error";
    status.textContent = `Connection failed. ${error.message}`;
  } finally {
    if (connectionTestController === controller) {
      connectionTestController = undefined;
      $("test-connection").disabled = false;
      $("test-connection").textContent = "Test Connection";
    }
  }
}

/** A host/port edit makes both a pending request and its old model list obsolete. */
function invalidateModels() {
  resetConnectionTest();
  cancelModels();
  loadedServer = "";
  $("model-select").replaceChildren(
    new Option("Connect to load available models", ""),
  );
  $("model-select").disabled = true;
  $("settings-status").textContent =
    "Server changed. Select Model to load its models.";
  $("fetch-models").disabled = false;
  $("fetch-models").textContent = "Select Model ↗";
}
/**
 * Discover models for the current draft server, without saving the settings yet.
 * Each invocation owns a controller so cancelled or superseded requests cannot
 * publish stale results or reset controls belonging to a newer request.
 */
async function loadModels() {
  showError("settings-error", "");
  let server;
  try {
    server = normalizeServer($("server-host").value, $("server-port").value);
  } catch (error) {
    showError("settings-error", error.message);
    return;
  }
  cancelModels();
  const controller = new AbortController();
  modelsController = controller;
  loadedServer = "";
  $("model-select").disabled = true;
  $("fetch-models").disabled = true;
  $("fetch-models").textContent = "Connecting…";
  $("settings-status").textContent =
    "Asking your Ollama server for its models…";
  try {
    const models = parseModels(
      await requestJSON(`${server.baseUrl}/v1/models`, {
        signal: controller.signal,
      }),
    );
    // An edit/close may cancel discovery while the response is being processed.
    if (controller.signal.aborted) return;
    if (!models.length)
      throw new Error(
        "No models are installed on this server. Install a chat model in Ollama, then select models again.",
      );
    $("model-select").replaceChildren(
      new Option("Choose a model…", ""),
      ...models.map((id) => new Option(id, id)),
    );
    if (models.includes(settings.model))
      $("model-select").value = settings.model;
    $("model-select").disabled = false;
    loadedServer = server.baseUrl;
    $("settings-status").textContent =
      `${models.length} model${models.length === 1 ? "" : "s"} found. Choose a chat model; embedding models cannot review contracts.`;
  } catch (error) {
    if (error.name !== "AbortError") {
      showError("settings-error", error.message);
      $("settings-status").textContent =
        "Connection unsuccessful. Check the help below.";
    }
  } finally {
    // Only this request's current owner may restore the button in finally.
    if (modelsController === controller) {
      modelsController = undefined;
      $("fetch-models").disabled = false;
      $("fetch-models").textContent = "Select Model ↗";
    }
  }
}
// Settings dialog lifecycle. Its native dialog behavior also handles Escape.
$("settings-button").addEventListener("click", () => openSettings());
$("select-model-main").addEventListener("click", () => openSettings(true));
$("close-settings").addEventListener("click", () =>
  $("settings-dialog").close(),
);
$("settings-dialog").addEventListener("close", () => {
  resetConnectionTest();
  cancelModels();
  $("fetch-models").disabled = false;
  $("fetch-models").textContent = "Select Model ↗";
});
$("settings-dialog").addEventListener("click", (event) => {
  if (event.target === $("settings-dialog")) {
    // Backdrop clicks target the dialog too. Check coordinates so clicks on
    // the dialog's own padding do not accidentally dismiss the settings draft.
    const rect = $("settings-dialog").getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      $("settings-dialog").close();
  }
});
$("test-connection").addEventListener("click", testConnection);
$("fetch-models").addEventListener("click", loadModels);
$("server-host").addEventListener("input", invalidateModels);
$("server-port").addEventListener("input", invalidateModels);
// Commit a validated settings draft; storage failure still permits this tab's use.
$("settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    if (modelsController)
      throw new Error("Wait for the model list to finish loading.");
    const server = normalizeServer(
      $("server-host").value,
      $("server-port").value,
    );
    const previous = normalizeServer(settings.host, settings.port).baseUrl;
    // Use the freshly loaded selection when it belongs to this server. Otherwise
    // retain the old model only for the same server; a new server needs discovery.
    const model =
      loadedServer === server.baseUrl
        ? $("model-select").value
        : previous === server.baseUrl
          ? settings.model
          : "";
    if (loadedServer && !model)
      throw new Error("Choose a model from the list.");
    settings = { host: server.host, port: server.port, model };
    let persisted = true;
    try {
      // Never include editor contents or review text in this persisted object.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      persisted = false;
    }
    updateConnection();
    $("settings-dialog").close();
    toast(
      persisted
        ? "Settings saved. You’re all set."
        : "Settings applied for this tab. Browser storage is unavailable.",
    );
  } catch (error) {
    showError("settings-error", error.message);
  }
});
// Editor actions keep an existing result visible, with a stale notice after edits.
$("contract").addEventListener("input", updateEditor);
$("clear-button").addEventListener("click", () => {
  $("contract").value = "";
  updateEditor();
  $("contract").focus();
});
// The synthetic example follows the real review flow; avoid replacing user text.
$("sample-button").addEventListener("click", () => {
  if ($("contract").value.trim()) {
    toast("Clear your text before loading the example.");
    return;
  }
  $("contract").value =
    `FREELANCE DESIGN SERVICES AGREEMENT — EXAMPLE ONLY\n\n1. Scope. The Freelancer will design a website for the Client for a fixed fee of $2,500. The Freelancer agrees to provide any additional design work and unlimited revisions requested by the Client until the Client is fully satisfied.\n\n2. Payment. The Client will pay the fee within 90 days of final acceptance. Acceptance is at the Client’s sole discretion. No deposit is required.\n\n3. Ownership. All intellectual property, including the Freelancer’s pre-existing templates, tools, and concepts used in the project, transfers to the Client upon signing this agreement.\n\n4. Liability. The Freelancer will indemnify the Client against all claims, losses, and expenses arising from the project, without limitation, including claims resulting from materials supplied by the Client.\n\n5. Termination. The Client may terminate this agreement at any time. No payment will be due for partially completed work.\n\n6. Exclusivity. The Freelancer may not provide services to any business competing with the Client for two years after the project ends.\n\n7. Changes. The Client may amend these terms by email. Continued work constitutes acceptance.`;
  updateEditor();
  $("contract").focus();
  toast("Example loaded. Analyze it with your selected model.");
});

// Render a small Markdown subset with DOM text nodes. Model output never becomes HTML.
/**
 * Recognize only **bold** inline spans. A capturing split returns alternating
 * plain text (even indices) and bold content (odd indices), all inserted as text.
 * HTML, scripts, and Markdown links from the model are never interpreted.
 */
function inlineText(parent, text) {
  for (const [index, part] of text.split(/\*\*(.*?)\*\*/g).entries()) {
    if (index % 2) {
      const strong = document.createElement("strong");
      strong.textContent = part;
      parent.append(strong);
    } else parent.append(document.createTextNode(part));
  }
}
/**
 * Render a deliberately limited, line-based Markdown subset: headings, lists,
 * blockquotes, paragraphs, and bold text. Blank lines/headings end the active list;
 * this is not a full Markdown parser and does not support nested list structure.
 * Assemble off-DOM, then replace the old review in a single operation.
 */
function renderReview(text) {
  const fragment = document.createDocumentFragment();
  let list = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      list = null;
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.+)$/);
    const bullet = line.match(/^\s*(?:[-*]\s+|\d+[.)]\s+)(.*)$/);
    let element;
    if (heading) {
      list = null;
      element = document.createElement(line.startsWith("###") ? "h4" : "h3");
      inlineText(element, heading[1]);
    } else if (bullet) {
      const type = /^\s*\d/.test(line) ? "ol" : "ul";
      if (!list || list.localName !== type) {
        list = document.createElement(type);
        fragment.append(list);
      }
      element = document.createElement("li");
      inlineText(element, bullet[1]);
      list.append(element);
      continue;
    } else {
      list = null;
      element = document.createElement(
        line.startsWith("> ") ? "blockquote" : "p",
      );
      inlineText(element, line.replace(/^> /, ""));
    }
    fragment.append(element);
  }
  $("review-content").replaceChildren(fragment);
}
// Review lifecycle: validate, snapshot inputs, request completion, then render.
$("analyze-button").addEventListener("click", async () => {
  if (!settings.model) {
    openSettings(true);
    return;
  }
  // Keep an exact snapshot for stale detection; core.js trims the API input.
  const contract = $("contract").value;
  let body;
  try {
    body = buildReviewRequest(contract, settings.model);
  } catch (error) {
    showError("review-error", error.message);
    return;
  }
  const controller = new AbortController();
  reviewController = controller;
  // A new attempt replaces the prior result instead of showing it as current.
  reviewText = "";
  showError("review-error", "");
  setBusy(true);
  const model = settings.model;
  try {
    const server = normalizeServer(settings.host, settings.port);
    const data = await requestJSON(`${server.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      // Local inference and model loading can take several minutes.
      timeout: 600000,
    });
    // Ignore a completion if Cancel was pressed before it could be displayed.
    if (controller.signal.aborted) return;
    reviewText = parseReview(data);
    reviewedContract = contract;
    renderReview(reviewText);
    $("result-model").textContent = `Reviewed with ${model}`;
  } catch (error) {
    if (error.name === "AbortError")
      toast("Review cancelled. Your contract is still here.");
    else showError("review-error", error.message);
  } finally {
    // Clear request ownership before updating buttons, even after failure/cancel.
    reviewController = undefined;
    setBusy(false);
    if (reviewText) {
      // Make the new review reachable to assistive technology without jumping
      // the viewport or adding a permanent stop to the normal Tab sequence.
      $("review-content").tabIndex = -1;
      $("review-content").focus({ preventScroll: true });
    }
  }
});
$("cancel-button").addEventListener("click", () => reviewController?.abort());
// Export on explicit user action without appending the original contract.
// The review itself may contain excerpts quoted by the model.
// Keep the disclaimer in the artifact so it remains visible outside this page.
$("download-button").addEventListener("click", () => {
  const disclaimer =
    "Contract Pal is not a lawyer. This AI-generated review is for informational purposes only, is not legal advice, and is not a substitute for a qualified lawyer. AI may miss issues or make mistakes.";
  const blob = new Blob(
    [
      `# Contract Pal review\n\n${$("result-model").textContent}\n${new Date().toLocaleString()}\n\n${disclaimer}\n\n${reviewText}`,
    ],
    { type: "text/markdown;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "contract-pal-review.md";
  link.click();
  // Let the download start before releasing the temporary Blob URL and its memory.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
// Initial render uses restored settings and the editor's current contents.
updateConnection();
updateEditor();
