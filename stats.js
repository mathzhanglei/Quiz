(function () {
  const config = window.QUIZ_CONFIG || {};
  const baseSettings = config.settings || {};
  const questionSets = config.questionSets || baseSettings.questionSets || {};
  const selectedQuestionSet = resolveQuestionSet(questionSets, baseSettings.defaultSet || "default", baseSettings);
  const settings = {
    ...baseSettings,
    ...(selectedQuestionSet.settings || {})
  };
  if (selectedQuestionSet.questionSource) settings.questionSource = selectedQuestionSet.questionSource;
  const questionSource = settings.questionSource || "./question-sets/questions.csv";
  const selectedQuizTitle = selectedQuestionSet.title || (selectedQuestionSet.meta && selectedQuestionSet.meta.title) || (config.meta && config.meta.title) || "";
  const statsRpcName = String(settings.statsRpcName || "quiz_results_for_stats").trim();
  const clearRpcName = String(settings.clearRpcName || "quiz_clear_results_for_set").trim();
  const statsTokenKey = "texQuizStatsToken";
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  let questions = [];

  const $ = (id) => document.getElementById(id);
  const elements = {
    resultsFile: $("resultsFile"),
    statsToken: $("statsToken"),
    loadRemoteButton: $("loadRemoteButton"),
    loadSampleButton: $("loadSampleButton"),
    clearSetInput: $("clearSetInput"),
    clearSetButton: $("clearSetButton"),
    clearAllButton: $("clearAllButton"),
    statsStatus: $("statsStatus"),
    summaryGrid: $("summaryGrid"),
    statsPanels: $("statsPanels"),
    scoreBars: $("scoreBars"),
    studentTableBody: $("studentTableBody"),
    wrongRankPanel: $("wrongRankPanel"),
    wrongRank: $("wrongRank"),
    questionStatsPanel: $("questionStatsPanel"),
    questionStats: $("questionStats")
  };

  async function boot() {
    refreshIcons();
    elements.resultsFile.addEventListener("change", handleFile);
    elements.loadRemoteButton.addEventListener("click", loadRemoteResults);
    elements.loadSampleButton.addEventListener("click", showEmptyStructure);
    elements.clearSetButton.addEventListener("click", clearSelectedSetResults);
    elements.clearAllButton.addEventListener("click", clearAllResults);
    await loadQuestions();
    setupRemoteControls();
  }

  function setupRemoteControls() {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get("statsToken") || params.get("token") || "";
    const savedToken = localStorage.getItem(statsTokenKey) || "";
    elements.statsToken.value = tokenFromUrl || savedToken;
    elements.loadRemoteButton.disabled = !hasSupabaseStatsSource();
    elements.clearSetInput.value = selectedQuestionSet.id || "";
    setClearButtonsDisabled(false);
    if (!hasSupabaseStatsSource()) {
      setStatus("没有配置 Supabase，可上传成绩 CSV。");
    }
    if (hasSupabaseStatsSource() && (params.get("autoload") === "1" || tokenFromUrl)) {
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
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const attempts = [];

    for (const file of files) {
      const text = await file.text();
      attempts.push(...attemptsFromCsv(text));
    }

    const filtered = filterAttemptsByQuestionSet(attempts);
    if (!filtered.length) {
      setStatus("没有识别到有效成绩记录。");
      return;
    }

    renderStats(filtered);
    setStatus(`已从 ${files.length} 个 CSV 统计 ${filtered.length} 份提交。`);
  }

  function attemptsFromCsv(text) {
    const rawRows = parseCsv(text);
    const personal = attemptFromPersonalCsv(rawRows);
    if (personal) return [personal];

    const rows = rawRows.filter((row) => row.some((cell) => cell.trim()));
    if (rows.length < 2) return [];
    const records = recordsFromRows(rows);
    return records.map(normalizeAttempt).filter(Boolean);
  }

  function attemptFromPersonalCsv(rows) {
    const blankIndex = rows.findIndex((row) => !row.some((cell) => cell.trim()));
    const answerHeaderIndex = rows.findIndex((row) => normalizeHeader(row[0]) === "question_id");
    if (blankIndex < 0 || answerHeaderIndex < 0 || rows.length <= answerHeaderIndex + 1) return null;

    const summary = recordsFromRows(rows.slice(0, blankIndex))[0];
    if (!summary) return null;
    const answerRows = rows.slice(answerHeaderIndex);
    const answerRecords = recordsFromRows(answerRows);
    const answers = answerRecords.map((record) => ({
      id: getField(record, ["question_id", "questionid", "题号", "编号"]),
      selected: normalizeAnswerText(getField(record, ["selected", "选择", "作答"])),
      correct: normalizeAnswerText(getField(record, ["correct", "答案", "正确答案"])),
      isCorrect: truthyValue(getField(record, ["is_correct", "iscorrect", "是否正确"])),
      score: firstFinite(numberField(record, ["score", "得分"]), 0),
      maxScore: firstFinite(numberField(record, ["max_score", "maxscore", "分值"]), 1)
    }));
    const attempt = normalizeAttempt({
      ...summary,
      answers_json: JSON.stringify(answers)
    });
    return attempt && attempt.answers.length ? attempt : null;
  }

  function attemptsFromRecords(records) {
    const attempts = records.map(normalizeAttempt).filter(Boolean);
    return filterAttemptsByQuestionSet(attempts);
  }

  function filterAttemptsByQuestionSet(attempts) {
    if (!selectedQuestionSet.explicit || !selectedQuestionSet.id) return attempts;
    const selectedSetId = normalizeSetId(selectedQuestionSet.id);
    const selectedTitle = normalizeComparable(selectedQuizTitle);
    const filtered = attempts.filter((attempt) => {
      const attemptSet = normalizeSetId(attempt.questionSet);
      const attemptTitle = normalizeComparable(attempt.quizTitle);
      return attemptSet === selectedSetId || (selectedTitle && attemptTitle === selectedTitle);
    });
    return filtered;
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

  async function loadRemoteResults() {
    if (!hasSupabaseStatsSource()) {
      setStatus("没有配置 Supabase，可上传成绩 CSV。");
      return;
    }

    await loadSupabaseResults();
  }

  async function loadSupabaseResults() {
    const token = elements.statsToken.value.trim();
    if (!token) {
      setStatus("请输入统计口令。");
      return;
    }

    localStorage.setItem(statsTokenKey, token);
    setStatus("正在从 Supabase 读取成绩...");

    try {
      const records = await fetchSupabaseRecords(token);
      const attempts = attemptsFromRecords(Array.isArray(records) ? records : []);
      if (!attempts.length) {
        setStatus("已经连上 Supabase，但还没有识别到有效成绩。");
        return;
      }

      renderStats(attempts);
      setStatus(`已从 Supabase 读取并统计 ${attempts.length} 份提交。`);
    } catch (error) {
      setStatus(`自动读取失败：${error.message || "请检查统计口令和 Supabase 配置。"} 也可以先上传成绩 CSV。`);
    }
  }

  async function clearSelectedSetResults() {
    if (!hasSupabaseStatsSource()) {
      setStatus("没有配置 Supabase，无法清空后台数据。");
      return;
    }

    const token = elements.statsToken.value.trim();
    if (!token) {
      setStatus("请输入统计口令。");
      return;
    }

    const setId = elements.clearSetInput.value.trim();
    if (!setId) {
      setStatus("请输入要清空的题库编号，例如 3。");
      return;
    }

    const setLabel = selectedQuestionSet.id === setId ? selectedQuestionSet.label || setId : `第 ${setId} 套`;
    const confirmText = `清空${setId}`;
    const typed = window.prompt(`将删除题库编号 ${setId} 的所有提交数据，不能撤销。\n请输入“${confirmText}”确认：`);
    if (typed !== confirmText) {
      setStatus("已取消清空。");
      return;
    }

    localStorage.setItem(statsTokenKey, token);
    setClearButtonsDisabled(true);
    setStatus(`正在清空 ${setLabel} 的提交数据...`);

    try {
      const deletedCount = await clearRemoteSet(token, setId);
      clearStatsView();
      setStatus(`已清空 ${setLabel} 的 ${deletedCount} 份提交。`);
    } catch (error) {
      setStatus(`清空失败：${error.message || "请检查统计口令和 Supabase 函数。"} `);
    } finally {
      setClearButtonsDisabled(false);
    }
  }

  async function clearAllResults() {
    if (!hasSupabaseStatsSource()) {
      setStatus("没有配置 Supabase，无法清空后台数据。");
      return;
    }

    const token = elements.statsToken.value.trim();
    if (!token) {
      setStatus("请输入统计口令。");
      return;
    }

    const confirmText = "清空全部";
    const typed = window.prompt(`将删除所有题库编号的提交数据，不能撤销。\n请输入“${confirmText}”确认：`);
    if (typed !== confirmText) {
      setStatus("已取消清空。");
      return;
    }

    localStorage.setItem(statsTokenKey, token);
    setClearButtonsDisabled(true);
    setStatus("正在读取后台提交数据...");

    try {
      const records = await fetchSupabaseRecords(token);
      const setIds = uniqueSetIds(records);
      if (!records.length || !setIds.length) {
        clearStatsView();
        setStatus("后台没有可清空的提交。");
        return;
      }

      setStatus(`正在清空全部提交数据，共 ${records.length} 份...`);
      let deletedCount = await clearRemoteSet(token, "__all__");
      if (deletedCount === 0 && records.length > 0) {
        deletedCount = 0;
        for (const setId of setIds) {
          deletedCount += await clearRemoteSet(token, setId);
        }
      }

      clearStatsView();
      setStatus(`已清空全部 ${deletedCount} 份提交。`);
    } catch (error) {
      setStatus(`清空失败：${error.message || "请检查统计口令和 Supabase 函数。"} `);
    } finally {
      setClearButtonsDisabled(false);
    }
  }

  async function fetchSupabaseRecords(token) {
    const response = await fetch(`${normalizeSupabaseUrl()}/rest/v1/rpc/${encodeURIComponent(statsRpcName)}`, {
      method: "POST",
      headers: {
        apikey: String(settings.supabaseAnonKey || "").trim(),
        Authorization: `Bearer ${String(settings.supabaseAnonKey || "").trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ p_token: token })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(readableSupabaseError(detail) || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async function clearRemoteSet(token, setId) {
    const response = await fetch(`${normalizeSupabaseUrl()}/rest/v1/rpc/${encodeURIComponent(clearRpcName)}`, {
      method: "POST",
      headers: {
        apikey: String(settings.supabaseAnonKey || "").trim(),
        Authorization: `Bearer ${String(settings.supabaseAnonKey || "").trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        p_token: token,
        p_question_set: setId
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(readableSupabaseError(detail) || `HTTP ${response.status}`);
    }

    return deletedCountFromRpc(await response.json());
  }

  function uniqueSetIds(records) {
    return Array.from(new Set((Array.isArray(records) ? records : [])
      .map((record) => String(record && record.question_set !== undefined ? record.question_set : "").trim())
      .filter(Boolean)));
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

  function normalizeAttempt(record) {
    const payload = parseJsonObject(getField(record, ["payload", "原始数据", "提交数据"]));
    const summaryPayload = parseSummaryText(getField(record, ["提交内容", "复制内容", "摘要", "summary", "content"]));
    const student = payload && payload.student ? payload.student : {};
    const rawAnswers = getField(record, ["answers_json", "answers", "答题", "作答记录"]);
    const answers = normalizeAnswers(
      Array.isArray(payload && payload.answers)
        ? payload.answers
        : summaryPayload.answers.length
          ? summaryPayload.answers
          : Array.isArray(rawAnswers)
            ? rawAnswers
            : parseJsonArray(rawAnswers)
    );

    const scoreFromRecord = numberField(record, ["score", "成绩", "得分"]);
    const scoreFromPayload = payload ? Number(payload.score) : NaN;
    const scoreFromSummary = Number(summaryPayload.score);
    const scoreFromAnswers = answers.length ? answers.reduce((sum, answer) => sum + Number(answer.score || 0), 0) : NaN;
    const score = firstFinite(scoreFromRecord, scoreFromPayload, scoreFromSummary, scoreFromAnswers);

    const totalFromQuestions = questions.length ? questions.reduce((sum, question) => sum + Number(question.score || 1), 0) : NaN;
    const totalFromAnswers = answers.length ? answers.reduce((sum, answer) => sum + Number(answer.maxScore || 1), 0) : NaN;
    const total = firstFinite(numberField(record, ["total", "满分", "总分"]), payload ? Number(payload.total) : NaN, Number(summaryPayload.total), totalFromQuestions, totalFromAnswers);
    const correctCount = firstFinite(
      numberField(record, ["correct", "correctcount", "正确", "正确数"]),
      payload ? Number(payload.correctCount) : NaN,
      Number(summaryPayload.correctCount),
      answers.length ? answers.filter((answer) => answer.isCorrect).length : NaN
    );
    const questionCount = firstFinite(numberField(record, ["questions", "questioncount", "题数"]), payload ? Number(payload.questionCount) : NaN, Number(summaryPayload.questionCount), questions.length || NaN, answers.length || NaN);

    if (!answers.length && !Number.isFinite(score)) return null;

    return {
      quizTitle: getField(record, ["quiz", "quiztitle", "试卷", "测验"]) || (payload && payload.quizTitle) || summaryPayload.quizTitle || "",
      questionSet: getField(record, ["question_set", "questionset", "set", "卷别", "章节编号"]) || (payload && payload.questionSet) || summaryPayload.questionSet || "",
      name: getField(record, ["name", "姓名"]) || student.name || summaryPayload.name || "-",
      className: getField(record, ["class", "className", "class_name", "班级"]) || student.className || "-",
      studentId: getField(record, ["student_id", "studentid", "学号"]) || student.studentId || summaryPayload.studentId || "-",
      score: Number.isFinite(score) ? score : 0,
      total,
      percent: firstFinite(numberField(record, ["percent", "百分比"]), payload ? Number(payload.percent) : NaN, total ? Math.round((score / total) * 100) : 0),
      correctCount: Number.isFinite(correctCount) ? correctCount : 0,
      questionCount,
      durationSeconds: firstFinite(numberField(record, ["duration_seconds", "durationseconds", "用时"]), payload ? Number(payload.durationSeconds) : NaN, Number(summaryPayload.durationSeconds), 0),
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
    const questionStats = computeQuestionStats(attempts);
    renderWrongRank(questionStats);
    renderQuestionStats(questionStats);

    elements.statsPanels.hidden = false;
    elements.wrongRankPanel.hidden = false;
    elements.questionStatsPanel.hidden = false;
    setStatus(`已统计 ${totalStudents} 份提交。`);
    typeset();
    refreshIcons();
  }

  function clearStatsView() {
    elements.summaryGrid.hidden = true;
    elements.summaryGrid.innerHTML = "";
    elements.statsPanels.hidden = true;
    elements.scoreBars.innerHTML = "";
    elements.studentTableBody.innerHTML = "";
    elements.wrongRankPanel.hidden = true;
    elements.wrongRank.innerHTML = "";
    elements.questionStatsPanel.hidden = true;
    elements.questionStats.innerHTML = "";
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
        <td>${escapeHtml(attempt.studentId)}</td>
        <td>${attempt.score}/${attempt.total}</td>
        <td>${attempt.correctCount}/${attempt.questionCount}</td>
        <td>${formatDuration(attempt.durationSeconds)}</td>
      </tr>
    `).join("");
  }

  function computeQuestionStats(attempts) {
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

    return stats;
  }

  function renderWrongRank(stats) {
    const ranked = stats
      .filter((item) => item.total > 0)
      .map((item) => ({
        ...item,
        wrong: item.total - item.correct,
        wrongRate: item.total ? Math.round(((item.total - item.correct) / item.total) * 100) : 0
      }))
      .sort((a, b) => b.wrongRate - a.wrongRate || b.wrong - a.wrong || a.index - b.index)
      .slice(0, 10);

    elements.wrongRank.innerHTML = ranked.map((item) => {
      const optionText = Object.entries(item.options)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([option, count]) => `${escapeHtml(option)}: ${count}`)
        .join(" · ") || "-";
      return `
        <article class="question-stat wrong-rank-item">
          <div class="question-stat-title">
            <strong>${item.index + 1}. ${escapeHtml(item.prompt)}</strong>
            <span>错 ${item.wrong}/${item.total} · ${item.wrongRate}%</span>
          </div>
          <div class="question-rate wrong-rate"><i style="width:${item.wrongRate}%"></i></div>
          <div class="question-stat-meta">
            <span>答案 ${escapeHtml(item.answer || "-")}</span>
            <span>${optionText}</span>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderQuestionStats(stats) {
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

  function parseJsonObject(value) {
    if (!value) return null;
    if (typeof value === "object" && !Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function parseJsonArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function readableSupabaseError(detail) {
    const parsed = parseJsonObject(detail);
    const message = parsed && parsed.message ? String(parsed.message) : String(detail || "");
    if (message.includes("invalid stats token")) return "统计口令不正确，或 Supabase 里还没有把默认口令改掉。";
    if (message.includes("missing question set")) return "没有传入题库编号，未清空。";
    return message;
  }

  function deletedCountFromRpc(data) {
    if (typeof data === "number") return data;
    if (Array.isArray(data) && data[0] && Number.isFinite(Number(data[0].deleted_count))) {
      return Number(data[0].deleted_count);
    }
    if (data && Number.isFinite(Number(data.deleted_count))) return Number(data.deleted_count);
    return 0;
  }

  function parseSummaryText(value) {
    const text = String(value || "").trim();
    const result = {
      quizTitle: "",
      questionSet: "",
      name: "",
      studentId: "",
      score: NaN,
      total: NaN,
      correctCount: NaN,
      questionCount: NaN,
      durationSeconds: NaN,
      answers: []
    };
    if (!text) return result;

    text.split(/\r?\n/).forEach((line) => {
      const index = line.indexOf("：");
      if (index < 0) return;
      const key = line.slice(0, index).trim();
      const val = line.slice(index + 1).trim();
      if (key === "试卷") result.quizTitle = val;
      if (key === "章节编号") result.questionSet = val === "-" ? "" : val;
      if (key === "姓名") result.name = val;
      if (key === "学号") result.studentId = val === "-" ? "" : val;
      if (key === "成绩") {
        const match = val.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
        if (match) {
          result.score = Number(match[1]);
          result.total = Number(match[2]);
        }
      }
      if (key === "正确") {
        const match = val.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
        if (match) {
          result.correctCount = Number(match[1]);
          result.questionCount = Number(match[2]);
        }
      }
      if (key === "用时") result.durationSeconds = durationTextToSeconds(val);
      if (key === "机器码") result.answers = parseCompactAnswers(val);
    });

    return result;
  }

  function parseCompactAnswers(value) {
    if (!value) return [];
    return String(value).split(";")
      .filter(Boolean)
      .map((item) => {
        const parts = item.split(":");
        return {
          id: parts[0] || "",
          selected: parts[1] || "",
          correct: parts[2] || "",
          isCorrect: parts[3] === "1",
          score: Number(parts[4] || 0),
          maxScore: Number(parts[5] || 1)
        };
      });
  }

  function durationTextToSeconds(value) {
    const text = String(value || "");
    const match = text.match(/(\d+)分(\d+)秒/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
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
    const raw = getField(record, names);
    if (raw === "") return NaN;
    const value = Number(raw);
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

  function setClearButtonsDisabled(disabled) {
    const shouldDisable = disabled || !hasSupabaseStatsSource();
    elements.clearSetButton.disabled = shouldDisable;
    elements.clearAllButton.disabled = shouldDisable;
  }

  function hasSupabaseStatsSource() {
    const provider = String(settings.statsProvider || settings.submitProvider || "").trim().toLowerCase();
    const wantsSupabase = provider === "supabase" || Boolean(settings.supabaseUrl || settings.supabaseAnonKey);
    return Boolean(wantsSupabase && statsRpcName && String(settings.supabaseUrl || "").trim() && String(settings.supabaseAnonKey || "").trim());
  }

  function normalizeSupabaseUrl() {
    return String(settings.supabaseUrl || "")
      .trim()
      .replace(/\/+$/, "")
      .replace(/\/rest\/v1$/i, "");
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
  }

  function typeset() {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  }

  function resolveQuestionSet(questionSets, defaultSet, settingsForSets) {
    const params = new URLSearchParams(window.location.search);
    const requested = String(params.get("set") || params.get("paper") || defaultSet || "").trim();
    const explicit = Boolean(params.get("set") || params.get("paper"));
    const setIds = Object.keys(questionSets || {});
    if (!setIds.length && !explicit) return { id: "", explicit };

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

  function normalizeComparable(value) {
    return String(value || "").trim().replace(/\s+/g, "");
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
