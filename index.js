const linebot = require('linebot');

const bot = linebot({
  channelId: process.env.LINE_BOT_ID,
  channelSecret: process.env.LINE_BOT_SECRET,
  channelAccessToken: process.env.LINE_BOT_TOKEN
});

bot.on('message', (event) => {
  event.reply(event.message.text).then((data) => {
    // success
    console.log(data);
  }).catch((error) => {
    console.error(error);
  });
});

bot.listen('/linewebhook', process.env.PORT);
