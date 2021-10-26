
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const pg = require('pg');
const BattleStatus = require('./battleStatus');

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  ssl: true
});

const secret = JSON.parse(process.env.GOOGLE_APPLICATION_SECRET);
const oauth2Client = new OAuth2Client(
  secret.installed.client_id,
  secret.installed.client_secret,
  secret.installed.redirect_uris[0]
);

oauth2Client.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
const sheets = google.sheets('v4');


function _isPositiveInteger(value) {
  const numVal = parseInt(value, 10);

  return numVal.toString().length === value.length
    && numVal > 0;
}

function _appendNewRow(range, rowData, sheetId = process.env.TARGET_SHEET_ID) {
  const reqBody = {
    auth: oauth2Client,
    spreadsheetId: sheetId,
    range: encodeURI(range),
    insertDataOption: 'INSERT_ROWS',
    valueInputOption: 'RAW',
    resource: {
      values: rowData
    }
  };

  return sheets.spreadsheets.values.append(reqBody);
}

function _clearRows(range, sheetId = process.env.TARGET_SHEET_ID) {
  return sheets.spreadsheets.values.clear({
    auth: oauth2Client,
    spreadsheetId: sheetId,
    range
  });
}

function _updateRow(range, rowData, sheetId = process.env.TARGET_SHEET_ID) {
  const reqBody = {
    auth: oauth2Client,
    spreadsheetId: sheetId,
    range,
    valueInputOption: 'RAW',
    resource: {
      values: rowData
    }
  };
  return sheets.spreadsheets.values.update(reqBody);
}

function _parseIdList(list) {
  return list.reduce((result, row, idx) => {
    const [lineId = '',, gameId = ''] = row;

    if (!result.has(lineId)) result.set(lineId, [idx + 1, gameId]);

    return result;
  }, new Map());
}

function _getToday(ts = new Date()) {
  const now = new Date(ts);
  const hours = now.getUTCHours();
  const year = now.getUTCFullYear();
  let month = now.getUTCMonth() + 1;
  let date = now.getUTCDate();

  if (hours + 3 >= 24) date += 1;
  if (month < 10) month = `0${month}`;
  if (date < 10) date = `0${date}`;

  return `${year}/${month}/${date}`;
}

async function _getIdList() {
  const res = await sheets.spreadsheets.values.get({
    auth: oauth2Client,
    spreadsheetId: process.env.TARGET_SHEET_ID,
    range: encodeURI('idList!A1:C99')
  });

  return _parseIdList(res.data.values);
}

async function _getDamageList() {
  const res = await sheets.spreadsheets.values.get({
    auth: oauth2Client,
    spreadsheetId: process.env.TARGET_SHEET_ID,
    range: '傷害表(系統)!A2:J32'
  });

  return res.data.values.reduce((result, row, index) => {
    const [gameId] = row;

    if (index === 0) {
      result.set('days', row);
      return result;
    }

    result.set(gameId, index + 2);

    return result;
  }, new Map());
}

async function addUserIdToSheet(event, gameId) {
  try {
    const idList = await _getIdList();
    const profile = await event.source.profile();
    const { displayName, userId } = profile;
    const rowData = [[userId, displayName, gameId]];
    const replyInfo = {
      code: 'REPLY_CREATE_GAME_ID',
      args: { gameId }
    };

    if (idList.has(userId) === true) {
      const [idIndex, originGameId] = idList.get(userId);

      await _updateRow(encodeURI(`idList!A${idIndex}:C${idIndex}`), rowData);

      replyInfo.code = 'REPLY_GAME_ID_CHANGED';
      replyInfo.args.originGameId = originGameId;
    } else await _appendNewRow('idList', rowData);

    return replyInfo;
  } catch (err) {
    throw err;
  }
}

function _isIllegalDamageInfo(damage, gameId, recordIdx) {
  if (_isPositiveInteger(damage) === false) return 'ERR_DAMAGE_NOT_INTEGER';
  if (gameId === undefined) return 'ERR_GAME_ID_NOT_FOUND';
  if (recordIdx === undefined) return 'ERR_NOT_FOUND_IN_DAMAGE_LIST';
}

