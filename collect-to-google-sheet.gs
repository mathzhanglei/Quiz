const STATS_TOKEN = "";

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === "submit") {
      const data = parsePayload_(e);
      appendResult_(data);
      return json_({ ok: true }, e.parameter.callback || "");
    }

    if (e && e.parameter && e.parameter.action === "results") {
      return results_(e);
    }

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) {
      return json_({
        ok: false,
        error: "No active spreadsheet. Open Apps Script from the target Google Sheet via Extensions > Apps Script."
      });
    }

    return json_({
      ok: true,
      spreadsheetName: spreadsheet.getName(),
      spreadsheetId: spreadsheet.getId()
    });
  } catch (error) {
    return json_({ ok: false, error: String(error) });
  }
}

function results_(e) {
  const callback = e && e.parameter && e.parameter.callback || "";

  if (!STATS_TOKEN) {
    return json_({
      ok: false,
      error: "请先在收集脚本里设置 STATS_TOKEN，然后重新部署 Web App。"
    }, callback);
  }

  if (!e || !e.parameter || e.parameter.token !== STATS_TOKEN) {
    return json_({ ok: false, error: "统计口令不正确。" }, callback);
  }

  const sheet = getResultSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return json_({ ok: true, records: [], count: 0 }, callback);
  }

  const headers = values[0].map(function (value) {
    return String(value || "");
  });
  const records = values.slice(1)
    .filter(function (row) {
      return row.some(function (cell) { return cell !== "" && cell !== null; });
    })
    .map(function (row) {
      const record = {};
      headers.forEach(function (header, index) {
        record[header] = normalizeCell_(row[index]);
      });
      return record;
    });

  return json_({
    ok: true,
    records: records,
    count: records.length,
    generatedAt: new Date().toISOString()
  }, callback);
}

function doPost(e) {
  try {
    const data = parsePayload_(e);
    appendResult_(data);
    return json_({ ok: true });
  } catch (error) {
    return json_({ ok: false, error: String(error) });
  }
}

function appendResult_(data) {
  const sheet = getResultSheet_();
  sheet.appendRow([
    new Date(),
    data.quizTitle || "",
    data.course || "",
    data.student && data.student.name || "",
    data.student && data.student.className || "",
    data.student && data.student.studentId || "",
    data.score || 0,
    data.total || 0,
    data.percent || 0,
    data.correctCount || 0,
    data.questionCount || 0,
    data.startedAt || "",
    data.endedAt || "",
    data.durationSeconds || 0,
    JSON.stringify(data.answers || []),
    data.questionSet || ""
  ]);
}

function parsePayload_(e) {
  if (e && e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }

  if (e && e.parameter && e.parameter.action === "submit") {
    return {
      quizTitle: e.parameter.quiz || "",
      questionSet: e.parameter.set || "",
      course: e.parameter.course || "",
      student: {
        name: e.parameter.name || "",
        className: e.parameter.class || "",
        studentId: e.parameter.student_id || ""
      },
      score: Number(e.parameter.score || 0),
      total: Number(e.parameter.total || 0),
      percent: Number(e.parameter.percent || 0),
      correctCount: Number(e.parameter.correct || 0),
      questionCount: Number(e.parameter.questions || 0),
      startedAt: e.parameter.started_at || "",
      endedAt: e.parameter.ended_at || "",
      durationSeconds: Number(e.parameter.duration_seconds || 0),
      answers: parseAnswers_(e.parameter.answers || "")
    };
  }

  if (e && e.postData && e.postData.contents) {
    const contents = e.postData.contents;
    if (contents.indexOf("payload=") === 0) {
      const payload = contents
        .split("&")
        .map(function (part) { return part.split("="); })
        .filter(function (pair) { return decodeURIComponent(pair[0] || "") === "payload"; })
        .map(function (pair) { return decodeURIComponent((pair[1] || "").replace(/\+/g, " ")); })[0];
      if (payload) return JSON.parse(payload);
    }
    return JSON.parse(contents);
  }

  return {};
}

function parseAnswers_(value) {
  if (!value) return [];
  return value.split(";")
    .filter(function (item) { return item !== ""; })
    .map(function (item) {
      const parts = item.split(":");
      return {
        id: parts[0] || "",
        selected: parts[1] || "",
        correct: parts[2] || "",
        isCorrect: parts[3] === "1",
        score: Number(parts[4] || 0),
        maxScore: Number(parts[5] || 0)
      };
    });
}

function getResultSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = "Results";
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);

  const headers = [
    "submitted_at",
    "quiz",
    "course",
    "name",
    "class",
    "student_id",
    "score",
    "total",
    "percent",
    "correct",
    "questions",
    "started_at",
    "ended_at",
    "duration_seconds",
    "answers_json",
    "question_set"
  ];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else if (sheet.getRange(1, headers.length).getValue() !== headers[headers.length - 1]) {
    sheet.getRange(1, headers.length).setValue(headers[headers.length - 1]);
  }

  return sheet;
}

function normalizeCell_(value) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  return value;
}

function json_(data, callback) {
  if (callback) {
    const safeCallback = /^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback)
      ? callback
      : "";
    if (safeCallback) {
      return ContentService
        .createTextOutput(safeCallback + "(" + JSON.stringify(data) + ");")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
