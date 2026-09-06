const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const source = fs.readFileSync("src/content/index.js", "utf8");

function load(html) {
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  const { window } = dom;
  let settingListener;
  window.chrome = {
    storage: {
      local: { get: (_, callback) => callback({ showButton: true, autoDetect: true, imageWidthValue: 100, imageWidthUnit: "%" }) },
      onChanged: { addListener: (listener) => { settingListener = listener; } },
    },
  };
  vm.runInContext(source, dom.getInternalVMContext());
  window.changeSettings = (changes) => settingListener(changes, "local");
  return dom;
}

function toolbar(forId, withHeader = true) {
  return `<markdown-toolbar${forId ? ` for="${forId}"` : ""}>${withHeader ? '<div class="ActionBar-item"><button data-md-button="header-3"></button></div>' : ""}</markdown-toolbar>`;
}

function formattingToolbar() {
  return '<div role="toolbar" aria-label="Formatting tools"></div>';
}

test("toolbar[for] discovers review textarea and formats only its value", () => {
  const dom = load(`<div class="review-form"><textarea id="review"></textarea>${toolbar("review", false)}</div>`);
  const textarea = dom.window.document.getElementById("review");
  textarea.value = '<img src="https://example.test/review.png" />';

  const button = dom.window.document.querySelector(".gh-image-formatter-btn");
  assert.ok(button);
  button.click();
  assert.match(textarea.value, /<p align="center">/);
});

test("visible Formatting tools toolbar is preferred over hidden markdown-toolbar", () => {
  const dom = load(`<fieldset>
    ${toolbar("review", false)}
    <textarea id="review" aria-label="Markdown value"></textarea>
    ${formattingToolbar()}
  </fieldset>`);
  const textarea = dom.window.document.getElementById("review");
  textarea.value = "![image](https://example.test/image.png)";

  const button = dom.window.document.querySelector(".gh-image-formatter-btn");
  assert.ok(button);
  assert.equal(button.closest('[role="toolbar"]')?.getAttribute("aria-label"), "Formatting tools");
  assert.equal(dom.window.document.querySelector("markdown-toolbar .gh-image-formatter-btn"), null);
  button.click();
  assert.match(textarea.value, /<img src="https:\/\/example\.test\/image\.png" width="100%" \/>/);
});

test("adding the visible toolbar replaces a button left on the hidden toolbar", async () => {
  const dom = load(`<fieldset>
    ${toolbar("review", false)}
    <textarea id="review" aria-label="Markdown value"></textarea>
  </fieldset>`);
  const fieldset = dom.window.document.querySelector("fieldset");
  assert.equal(fieldset.querySelectorAll(".gh-image-formatter-btn").length, 1);

  fieldset.appendChild(dom.window.document.createElement("div"));
  const visibleToolbar = fieldset.lastElementChild;
  visibleToolbar.setAttribute("role", "toolbar");
  visibleToolbar.setAttribute("aria-label", "Formatting tools");
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  assert.equal(visibleToolbar.querySelectorAll(".gh-image-formatter-btn").length, 1);
  assert.equal(fieldset.querySelectorAll("markdown-toolbar .gh-image-formatter-btn").length, 0);
});

test("formatting toolbars in separate fieldsets keep their textareas isolated", () => {
  const dom = load(`<fieldset>
    ${toolbar("first", false)}
    <textarea id="first" aria-label="Markdown value"></textarea>
    ${formattingToolbar()}
  </fieldset><fieldset>
    ${toolbar("second", false)}
    <textarea id="second" aria-label="Markdown value"></textarea>
    ${formattingToolbar()}
  </fieldset>`);
  const first = dom.window.document.getElementById("first");
  const second = dom.window.document.getElementById("second");
  first.value = "![first](https://example.test/first.png)";
  second.value = "![second](https://example.test/second.png)";

  const buttons = dom.window.document.querySelectorAll(".gh-image-formatter-btn");
  assert.equal(buttons.length, 2);
  buttons[1].click();
  assert.doesNotMatch(first.value, /align="center"/);
  assert.match(second.value, /src="https:\/\/example\.test\/second\.png"/);
});

