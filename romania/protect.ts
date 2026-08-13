/**
 * AES-256 PDF encryption via qpdf.
 *
 * The *user* password is set, not merely an owner password: owner passwords
 * only set permission flags that any tool strips, and would give the
 * respondent confidentiality they do not actually have. Verified against qpdf
 * 12.2.0 -- `--show-encryption` reports R = 6, the PDF 2.0 handler.
 *
 * The result is verified openable before it is returned. PDF password encoding
 * is genuinely treacherous -- R6 expects UTF-8 with SASLprep, older handlers
 * used PDFDocEncoding, and readers disagree -- so a password containing an
 * emoji or a Tamil character can encrypt cleanly and then refuse to open.
 *
 * Every failure path throws. This must never return the unprotected input:
 * mailing an unencrypted PDF to someone who asked for a password is the single
 * worst outcome available to this system.
 */

/** qpdf reads @argfile as one argument per line; there is no escaping. */
async function runQpdf(args: string[], argPath: string): Promise<boolean> {
  await Deno.writeTextFile(argPath, args.join('\n'), { mode: 0o600 });
  try {
    const res = await new Deno.Command('qpdf', {
      args: [`@${argPath}`],
      stdout: 'null',
      stderr: 'null',
    }).output();
    return res.success;
  } finally {
    await Deno.remove(argPath).catch(() => {});
  }
}

export async function protectPdf(pdf: Uint8Array, password: string, workDir: string): Promise<Uint8Array> {
  if (password.length === 0) throw new Error('empty password');

  // The @argfile format is ONE ARGUMENT PER LINE, so a password containing a
  // newline does not merely corrupt the file -- it injects qpdf arguments.
  // Moving the password off argv to fix an information leak introduced an
  // injection vector in the same edit; this closes it.
  //
  // Rejected rather than stripped or escaped: the format has no escaping, and
  // silently altering someone's password produces a PDF that will not open
  // with what they typed.
  if (/[\r\n]/.test(password)) throw new Error('password contains a line separator');

  const inPath = `${workDir}/plain.pdf`;
  const outPath = `${workDir}/protected.pdf`;

  try {
    await Deno.writeFile(inPath, pdf, { mode: 0o600 });

    const encrypted = await runQpdf([
      '--encrypt',
      `--user-password=${password}`,
      `--owner-password=${password}`,
      '--bits=256',
      '--',
      inPath,
      outPath,
    ], `${workDir}/qpdf.enc.args`);
    if (!encrypted) throw new Error('qpdf encryption failed');

    // qpdf 12.2.0 has no --password-file, so the check goes through an argfile
    // as well rather than putting the password on argv.
    const opens = await runQpdf([`--password=${password}`, '--check', outPath], `${workDir}/qpdf.chk.args`);
    if (!opens) throw new Error('encrypted pdf failed its round-trip check');

    return await Deno.readFile(outPath);
  } finally {
    // Every path, including the throws above. A failed encryption previously
    // left plain.pdf -- the fully decrypted document -- sitting in workDir.
    for (const p of [inPath, outPath]) {
      await Deno.remove(p).catch(() => {});
    }
  }
}
