
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

const secret = JSON.parse(process.env.GOOGLE_APPLICATION_SECRET);
const oauth2Client = new OAuth2Client(
  secret.installed.client_id,
  secret.installed.client_secret,
  secret.installed.redirect_uris[0]
);

oauth2Client.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);

function isInteger(value) {
  return parseInt(value, 10).toString().length === value.length;
}

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
    range,
    valueInputOption: 'RAW',
    resource: {
      values: rowData
    }
  };
  return sheets.spreadsheets.values.update(reqBody);
}

function parseIdList(list) {
  return list.reduce((result, row, idx) => {
    const [lineId = '',, gameId = ''] = row;

    if (!result.has(lineId)) result.set(lineId, [idx + 1, gameId]);

    return result;
  }, new Map());
}

function getToday() {
  const now = new Date();
  const hours = now.getUTCHours();
  const year = now.getUTCFullYear();
  let month = now.getUTCMonth() + 1;
  let date = now.getUTCDate();

  if (hours + 3 >= 24) date += 1;
  if (month < 10) month = `0${month}`;
  if (date < 10) date = `0${date}`;

  return `${year}/${month}/${date}`;
}

async function getIdList() {
  const sheets = google.sheets('v4');

  const res = await sheets.spreadsheets.values.get({
    auth: oauth2Client,
    spreadsheetId: process.env.TARGET_SHEET_ID,
    range: encodeURI('idList!A1:C99')
  });

  return parseIdList(res.data.values);
}

async function getDamageList() {
  const sheets = google.sheets('v4');

  const res = await sheets.spreadsheets.values.get({
    auth: oauth2Client,
    spreadsheetId: process.env.TARGET_SHEET_ID,
    range: '傷害表(系統)!A2:J32'
  });

  return res.data.values.reduce((result, row, index) => {
    let [gameId] = row;

    if (index === 0) {
      result.set('days', row);
      return result;
    }
    gameId = gameId.replace(/\[.*\] {0,1}/g, '');
    result.set(gameId, index + 2);

    return result;
  }, new Map());
}

async function addUserIdToSheet(event, gameId) {
  try {
    const idList = await getIdList();
    const profile = await event.source.profile();
    const { displayName, userId } = profile;
    const rowData = [[userId, displayName, gameId]];

    if (idList.has(userId) === true) {
      const [idIndex, originGameId] = idList.get(userId);

      await updateRow(encodeURI(`idList!A${idIndex}:C${idIndex}`), rowData);
      await event.reply({
        type: 'text',
        text: `${originGameId} -> ${gameId}，改個名字都懶嗎!`
      });
    } else {
      await appendNewRow('idList', rowData);
      await event.reply({
        type: 'text',
        text: `${gameId} 沒見過的名字呢`
      });
    }
  } catch (err) {
    throw err;
  }
}

async function saveDamage(event, damage) {
  try {
    const { userId, displayName } = await event.source.profile();
    const idList = await getIdList();
    const damageList = await getDamageList();
    const [, gameId] = idList.get(userId) || [];
    const recordIdx = damageList.get(gameId);

    if (isInteger(damage) === false) {
      await event.reply({
        type: 'text',
        text: `蛤???"${damage}"看起來到底哪裡像整數了??你的腦子沒問題嗎??`
      });
      return;
    }

    if (gameId === undefined) {
      await event.reply({
        type: 'text',
        text: `${displayName} 你沒有登錄過ID呢，新來的?`
      });
      return;
    }
    if (recordIdx === undefined) {
      await event.reply({
        type: 'text',
        text: `${displayName} 你根本沒有在傷害表名單裡面啊?!`
      });
      return;
    }
    const days = damageList.get('days');
    const damageColumeIdx = days.indexOf(getToday());
    const damageColume = `傷害表(系統)!${String.fromCharCode(65 + damageColumeIdx)}${recordIdx}`;

    await updateRow(damageColume, [[parseInt(damage, 10)]]);

    await event.reply({
      type: 'text',
      text: `${gameId} 今日總傷 ${damage}， 好好打不要摸魚啊!`
    });
  } catch (error) {
    throw error;
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
  wakeUp,
  saveDamage
};