async function saveDamage(event, damage) {
  try {
    const [profile, idList, damageList] = await Promise.all([
      event.source.profile(),
      _getIdList(),
      _getDamageList()
    ]);
    const { userId, displayName } = profile;
    const [, gameId] = idList.get(userId) || [];
    const recordIdx = damageList.get(gameId);
    const replyInfo = {
      args: { displayName, gameId, damage }
    };

    replyInfo.code = _isIllegalDamageInfo(damage, gameId, recordIdx);

    if (replyInfo.code) return replyInfo;
    const days = damageList.get('days');
    const damageColumeIdx = days.indexOf(_getToday());
    const damageColume = `傷害表(系統)!${String.fromCharCode(65 + damageColumeIdx)}${recordIdx}`;

    await _updateRow(damageColume, [[parseInt(damage, 10)]]);

    replyInfo.code = 'REPLY_DAMAGE_ACCEPTED';
    return replyInfo;
  } catch (error) {
    throw error;
  }
}

async function wakeUp(event) {
  await event.reply({
    type: 'image',
    originalContentUrl: 'https://i.imgur.com/e2BaTXC.jpg',
    previewImageUrl: 'https://i.imgur.com/4BZn16n.jpg'
  });
}

function _loadAttackTs() {
  return pool.query('SELECT value FROM session WHERE key=\'gvgAttackTs\';');
}

async function _getAttackRecordList() {
  const res = await sheets.spreadsheets.values.get({
    auth: oauth2Client,
    spreadsheetId: process.env.TARGET_SHEET_ID,
    range: '出刀表!A1:D31'
  });

  return res.data.values.reduce((result, row, idx) => {
    const [gameId] = row;

    if (idx === 0) result.set('types', row.slice(1));
    else result.set(gameId, idx);

    return result;
  }, new Map());
}

async function _resetAttackTable() {
  const promiseList = [];

  promiseList.push(pool.query(`
    UPDATE session SET value = $1::text
    WHERE key='gvgAttackTs';
  `, [(new Date()).getTime()]));
  promiseList.push(_clearRows('出刀表!B2:D31'));

  return Promise.all(promiseList);
}

function _isDayChanged(lastTs) {
  const ts = _getToday(parseInt(lastTs, 10));
  const now = _getToday();

  return ts !== now;
}

async function recordAttack(event, type = '', comment = 'O') {
  const [profile, idList, recordTs, recordList] = await Promise.all([
    event.source.profile(),
    _getIdList(),
    _loadAttackTs(),
    _getAttackRecordList()
  ]);
  const { userId, displayName } = profile;
  const attackTypes = recordList.get('types');
  const typeIdx = attackTypes.indexOf(type);
  const [, gameId] = idList.get(userId) || [];
  const userIdx = recordList.get(gameId);

  if (gameId === undefined) return { code: 'ERR_GAME_ID_NOT_FOUND', args: { displayName } };
  if (_isDayChanged(recordTs.rows[0].value)) await _resetAttackTable();
  if (typeIdx === -1) {
    return {
      code: 'ERR_ATTACK_TYPE_NOT_FOUND',
      args: { type, acceptType: attackTypes.join(' ') }
    };
  }

  await _updateRow(
    `出刀表!${String.fromCharCode(66 + typeIdx)}${userIdx + 1}`,
    [[comment]]
  );
  return {
    code: 'REPLY_ATTACK_RECORED',
    args: {
      displayName,
      attackType: type,
      comment
    }
  };
}

async function bloodTest(event) {
  const { displayName } = await event.source.profile();
  const WEIGHT = 100;
  const COLOR_THRESHOLD = 2 * WEIGHT;
  const GOLD_THRESHOLD = 18 * WEIGHT;
  const resInfo = { code: 'REPLY_BLOOD_TEST_AFRICA' };
  let gold = 0;
  let color = 0;

  for (let i = 0; i < 10; i += 1) {
    const bloodType = Math.floor(Math.random() * 100 * WEIGHT);

    if (bloodType <= COLOR_THRESHOLD) color += 1;
    if (bloodType <= GOLD_THRESHOLD
      && bloodType > COLOR_THRESHOLD) gold += 1;
  }
  if (color >= 1) resInfo.code = 'REPLY_BLOOD_TEST_EURPOE';
  if (color === 0 && gold >= 3) resInfo.code = 'REPLY_BLOOD_TEST_ASIA';

  resInfo.args = {
    displayName,
    gold,
    color
  };

  return resInfo;
}

