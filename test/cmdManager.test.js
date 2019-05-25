const CmdManager = require('../src/cmdManager');

describe('test CmdManager class', () => {
  const cmdManager = new CmdManager({
    groupId: '1',
    adminId: 'root',
    groupMode: true,
    adminMode: false,
    textualTemplates: {}
  });

  describe('execute', () => {
    it('should execute any exists cmd from admin', async () => {
      const lineEvent = { source: { userId: 'root', type: 'group', groupId: '1' } };
      const spy = jest.fn();
      const spyParser = jest.mock()
        .spyOn(cmdManager, '_messageParser')
        .mockReturnValue({ cmd: 'test', param: [] });
      const spyGetMethod = jest.mock()
        .spyOn(cmdManager, '_getCmdMethod')
        .mockReturnValue(spy);

      await cmdManager.execute(lineEvent, '');

      expect(spy).toBeCalledWith(lineEvent);

      spyGetMethod.mockRestore();
      spyParser.mockRestore();
    });

    it('should execute cmd from group when groupMode is opened', async () => {
      const spy = jest.fn().mockReturnValue({ code: 'TEST', args: {} });
      const spyParser = jest.mock()
        .spyOn(cmdManager, '_messageParser')
        .mockReturnValue({ cmd: 'test', param: [] });
      const spyGetMethod = jest.mock()
        .spyOn(cmdManager, '_getCmdMethod')
        .mockReturnValue(spy);
      const spyReply = jest.fn();
      const lineEvent = {
        source: {
          userId: 'id',
          type: 'group',
          groupId: '1'
        },
        reply: spyReply
      };

      cmdManager.groupMode = true;
      cmdManager.textualTemplates = { TEST: '' };

      await cmdManager.execute(lineEvent, '');

      expect(spyParser).toBeCalled();
      expect(spy).toBeCalledWith(lineEvent);
      expect(spyReply).toBeCalled();

      spyParser.mockRestore();
      spyGetMethod.mockRestore();
    });

    it('should not execute cmd from group when groupMode is closed', async () => {
      const spy = jest.fn();
      const spyParser = jest.mock()
        .spyOn(cmdManager, '_messageParser')
        .mockReturnValue({ cmd: 'test', param: [] });

      cmdManager.setCmds({ test: spy });
      cmdManager.groupMode = false;

      await cmdManager.execute({
        source: { }
      }, '');

      expect(spyParser).toBeCalled();
      expect(spy).not.toBeCalled();

      spyParser.mockRestore();
    });

    it('should not execute cmd not exists', async () => {
      const spy = jest.fn();

      const spyParser = jest.mock()
        .spyOn(cmdManager, '_messageParser')
        .mockReturnValue({ cmd: 'notExists', param: [] });
      cmdManager.setCmds({ test: spy });

      await cmdManager.execute({
        source: { userId: 'id', type: 'type', groupId: 'gid' }
      }, '');

      expect(spyParser).toBeCalled();
      expect(spy).not.toBeCalled();

      spyParser.mockRestore();
    });
  });
});
