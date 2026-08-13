// Minimal structured logger — no external dependency. One JSON line per call to
// stdout/stderr, parseable by any log shipper without this repo committing to one.
type Level = 'info' | 'warn' | 'error';

function write(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info:  (event: string, fields?: Record<string, unknown>) => write('info', event, fields),
  warn:  (event: string, fields?: Record<string, unknown>) => write('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write('error', event, fields),
};
