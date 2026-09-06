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

const MARKDOWN_IMAGE_START = "![";

const IMAGE_ICON_PATH =
  "M1.75 2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h.94a.76.76 0 0 1 .03-.06l2.78-3.71a.5.5 0 0 1 .8 0l1.74 2.32 3.18-4.24a.5.5 0 0 1 .8 0l2.46 3.28V2.75a.25.25 0 0 0-.25-.25H1.75ZM0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25ZM5.5 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0ZM7 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z";

// --- 設定 ---

let settings = { ...DEFAULT_SETTINGS };
let nextElementId = 0;
const textareaTargetIds = new WeakMap();

function getTextareaTargetId(textarea) {
  let targetId = textareaTargetIds.get(textarea);
  if (!targetId) {
    targetId = `textarea-${++nextElementId}`;
    textareaTargetIds.set(textarea, targetId);
  }
  return targetId;
}

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

function escapeHtmlAttribute(value) {
  return value.replace(/[&"<>]/g, (character) => {
    const escaped = {
      "&": "&amp;",
      '"': "&quot;",
      "<": "&lt;",
      ">": "&gt;",
    };
    return escaped[character];
  });
}

function findHtmlTagEnd(text, start, state) {
  let quote = state.quote;
  for (let index = start + 1; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      state.quote = "";
      return index + 1;
    }
  }
  state.quote = quote;
  return -1;
}

