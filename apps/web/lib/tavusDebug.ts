const PREFIX = "[TavusAd]";

export function tavusLog(message: string, data?: unknown): void {
  if (data !== undefined) {
    console.log(`${PREFIX} ${message}`, data);
  } else {
    console.log(`${PREFIX} ${message}`);
  }
}

export function tavusWarn(message: string, data?: unknown): void {
  if (data !== undefined) {
    console.warn(`${PREFIX} ${message}`, data);
  } else {
    console.warn(`${PREFIX} ${message}`);
  }
}

export function tavusError(message: string, data?: unknown): void {
  if (data !== undefined) {
    console.error(`${PREFIX} ${message}`, data);
  } else {
    console.error(`${PREFIX} ${message}`);
  }
}
