function doGet() {
  try {
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

function doPost(e) {
  const sheet = getResultSheet_();
  const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");

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

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
