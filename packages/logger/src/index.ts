import debug, { Debugger } from 'debug';
import LRU from 'lru-cache';

type Argument = number | string | Error | object;

const loggers: LRU<string, Debugger> = new LRU({
  max: 32768,
});

class Logger {
  private service: string;
  private tags: string[] | undefined;

  constructor(service: string, tags?: string | string[]) {
      this.service = service;
      if (tags) {
        this.tags = (tags instanceof Array)? tags: [tags];
      }
  }

  tag(tags: string | string[]): Logger {
    return new Logger(this.service, [
      ...((this.tags || []).slice(0) as string[]),
      ...((tags instanceof Array)? tags: [tags]),
    ]);
  }

  log(level: string, ...args: Argument[]): void {
    const scope = `${level}${this.service ? `:${this.service}` : ''}`;
    const logger = loggers.get(scope) || debug(scope);

    if (!loggers.get(scope)) {
      loggers.set(scope, logger);
    }

    args
      .map((item: Argument) => {
        if (item instanceof Error) {
          const obj = { message: item.message };

          Object.getOwnPropertyNames(item).forEach(property => {
            (obj as any)[property] = (item as any)[property];
          });

          return obj;
        }

        if (typeof item === 'string') {
          return item.replace(/\n/, '\\n');
        }

        if (typeof item === 'number') {
          return item.toString();
        }

        return item;
      })
      .map(item => {
        return JSON.stringify({ 
          tags: this.tags, 
          ...(typeof item === 'object')? item : { message: item } 
        });
      })
      .forEach(item => logger(item));
  }

  critical(...args: Argument[]): void {
    this.log.apply(this, ['critical', ...args]);
  }

  error(...args: Argument[]): void {
    this.log.apply(this, ['error', ...args]);
  }

  warn(...args: Argument[]): void {
    this.log.apply(this, ['warn', ...args]);
  }

  info(...args: Argument[]): void {
    this.log.apply(this, ['info', ...args]);
  }

  verbose(...args: Argument[]): void {
    this.log.apply(this, ['verbose', ...args]);
  }

  silly(...args: Argument[]): void {
    this.log.apply(this, ['silly', ...args]);
  }
}

export default Logger;