async function rollDice(event, dice) {
  const { displayName } = await event.source.profile();
  const replyInfo = { code: undefined, args: { displayName, dice } };

  dice = dice.toLowerCase();
  let [amount, point] = dice.split('d');

  if (_isPositiveInteger(amount) === false) {
    replyInfo.args.damage = amount;
    replyInfo.code = 'ERR_DAMAGE_NOT_INTEGER';
  }
  if (_isPositiveInteger(point) === false) {
    replyInfo.args.damage = point;
    replyInfo.code = 'ERR_DAMAGE_NOT_INTEGER';
  }
  if (replyInfo.code) return replyInfo;

  amount = parseInt(amount, 10);
  point = parseInt(point, 10);

  let result = 0;
  for (let i = 0; i < amount; i += 1) {
    result += Math.floor(point * Math.random()) + 1;
  }
  replyInfo.code = 'REPLY_ROLL_DICE_RESULT';
  replyInfo.args.result = result;
  return replyInfo;
}

async function dickCompetition(event) {
  const { displayName } = await event.source.profile();
  let dickScore = Math.floor(Math.random() * 70);
  const replyInfo = { code: undefined, args: { displayName } };

  if (dickScore <= 5) replyInfo.code = 'REPLY_DICK_DISAPPEAR';
  if (dickScore > 5 && dickScore <= 11) replyInfo.code = 'REPLY_NANO_DICK';
  if (dickScore > 11 && dickScore <= 60) replyInfo.code = 'REPLY_NORMAL_DICK';
  if (dickScore > 60 && dickScore <= 65) replyInfo.code = 'REPLY_BIG_DICK';
  if (dickScore > 65 && dickScore <= 70) replyInfo.code = 'REPLY_BIG_DICK_CUTE_GIRL';

  dickScore = Math.floor((dickScore - 5) / 2 + 0.5);
  replyInfo.args.dickScore = dickScore;

  return replyInfo;
}

const yuzuBattleStatus = new BattleStatus(process.env.YUZU_GROUP_ID, pool);

async function _getYuzuIdList() {
  const res = await sheets.spreadsheets.values.get({
    auth: oauth2Client,
    spreadsheetId: process.env.YUZU_SHEET_ID,
    range: encodeURI('idList!A1:C99')
  });

  return _parseIdList(res.data.values);
}

async function addYuzuUserIdToSheet(event, gameId) {
  try {
    const idList = await _getYuzuIdList();
    const profile = await event.source.profile();
    const { displayName, userId } = profile;
    const rowData = [[userId, displayName, gameId]];
    const replyInfo = {
      code: 'REPLY_CREATE_GAME_ID',
      args: { gameId }
    };

    if (idList.has(userId) === true) {
      const [idIndex, originGameId] = idList.get(userId);

      await _updateRow(encodeURI(`idList!A${idIndex}:C${idIndex}`), rowData, process.env.YUZU_SHEET_ID);

      replyInfo.code = 'REPLY_GAME_ID_CHANGED';
      replyInfo.args.originGameId = originGameId;
    } else await _appendNewRow('idList', rowData, process.env.YUZU_SHEET_ID);

    return replyInfo;
  } catch (err) {
    throw err;
  }
}

function _loadYuzuAttackTs() {
  return pool.query('SELECT value FROM session WHERE key=\'yuzuAttackTs\';');
}

async function _getYuzuAttackRecordList() {
  const res = await sheets.spreadsheets.values.get({
    auth: oauth2Client,
    spreadsheetId: process.env.YUZU_SHEET_ID,
    range: '出刀表!D6:G36'
  });

  return res.data.values.reduce((result, row, idx) => {
    const [gameId] = row;

    if (idx === 0) result.set('types', row.slice(1));
    else result.set(gameId, idx);

    return result;
  }, new Map());
}

async function _resetYuzuAttackTable() {
  const promiseList = [];

  promiseList.push(pool.query(`
    UPDATE session SET value = $1::text
    WHERE key='yuzuAttackTs';
  `, [(new Date()).getTime()]));
  promiseList.push(_clearRows('出刀表!E7:G36', process.env.YUZU_SHEET_ID));

  return Promise.all(promiseList);
}

