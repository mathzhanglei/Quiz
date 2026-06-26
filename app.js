(function () {
  const config = window.QUIZ_CONFIG || {};
  const baseMeta = config.meta || {};
  const baseSettings = {
    questionSource: "",
    shuffleQuestions: false,
    shuffleOptions: false,
    showCorrectAnswers: true,
    submitProvider: "",
    supabaseUrl: "",
    supabaseAnonKey: "",
    submitEndpoint: "",
    ...(config.settings || {})
  };
  const questionSets = config.questionSets || baseSettings.questionSets || {};
  const selectedQuestionSet = resolveQuestionSet(questionSets, baseSettings.defaultSet || "default", baseSettings);
  const meta = {
    ...baseMeta,
    ...(selectedQuestionSet.meta || {})
  };
  const settings = {
    ...baseSettings,
    ...(selectedQuestionSet.settings || {})
  };
  if (selectedQuestionSet.title) meta.title = selectedQuestionSet.title;
  if (selectedQuestionSet.course) meta.course = selectedQuestionSet.course;
  if (selectedQuestionSet.timeLimitMinutes !== undefined) meta.timeLimitMinutes = selectedQuestionSet.timeLimitMinutes;
  if (selectedQuestionSet.instructions) meta.instructions = selectedQuestionSet.instructions;
  if (selectedQuestionSet.questionSource) settings.questionSource = selectedQuestionSet.questionSource;
  if (selectedQuestionSet.shuffleQuestions !== undefined) settings.shuffleQuestions = selectedQuestionSet.shuffleQuestions;
  if (selectedQuestionSet.shuffleOptions !== undefined) settings.shuffleOptions = selectedQuestionSet.shuffleOptions;
  if (selectedQuestionSet.showCorrectAnswers !== undefined) settings.showCorrectAnswers = selectedQuestionSet.showCorrectAnswers;

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const historyLimit = 8;
  let originalQuestions = Array.isArray(config.questions) ? config.questions : [];
  let activeQuestionSource = originalQuestions.length ? "内置题库" : "";
  const state = {
    student: null,
    startedAt: null,
    endedAt: null,
    viewingHistory: false,
    questions: [],
    currentIndex: 0,
    answers: {},
    timerId: null,
    deadline: null,
    submitted: false,
    result: null
  };

  const $ = (id) => document.getElementById(id);

  const elements = {
    courseLabel: $("courseLabel"),
    quizTitle: $("quizTitle"),
    timer: $("timer"),
    timerText: $("timerText"),
    themeToggle: $("themeToggle"),
    startView: $("startView"),
    studentForm: $("studentForm"),
    introText: $("introText"),
    studentName: $("studentName"),
    studentId: $("studentId"),
    startButton: $("startButton"),
    sourceStatus: $("sourceStatus"),
    historyPanel: $("historyPanel"),
    historyList: $("historyList"),
    clearHistoryButton: $("clearHistoryButton"),
    quizView: $("quizView"),
    progressText: $("progressText"),
    answeredText: $("answeredText"),
    progressFill: $("progressFill"),
    numberGrid: $("numberGrid"),
    questionBadge: $("questionBadge"),
    questionScore: $("questionScore"),
    questionText: $("questionText"),
    options: $("options"),
    prevButton: $("prevButton"),
    nextButton: $("nextButton"),
    submitButton: $("submitButton"),
    resultView: $("resultView"),
    scoreNumber: $("scoreNumber"),
    scoreDetail: $("scoreDetail"),
    submitStatus: $("submitStatus"),
    reviewPanel: $("reviewPanel"),
    downloadCsvButton: $("downloadCsvButton"),
    copySummaryButton: $("copySummaryButton"),
    restartButton: $("restartButton"),
    homeButton: $("homeButton")
  };

  async function boot() {
    elements.quizTitle.textContent = meta.title || "TeX 单选测验";
    document.title = meta.title || "TeX 单选测验";
    const setLabel = selectedQuestionSet.label ? ` · ${selectedQuestionSet.label}` : "";
    elements.courseLabel.textContent = `${meta.course || "Quiz"}${setLabel}`;
    if (meta.instructions) {
      elements.introText.innerHTML = cleanQuestionText(meta.instructions);
      elements.introText.hidden = false;
    }
    elements.startButton.disabled = true;

    const savedTheme = localStorage.getItem("texQuizTheme");
    if (savedTheme === "dark") {
      document.documentElement.dataset.theme = "dark";
      updateThemeIcon();
    }

    elements.studentForm.addEventListener("submit", startQuiz);
    elements.prevButton.addEventListener("click", () => goToQuestion(state.currentIndex - 1));
    elements.nextButton.addEventListener("click", () => goToQuestion(state.currentIndex + 1));
    elements.submitButton.addEventListener("click", () => submitQuiz(false));
    elements.restartButton.addEventListener("click", restart);
    elements.homeButton.addEventListener("click", showStartView);
    elements.downloadCsvButton.addEventListener("click", downloadCsv);
    elements.copySummaryButton.addEventListener("click", copySummary);
    elements.clearHistoryButton.addEventListener("click", clearHistory);
    elements.themeToggle.addEventListener("click", toggleTheme);

    await loadQuestionBank();
    renderHistoryPanel();
    refreshIcons();
  }

  async function loadQuestionBank() {
    const source = String(settings.questionSource || "").trim();
    if (!source) {
      updateSourceStatus(`已载入 ${originalQuestions.length} 题 · ${activeQuestionSource || "内置题库"}`);
      elements.startButton.disabled = !originalQuestions.length;
      return;
    }

    updateSourceStatus("正在加载题库表...");
    try {
      const response = await fetch(source, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const csv = await response.text();
      const { questions, skipped } = questionsFromCsv(csv);
      if (!questions.length) throw new Error("题库表没有可用题目");

      originalQuestions = questions;
      activeQuestionSource = source;
      const skippedText = skipped ? `，跳过 ${skipped} 行` : "";
      updateSourceStatus(`已从题库表载入 ${questions.length} 题${skippedText}`);
      elements.startButton.disabled = false;
    } catch (error) {
      if (originalQuestions.length) {
        updateSourceStatus(`题库表读取失败，已改用内置题库 ${originalQuestions.length} 题`);
        elements.startButton.disabled = false;
      } else {
        updateSourceStatus("题库加载失败，请联系老师检查题库表。");
        elements.startButton.disabled = true;
      }
    }
  }

  function questionsFromCsv(csv) {
    const rows = parseCsv(csv).filter((row) => row.some((cell) => cell.trim()));
    if (rows.length < 2) return { questions: [], skipped: rows.length };

    const headers = rows[0].map(normalizeHeader);
    const questions = [];
    let skipped = 0;

    rows.slice(1).forEach((row, index) => {
      const record = {};
      headers.forEach((header, cellIndex) => {
        record[header] = (row[cellIndex] || "").trim();
      });

      if (isDisabledRow(getField(record, ["enabled", "enable", "启用", "是否启用", "发布"]))) return;

      const prompt = getField(record, ["prompt", "question", "title", "题干", "题目", "问题"]);
      const answer = normalizeAnswerText(getField(record, ["answer", "correct", "正确答案", "答案"]));
      const score = Number(getField(record, ["score", "points", "point", "分值", "分数"]) || 1);
      const id = getField(record, ["id", "编号", "题号"]) || `q${index + 1}`;
      const explanation = getField(record, ["explanation", "解析", "答案解析", "说明"]);
      const options = optionFields(record);

      if (!prompt || options.length < 2 || !answer || normalizeAnswer(answer, options) < 0) {
        skipped += 1;
        return;
      }

      questions.push({
        id,
        prompt: cleanQuestionText(prompt),
        options: options.map(cleanQuestionText),
        explanation: cleanQuestionText(explanation),
        answer,
        score: Number.isFinite(score) && score > 0 ? score : 1
      });
    });

    return { questions, skipped };
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

  function normalizeHeader(header) {
    return String(header || "")
      .trim()
      .replace(/^\uFEFF/, "")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function getField(record, names) {
    for (const name of names) {
      const value = record[normalizeHeader(name)];
      if (value !== undefined && value !== "") return value;
    }
    return "";
  }

  function optionFields(record) {
    return letters
      .map((letter) => getField(record, [letter, `选项${letter}`, `option${letter}`]))
      .filter((value) => value !== "");
  }

  function isDisabledRow(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return ["0", "false", "no", "n", "否", "不启用", "停用", "隐藏"].includes(normalized);
  }

  function normalizeAnswerText(value) {
    const normalized = String(value || "")
      .trim()
      .replace(/^选项/i, "")
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
    return /^[a-z]$/i.test(normalized) ? normalized.toUpperCase() : normalized;
  }

  function cleanQuestionText(value) {
    return escapeHtml(String(value || "").trim()).replace(/\n/g, "<br>");
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function updateSourceStatus(message) {
    elements.sourceStatus.textContent = message;
  }

  function startQuiz(event) {
    event.preventDefault();
    if (!originalQuestions.length) {
      updateSourceStatus("题库还没有可用题目。");
      return;
    }

    state.student = {
      name: elements.studentName.value.trim(),
      className: "",
      studentId: elements.studentId.value.trim()
    };
    state.startedAt = new Date();
    state.endedAt = null;
    state.currentIndex = 0;
    state.answers = {};
    state.viewingHistory = false;
    state.submitted = false;
    state.result = null;
    state.questions = prepareQuestions(originalQuestions);

    elements.startView.hidden = true;
    elements.quizView.hidden = false;
    elements.resultView.hidden = true;
    buildNumberGrid();
    setupTimer();
    renderQuestion();
  }

  function prepareQuestions(questions) {
    const prepared = questions.map((question, questionIndex) => {
      const normalizedOptions = question.options.map((text, optionIndex) => ({
        text,
        originalIndex: optionIndex,
        originalLetter: letters[optionIndex]
      }));
      const correctIndex = normalizeAnswer(question.answer, question.options);
      const options = settings.shuffleOptions ? shuffle(normalizedOptions) : normalizedOptions;
      return {
        ...question,
        sourceIndex: questionIndex,
        score: Number(question.score || 0),
        correctIndex,
        options
      };
    });
    return settings.shuffleQuestions ? shuffle(prepared) : prepared;
  }

  function normalizeAnswer(answer, options) {
    if (typeof answer === "number") {
      return answer >= 0 && answer < options.length ? answer : answer - 1;
    }
    if (typeof answer === "string") {
      const trimmed = answer.trim().toUpperCase();
      if (/^[A-Z]$/.test(trimmed)) {
        return letters.indexOf(trimmed);
      }
      const optionIndex = options.findIndex((option) => option.trim() === answer.trim());
      if (optionIndex >= 0) return optionIndex;
    }
    return -1;
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function setupTimer() {
    clearInterval(state.timerId);
    const minutes = Number(meta.timeLimitMinutes || 0);
    if (!minutes) {
      elements.timer.hidden = true;
      return;
    }

    state.deadline = Date.now() + minutes * 60 * 1000;
    elements.timer.hidden = false;
    updateTimer();
    state.timerId = setInterval(updateTimer, 1000);
  }

  function updateTimer() {
    const remaining = Math.max(0, state.deadline - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    elements.timerText.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    elements.timer.classList.toggle("danger", remaining <= 60000);
    if (remaining === 0) submitQuiz(true);
  }

  function buildNumberGrid() {
    elements.numberGrid.innerHTML = "";
    state.questions.forEach((question, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(index + 1);
      button.className = "number-button";
      button.setAttribute("aria-label", `第 ${index + 1} 题`);
      button.addEventListener("click", () => goToQuestion(index));
      elements.numberGrid.append(button);
    });
  }

  function goToQuestion(index) {
    if (index < 0 || index >= state.questions.length) return;
    state.currentIndex = index;
    renderQuestion();
  }

  function renderQuestion() {
    const question = state.questions[state.currentIndex];
    const selected = state.answers[question.id];
    elements.progressText.textContent = `第 ${state.currentIndex + 1} / ${state.questions.length} 题`;
    elements.answeredText.textContent = `${Object.keys(state.answers).length} 已答`;
    elements.progressFill.style.width = `${((state.currentIndex + 1) / state.questions.length) * 100}%`;
    elements.questionBadge.textContent = "单选";
    elements.questionScore.textContent = `${question.score} 分`;
    elements.questionText.innerHTML = question.prompt;
    elements.options.innerHTML = "";

    question.options.forEach((option, visibleIndex) => {
      const label = document.createElement("label");
      label.className = "option";
      if (selected === option.originalIndex) label.classList.add("selected");

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `question-${question.id}`;
      input.value = String(option.originalIndex);
      input.checked = selected === option.originalIndex;
      input.addEventListener("change", () => {
        state.answers[question.id] = option.originalIndex;
        renderQuestion();
      });

      const letter = document.createElement("span");
      letter.className = "option-letter";
      letter.textContent = letters[visibleIndex];

      const text = document.createElement("span");
      text.className = "option-text";
      text.innerHTML = option.text;

      label.append(input, letter, text);
      elements.options.append(label);
    });

    elements.prevButton.disabled = state.currentIndex === 0;
    elements.nextButton.disabled = state.currentIndex === state.questions.length - 1;
    updateNumberGrid();
    typeset();
    refreshIcons();
  }

  function updateNumberGrid() {
    [...elements.numberGrid.children].forEach((button, index) => {
      const question = state.questions[index];
      button.classList.toggle("active", index === state.currentIndex);
      button.classList.toggle("answered", state.answers[question.id] !== undefined);
    });
  }

  function submitQuiz(isAutoSubmit) {
    if (state.submitted) return;
    if (!isAutoSubmit) {
      const unanswered = state.questions.length - Object.keys(state.answers).length;
      if (unanswered > 0) {
        const ok = window.confirm(`还有 ${unanswered} 题未作答，确定交卷吗？`);
        if (!ok) return;
      }
    }

    state.submitted = true;
    state.endedAt = new Date();
    clearInterval(state.timerId);
    state.result = gradeQuiz();
    renderResult(isAutoSubmit);
    saveCurrentAttempt(isAutoSubmit);
    renderHistoryPanel();
    sendResult();
  }

  function gradeQuiz() {
    let earned = 0;
    let total = 0;
    let correctCount = 0;

    const items = state.questions.map((question) => {
      total += question.score;
      const selectedIndex = state.answers[question.id];
      const selectedVisibleIndex = question.options.findIndex((option) => option.originalIndex === selectedIndex);
      const correctVisibleIndex = question.options.findIndex((option) => option.originalIndex === question.correctIndex);
      const isCorrect = selectedIndex === question.correctIndex;
      if (isCorrect) {
        earned += question.score;
        correctCount += 1;
      }
      return {
        id: question.id,
        prompt: question.prompt,
        selectedIndex,
        selectedLetter: selectedIndex === undefined ? "" : letters[selectedVisibleIndex],
        correctIndex: question.correctIndex,
        correctLetter: letters[correctVisibleIndex],
        explanation: question.explanation || "",
        isCorrect,
        score: isCorrect ? question.score : 0,
        maxScore: question.score,
        options: question.options
      };
    });

    return {
      earned,
      total,
      percent: total ? Math.round((earned / total) * 100) : 0,
      correctCount,
      questionCount: state.questions.length,
      durationSeconds: Math.round((state.endedAt - state.startedAt) / 1000),
      items
    };
  }

  function renderResult(isAutoSubmit) {
    elements.quizView.hidden = true;
    elements.startView.hidden = true;
    elements.resultView.hidden = false;
    elements.scoreNumber.textContent = `${state.result.earned}`;
    elements.scoreDetail.textContent = `${state.result.total} 分满分 · ${state.result.correctCount}/${state.result.questionCount} 题正确 · ${formatDuration(state.result.durationSeconds)}`;
    elements.submitStatus.textContent = isAutoSubmit ? "时间到，已自动交卷。" : "";

    elements.reviewPanel.innerHTML = "";
    state.result.items.forEach((item, index) => {
      const article = document.createElement("article");
      article.className = `review-item ${item.isCorrect ? "correct" : "wrong"}`;

      const title = document.createElement("div");
      title.className = "review-title";
      title.innerHTML = `<strong>${index + 1}.</strong> ${item.prompt}`;

      const meta = document.createElement("div");
      meta.className = "review-meta";
      const selected = item.selectedLetter || "未答";
      const correct = settings.showCorrectAnswers ? ` · 正确答案 ${item.correctLetter}` : "";
      meta.textContent = `${item.isCorrect ? "正确" : "错误"} · 你的答案 ${selected}${correct}`;

      article.append(title, meta);
      if (item.explanation) {
        const explanation = document.createElement("div");
        explanation.className = "review-explanation";
        explanation.innerHTML = `<strong>解析</strong><span>${item.explanation}</span>`;
        article.append(explanation);
      }

      if (settings.showCorrectAnswers) {
        const options = document.createElement("div");
        options.className = "review-options";
        item.options.forEach((option, optionIndex) => {
          const row = document.createElement("div");
          const originalLetter = letters[option.originalIndex];
          row.className = "review-option";
          row.classList.toggle("is-answer", option.originalIndex === item.correctIndex);
          row.classList.toggle("is-selected", option.originalIndex === item.selectedIndex);
          row.innerHTML = `<span>${letters[optionIndex]}</span><span>${option.text}</span><small>原选项 ${originalLetter}</small>`;
          options.append(row);
        });
        article.append(options);
      }
      elements.reviewPanel.append(article);
    });

    typeset();
    refreshIcons();
  }

  function sendResult() {
    if (state.viewingHistory) return;

    const payload = buildPayload();
    if (wantsSupabaseSubmit()) {
      if (!isSupabaseConfigured()) {
        elements.submitStatus.textContent = elements.submitStatus.textContent || "Supabase 还没有配置，成绩已在本机生成。";
        return;
      }

      elements.submitStatus.textContent = "正在提交成绩...";
      submitSupabaseResult(payload)
        .then(() => {
          elements.submitStatus.textContent = "成绩已提交到 Supabase。";
        })
        .catch((error) => {
          elements.submitStatus.textContent = `成绩提交失败：${error.message || "请检查 Supabase 配置和网络。"} 可先下载成绩文件或复制提交内容交给老师。`;
        });
      return;
    }

    const endpoint = String(settings.submitEndpoint || "").trim();
    if (!endpoint) {
      elements.submitStatus.textContent = elements.submitStatus.textContent || "成绩已在本机生成。";
      return;
    }

    elements.submitStatus.textContent = "正在提交成绩...";
    submitResult(endpoint, payload)
      .then((data) => {
        if (!data || data.ok !== true || data.saved !== true) {
          throw new Error(data && data.error ? data.error : "收集端没有确认写入，请检查收集服务。");
        }
        elements.submitStatus.textContent = "成绩已提交到收集表。";
      })
      .catch((error) => {
        elements.submitStatus.textContent = `成绩提交失败：${error.message || "请检查网络或收集脚本部署。"} 可先下载成绩文件或复制提交内容交给老师。`;
    });
  }

  async function submitSupabaseResult(payload) {
    const response = await fetch(`${normalizeSupabaseUrl()}/rest/v1/quiz_results`, {
      method: "POST",
      headers: {
        apikey: settings.supabaseAnonKey.trim(),
        Authorization: `Bearer ${settings.supabaseAnonKey.trim()}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(supabaseRecordFromPayload(payload))
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `HTTP ${response.status}`);
    }

    return { ok: true, saved: true };
  }

  function submitResult(endpoint, payload) {
    return new Promise((resolve, reject) => {
      const callbackName = `__quizSubmitCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const url = new URL(endpoint, window.location.href);
      url.searchParams.set("action", "submit");
      url.searchParams.set("callback", callbackName);
      Object.entries(compactPayload(payload)).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });

      const script = document.createElement("script");
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("连接收集端超时"));
      }, 20000);

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
        reject(new Error("无法连接收集端"));
      };
      script.src = url.toString();
      document.head.append(script);
    });
  }

  function wantsSupabaseSubmit() {
    const provider = String(settings.submitProvider || "").trim().toLowerCase();
    return provider === "supabase" || Boolean(settings.supabaseUrl || settings.supabaseAnonKey);
  }

  function isSupabaseConfigured() {
    return Boolean(String(settings.supabaseUrl || "").trim() && String(settings.supabaseAnonKey || "").trim());
  }

  function normalizeSupabaseUrl() {
    return String(settings.supabaseUrl || "")
      .trim()
      .replace(/\/+$/, "")
      .replace(/\/rest\/v1$/i, "");
  }

  function supabaseRecordFromPayload(payload) {
    return {
      submitted_at: new Date().toISOString(),
      quiz: payload.quizTitle,
      question_set: payload.questionSet,
      course: payload.course,
      name: payload.student.name,
      class: payload.student.className,
      student_id: payload.student.studentId,
      score: payload.score,
      total: payload.total,
      percent: payload.percent,
      correct: payload.correctCount,
      questions: payload.questionCount,
      started_at: payload.startedAt,
      ended_at: payload.endedAt,
      duration_seconds: payload.durationSeconds,
      answers_json: payload.answers
    };
  }

  function compactPayload(payload) {
    return {
      quiz: payload.quizTitle,
      set: payload.questionSet,
      course: payload.course,
      name: payload.student.name,
      class: payload.student.className,
      student_id: payload.student.studentId,
      score: payload.score,
      total: payload.total,
      percent: payload.percent,
      correct: payload.correctCount,
      questions: payload.questionCount,
      started_at: payload.startedAt,
      ended_at: payload.endedAt,
      duration_seconds: payload.durationSeconds,
      answers: payload.answers.map((answer) => [
        answer.id,
        answer.selected || "",
        answer.correct || "",
        answer.isCorrect ? "1" : "0",
        answer.score,
        answer.maxScore
      ].join(":")).join(";")
    };
  }

  function buildPayload() {
    return {
      quizTitle: meta.title || "",
      questionSet: selectedQuestionSet.id || "",
      course: meta.course || "",
      student: state.student,
      score: state.result.earned,
      total: state.result.total,
      percent: state.result.percent,
      correctCount: state.result.correctCount,
      questionCount: state.result.questionCount,
      startedAt: state.startedAt.toISOString(),
      endedAt: state.endedAt.toISOString(),
      durationSeconds: state.result.durationSeconds,
      answers: state.result.items.map((item) => ({
        id: item.id,
        selected: item.selectedLetter,
        correct: item.correctLetter,
        isCorrect: item.isCorrect,
        score: item.score,
        maxScore: item.maxScore
      }))
    };
  }

  function saveCurrentAttempt(isAutoSubmit) {
    if (state.viewingHistory) return;

    const attempt = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      quizTitle: meta.title || "",
      course: meta.course || "",
      student: { ...state.student },
      startedAt: state.startedAt.toISOString(),
      endedAt: state.endedAt.toISOString(),
      autoSubmitted: Boolean(isAutoSubmit),
      result: state.result
    };
    const history = [attempt, ...loadHistory()].slice(0, historyLimit);
    localStorage.setItem(historyStorageKey(), JSON.stringify(history));
  }

  function loadHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(historyStorageKey()) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function historyStorageKey() {
    return `texQuizHistory:${meta.title || document.title || "quiz"}`;
  }

  function renderHistoryPanel() {
    const history = loadHistory();
    elements.historyPanel.hidden = history.length === 0;
    elements.historyList.innerHTML = "";
    if (!history.length) return;

    history.forEach((attempt) => {
      const item = document.createElement("article");
      item.className = "history-item";

      const copy = document.createElement("div");
      copy.className = "history-copy";

      const title = document.createElement("strong");
      title.textContent = `${attempt.student && attempt.student.name ? attempt.student.name : "未命名"} · ${attempt.result.earned}/${attempt.result.total}`;

      const detail = document.createElement("span");
      detail.textContent = `${formatDateTime(attempt.endedAt)} · ${attempt.result.correctCount}/${attempt.result.questionCount} 题正确`;

      const button = document.createElement("button");
      button.className = "secondary";
      button.type = "button";
      button.innerHTML = '<i data-lucide="eye"></i> 查看';
      button.addEventListener("click", () => openHistoryAttempt(attempt.id));

      copy.append(title, detail);
      item.append(copy, button);
      elements.historyList.append(item);
    });

    refreshIcons();
  }

  function openHistoryAttempt(attemptId) {
    const attempt = loadHistory().find((item) => item.id === attemptId);
    if (!attempt) {
      renderHistoryPanel();
      return;
    }

    state.student = { ...(attempt.student || {}) };
    state.startedAt = new Date(attempt.startedAt);
    state.endedAt = new Date(attempt.endedAt);
    state.result = attempt.result;
    state.viewingHistory = true;
    state.submitted = true;

    elements.startView.hidden = true;
    elements.quizView.hidden = true;
    renderResult(Boolean(attempt.autoSubmitted));
    elements.submitStatus.textContent = "正在查看本机保存的历史记录。";
  }

  function clearHistory() {
    const ok = window.confirm("确定清空本机保存的作答历史吗？");
    if (!ok) return;
    localStorage.removeItem(historyStorageKey());
    renderHistoryPanel();
  }

  function downloadCsv() {
    const payload = buildPayload();
    const rows = [
      ["quiz", "name", "class", "student_id", "score", "total", "percent", "correct", "questions", "started_at", "ended_at", "duration_seconds"],
      [
        payload.quizTitle,
        payload.student.name,
        payload.student.className,
        payload.student.studentId,
        payload.score,
        payload.total,
        payload.percent,
        payload.correctCount,
        payload.questionCount,
        payload.startedAt,
        payload.endedAt,
        payload.durationSeconds
      ],
      [],
      ["question_id", "selected", "correct", "is_correct", "score", "max_score"],
      ...payload.answers.map((answer) => [answer.id, answer.selected, answer.correct, answer.isCorrect ? "TRUE" : "FALSE", answer.score, answer.maxScore])
    ];

    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = resultFileName(payload);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function resultFileName(payload) {
    const setName = selectedQuestionSet.label || payload.questionSet || "测验";
    const name = payload.student.name || "未命名";
    const studentId = payload.student.studentId || "无学号";
    const stamp = formatFileDate(new Date());
    return sanitizeFileName(`${setName}-${name}-${studentId}-${stamp}.csv`);
  }

  function csvCell(value) {
    const text = value === undefined || value === null ? "" : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  }

  function sanitizeFileName(value) {
    return value.replace(/[\\/:*?"<>|]/g, "_");
  }

  function formatFileDate(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  }

  function copySummary() {
    navigator.clipboard.writeText(summaryText()).then(() => {
      elements.submitStatus.textContent = "提交内容已复制，请粘贴到老师指定的收集表。";
    });
  }

  function summaryText() {
    const payload = buildPayload();
    const answers = payload.answers
      .map((answer, index) => `${index + 1}.${answer.selected || "未答"}${answer.isCorrect ? "" : `(错, 正确${answer.correct})`}`)
      .join(" ");

    return [
      "QUIZ_RESULT_V1",
      `试卷：${payload.quizTitle}`,
      `章节：${selectedQuestionSet.label || payload.questionSet || "-"}`,
      `章节编号：${payload.questionSet || "-"}`,
      `姓名：${payload.student.name}`,
      `学号：${payload.student.studentId || "-"}`,
      `成绩：${payload.score}/${payload.total}`,
      `正确：${payload.correctCount}/${payload.questionCount}`,
      `用时：${formatDuration(payload.durationSeconds)}`,
      `开始：${payload.startedAt}`,
      `交卷：${payload.endedAt}`,
      `答题：${answers}`,
      `机器码：${compactAnswers(payload.answers)}`
    ].join("\n");
  }

  function compactAnswers(answers) {
    return answers.map((answer) => [
      answer.id,
      answer.selected || "",
      answer.correct || "",
      answer.isCorrect ? "1" : "0",
      answer.score,
      answer.maxScore
    ].join(":")).join(";");
  }

  function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}分${String(rest).padStart(2, "0")}秒`;
  }

  function restart() {
    clearInterval(state.timerId);
    elements.resultView.hidden = true;
    elements.startView.hidden = false;
    elements.submitStatus.textContent = "";
    state.questions = [];
    state.answers = {};
    state.currentIndex = 0;
    state.viewingHistory = false;
    state.submitted = false;
  }

  function showStartView() {
    clearInterval(state.timerId);
    elements.resultView.hidden = true;
    elements.quizView.hidden = true;
    elements.startView.hidden = false;
    elements.submitStatus.textContent = "";
    state.viewingHistory = false;
    renderHistoryPanel();
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme;
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("texQuizTheme", next);
    updateThemeIcon();
  }

  function updateThemeIcon() {
    const isDark = document.documentElement.dataset.theme === "dark";
    elements.themeToggle.innerHTML = `<i data-lucide="${isDark ? "sun" : "moon"}"></i>`;
    refreshIcons();
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
  }

  function typeset() {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  }

  function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function resolveQuestionSet(questionSets, defaultSet, settingsForSets) {
    const params = new URLSearchParams(window.location.search);
    const requested = String(params.get("set") || params.get("paper") || defaultSet || "").trim();
    const explicit = Boolean(params.get("set") || params.get("paper"));
    const setIds = Object.keys(questionSets || {});
    if (!setIds.length && !explicit) return { id: "" };

    const exactId = setIds.find((id) => id === requested);
    const normalizedId = setIds.find((id) => normalizeSetId(id) === normalizeSetId(requested));
    if (exactId || normalizedId) {
      const id = exactId || normalizedId;
      return {
        id,
        explicit,
        ...(questionSets[id] || {})
      };
    }

    if (explicit && isSafeSetId(requested)) {
      return autoQuestionSet(requested, settingsForSets, explicit);
    }

    const fallbackId = setIds.includes(defaultSet) ? defaultSet : setIds[0];
    if (!fallbackId) return { id: "", explicit };
    return {
      id: fallbackId,
      explicit,
      ...(questionSets[fallbackId] || {})
    };
  }

  function autoQuestionSet(setId, settingsForSets, explicit) {
    const rules = settingsForSets || {};
    const label = fillSetPattern(rules.autoQuestionSetLabelPattern || "第{set}套", setId);
    return {
      id: setId,
      explicit,
      label,
      title: fillSetPattern(rules.autoQuestionSetTitlePattern || "第{set}套在线练习", setId, label),
      questionSource: fillSetPattern(rules.autoQuestionSetPattern || "./question-sets/questions-{set}.csv", setId, label)
    };
  }

  function fillSetPattern(pattern, setId, label) {
    return String(pattern || "")
      .replaceAll("{set}", setId)
      .replaceAll("{label}", label || setId);
  }

  function isSafeSetId(value) {
    return /^[A-Za-z0-9_-]+$/.test(String(value || ""));
  }

  function normalizeSetId(value) {
    return String(value || "").trim().toLowerCase();
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
