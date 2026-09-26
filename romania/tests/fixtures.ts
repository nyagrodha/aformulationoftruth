/**
 * Shared test fixtures.
 *
 * TEST_EMAIL is the recipient inside test bundles. The unit tests never mail
 * it: every send goes through a fake runner that fails or records instead of
 * invoking python3. Only live_smtp_test.ts sends, and only when
 * A4T_LIVE_SMTP=1 is set on purpose.
 */

import { armor, Encrypter, generateIdentity, identityToRecipient } from 'jsr:@age/age-encryption@^0.3.0';
import type { Runner } from '../subprocess.ts';

export const TEST_EMAIL = Deno.env.get('A4T_TEST_EMAIL') || 'respondent@example.invalid';

export interface Call {
  command: string;
  args: string[];
}

/**
 * A runner that records each call and answers from `script`, keyed by command.
 * A command with no script entry fails, so an unexpected tool never runs for
 * real and never passes by accident.
 */
export function fakeRunner(script: Record<string, (args: string[]) => Promise<boolean> | boolean>): {
  run: Runner;
  calls: Call[];
} {
  const calls: Call[] = [];
  const run: Runner = async (command, args) => {
    calls.push({ command, args: [...args] });
    const step = script[command];
    return step ? await step(args) : false;
  };
  return { run, calls };
}

/** A real age identity and a way to encrypt to it, as the web tier does. */
export async function ageFixture(): Promise<{ identity: string; encrypt: (text: string) => Promise<string> }> {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  return {
    identity,
    async encrypt(text: string) {
      const e = new Encrypter();
      e.addRecipient(recipient);
      return armor.encode(await e.encrypt(text));
    },
  };
}

export function dirContents(dir: string): string[] {
  return [...Deno.readDirSync(dir)].map((e) => e.name).sort();
}
