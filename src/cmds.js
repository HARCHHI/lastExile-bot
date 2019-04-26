
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

const secret = JSON.parse(process.env.GOOGLE_APPLICATION_SECRET);
const oauth2Client = new OAuth2Client(
  secret.installed.client_id,
  secret.installed.client_secret,
  secret.installed.redirect_uris[0]
);

oauth2Client.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);

function appendNewRow(range, rowData) {
  const sheets = google.sheets('v4');
  const reqBody = {
    auth: oauth2Client,
    spreadsheetId: process.env.TARGET_SHEET_ID,
    range: encodeURI(range),
    insertDataOption: 'INSERT_ROWS',
    valueInputOption: 'RAW',
    resource: {
      values: rowData
    }
  };

  return sheets.spreadsheets.values.append(reqBody);
}

function updateRow(range, rowData) {
  const sheets = google.sheets('v4');
  const reqBody = {
    auth: oauth2Client,
    spreadsheetId: process.env.TARGET_SHEET_ID,
    range: encodeURI(range),
    valueInputOption: 'RAW',
    resource: {
      values: rowData
    }
  };
  return sheets.spreadsheets.values.update(reqBody);
}

function parseIdList(list) {
  return list.reduce((result, row, idx) => {
    const [lineId = ''] = row;

    if (!result.has(lineId)) result.set(lineId, idx + 1);

    return result;
  }, new Map());
}

async function addUserIdToSheet(event, gameId) {
  try {
    const profile = await event.source.profile();
    const { displayName, userId } = profile;
    const sheets = google.sheets('v4');
    const res = await sheets.spreadsheets.values.get({
      auth: oauth2Client,
      spreadsheetId: process.env.TARGET_SHEET_ID,
      range: encodeURI('idList!A1:C99')
    });
    const rowData = [[userId, displayName, gameId]];
    const idList = parseIdList(res.data.values);
    if (idList.has(userId) === true) {
      const idIndex = idList.get(userId);

      await updateRow(encodeURI(`idList!A${idIndex}:C${idIndex}`), rowData);
    } else await appendNewRow('idList', rowData);
  } catch (err) {
    throw err;
  }
}

async function wakeUp(event) {
  event.reply({
    type: 'image',
    originalContentUrl: 'https://i.imgur.com/e2BaTXC.jpg',
    previewImageUrl: 'https://i.imgur.com/4BZn16n.jpg'
  });
}

module.exports = {
  addUserIdToSheet,
  wakeUp
};
