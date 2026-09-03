#!/usr/bin/env python3
"""
Web-tier SMTP sender.

Sibling in spirit to romania/send_mail.py, deliberately NOT the same file: that
one ships to the key box on its own schedule, over an ssh relay, and attaches a
PDF this tier never has. Sharing it would let a web-tier change break delivery
on a machine in another country that nothing here redeploys. The overlap is
about fourteen lines of smtplib boilerplate; the bodies differ entirely.

Python rather than denomailer: denomailer 1.6.0 leaves the STARTTLS handshake
on a detached promise (client.ts:335 calls writeCmdAndAssert without awaiting
it and without a .catch()). Under Deno 2.9 the conn is invalidated by
Deno.startTls, that orphan settles with a null reply, assertCode throws
`invalid cmd` where no try/catch can reach it, and the whole Fresh process
exits(1) -- 156 times between 2026-09-01 and 2026-09-03, each one taking the
clearnet site down for the unit's RestartSec=10. smtplib completes the
identical submission against smtp.mail.me.com:587 without complaint. 1.6.0 is
the latest published denomailer, so there is no version to upgrade to.

Everything sensitive arrives in a 0600 JSON file inside a 0700 directory, and
its path is the ONLY argv argument, because /proc/<pid>/cmdline is
world-readable. Credentials come from the environment instead:
/proc/<pid>/environ is 0400 and owner-only.

Contract, and nothing else is ever printed:

    exit 0  -> stdout {"ok": true}
    exit 1  -> stdout {"ok": false, "kind": "<ExceptionClassName>", "code": <int|null>}
    exit 2  -> bad invocation, stdout empty

In particular never str(exception): SMTPRecipientsRefused stringifies the
recipient, and SMTPResponseException's message can echo the envelope. A class
name and an integer reply code carry no user data, which is the same line
lib/email.ts's smtpFailureKind and smtpReplyCode draw.
"""
import json
import os
import smtplib
import ssl
import sys
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid

# Longer than any single SMTP round trip should need, shorter than the Deno
# side's own SIGKILL deadline -- so an ordinary stall produces a structured
# failure here rather than a killed child with empty stdout there.
TIMEOUT_S = 45


def fail(exc, code=None):
    print(json.dumps({"ok": False, "kind": type(exc).__name__, "code": code}))
    sys.exit(1)


if len(sys.argv) != 2:
    sys.exit(2)

with open(sys.argv[1]) as fh:
    spec = json.load(fh)

msg = EmailMessage()
msg["Subject"] = spec["subject"]
msg["From"] = formataddr((spec["from_name"], spec["from_email"]))
msg["To"] = spec["to"]
# denomailer set these itself; smtplib.send_message does not, and a message
# with no Date and no Message-ID scores badly with every spam filter Apple
# hands it to. The Message-ID domain is fixed rather than socket.getfqdn() so
# the sending host's name does not travel with the mail.
msg["Date"] = formatdate(localtime=True)
msg["Message-ID"] = make_msgid(domain="aformulationoftruth.com")

# text first, then html: add_alternative appends, and multipart/alternative is
# ordered least- to most-preferred. Reversing them shows the plaintext to
# clients that can render the HTML.
msg.set_content(spec["text"])
msg.add_alternative(spec["html"], subtype="html")

try:
    # Inside the try, not above it. A missing SMTP_HOST or a non-numeric
    # SMTP_PORT would otherwise raise before the first print, and the contract
    # above promises JSON on every exit-1 path -- the Deno side discards stderr,
    # so a traceback there is not a diagnostic, it is just silence.
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    secure = os.environ.get("SMTP_SECURE", "false").lower() == "true"
    ctx = ssl.create_default_context()

    if secure:
        with smtplib.SMTP_SSL(host, port, timeout=TIMEOUT_S, context=ctx) as s:
            s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=TIMEOUT_S) as s:
            s.ehlo()
            s.starttls(context=ctx)
            # Re-issued after the upgrade: the capability list advertised in
            # cleartext is not the one that governs the encrypted session, and
            # AUTH is only offered on the second EHLO.
            s.ehlo()
            s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
            s.send_message(msg)
except smtplib.SMTPRecipientsRefused as e:
    # .recipients maps ADDRESS -> (code, msg). Take a code, never a key.
    codes = [v[0] for v in e.recipients.values()]
    fail(e, codes[0] if codes else None)
except smtplib.SMTPResponseException as e:
    # 535 bad credentials, 421 throttled, 550 rejected -- the integer is the
    # whole of the diagnosis and none of the payload.
    fail(e, e.smtp_code)
except Exception as e:
    # OSError, ssl.SSLError, socket.timeout, KeyError on a missing SMTP_* var.
    fail(e)

print(json.dumps({"ok": True}))
