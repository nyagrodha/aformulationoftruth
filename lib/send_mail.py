#!/usr/bin/env python3
"""
Send a web-tier notice -- a magic link, a newsletter confirmation.

Python rather than denomailer. denomailer 1.6.0 fails this submission to
smtp.mail.me.com with "invalid cmd", and worse, leaks a rejected promise from
its own socket reader: Deno terminates the process on an unhandled rejection,
so every failed send took the whole site down rather than one request. smtplib
completes STARTTLS and authenticates on the same socket without complaint.
romania/mailer.ts reached this conclusion for the PDF; this is the same fix on
the web side, and the two senders are deliberately near-identical.

The recipient arrives in a 0600 JSON file whose path is the only argument.
Nothing sensitive goes on argv, because /proc/<pid>/cmdline is world-readable.
Credentials arrive in the environment, which is not.

Failures print exactly one line on stdout --

    code=<int|none> kind=<ExceptionClassName>

-- and nothing else, ever. No traceback escapes: smtplib's exceptions carry the
envelope (SMTPRecipientsRefused keeps the address in .recipients, and a
traceback frame can hold the whole message), and the zero-logging policy has no
exception for a stack trace. A reply code and a class name are PII-free and are
the whole of the diagnosis.
"""
import json
import os
import smtplib
import ssl
import sys
from email.message import EmailMessage


def report_failure(exc):
    """Print the PII-free summary and exit non-zero. Never prints the exception."""
    code = getattr(exc, "smtp_code", None)
    if code is None and isinstance(exc, smtplib.SMTPRecipientsRefused):
        # .recipients maps address -> (code, message). Take the code, never the key.
        codes = [pair[0] for pair in exc.recipients.values()]
        code = codes[0] if codes else None
    printable = code if isinstance(code, int) and 200 <= code <= 599 else "none"
    print(f"code={printable} kind={type(exc).__name__}")
    sys.exit(1)


try:
    with open(sys.argv[1]) as fh:
        spec = json.load(fh)

    msg = EmailMessage()
    msg["Subject"] = spec["subject"]
    msg["From"] = spec["from"]
    msg["To"] = spec["to"]
    msg.set_content(spec["text"])
    if spec.get("html"):
        msg.add_alternative(spec["html"], subtype="html")

    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    secure = os.environ.get("SMTP_SECURE", "false").lower() == "true"
    ctx = ssl.create_default_context()

    if secure:
        with smtplib.SMTP_SSL(host, port, timeout=60, context=ctx) as s:
            s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=60) as s:
            s.starttls(context=ctx)
            s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
            s.send_message(msg)
except Exception as exc:
    report_failure(exc)

print("sent")
