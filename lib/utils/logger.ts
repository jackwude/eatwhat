export const logger = {
  info: (...args: unknown[]) => console.log("[eatwhat]", ...args),
  error: (...args: unknown[]) => console.error("[eatwhat]", ...args),
};