async function yuzuAttacked(event, type, comment) {
  const [profile, idList, recordTs, recordList] = await Promise.all([
    event.source.profile(),
    _getYuzuIdList(),
    _loadYuzuAttackTs(),
    _getYuzuAttackRecordList()
  ]);
  const { userId, displayName } = profile;
  const attackTypes = recordList.get('types');
  const typeIdx = attackTypes.indexOf(type);
  const [, gameId] = idList.get(userId) || [];
  const userIdx = recordList.get(gameId);

  if (gameId === undefined) return { code: 'ERR_GAME_ID_NOT_FOUND', args: { displayName } };
  if (_isDayChanged(recordTs.rows[0].value)) await _resetYuzuAttackTable();
  if (typeIdx === -1 && type !== '完刀') {
    return {
      code: 'ERR_ATTACK_TYPE_NOT_FOUND',
      args: { type, acceptType: attackTypes.join(' ') }
    };
  }

  if (type === '完刀') {
    await _updateRow(
      `出刀表!E${userIdx + 6}:G${userIdx + 6}`,
      [[comment || 'done', 'done', 'done']],
      process.env.YUZU_SHEET_ID
    );
  } else {
    await _updateRow(
      `出刀表!${String.fromCharCode(69 + typeIdx)}${userIdx + 6}`,
      [[comment]],
      process.env.YUZU_SHEET_ID
    );
  }

  return {
    code: 'REPLY_ATTACK_RECORED',
    args: {
      displayName,
      attackType: type || '完刀',
      comment: type === '完刀' ? comment || '完刀' : comment
    }
  };
}

async function yuzuBattleIn(event, bossNum) {
  const { userId, displayName } = await event.source.profile();

  if (!bossNum || _isPositiveInteger(bossNum) === false) {
    return {
      code: 'ERR_YUZU_NOT_A_BOSS',
      args: { displayName }
    };
  }

  const result = await yuzuBattleStatus.getIn(displayName, userId, bossNum);
  const code = result ? 'REPLY_YUZU_BOSS_IN' : 'ERR_YUZU_BOSS_IN_DUPLICATE';

  return {
    code,
    args: {
      displayName
    }
  };
}

async function yuzuBattleUpdate(event, bossNum, comment) {
  const { userId, displayName } = await event.source.profile();

  if (_isPositiveInteger(bossNum) === false) {
    return {
      code: 'ERR_YUZU_NOT_A_BOSS',
      args: { displayName }
    };
  }
  await yuzuBattleStatus.update(displayName, userId, bossNum, comment);

  return {
    code: 'REPLY_YUZU_BOSS_UPDATE',
    args: {
      displayName,
      comment
    }
  };
}

async function yuzuGetBattleStatus(event, bossNum) {
  const { displayName } = await event.source.profile();

  if (bossNum && _isPositiveInteger(bossNum) === false) {
    return {
      code: 'ERR_YUZU_NOT_A_BOSS',
      args: { displayName }
    };
  }
  const status = await yuzuBattleStatus.getStatus(bossNum);
  const payload = status.reduce((result, [, { name, status: val }]) => {
    result += `${name}: ${val}\n`;

    return result;
  }, '');

  return {
    code: 'REPLY_YUZU_BOSS_STATUS',
    args: {
      payload
    }
  };
}

async function yuzuBattleReset(event, bossNum) {
  const { displayName } = await event.source.profile();

  if (bossNum && _isPositiveInteger(bossNum) === false) {
    return {
      code: 'ERR_YUZU_NOT_A_BOSS',
      args: { displayName }
    };
  }
  await yuzuBattleStatus.reset(bossNum);

  return {
    code: 'REPLAY_YUZU_BOSS_RESET'
  };
}

module.exports = {
  addUserIdToSheet,
  wakeUp,
  saveDamage,
  recordAttack,
  bloodTest,
  rollDice,
  dickCompetition,
  yuzuAttacked,
  addYuzuUserIdToSheet,
  yuzuBattleIn,
  yuzuBattleUpdate,
  yuzuGetBattleStatus,
  yuzuBattleReset
};
