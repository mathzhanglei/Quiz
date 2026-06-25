(function () {
  const config = window.QUIZ_CONFIG || {};
  const settings = config.settings || {};
  const questionSource = "./questions.csv";
  const statsEndpoint = String(settings.statsEndpoint || settings.submitEndpoint || "").trim();
  const statsTokenKey = "texQuizStatsToken";
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  let questions = [];

  const $ = (id) => document.getElementById(id);
  const elements = {
    resultsFile: $("resultsFile"),
    statsToken: $("statsToken"),
    loadRemoteButton: $("loadRemoteButton"),
    loadSampleButton: $("loadSampleButton"),
    statsStatus: $("statsStatus"),
    summaryGrid: $("summaryGrid"),
    statsPanels: $("statsPanels"),
    scoreBars: $("scoreBars"),
    studentTableBody: $("studentTableBody"),
    questionStatsPanel: $("questionStatsPanel"),
    questionStats: $("questionStats")
  };

  async function boot() {
    refreshIcons();
    elements.resultsFile.addEventListener("change", handleFile);
    elements.loadRemoteButton.addEventListener("click", loadRemoteResults);
    elements.loadSampleButton.addEventListener("click", showEmptyStructure);
    await loadQuestions();
    setupRemoteControls();
  }

  function setupRemoteControls() {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get("statsToken") || params.get("token") || "";
    const savedToken = localStorage.getItem(statsTokenKey) || "";
    elements.statsToken.value = tokenFromUrl || savedToken;
    elements.loadRemoteButton.disabled = !statsEndpoint;
    if (!statsEndpoint) {
      setStatus("没有配置自动读取地址，可上传成绩 CSV。");
    }
    if (statsEndpoint && (params.get("autoload") === "1" || tokenFromUrl)) {
      window.setTimeout(loadRemoteResults, 0);
    }
  }

  async function loadQuestions() {
    try {
      const response = await fetch(questionSource, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      questions = questionsFromCsv(await response.text());
      setStatus(`已载入题库 ${questions.length} 题。`);
    } catch (error) {
      questions = [];
      setStatus("题库读取失败，只能显示成绩汇总。");
    }
  }

  async function handleFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim()));
    if (rows.length < 2) {
      setStatus("成绩 CSV 没有可统计的数据。");
      return;
    }

    const records = recordsFromRows(rows);
    const attempts = records.map(normalizeAttempt).filter(Boolean);
    if (!attempts.length) {
      setStatus("没有识别到有效成绩记录。");
      return;
    }

    renderStats(attempts);
  }

  async function loadRemoteResults() {
    if (!statsEndpoint) {
      setStatus("没有配置自动读取地址，可上传成绩 CSV。");
      return;
    }

    const token = elements.statsToken.value.trim();
    if (token) localStorage.setItem(statsTokenKey, token);
    setStatus("正在自动读取成绩...");

    try {
      const data = await fetchJsonp(statsEndpoint, {
        action: "results",
        token
      });
      if (!data || data.ok !== true) {
        throw new Error(data && data.error ? data.error : "自动读取失败。");
      }

      const records = Array.isArray(data.records) ? data.records : recordsFromRemoteRows(data);
      const attempts = records.map(normalizeAttempt).filter(Boolean);
      if (!attempts.length) {
        setStatus("已经连上收集表，但还没有识别到有效成绩。");
        return;
      }

      renderStats(attempts);
      setStatus(`已自动读取并统计 ${attempts.length} 份提交。`);
    } catch (error) {
      setStatus(error.message || "自动读取失败，可先用 CSV 上传。");
    }
  }

  function showEmptyStructure() {
    const sample = [{
      name: "示例学生",
      className: "示例班级",
      studentId: "001",
      score: 24,
      total: 30,
      percent: 80,
      correctCount: 24,
      questionCount: 30,
      durationSeconds: 600,
      submittedAt: new Date().toISOString(),
      answers: questions.map((question, index) => ({
        id: question.id,
        selected: index % 5 === 0 ? "B" : question.answer,
        correct: question.answer,
        isCorrect: index % 5 !== 0,
        score: index % 5 === 0 ? 0 : Number(question.score || 1),
        maxScore: Number(question.score || 1)
      }))
    }];
    renderStats(sample);
    setStatus("已显示示例统计结构。");
  }

  function recordsFromRows(rows) {
    const headers = rows[0].map(normalizeHeader);
    return rows.slice(1).map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = row[index] || "";
      });
      return record;
    });
  }

  function recordsFromRemoteRows(data) {
    if (!Array.isArray(data.rows) || !Array.isArray(data.headers)) return [];
    const rows = [data.headers, ...data.rows];
    return recordsFromRows(rows);
  }

  function normalizeAttempt(record) {
    const payload = parseJsonObject(getField(record, ["payload", "原始数据", "提交数据"]));
    const student = payload && payload.student ? payload.student : {};
    const answers = normalizeAnswers(
      Array.isArray(payload && payload.answers)
        ? payload.answers
        : parseJsonArray(getField(record, ["answers_json", "answers", "答题", "作答记录"]))
    );

    const scoreFromRecord = numberField(record, ["score", "成绩", "得分"]);
    const scoreFromPayload = payload ? Number(payload.score) : NaN;
    const scoreFromAnswers = answers.length ? answers.reduce((sum, answer) => sum + Number(answer.score || 0), 0) : NaN;
    const score = firstFinite(scoreFromRecord, scoreFromPayload, scoreFromAnswers);

    const totalFromQuestions = questions.length ? questions.reduce((sum, question) => sum + Number(question.score || 1), 0) : NaN;
    const totalFromAnswers = answers.length ? answers.reduce((sum, answer) => sum + Number(answer.maxScore || 1), 0) : NaN;
    const total = firstFinite(numberField(record, ["total", "满分", "总分"]), payload ? Number(payload.total) : NaN, totalFromQuestions, totalFromAnswers);
    const correctCount = firstFinite(
      numberField(record, ["correct", "correctcount", "正确", "正确数"]),
      payload ? Number(payload.correctCount) : NaN,
      answers.length ? answers.filter((answer) => answer.isCorrect).length : NaN
    );
    const questionCount = firstFinite(numberField(record, ["questions", "questioncount", "题数"]), payload ? Number(payload.questionCount) : NaN, questions.length || NaN, answers.length || NaN);

    if (!answers.length && !Number.isFinite(score)) return null;

    return {
      name: getField(record, ["name", "姓名"]) || student.name || "-",
      className: getField(record, ["class", "className", "班级"]) || student.className || "-",
      studentId: getField(record, ["student_id", "studentid", "学号"]) || student.studentId || "-",
      score: Number.isFinite(score) ? score : 0,
      total,
      percent: firstFinite(numberField(record, ["percent", "百分比"]), payload ? Number(payload.percent) : NaN, total ? Math.round((score / total) * 100) : 0),
      correctCount: Number.isFinite(correctCount) ? correctCount : 0,
      questionCount,
      durationSeconds: firstFinite(numberField(record, ["duration_seconds", "durationseconds", "用时"]), payload ? Number(payload.durationSeconds) : NaN, 0),
      submittedAt: getField(record, ["submitted_at", "submittedat", "提交时间"]) || (payload && payload.endedAt) || "",
      answers
    };
  }

  function renderStats(attempts) {
    const totalStudents = attempts.length;
    const maxTotal = Math.max(...attempts.map((attempt) => attempt.total || 0), 0);
    const averageScore = average(attempts.map((attempt) => attempt.score));
    const averagePercent = average(attempts.map((attempt) => attempt.percent));
    const highest = Math.max(...attempts.map((attempt) => attempt.score));
    const lowest = Math.min(...attempts.map((attempt) => attempt.score));
    const medianScore = median(attempts.map((attempt) => attempt.score));

    elements.summaryGrid.hidden = false;
    elements.summaryGrid.innerHTML = [
      summaryCard("提交人数", totalStudents),
      summaryCard("平均分", `${formatNumber(averageScore)} / ${maxTotal}`),
      summaryCard("平均正确率", `${formatNumber(averagePercent)}%`),
      summaryCard("最高 / 最低", `${highest} / ${lowest}`),
      summaryCard("中位数", formatNumber(medianScore))
    ].join("");

    renderScoreBars(attempts, maxTotal);
    renderStudentTable(attempts);
    renderQuestionStats(attempts);

    elements.statsPanels.hidden = false;
    elements.questionStatsPanel.hidden = false;
    setStatus(`已统计 ${totalStudents} 份提交。`);
    typeset();
    refreshIcons();
  }

  function renderScoreBars(attempts, total) {
    const buckets = [
      { label: "90%-100%", min: 90, max: 100 },
      { label: "80%-89%", min: 80, max: 89.999 },
      { label: "70%-79%", min: 70, max: 79.999 },
      { label: "60%-69%", min: 60, max: 69.999 },
      { label: "<60%", min: -Infinity, max: 59.999 }
    ];
    const maxCount = Math.max(...buckets.map((bucket) => countInBucket(attempts, bucket)), 1);
    elements.scoreBars.innerHTML = buckets.map((bucket) => {
      const count = countInBucket(attempts, bucket);
      const width = Math.round((count / maxCount) * 100);
      return `<div class="score-bar-row"><span>${bucket.label}</span><div><i style="width:${width}%"></i></div><strong>${count}</strong></div>`;
    }).join("");
  }

  function countInBucket(attempts, bucket) {
    return attempts.filter((attempt) => {
      const percent = attempt.total ? (attempt.score / attempt.total) * 100 : attempt.percent;
      return percent >= bucket.min && percent <= bucket.max;
    }).length;
  }

  function renderStudentTable(attempts) {
    const sorted = [...attempts].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN"));
    elements.studentTableBody.innerHTML = sorted.map((attempt) => `
      <tr>
        <td>${escapeHtml(attempt.name)}</td>
        <td>${escapeHtml(attempt.className)}</td>
        <td>${escapeHtml(attempt.studentId)}</td>
        <td>${attempt.score}/${attempt.total}</td>
        <td>${attempt.correctCount}/${attempt.questionCount}</td>
        <td>${formatDuration(attempt.durationSeconds)}</td>
      </tr>
    `).join("");
  }

  function renderQuestionStats(attempts) {
    const questionMap = new Map(questions.map((question, index) => [question.id, { ...question, index }]));
    const fallbackCount = Math.max(questions.length, ...attempts.map((attempt) => attempt.answers.length));
    const stats = Array.from({ length: fallbackCount }, (_, index) => {
      const question = questions[index] || { id: `q${index + 1}`, prompt: `第 ${index + 1} 题`, answer: "" };
      return {
        id: question.id,
        index,
        prompt: question.prompt,
        answer: question.answer,
        total: 0,
        correct: 0,
        blank: 0,
        options: {}
      };
    });

    attempts.forEach((attempt) => {
      attempt.answers.forEach((answer, answerIndex) => {
        const questionInfo = questionMap.get(answer.id);
        const index = questionInfo ? questionInfo.index : answerIndex;
        if (!stats[index]) return;
        stats[index].total += 1;
        if (answer.isCorrect) stats[index].correct += 1;
        if (!answer.selected) stats[index].blank += 1;
        const selected = answer.selected || "未答";
        stats[index].options[selected] = (stats[index].options[selected] || 0) + 1;
      });
    });

    elements.questionStats.innerHTML = stats.map((item) => {
      const rate = item.total ? Math.round((item.correct / item.total) * 100) : 0;
      const optionText = Object.entries(item.options)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([option, count]) => `${escapeHtml(option)}: ${count}`)
        .join(" · ") || "-";
      return `
        <article class="question-stat">
          <div class="question-stat-title">
            <strong>${item.index + 1}. ${escapeHtml(item.prompt)}</strong>
            <span>${rate}%</span>
          </div>
          <div class="question-rate"><i style="width:${rate}%"></i></div>
          <div class="question-stat-meta">
            <span>正确 ${item.correct}/${item.total}</span>
            <span>答案 ${escapeHtml(item.answer || "-")}</span>
            <span>${optionText}</span>
          </div>
        </article>
      `;
    }).join("");
  }

  function questionsFromCsv(csv) {
    const rows = parseCsv(csv).filter((row) => row.some((cell) => cell.trim()));
    if (rows.length < 2) return [];
    const records = recordsFromRows(rows);
    return records
      .filter((record) => !isDisabledRow(getField(record, ["enabled", "enable", "启用", "是否启用", "发布"])))
      .map((record, index) => ({
        id: getField(record, ["id", "编号", "题号"]) || `q${index + 1}`,
        prompt: getField(record, ["prompt", "question", "title", "题干", "题目", "问题"]),
        answer: normalizeAnswerText(getField(record, ["answer", "correct", "正确答案", "答案"])),
        score: Number(getField(record, ["score", "points", "point", "分值", "分数"]) || 1)
      }));
  }

  function parseCsv(csv) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let index = 0; index < csv.length; index += 1) {
      const char = csv[index];
      const next = csv[index + 1];
      if (char === '"') {
        if (inQuotes && next === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }

    row.push(cell);
    rows.push(row);
    return rows;
  }

  function fetchJsonp(endpoint, params) {
    return new Promise((resolve, reject) => {
      const callbackName = `__quizStatsCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const url = new URL(endpoint, window.location.href);
      Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null) url.searchParams.set(key, value);
      });
      url.searchParams.set("callback", callbackName);

      const script = document.createElement("script");
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("自动读取超时，可稍后重试或上传 CSV。"));
      }, 15000);

      function cleanup() {
        window.clearTimeout(timer);
        delete window[callbackName];
        script.remove();
      }

      window[callbackName] = (data) => {
        cleanup();
        resolve(data);
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("自动读取失败，请检查 Web App 是否已重新部署。"));
      };
      script.src = url.toString();
      document.head.append(script);
    });
  }

  function parseJsonObject(value) {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function parseJsonArray(value) {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function normalizeAnswers(answers) {
    return answers.map((answer) => {
      if (!answer || typeof answer !== "object") return null;
      const selected = normalizeAnswerText(answer.selected || answer.selectedLetter || answer.answer || "");
      const correct = normalizeAnswerText(answer.correct || answer.correctLetter || "");
      const isCorrect = typeof answer.isCorrect === "boolean"
        ? answer.isCorrect
        : truthyValue(answer.is_correct || answer.correctness) || (selected && correct ? selected === correct : false);
      return {
        id: answer.id || answer.questionId || answer.question_id || "",
        selected,
        correct,
        isCorrect,
        score: firstFinite(Number(answer.score), 0),
        maxScore: firstFinite(Number(answer.maxScore), Number(answer.max_score), 1)
      };
    }).filter(Boolean);
  }

  function summaryCard(label, value) {
    return `<article class="summary-card"><span>${label}</span><strong>${value}</strong></article>`;
  }

  function normalizeHeader(header) {
    return String(header || "").trim().replace(/^\uFEFF/, "").replace(/\s+/g, "").toLowerCase();
  }

  function getField(record, names) {
    for (const name of names) {
      const value = record[normalizeHeader(name)];
      if (value !== undefined && value !== "") return value;
    }
    return "";
  }

  function numberField(record, names) {
    const value = Number(getField(record, names));
    return Number.isFinite(value) ? value : NaN;
  }

  function firstFinite(...values) {
    const found = values.find((value) => Number.isFinite(value));
    return found === undefined ? NaN : found;
  }

  function truthyValue(value) {
    return ["true", "1", "yes", "y", "对", "正确"].includes(String(value || "").trim().toLowerCase());
  }

  function normalizeAnswerText(value) {
    const normalized = String(value || "")
      .trim()
      .replace(/^选项/i, "")
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
    return /^[a-z]$/i.test(normalized) ? normalized.toUpperCase() : normalized;
  }

  function isDisabledRow(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return ["0", "false", "no", "n", "否", "不启用", "停用", "隐藏"].includes(normalized);
  }

  function average(values) {
    const valid = values.filter(Number.isFinite);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
  }

  function median(values) {
    const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!valid.length) return 0;
    const middle = Math.floor(valid.length / 2);
    return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
  }

  function formatNumber(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function formatDuration(seconds) {
    const value = Number(seconds || 0);
    const minutes = Math.floor(value / 60);
    const rest = Math.floor(value % 60);
    return `${minutes}分${String(rest).padStart(2, "0")}秒`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setStatus(message) {
    elements.statsStatus.textContent = message;
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
  }

  function typeset() {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
