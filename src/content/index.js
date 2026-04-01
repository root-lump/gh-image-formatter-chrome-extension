/**
 * GitHub Image Formatter - Content Script
 *
 * GitHubのtextareaに貼り付けられた画像のimgタグを自動フォーマットする
 *
 * 変換例:
 *   <img width="1013" height="826" alt="image" src="https://..." />
 *   ↓
 *   <p align="center">
 *   <img src="https://..." width="100%" />
 *   </p>
 */

// --- 定数 ---

const DEFAULT_SETTINGS = {
  showButton: true,
  autoDetect: true,
  imageWidthValue: 100,
  imageWidthUnit: "%",
};

const TEXTAREA_SELECTOR = [
  'textarea[name="pull_request[body]"]',
  'textarea[name="issue[body]"]',
  "textarea.js-comment-field",
  'textarea[id^="TextArea--"]',
  'textarea[id^="markdown-editor-"]',
].join(", ");

const IMAGE_PATTERN =
  /(?<!<p align="center">\n)<img\s+[^>]*src="([^"]+)"[^>]*\/?\s*>(?!<\/p>)/gi;

const IMAGE_ICON_PATH =
  "M1.75 2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h.94a.76.76 0 0 1 .03-.06l2.78-3.71a.5.5 0 0 1 .8 0l1.74 2.32 3.18-4.24a.5.5 0 0 1 .8 0l2.46 3.28V2.75a.25.25 0 0 0-.25-.25H1.75ZM0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25ZM5.5 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0ZM7 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z";

// --- 設定 ---

let settings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  chrome.storage.local.get(DEFAULT_SETTINGS, (result) => {
    settings = result;
    applyToAllTextareas();
  });
}

function watchSettingChanges() {
  chrome.storage.onChanged.addListener((changes) => {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (changes[key]) settings[key] = changes[key].newValue;
    }
    applyToAllTextareas();
  });
}

// --- フォーマット ---

function buildWidth() {
  return `${settings.imageWidthValue || 100}${settings.imageWidthUnit || "%"}`;
}

function formatImages(text) {
  const width = buildWidth();
  return text.replace(IMAGE_PATTERN, (_, src) => {
    return `<p align="center">\n<img src="${src}" width="${width}" />\n</p>`;
  });
}

function setTextareaValue(textarea, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  ).set;
  nativeSetter.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
}

function tryFormat(textarea) {
  const original = textarea.value;
  const formatted = formatImages(original);
  if (original === formatted) return;

  const { selectionStart, selectionEnd } = textarea;
  const diff = formatted.length - original.length;

  setTextareaValue(textarea, formatted);

  textarea.selectionStart = selectionStart + diff;
  textarea.selectionEnd = selectionEnd + diff;
}

// --- 自動検出（ペースト監視） ---

function onPaste(textarea) {
  if (!settings.autoDetect) return;

  let lastValue = textarea.value;
  const interval = setInterval(() => {
    if (textarea.value !== lastValue) {
      lastValue = textarea.value;
      tryFormat(textarea);
      lastValue = textarea.value;
    }
  }, 200);
  setTimeout(() => clearInterval(interval), 5000);
}

// --- ツールバーボタン ---

function findToolbar(textarea) {
  return textarea
    .closest(".js-previewable-comment-form, .markdown-editor, .CommentBox")
    ?.querySelector("markdown-toolbar");
}

function createFormatButton(textarea) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gh-image-formatter-btn";

  const btnId = `gh-image-formatter-btn-${Date.now()}`;
  const tooltipId = `gh-image-formatter-tooltip-${Date.now()}`;
  button.id = btnId;
  button.setAttribute("aria-labelledby", tooltipId);

  // アイコン
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "currentColor");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", IMAGE_ICON_PATH);
  svg.appendChild(path);
  button.appendChild(svg);

  // ツールチップ
  const tooltip = document.createElement("tool-tip");
  tooltip.id = tooltipId;
  tooltip.setAttribute("for", btnId);
  tooltip.setAttribute("popover", "manual");
  tooltip.setAttribute("data-direction", "s");
  tooltip.setAttribute("data-type", "label");
  tooltip.setAttribute("data-view-component", "true");
  tooltip.className = "sr-only position-absolute";
  tooltip.setAttribute("aria-hidden", "true");
  tooltip.setAttribute("role", "tooltip");
  tooltip.textContent = "Format Images";
  button.appendChild(tooltip);

  button.addEventListener("click", (e) => {
    e.preventDefault();
    tryFormat(textarea);
  });

  return button;
}

function addFormatButton(textarea) {
  const toolbar = findToolbar(textarea);
  if (!toolbar || toolbar.querySelector(".gh-image-formatter-btn")) return;

  const button = createFormatButton(textarea);
  const headerBtn = toolbar.querySelector('[data-md-button="header-3"]');

  if (headerBtn) {
    const wrapper = document.createElement("div");
    wrapper.className = "ActionBar-item gh-image-formatter-wrapper";
    wrapper.dataset.targets = "action-bar.items";
    wrapper.appendChild(button);
    headerBtn.closest(".ActionBar-item").insertAdjacentElement("beforebegin", wrapper);
  }
}

function removeFormatButton(textarea) {
  findToolbar(textarea)?.querySelector(".gh-image-formatter-wrapper")?.remove();
}

// --- textarea 初期化・設定適用 ---

function initTextarea(textarea) {
  if (textarea.dataset.imageFormatterAttached) return;
  textarea.dataset.imageFormatterAttached = "true";
  textarea.addEventListener("paste", () => onPaste(textarea));
}

function applyToAllTextareas() {
  document.querySelectorAll(TEXTAREA_SELECTOR).forEach((textarea) => {
    initTextarea(textarea);
    if (settings.showButton) {
      addFormatButton(textarea);
    } else {
      removeFormatButton(textarea);
    }
  });
}

// --- DOM 監視・起動 ---

function start() {
  loadSettings();
  watchSettingChanges();

  new MutationObserver(() => applyToAllTextareas()).observe(document.body, {
    childList: true,
    subtree: true,
  });
}

start();
