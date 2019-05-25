const dotenv = require('dotenv');

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const linebot = require('linebot');
const cmds = require('./src/cmds');
const CmdManager = require('./src/cmdManager');
const templates = require('./persist/textual.json');


const bot = linebot({
  channelId: process.env.LINE_BOT_ID,
  channelSecret: process.env.LINE_BOT_SECRET,
  channelAccessToken: process.env.LINE_BOT_TOKEN
});

const cmdManager = new CmdManager({
  groupId: process.env.LAST_EXILE_GROUP_ID,
  adminId: process.env.ADMIN_ID,
  cmds,
  textualTemplates: templates
});

bot.on('message', (event) => {
  const { type, text } = event.message;

  if (type === 'text') {
    cmdManager.execute(event, text).catch((err) => {
      console.error(err);
    });
  }
});

bot.listen('/linewebhook', process.env.PORT, () => {
  console.log('working');
});
