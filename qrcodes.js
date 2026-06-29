(function () {
  const config = window.QUIZ_CONFIG || {};
  const settings = config.settings || {};
  const storageKey = "texQuizQrMaxSet";
  const defaultMaxSet = 100;
  const maxScanLimit = 300;
  const scanBatchSize = 12;

  const $ = (id) => document.getElementById(id);
  const elements = {
    maxSet: $("qrMaxSet"),
    scanButton: $("scanQrButton"),
    status: $("qrStatus"),
    grid: $("qrGrid")
  };

  async function boot() {
    const savedMax = Number.parseInt(localStorage.getItem(storageKey) || "", 10);
    const configuredMax = Number.parseInt(settings.qrMaxSet || "", 10);
    elements.maxSet.value = String(clampMax(Number.isFinite(savedMax) ? savedMax : configuredMax || defaultMaxSet));
    elements.scanButton.addEventListener("click", scanSets);
    refreshIcons();
    await scanSets();
  }

  async function scanSets() {
    const maxSet = readMaxSet();
    localStorage.setItem(storageKey, String(maxSet));
    elements.scanButton.disabled = true;
    elements.grid.innerHTML = "";
    setStatus(`正在扫描 1-${maxSet} 套题...`);

    const found = [];
    const candidates = Array.from({ length: maxSet }, (_, index) => index + 1);
    for (let index = 0; index < candidates.length; index += scanBatchSize) {
      const batch = candidates.slice(index, index + scanBatchSize);
      const results = await Promise.all(batch.map(checkNumberedSet));
      found.push(...results.filter(Boolean));
      setStatus(`正在扫描 ${Math.min(index + scanBatchSize, maxSet)}/${maxSet}，已找到 ${found.length} 套。`);
    }

    renderSets(found);
    elements.scanButton.disabled = false;
    refreshIcons();
  }

  async function checkNumberedSet(number) {
    const setId = String(number);
    const path = questionPath(setId);
    if (!(await fileExists(path))) return null;

    const label = fillSetPattern(settings.autoQuestionSetLabelPattern || "第{set}套", setId);
    const title = fillSetPattern(settings.autoQuestionSetTitlePattern || "复变函数第{set}套在线练习", setId, label);
    return {
      setId,
      path,
      label,
      title,
      quizUrl: quizUrl(setId),
      statsUrl: statsUrl(setId)
    };
  }

  async function fileExists(path) {
    try {
      const head = await fetch(path, { method: "HEAD", cache: "no-store" });
      if (head.ok) return true;
      if (head.status !== 405) return false;
    } catch (error) {
      return false;
    }

    try {
      const get = await fetch(path, { cache: "no-store" });
      return get.ok;
    } catch (error) {
      return false;
    }
  }

  function renderSets(items) {
    elements.grid.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("article");
      empty.className = "panel qr-empty";
      empty.textContent = "没有找到编号题库。请确认文件名类似 question-sets/questions-1.csv。";
      elements.grid.append(empty);
      setStatus("没有找到编号题库。");
      return;
    }

    items.forEach((item) => {
      elements.grid.append(renderCard(item));
    });
    setStatus(`已找到 ${items.length} 套题。`);
  }

  function renderCard(item) {
    const article = document.createElement("article");
    article.className = "qr-card";

    const head = document.createElement("div");
    head.className = "qr-card-head";

    const titleWrap = document.createElement("div");
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = `Set ${item.setId}`;
    const title = document.createElement("h2");
    title.textContent = item.label;
    titleWrap.append(eyebrow, title);

    const statsLink = document.createElement("a");
    statsLink.className = "secondary link-button";
    statsLink.href = item.statsUrl;
    statsLink.target = "_blank";
    statsLink.rel = "noopener";
    statsLink.innerHTML = '<i data-lucide="bar-chart-3"></i>统计';
    head.append(titleWrap, statsLink);

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "qr-canvas-wrap";
    const qrBox = document.createElement("div");
    qrBox.className = "qr-code-box";
    canvasWrap.append(qrBox);

    const fallback = document.createElement("p");
    fallback.className = "qr-fallback";
    fallback.hidden = true;
    fallback.textContent = "二维码库加载失败，可先复制链接。";
    canvasWrap.append(fallback);

    const link = document.createElement("a");
    link.className = "qr-link";
    link.href = item.quizUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = item.quizUrl;

    const actions = document.createElement("div");
    actions.className = "qr-card-actions";

    const openButton = document.createElement("a");
    openButton.className = "primary link-button";
    openButton.href = item.quizUrl;
    openButton.target = "_blank";
    openButton.rel = "noopener";
    openButton.innerHTML = '<i data-lucide="external-link"></i>打开答题';

    const copyButton = document.createElement("button");
    copyButton.className = "secondary";
    copyButton.type = "button";
    copyButton.innerHTML = '<i data-lucide="copy"></i><span>复制链接</span>';
    copyButton.addEventListener("click", () => copyLink(item.quizUrl, copyButton));

    const downloadButton = document.createElement("button");
    downloadButton.className = "ghost";
    downloadButton.type = "button";
    downloadButton.innerHTML = '<i data-lucide="download"></i><span>下载二维码</span>';
    downloadButton.addEventListener("click", () => downloadQr(qrBox, item.setId));

    actions.append(openButton, copyButton, downloadButton);
    article.append(head, canvasWrap, link, actions);
    drawQr(qrBox, item.quizUrl, fallback, downloadButton);
    return article;
  }

  function drawQr(qrBox, text, fallback, downloadButton) {
    if (!window.QRCode) {
      showQrFailure(qrBox, fallback, downloadButton);
      return;
    }

    qrBox.innerHTML = "";

    if (typeof window.QRCode.toCanvas === "function") {
      const canvas = document.createElement("canvas");
      canvas.width = 188;
      canvas.height = 188;
      qrBox.append(canvas);
      window.QRCode.toCanvas(canvas, text, {
        width: 188,
        margin: 1,
        errorCorrectionLevel: "M",
        color: {
          dark: "#17201b",
          light: "#ffffff"
        }
      }, (error) => {
        if (!error) return;
        showQrFailure(qrBox, fallback, downloadButton);
      });
      return;
    }

    if (typeof window.QRCode === "function") {
      try {
        const correctLevel = window.QRCode.CorrectLevel ? window.QRCode.CorrectLevel.M : undefined;
        const options = {
          text,
          typeNumber: 0,
          width: 188,
          height: 188,
          colorDark: "#17201b",
          colorLight: "#ffffff"
        };
        if (correctLevel !== undefined) options.correctLevel = correctLevel;
        new window.QRCode(qrBox, options);
      } catch (error) {
        showQrFailure(qrBox, fallback, downloadButton);
      }
      return;
    }

    showQrFailure(qrBox, fallback, downloadButton);
  }

  function showQrFailure(qrBox, fallback, downloadButton) {
    qrBox.hidden = true;
    fallback.hidden = false;
    downloadButton.disabled = true;
  }

  async function copyLink(text, button) {
    const label = button.querySelector("span");
    const oldText = label ? label.textContent : "";
    try {
      await navigator.clipboard.writeText(text);
      flashButton(label, "已复制", oldText);
    } catch (error) {
      const copied = fallbackCopy(text);
      flashButton(label, copied ? "已复制" : "复制失败", oldText);
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }
    textarea.remove();
    return copied;
  }

  function flashButton(label, text, oldText) {
    if (!label) return;
    label.textContent = text;
    window.setTimeout(() => {
      label.textContent = oldText;
    }, 1200);
  }

  function downloadQr(qrBox, setId) {
    const canvas = qrBox.querySelector("canvas");
    if (canvas && typeof canvas.toBlob === "function") {
      canvas.toBlob((blob) => {
        if (!blob) {
          setStatus("二维码下载失败，先复制链接。");
          return;
        }
        downloadBlob(blob, `quiz-${setId}-qr.png`);
      }, "image/png");
      return;
    }

    const image = qrBox.querySelector("img");
    if (image && image.src) {
      downloadUrl(image.src, `quiz-${setId}-qr.png`);
      return;
    }

    if (!qrBox || qrBox.hidden) {
      setStatus("二维码还没有生成，先复制链接。");
      return;
    }

    setStatus("二维码下载失败，先复制链接。");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    downloadUrl(url, filename);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadUrl(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
  }

  function questionPath(setId) {
    const pattern = settings.autoQuestionSetPattern || "./question-sets/questions-{set}.csv";
    return fillSetPattern(pattern, setId);
  }

  function quizUrl(setId) {
    const url = new URL("./index.html", window.location.href);
    url.searchParams.set("set", setId);
    return url.toString();
  }

  function statsUrl(setId) {
    const url = new URL("./stats.html", window.location.href);
    url.searchParams.set("set", setId);
    return url.toString();
  }

  function fillSetPattern(pattern, setId, label) {
    return String(pattern || "")
      .replaceAll("{set}", setId)
      .replaceAll("{label}", label || `第${setId}套`);
  }

  function readMaxSet() {
    const raw = Number.parseInt(elements.maxSet.value || "", 10);
    const next = clampMax(Number.isFinite(raw) ? raw : defaultMaxSet);
    elements.maxSet.value = String(next);
    return next;
  }

  function clampMax(value) {
    return Math.min(maxScanLimit, Math.max(1, Math.floor(value)));
  }

  function setStatus(message) {
    elements.status.textContent = message;
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
