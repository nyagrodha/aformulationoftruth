/**
 * How the render path runs external tools. Production always uses runQuiet;
 * tests pass a fake so a failure can be forced at a known point without
 * invoking typst, qpdf or a live SMTP submission.
 */
export type Runner = (command: string, args: string[], timeoutMs?: number) => Promise<boolean>;

/** Bounded tools; their stderr may contain decrypted answers or addresses. */
export async function runQuiet(command: string, args: string[], timeoutMs = 30_000): Promise<boolean> {
  const child = new Deno.Command(command, { args, stdin: 'null', stdout: 'null', stderr: 'null' }).spawn();
  const timeout = setTimeout(() => {
    try {
      child.kill('SIGKILL');
    } catch { /* Already exited. */ }
  }, timeoutMs);
  try {
    return (await child.status).success;
  } finally {
    clearTimeout(timeout);
  }
}