test("separate linked toolbars keep multiple textareas isolated", () => {
  const dom = load(`<div>${toolbar("first")}<textarea id="first"></textarea>${toolbar("second")}<textarea id="second"></textarea></div>`);
  const first = dom.window.document.getElementById("first");
  const second = dom.window.document.getElementById("second");
  first.value = '<img src="https://example.test/first.png" />';
  second.value = '<img src="https://example.test/second.png" />';

  const buttons = dom.window.document.querySelectorAll(".gh-image-formatter-btn");
  assert.equal(buttons.length, 2);
  buttons[1].click();
  assert.doesNotMatch(first.value, /align="center"/);
  assert.match(second.value, /align="center"/);
});

test("a toolbar without header-3 still receives the button", () => {
  const dom = load(`<div class="js-previewable-comment-form"><textarea id="comment" class="js-comment-field"></textarea>${toolbar(null, false)}</div>`);
  assert.equal(dom.window.document.querySelectorAll(".gh-image-formatter-btn").length, 1);
});

test("dynamically added linked textarea is initialized once and auto-formatted", async () => {
  const dom = load("<main></main>");
  const form = dom.window.document.createElement("div");
  form.innerHTML = `<textarea id="dynamic"></textarea>${toolbar("dynamic", false)}`;
  dom.window.document.querySelector("main").appendChild(form);
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  const textarea = dom.window.document.getElementById("dynamic");
  assert.equal(dom.window.document.querySelectorAll(".gh-image-formatter-btn").length, 1);
  textarea.dispatchEvent(new dom.window.Event("paste", { bubbles: true }));
  textarea.value = '<img src="https://example.test/dynamic.png" />';
  await new Promise((resolve) => dom.window.setTimeout(resolve, 250));
  assert.match(textarea.value, /<p align="center">/);

  form.appendChild(dom.window.document.createElement("span"));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  assert.equal(dom.window.document.querySelectorAll(".gh-image-formatter-btn").length, 1);
});

test("a mismatched linked toolbar is never used as an unlinked fallback", () => {
  const dom = load(`<div class="js-previewable-comment-form"><textarea class="js-comment-field" id="comment"></textarea>${toolbar("other", false)}</div>`);
  assert.equal(dom.window.document.querySelectorAll(".gh-image-formatter-btn").length, 0);
});