function formatMarkdownImages(text, width) {
  let inlineCodeDelimiter = "";
  let htmlMode = "";
  const htmlState = { quote: "" };

  const formatMarkdownSegment = (segment) => {
    let result = "";
    let position = 0;
    while (position < segment.length) {
      if (htmlMode) {
        const end = htmlMode === "comment"
          ? segment.indexOf("-->", position)
          : findHtmlTagEnd(segment, position - 1, htmlState);
        if (end === -1) {
          result += segment.slice(position);
          return result;
        }
        const endPosition = htmlMode === "comment" ? end + 3 : end;
        result += segment.slice(position, endPosition);
        position = endPosition;
        htmlMode = "";
        continue;
      }

      if (inlineCodeDelimiter) {
        const closing = segment.indexOf(inlineCodeDelimiter, position);
        if (closing === -1) {
          return result + segment.slice(position);
        }
        const end = closing + inlineCodeDelimiter.length;
        result += segment.slice(position, end);
        position = end;
        inlineCodeDelimiter = "";
        continue;
      }

      const nextBacktick = segment.indexOf("`", position);
      const nextImage = segment.indexOf(MARKDOWN_IMAGE_START, position);
      const nextHtml = segment.indexOf("<", position);
      if (nextBacktick === -1 && nextImage === -1 && nextHtml === -1) {
        result += segment.slice(position);
        break;
      }
      if (
        nextHtml !== -1 &&
        (nextBacktick === -1 || nextHtml < nextBacktick) &&
        (nextImage === -1 || nextHtml < nextImage)
      ) {
        result += segment.slice(position, nextHtml);
        htmlMode = segment.startsWith("<!--", nextHtml) ? "comment" : "tag";
        const end = htmlMode === "comment"
          ? segment.indexOf("-->", nextHtml + 4)
          : findHtmlTagEnd(segment, nextHtml, htmlState);
        if (end === -1) {
          result += segment.slice(nextHtml);
          return result;
        }
        const endPosition = htmlMode === "comment" ? end + 3 : end;
        result += segment.slice(nextHtml, endPosition);
        position = endPosition;
        htmlMode = "";
        continue;
      }
      if (nextBacktick !== -1 && (nextImage === -1 || nextBacktick < nextImage)) {
        result += segment.slice(position, nextBacktick);
        let delimiterEnd = nextBacktick;
        while (segment[delimiterEnd] === "`") delimiterEnd += 1;
        inlineCodeDelimiter = segment.slice(nextBacktick, delimiterEnd);
        const closing = segment.indexOf(inlineCodeDelimiter, delimiterEnd);
        if (closing === -1) {
          result += segment.slice(nextBacktick);
          break;
        }
        const end = closing + inlineCodeDelimiter.length;
        result += segment.slice(nextBacktick, end);
        position = end;
        inlineCodeDelimiter = "";
        continue;
      }

      const start = nextImage;
      result += segment.slice(position, start);
      if (start > 0 && segment[start - 1] === "\\") {
        result += MARKDOWN_IMAGE_START;
        position = start + MARKDOWN_IMAGE_START.length;
        continue;
      }

      const labelEnd = segment.indexOf("]", start + MARKDOWN_IMAGE_START.length);
      if (
        labelEnd === -1 ||
        segment[labelEnd + 1] !== "(" ||
        segment.slice(start + MARKDOWN_IMAGE_START.length, labelEnd).includes("[") ||
        segment.slice(start + MARKDOWN_IMAGE_START.length, labelEnd).includes("\\")
      ) {
        result += MARKDOWN_IMAGE_START;
        position = start + MARKDOWN_IMAGE_START.length;
        continue;
      }

      let urlStart = labelEnd + 2;
      while (/\s/.test(segment[urlStart] || "")) urlStart += 1;
      if (!/^https?:\/\//i.test(segment.slice(urlStart))) {
        result += MARKDOWN_IMAGE_START;
        position = start + MARKDOWN_IMAGE_START.length;
        continue;
      }

      let urlEnd = urlStart;
      let parenthesesDepth = 0;
      while (urlEnd < segment.length) {
        const character = segment[urlEnd];
        if (character === "\\" && urlEnd + 1 < segment.length) {
          urlEnd += 2;
          continue;
        }
        if (/\s/.test(character)) break;
        if (character === "(") {
          parenthesesDepth += 1;
        } else if (character === ")") {
          if (parenthesesDepth === 0) break;
          parenthesesDepth -= 1;
        }
        urlEnd += 1;
      }
      const source = segment.slice(urlStart, urlEnd);
      if (
        urlEnd === urlStart ||
        parenthesesDepth !== 0 ||
        source.includes("\\(") ||
        source.includes("\\)")
      ) {
        result += MARKDOWN_IMAGE_START;
        position = start + MARKDOWN_IMAGE_START.length;
        continue;
      }

      let end = urlEnd;
      while (/\s/.test(segment[end] || "")) end += 1;
      if (segment[urlEnd] !== ")") {
        const titleStart = end;
        const titleDelimiter = segment[titleStart];
        if (titleDelimiter === '"' || titleDelimiter === "'" || titleDelimiter === "(") {
          const titleEnd = titleDelimiter === "(" ? ")" : titleDelimiter;
          end += 1;
          while (end < segment.length && segment[end] !== titleEnd) end += 1;
          if (segment[end] !== titleEnd) {
            result += MARKDOWN_IMAGE_START;
            position = start + MARKDOWN_IMAGE_START.length;
            continue;
          }
          end += 1;
          while (/\s/.test(segment[end] || "")) end += 1;
        }
      }
      if (segment[end] !== ")") {
        result += MARKDOWN_IMAGE_START;
        position = start + MARKDOWN_IMAGE_START.length;
        continue;
      }

      result += `<p align="center">\n<img src="${escapeHtmlAttribute(
        source
      )}" width="${width}" />\n</p>`;
      position = end + 1;
    }
    return result;
  };

  const lines = text.split(/(\r\n|\n|\r)/);
  let fence;
  let result = "";
  for (let index = 0; index < lines.length; index += 2) {
    const line = lines[index];
    const lineEnding = lines[index + 1] || "";
    if (htmlMode) {
      result += formatMarkdownSegment(line) + lineEnding;
      continue;
    }
    const closingFence = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
    if (fence) {
      result += line + lineEnding;
      if (
        closingFence &&
        closingFence[1][0] === fence.character &&
        closingFence[1].length >= fence.length
      ) {
        fence = undefined;
      }
      continue;
    }

    const openingFence = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (openingFence) {
      fence = {
        character: openingFence[1][0],
        length: openingFence[1].length,
      };
      result += line + lineEnding;
      continue;
    }
    if (/^(?: {4}|\t)/.test(line) || /^ {0,3}>/.test(line)) {
      result += line + lineEnding;
      continue;
    }
    result += formatMarkdownSegment(line) + lineEnding;
  }
  return result;
}

