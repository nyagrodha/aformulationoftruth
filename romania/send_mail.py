#!/usr/bin/env python3
"""
Send the finished document.

Python rather than denomailer: denomailer 1.6.0 fails this exact submission
("invalid cmd", then "Bad resource ID") on a socket where smtplib completes the
STARTTLS handshake and authenticates without complaint. The render service
already shells out to typst and qpdf, so one more subprocess is consistent, and
email.message handles MIME and the PDF attachment without hand-rolling either.

Everything sensitive arrives in a 0600 JSON file whose path is the only
argument. Nothing -- not the address, not the password, not the document --
goes on argv, because /proc/<pid>/cmdline is world-readable.
"""
import json
import os
import smtplib
import ssl
import sys
from email.message import EmailMessage

spec = json.load(open(sys.argv[1]))

msg = EmailMessage()
msg["Subject"] = spec.get("subject", "your responses")
msg["From"] = spec["from"]
msg["To"] = spec["to"]
msg.set_content(spec["body"])

with open(spec["pdf_path"], "rb") as fh:
    msg.add_attachment(
        fh.read(),
        maintype="application",
        subtype="pdf",
        filename=spec.get("filename", "responses.pdf"),
    )

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

print("sent")