test("Markdown images are formatted while links and code remain unchanged", () => {
  const dom = load(`<div class="review-form"><textarea id="review"></textarea>${toolbar("review", false)}</div>`);
  const textarea = dom.window.document.getElementById("review");
  textarea.value = [
    "![image](https://example.test/image.png?x=1&y=2)",
    "[link](https://example.test/link.png)",
    "`![inline](https://example.test/inline.png)`",
    "``![double](https://example.test/double.png)``",
    "    ![indented](https://example.test/indented.png)",
    "```markdown",
    "~~~",
    "![fenced](https://example.test/fenced.png)",
    "```",
    "![unfinished",
    "",
    "[link](https://example.test/second-link.png)",
    "![escaped](https://example.test/a\\(b\\).png)",
  ].join("\n");

  dom.window.document.querySelector(".gh-image-formatter-btn").click();

  assert.match(textarea.value, /<img src="https:\/\/example\.test\/image\.png\?x=1&amp;y=2" width="100%" \/>/);
  assert.match(textarea.value, /\[link\]\(https:\/\/example\.test\/link\.png\)/);
  assert.match(textarea.value, /`!\[inline\]\(https:\/\/example\.test\/inline\.png\)`/);
  assert.match(textarea.value, /``!\[double\]\(https:\/\/example\.test\/double\.png\)``/);
  assert.match(textarea.value, /    !\[indented\]\(https:\/\/example\.test\/indented\.png\)/);
  assert.match(textarea.value, /!\[fenced\]\(https:\/\/example\.test\/fenced\.png\)/);
  assert.match(textarea.value, /~~~\n!\[fenced\]/);
  assert.match(textarea.value, /!\[unfinished\n\n\[link\]\(https:\/\/example\.test\/second-link\.png\)/);
  assert.match(textarea.value, /!\[escaped\]\(https:\/\/example\.test\/a\\\(b\\\)\.png\)/);
});

test("Markdown images are kept out of HTML, quotes, comments, and blockquotes", () => {
  const dom = load(`<div class="review-form"><textarea id="review"></textarea>${toolbar("review", false)}</div>`);
  const textarea = dom.window.document.getElementById("review");
  textarea.value = [
    '![bad] normal text [link](https://example.test/link.png)',
    '<a title="![attribute](https://example.test/attribute.png)">link</a> ![after-tag](https://example.test/after-tag.png)',
    '<!-- ![comment](https://example.test/comment.png) --> ![after-comment](https://example.test/after-comment.png)',
    '<a',
    ' title="![multiline](https://example.test/multiline.png)"> ![after-multiline](https://example.test/after-multiline.png)</a>',
    '> ~~~',
    '> ![quote](https://example.test/quote.png)',
    '> ~~~',
  ].join("\n");

  dom.window.document.querySelector(".gh-image-formatter-btn").click();

  assert.match(textarea.value, /!\[bad\] normal text \[link\]\(https:\/\/example\.test\/link\.png\)/);
  assert.match(textarea.value, /title="!\[attribute\]\(https:\/\/example\.test\/attribute\.png\)"/);
  assert.match(textarea.value, /<a title="!\[attribute\].*?<p align="center">/s);
  assert.match(textarea.value, /<!-- !\[comment\]\(https:\/\/example\.test\/comment\.png\) -->/);
  assert.match(textarea.value, /src="https:\/\/example\.test\/after-comment\.png"/);
  assert.match(textarea.value, /title="!\[multiline\]\(https:\/\/example\.test\/multiline\.png\)"/);
  assert.match(textarea.value, /src="https:\/\/example\.test\/after-multiline\.png"/);
  assert.match(textarea.value, /> ~~~\n> !\[quote\]\(https:\/\/example\.test\/quote\.png\)\n> ~~~/);
});

test("multiline HTML attributes keep quoted Markdown and format text after the tag", () => {
  const dom = load(`<div class="review-form"><textarea id="review"></textarea>${toolbar("review", false)}</div>`);
  const textarea = dom.window.document.getElementById("review");
  textarea.value = [
    '<a title="first line',
    'x > ![attribute](https://example.test/attribute.png)',
    '">link</a> ![after](https://example.test/after.png)',
  ].join("\n");

  dom.window.document.querySelector(".gh-image-formatter-btn").click();

  assert.match(textarea.value, /title="first line\nx > !\[attribute\]\(https:\/\/example\.test\/attribute\.png\)\n"/);
  assert.match(textarea.value, /src="https:\/\/example\.test\/after\.png"/);
  assert.doesNotMatch(textarea.value, /src="https:\/\/example\.test\/attribute\.png"/);
});

test("HTML and Markdown images can be formatted in successive operations", () => {
  const dom = load(`<div class="review-form"><textarea id="review"></textarea>${toolbar("review", false)}</div>`);
  const textarea = dom.window.document.getElementById("review");
  const button = dom.window.document.querySelector(".gh-image-formatter-btn");
  textarea.value = '<p align="center">\n<img src="https://example.test/first.png" width="100%" />\n</p>';

  button.click();
  textarea.value += "\n![second](https://example.test/second.png)";
  button.click();

  assert.equal((textarea.value.match(/<p align="center">/g) || []).length, 2);
  assert.match(textarea.value, /src="https:\/\/example\.test\/first\.png" width="100%"/);
  assert.match(textarea.value, /src="https:\/\/example\.test\/second\.png" width="100%"/);
});

test("private-use characters in the body are preserved during Markdown formatting", () => {
  const dom = load(`<div class="review-form"><textarea id="review"></textarea>${toolbar("review", false)}</div>`);
  const textarea = dom.window.document.getElementById("review");
  const privateUseText = "\uE0000\uE001";
  textarea.value = `${privateUseText}\n![image](https://example.test/image.png)`;

  dom.window.document.querySelector(".gh-image-formatter-btn").click();

  assert.match(textarea.value, new RegExp(`^${privateUseText}`));
  assert.match(textarea.value, /<p align="center">/);
});

test("Markdown images are automatically formatted after paste", async () => {
  const dom = load(`<div class="review-form"><textarea id="review"></textarea>${toolbar("review", false)}</div>`);
  const textarea = dom.window.document.getElementById("review");

  textarea.dispatchEvent(new dom.window.Event("paste", { bubbles: true }));
  textarea.value = "![image](https://example.test/image.png)";
  await new Promise((resolve) => dom.window.setTimeout(resolve, 250));

  assert.match(textarea.value, /<p align="center">/);
  assert.match(textarea.value, /src="https:\/\/example\.test\/image\.png"/);
});

test("already formatted HTML images are not duplicated", () => {
  const dom = load(`<div class="review-form"><textarea id="review"></textarea>${toolbar("review", false)}</div>`);
  const textarea = dom.window.document.getElementById("review");
  textarea.value = '<p align="center">\n<img src="https://example.test/image.png" width="100%" />\n</p>';

  dom.window.document.querySelector(".gh-image-formatter-btn").click();

  assert.equal(
    textarea.value,
    '<p align="center">\n<img src="https://example.test/image.png" width="100%" />\n</p>'
  );
});

test("replacing a textarea removes its detached button before adding the new one", async () => {
  const dom = load(`<div class="review-form"><textarea id="review"></textarea>${toolbar("review", false)}</div>`);
  const oldTextarea = dom.window.document.getElementById("review");
  oldTextarea.remove();
  const newTextarea = dom.window.document.createElement("textarea");
  newTextarea.id = "review";
  dom.window.document.querySelector(".review-form").prepend(newTextarea);
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  assert.equal(dom.window.document.querySelectorAll(".gh-image-formatter-btn").length, 1);
});

test("body fields and comment fields stay isolated and honor display settings", () => {
  const dom = load(`<div class="js-previewable-comment-form">
    ${toolbar("missing", false)}
    <textarea id="pr" name="pull_request[body]"></textarea>${toolbar("pr", false)}
    <textarea id="issue" name="issue[body]"></textarea>${toolbar("issue", false)}
  </div>`);
  const document = dom.window.document;
  const pr = document.getElementById("pr");
  const issue = document.getElementById("issue");
  pr.value = '<img src="https://example.test/pr.png" />';
  issue.value = '<img src="https://example.test/issue.png" />';

  let buttons = document.querySelectorAll(".gh-image-formatter-btn");
  assert.equal(buttons.length, 2);
  assert.equal(document.querySelector('[for="missing"] .gh-image-formatter-btn'), null);
  const ids = [...document.querySelectorAll(".gh-image-formatter-btn, tool-tip")].map((element) => element.id);
  assert.equal(new Set(ids).size, 4);

  dom.window.changeSettings({
    imageWidthValue: { newValue: 320 },
    imageWidthUnit: { newValue: "px" },
  });
  buttons = document.querySelectorAll(".gh-image-formatter-btn");
  buttons[0].click();
  assert.match(pr.value, /width="320px"/);
  assert.doesNotMatch(issue.value, /align="center"/);
  pr.value = '<img src="https://example.test/pr.png" />';
  buttons[1].click();
  assert.equal(pr.value, '<img src="https://example.test/pr.png" />');
  assert.match(issue.value, /width="320px"/);

  dom.window.changeSettings({ showButton: { newValue: false } });
  assert.equal(document.querySelectorAll(".gh-image-formatter-btn").length, 0);
  dom.window.changeSettings({ showButton: { newValue: true } });
  assert.equal(document.querySelectorAll(".gh-image-formatter-btn").length, 2);
  dom.window.changeSettings({ showButton: { newValue: true } });
  assert.equal(document.querySelectorAll(".gh-image-formatter-btn").length, 2);
});