function formatImages(text) {
  const width = buildWidth();
  const formattedHtml = text.replace(IMAGE_PATTERN, (_, src) => {
    return `<p align="center">\n<img src="${src}" width="${width}" />\n</p>`;
  });
  return formatMarkdownImages(formattedHtml, width);
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
  const fieldset = textarea.closest("fieldset");
  if (fieldset) {
    const fieldsetTextareas = Array.from(fieldset.querySelectorAll("textarea"));
    const formattingToolbars = Array.from(
      fieldset.querySelectorAll('[role="toolbar"][aria-label="Formatting tools"]')
    );
    if (fieldsetTextareas.length === 1 && formattingToolbars.length === 1) {
      return formattingToolbars[0];
    }
  }

  if (textarea.id) {
    const linkedToolbars = Array.from(
      document.querySelectorAll("markdown-toolbar[for]")
    ).filter((toolbar) => toolbar.getAttribute("for") === textarea.id);
    if (linkedToolbars.length === 1) return linkedToolbars[0];
  }

  const form = textarea.closest(
    ".js-previewable-comment-form, .markdown-editor, .CommentBox"
  );
  if (!form) return undefined;

  const toolbars = Array.from(form.querySelectorAll("markdown-toolbar"));
  if (toolbars.some((toolbar) => toolbar.hasAttribute("for"))) {
    return undefined;
  }
  if (toolbars.length !== 1) return undefined;

  const textareas = Array.from(form.querySelectorAll("textarea"));
  return textareas.length === 1 ? toolbars[0] : undefined;
}

function getTextareas() {
  const textareas = new Set(document.querySelectorAll(TEXTAREA_SELECTOR));

  document.querySelectorAll("markdown-toolbar[for]").forEach((toolbar) => {
    const target = document.getElementById(toolbar.getAttribute("for"));
    if (target instanceof HTMLTextAreaElement) textareas.add(target);
  });

  return textareas;
}

function createFormatButton(textarea) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gh-image-formatter-btn";

  const targetId = getTextareaTargetId(textarea);
  const btnId = `gh-image-formatter-btn-${++nextElementId}`;
  const tooltipId = `gh-image-formatter-tooltip-${++nextElementId}`;
  button.id = btnId;
  button.dataset.imageFormatterTarget = targetId;
  button.imageFormatterTextarea = textarea;
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
  if (!toolbar) return;

  const targetId = getTextareaTargetId(textarea);
  document.querySelectorAll(".gh-image-formatter-btn").forEach((existingButton) => {
    if (!existingButton.imageFormatterTextarea?.isConnected) {
      existingButton.closest(".gh-image-formatter-wrapper")?.remove();
    } else if (
      existingButton.dataset.imageFormatterTarget === targetId &&
      !toolbar.contains(existingButton)
    ) {
      existingButton.closest(".gh-image-formatter-wrapper")?.remove();
    }
  });
  if (
    toolbar.querySelector(
      `.gh-image-formatter-btn[data-image-formatter-target="${targetId}"]`
    )
  ) {
    return;
  }

  const button = createFormatButton(textarea);
  const headerBtn = toolbar.querySelector('[data-md-button="header-3"]');
  const wrapper = document.createElement("div");
  wrapper.className = "ActionBar-item gh-image-formatter-wrapper";
  wrapper.dataset.targets = "action-bar.items";
  wrapper.appendChild(button);

  const headerItem = headerBtn?.closest(".ActionBar-item");
  if (headerItem) {
    headerItem.insertAdjacentElement("beforebegin", wrapper);
  } else {
    toolbar.appendChild(wrapper);
  }
}

function removeFormatButton(textarea) {
  const targetId = getTextareaTargetId(textarea);
  document
    .querySelectorAll(
      `.gh-image-formatter-btn[data-image-formatter-target="${targetId}"]`
    )
    .forEach((button) => button.closest(".gh-image-formatter-wrapper")?.remove());
}

// --- textarea 初期化・設定適用 ---

function initTextarea(textarea) {
  if (textarea.dataset.imageFormatterAttached) return;
  textarea.dataset.imageFormatterAttached = "true";
  textarea.addEventListener("paste", () => onPaste(textarea));
}

function applyToAllTextareas() {
  getTextareas().forEach((textarea) => {
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
