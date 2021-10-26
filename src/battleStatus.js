class BattleStatus {
  constructor(groupId, pgPool) {
    this.pgPool = pgPool;
    this.groupId = groupId;
    this.status = new Map();
    this.warmUpTs = -1;
  }

  async _warmUp() {
    const res = await this.pgPool.query('SELECT value FROM session WHERE key=\'yuzuBattleStatus\';');

    this.status = new Map(JSON.parse(res.rows[0].value));
  }

  async getIn(name, userId, bossNum) {
    if (this.warmUpTs === -1) await this._warmUp();
    if (this.status.has(userId) === false) {
      this.status.set(userId, {
        name,
        bossNum,
        status: '進場'
      });

      await this.pgPool.query(`
        UPDATE session SET value = $1::text
        WHERE key='yuzuBattleStatus';
      `, [JSON.stringify(Array.from(this.status.entries()))]);
      return true;
    }
    return false;
  }

  async update(name, userId, bossNum, comment) {
    if (this.warmUpTs === -1) await this._warmUp();
    this.status.set(userId, {
      name,
      bossNum,
      status: comment
    });

    this.pgPool.query(`
    UPDATE session SET value = $1::text
    WHERE key='yuzuBattleStatus';
  `, [JSON.stringify(Array.from(this.status.entries()))]);
    return true;
  }

  async getStatus(bossNum) {
    if (this.warmUpTs === -1) await this._warmUp();
    const res = Array.from(this.status.entries());

    if (bossNum) res.filter((key, val) => val.bossNum === bossNum);

    return res;
  }

  async reset(bossNum) {
    if (this.warmUpTs === -1) await this._warmUp();
    if (!bossNum) {
      this.status = new Map();
      await this.pgPool.query('update session set value = \'[]\' where key = \'yuzuBattleStatus\'');
    } else {
      const res = Array.from(this.status.entries());
      res.filter((key, val) => val.bossNum !== bossNum);
      this.status = new Map(res);

      this.pgPool.query(`
      UPDATE session SET value = $1::text
      WHERE key='yuzuBattleStatus';
    `, [JSON.stringify(Array.from(this.status.entries()))]);
    }
  }
}

module.exports = BattleStatus;
