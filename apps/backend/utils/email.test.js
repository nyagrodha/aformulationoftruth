/**
 * @file backend/utils/email.test.js
 *
 * Run:  npm test -- email.test.js
 * or:   npx jest backend/utils/email.test.js
 */

jest.mock('nodemailer', () => {
  const sendMail = jest.fn().mockResolvedValue({ messageId: '<mocked@id>' });
  return {
    __esModule: true,
    default: { createTransport: jest.fn(() => ({ sendMail })) },
    createTransport: jest.fn(() => ({ sendMail })),
    // expose for assertions
    _sendMail: sendMail,
  };
});

const nodemailer = require('nodemailer');
const emailMod = require('./email'); // exports { sendMagicLink, isBhairavaWindow, _internals }

describe('isBhairavaWindow (America/Chicago)', () => {
  test('returns true at 01:13 local (CDT)', () => {
    // 2025-08-20 01:13 in America/Chicago == 2025-08-20T06:13:00Z
    const d = new Date('2025-08-20T06:13:00Z');
    expect(emailMod.isBhairavaWindow(d)).toBe(true);
  });

  test('returns false at 01:15 local (CDT)', () => {
    // 2025-08-20 01:15 in America/Chicago == 2025-08-20T06:15:00Z
    const d = new Date('2025-08-20T06:15:00Z');
    expect(emailMod.isBhairavaWindow(d)).toBe(false);
  });
});

describe('Template building', () => {
  const MAGIC = 'https://aformulationoftruth.com/auth/verify?token=abc';
  const MORNING = 'May clarity find you before coffee.';
  const DATE_LINE = 'Aug 20, 2025 – Arasudaiyampattu, Tiruvannamalai District, Tamil Nadu';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('HTML includes Bhairava block when window is active', () => {
    const spy = jest.spyOn(emailMod, 'isBhairavaWindow').mockReturnValue(true);
    const html = emailMod._internals.buildHtml({
      magicLink: MAGIC,
      morningMessage: MORNING,
      dateLine: DATE_LINE,
    });
    expect(spy).toHaveBeenCalled();
    expect(html).toMatch(/Bhairava hour \(01:00–01:14\)/);
    expect(html).toMatch(/Tantrasāra/);
    expect(html).toContain(MAGIC); // CTA link present
  });

  test('HTML excludes Bhairava block when window is inactive', () => {
    jest.spyOn(emailMod, 'isBhairavaWindow').mockReturnValue(false);
    const html = emailMod._internals.buildHtml({
      magicLink: MAGIC,
      morningMessage: MORNING,
      dateLine: DATE_LINE,
    });
    expect(html).not.toMatch(/Bhairava hour \(01:00–01:14\)/);
  });

  test('CTA href is correctly injected & escaped', () => {
    jest.spyOn(emailMod, 'isBhairavaWindow').mockReturnValue(false);
    const weird = 'https://ex.ampl/e?x=<script>alert(1)</script>&y="z"';
    const html = emailMod._internals.buildHtml({
      magicLink: weird,
      morningMessage: '',
      dateLine: DATE_LINE,
    });
    // The raw characters should be escaped in attribute context
    expect(html).toContain('href="https://ex.ampl/e?x=&lt;script&gt;alert(1)&lt;/script&gt;&amp;y=&quot;z&quot;"');
  });

  test('Plain text and HTML contain the fixed multilingual sign-off order', () => {
    jest.spyOn(emailMod, 'isBhairavaWindow').mockReturnValue(false);
    const text = emailMod._internals.buildText({
      magicLink: MAGIC,
      morningMessage: MORNING,
      dateLine: DATE_LINE,
    });
    const html = emailMod._internals.buildHtml({
      magicLink: MAGIC,
      morningMessage: MORNING,
      dateLine: DATE_LINE,
    });

    const order = [
      'Слава мудрецу, Нирмейаппор',
      'Salve al sabio, Nirmeyappor',
      'Kunnia viisaalle, Nirmeyappor',
      'Hail the wise one, Nirmeyappor',
      'Cinvāṉē pōṟṟi, Nirmeyappōr',
    ];

    for (const line of order) {
      expect(text).toContain(line);
      expect(html).toContain(line);
    }
    // Ensure ordering (basic check: the sequence indices are increasing)
    const idx = order.map(l => html.indexOf(l));
    const isStrictlyIncreasing = idx.every((v, i, a) => (i === 0 ? v >= 0 : v > a[i - 1]));
    expect(isStrictlyIncreasing).toBe(true);
  });
});

describe('sendMagicLink transport usage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('calls nodemailer with expected fields', async () => {
    process.env.MAIL_FROM_NAME = 'Karuppacāmi Nirmeyappōr';
    process.env.MAIL_FROM_ADDR = 'thoughtlessness@aformulationoftruth.com';
    delete process.env.USE_SMTP; // prefer sendmail mock

    const info = await emailMod.sendMagicLink({
      toEmail: 'user@example.com',
      toName: 'Test User',
      magicLink: 'https://aformulationoftruth.com/auth/verify?token=abc123',
      morningMessage: 'Good morning.',
    });

    // transport created
    expect(nodemailer.createTransport).toHaveBeenCalled();

    // sendMail invoked with multipart body
    const transport = nodemailer.createTransport.mock.results[0].value;
    expect(transport.sendMail).toHaveBeenCalledTimes(1);

    const args = transport.sendMail.mock.calls[0][0];
    expect(args.from).toContain('Karuppacāmi Nirmeyappōr');
    expect(args.from).toContain('thoughtlessness@aformulationoftruth.com');
    expect(args.to).toContain('Test User');
    expect(args.to).toContain('user@example.com');
    expect(args.subject).toMatch(/apotropaic link/i);
    expect(args.text).toMatch(/Your link:/);
    expect(args.html).toMatch(/⛓️ Take the plunge/);
    expect(info).toHaveProperty('messageId');
  });

  test('SMTP mode requires credentials', async () => {
    process.env.USE_SMTP = '1';
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    await expect(emailMod.sendMagicLink({
      toEmail: 'user@example.com',
      magicLink: 'https://x',
    })).rejects.toThrow(/SMTP selected but SMTP_USER\/SMTP_PASS missing/i);

    // clean
    delete process.env.USE_SMTP;
  });
});
