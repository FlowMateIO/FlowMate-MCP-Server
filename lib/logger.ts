import { ConsoleHandler, LevelName, log } from "../deps.ts";

const loggerLevel = Deno.env.get("LOG_LEVEL") as LevelName || "INFO";

export const setupLog = (): Promise<void> => log.setup({
    handlers: {
        console: new ConsoleHandler(loggerLevel)
    },
    loggers: {
      default: {
        level: loggerLevel,
        handlers: ["console"]
      }
    }
  })

export const logger = log.getLogger();