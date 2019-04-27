const cmds = require('./cmds');
const cmdMap = require('./cmdMap');

class CmdManager {
  constructor({
    groupId = '',
    adminId = ''
  }) {
    this.adminMode = false;
    this.groupMode = true;
    this.groupId = groupId;
    this.adminId = adminId;
  }

  _isGroupMessage(sourceType, groupId) {
    return sourceType === 'group' && groupId === this.groupId;
  }

  _messageParser(msg) {
    try {
      const matchResult = msg.match(/^!(.*)/);
      let cmd = null;
      let param;

      if (matchResult !== null) [cmd, ...param] = matchResult[1].split(' ');

      return {
        cmd,
        param
      };
    } catch (error) {
      throw error;
    }
  }

  async _adminCmd(cmd, param, event) {
    switch (cmd) {
      case 'adminMode':
        if (param[0] === 'true') {
          this.adminMode = true;
          await event.reply({
            type: 'text',
            text: '現在開始管理員以外的人不要對我下指令! 噁心!'
          });
        } else {
          this.adminMode = false;
          await event.reply({
            type: 'text',
            text: '我就大發慈悲幫你們處理一下雜務吧'
          });
        }
        break;
      case 'groupMode':
        if (param[0] === 'true') {
          this.groupMode = true;
          await event.reply({
            type: 'text',
            text: 'I hate my job = ='
          });
        } else {
          this.groupMode = false;
          await event.reply({
            type: 'text',
            text: '88888'
          });
        }
        break;
      default:
        break;
    }
  }

  async execute(event, msg) {
    try {
      const { userId, type: sourceType, groupId } = event.source;
      const { cmd = null, param } = this._messageParser(msg);
      const method = cmds[cmdMap[cmd]];

      await this._adminCmd(cmd, param, event);

      if (method === undefined) return;
      if (this.adminId === userId || this.adminMode === true) {
        if (this.adminId === userId) method(event, ...param);
        return;
      }

      if (this.groupMode === true && this._isGroupMessage(sourceType, groupId)) {
        method(event, ...param);
      }
    } catch (error) {
      throw error;
    }
  }
}

module.exports = CmdManager;
