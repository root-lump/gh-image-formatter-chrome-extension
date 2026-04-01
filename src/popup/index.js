const DEFAULT_SETTINGS = {
  showButton: true,
  autoDetect: true,
  imageWidthValue: 100,
  imageWidthUnit: "%",
};

document.addEventListener("DOMContentLoaded", () => {
  const els = {
    showButton: document.getElementById("showButton"),
    autoDetect: document.getElementById("autoDetect"),
    widthValue: document.getElementById("imageWidthValue"),
    widthUnit: document.getElementById("imageWidthUnit"),
    saveIcon: document.getElementById("saveIcon"),
    spinUp: document.getElementById("spinUp"),
    spinDown: document.getElementById("spinDown"),
  };

  let hideTimer = null;

  function loadSettings() {
    chrome.storage.local.get(DEFAULT_SETTINGS, (result) => {
      els.showButton.checked = result.showButton;
      els.autoDetect.checked = result.autoDetect;
      els.widthValue.value = result.imageWidthValue;
      els.widthUnit.value = result.imageWidthUnit;
      syncWidthConstraints();
    });
  }

  function syncWidthConstraints() {
    const isPct = els.widthUnit.value === "%";
    els.widthValue.min = 1;
    els.widthValue.max = isPct ? 100 : 9999;
    els.widthValue.step = 1;
  }

  function flashSaveIcon() {
    els.saveIcon.classList.add("visible");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => els.saveIcon.classList.remove("visible"), 1500);
  }

  function save() {
    chrome.storage.local.set(
      {
        showButton: els.showButton.checked,
        autoDetect: els.autoDetect.checked,
        imageWidthValue: parseInt(els.widthValue.value, 10) || 100,
        imageWidthUnit: els.widthUnit.value,
      },
      flashSaveIcon
    );
  }

  // イベント登録
  els.showButton.addEventListener("change", save);
  els.autoDetect.addEventListener("change", save);
  els.widthValue.addEventListener("change", save);
  els.widthUnit.addEventListener("change", () => { syncWidthConstraints(); save(); });
  els.spinUp.addEventListener("click", () => { els.widthValue.stepUp(); save(); });
  els.spinDown.addEventListener("click", () => { els.widthValue.stepDown(); save(); });

  loadSettings();
});
