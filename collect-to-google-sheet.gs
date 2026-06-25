const STATS_TOKEN = "";

function doGet(e) {
  try {
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
  const sheet = getResultSheet_();
  const data = parsePayload_(e);

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
    JSON.stringify(data.answers || [])
  ]);

  return json_({ ok: true });
}

function parsePayload_(e) {
  if (e && e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
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

function getResultSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = "Results";
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
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
      "answers_json"
    ]);
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
