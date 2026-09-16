import { parseArgs } from './args';

describe('parseArgs', () => {
  it('separates the command, positionals and flags', () => {
    const parsed = parseArgs(['run', 'GET', '/users/:id', '--port', '4790', '--json'], 4780);
    expect(parsed.command).toBe('run');
    expect(parsed.positional).toEqual(['GET', '/users/:id']);
    expect(parsed.flags).toMatchObject({ port: 4790, json: true, help: false });
  });

  it('defaults the port, booleans and thresholds', () => {
    expect(parseArgs(['stats'], 4780).flags).toEqual({
      port: 4780,
      json: false,
      help: false,
      version: false,
      once: false,
      fast: 200,
      warn: 500,
    });
  });

  it('accepts --flag=value and short help/version', () => {
    expect(parseArgs(['--port=5000', '-h'], 4780).flags).toMatchObject({ port: 5000, help: true });
    expect(parseArgs(['-v'], 4780).flags.version).toBe(true);
  });

  it('parses run options', () => {
    const { flags } = parseArgs(
      ['run', 'GET', '/x', '--connections', '20', '--duration', '3', '--target', 'http://127.0.0.1:3000'],
      4780,
    );
    expect(flags).toMatchObject({ connections: 20, duration: 3, target: 'http://127.0.0.1:3000' });
  });

  it('parses live options', () => {
    expect(parseArgs(['--fast', '100', '--warn', '300', '--once'], 4780).flags).toMatchObject({
      fast: 100,
      warn: 300,
      once: true,
    });
  });

  it('returns no command when only flags are given', () => {
    expect(parseArgs(['--json'], 4780).command).toBeNull();
  });

  it.each([
    [['--port'], /--port needs a value/],
    [['--port', 'abc'], /--port must be a positive number/],
    [['--duration', '0'], /--duration must be a positive number/],
    [['--colour'], /unknown option --colour/],
    [['--fast', '500', '--warn', '500'], /--warn .* greater than --fast/],
  ])('rejects %j', (argv, message) => {
    expect(() => parseArgs(argv, 4780)).toThrow(message);
  });
});
