/**
 * Typst rendering.
 *
 * Input and output both live in a caller-supplied working directory, which in
 * production is a tmpfs mount: these are the only plaintext bytes in the whole
 * system and they must never reach a disk that survives a reboot.
 */

export interface RenderEntry {
  index: number;
  tamilNumeral: string;
  tamil: string;
  transliteration: string;
  english: string;
  answer: string;
  skipped: boolean;
}

export interface RenderDoc {
  entries: RenderEntry[];
}

const TEMPLATE = new URL('./template.typ', import.meta.url).pathname;

/**
 * Render a document to PDF bytes.
 *
 * Nothing sensitive goes on argv. The original passed the whole decrypted
 * questionnaire as `--input data=<JSON>`, and /proc/<pid>/cmdline is
 * world-readable -- every answer would have been visible to any local user for
 * the lifetime of the render, on the machine that also holds the private keys.
 * The data goes to a 0600 file inside workDir instead, and --root is set to
 * workDir so Typst will read it (json() resolves against the root; verified
 * against typst 0.15.1).
 *
 * The template is copied in rather than referenced in place, because --root
 * must contain both it and the data.
 */
export async function renderPdf(doc: RenderDoc, workDir: string): Promise<Uint8Array> {
  const dataPath = `${workDir}/data.json`;
  const typPath = `${workDir}/template.typ`;
  const outPath = `${workDir}/out.pdf`;

  try {
    await Deno.writeTextFile(dataPath, JSON.stringify(doc), { mode: 0o600 });
    await Deno.copyFile(TEMPLATE, typPath);

    const res = await new Deno.Command('typst', {
      args: ['compile', '--root', workDir, typPath, outPath],
      stdout: 'null',
      // Discarded rather than captured: Typst echoes source context on failure,
      // which for this template means answer text.
      stderr: 'null',
    }).output();
    if (!res.success) throw new Error('typst render failed');

    return await Deno.readFile(outPath);
  } finally {
    // Runs on every path. A thrown render previously left the decrypted JSON
    // behind in the working directory for whatever cleaned up next.
    for (const p of [dataPath, typPath, outPath]) {
      await Deno.remove(p).catch(() => {});
    }
  }
}
