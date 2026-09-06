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

test("toolbar[for] discovers review textarea and formats only its value", () => {
  const dom = load(`<div class="review-form"><textarea id="review"></textarea>${toolbar("review", false)}</div>`);
  const textarea = dom.window.document.getElementById("review");
  textarea.value = '<img src="https://example.test/review.png" />';

  const button = dom.window.document.querySelector(".gh-image-formatter-btn");
  assert.ok(button);
  button.click();
  assert.match(textarea.value, /<p align="center">/);
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
