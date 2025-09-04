// src/pages/Contact.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as openpgp from "openpgp";

/**
 * Soft earth minimalist palette
 */
const theme = {
  bg: "#FAFAFA",
  panel: "#F2EFEC",
  panelBorder: "#E0E0E0",
  text: "#2c2a26",
  textMuted: "#5a4e3c",
  accent: "#7B5B4A",
  accentHover: "#6a4e40",
  inputBg: "#FFFEFC",
  inputBorder: "#D3C9B8",
};

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [encryptOn, setEncryptOn] = useState(true);
  const [status, setStatus] = useState({ kind: "", text: "" });
  const [keyInfo, setKeyInfo] = useState("Loading key…");
  const publicKeyRef = useRef(null);

  // ---- Language ring state (around Email box)
  const languages = useMemo(
    () => [
      { code: "en", label: "English" },
      { code: "hi", label: "हिन्दी" },
      { code: "ta", label: "தமிழ்" },
    ],
    []
  );

  const browserLang = (typeof navigator !== "undefined" ? navigator.language : "en")
    .split("-")[0]
    .toLowerCase();

  const [centerLang, setCenterLang] = useState(
    languages.find((l) => l.code === browserLang)?.code || "en"
  );

  // Load and parse the webmaster public key once (from /a4m_public.asc)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/a4m_public.asc", { cache: "no-store" });
        if (!res.ok) throw new Error("Key fetch failed");
        const armored = await res.text();
        const key = await openpgp.readKey({ armoredKey: armored });
        if (!cancelled) {
          publicKeyRef.current = key;
          const fp = key.getFingerprint?.().toUpperCase?.() ?? "";
          setKeyInfo(`Key loaded${fp ? ` • FP ${fp.slice(-16)}` : ""}`);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setKeyInfo("Key load failed — you can still send plaintext.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canSubmit = useMemo(() => {
    return name.trim() && email.trim() && message.trim();
  }, [name, email, message]);

  const buildCleartext = () => {
    const s = subject.trim() || "(no subject)";
    const n = name.trim() || "(anonymous)";
    return `From: ${n}\nEmail: ${email}\nSubject: ${s}\n\n${message}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ kind: "", text: "" });

    let payload = {
      name,
      email,
      subject,
      message,
      pgp: false,
    };

    if (encryptOn && publicKeyRef.current) {
      try {
        setStatus({ kind: "info", text: "Encrypting…" });
        const msg = await openpgp.createMessage({ text: buildCleartext() });
        const cipher = await openpgp.encrypt({
          message: msg,
          encryptionKeys: publicKeyRef.current,
          config: { showVersionString: false },
        });
        payload = {
          name,
          email,
          subject: "[Encrypted message]",
          encrypted_message: cipher,
          pgp: true,
        };
      } catch (err) {
        console.error(err);
        setStatus({
          kind: "warn",
          text: "Encryption failed — sending plaintext instead.",
        });
      }
    }

    try {
      const resp = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error("Request failed");
      setStatus({
        kind: "ok",
        text: payload.pgp ? "Sent securely (PGP)." : "Sent (plaintext).",
      });
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (err) {
      console.error(err);
      setStatus({
        kind: "err",
        text:
          "Could not send right now. Try again later or email formitselfisemptiness@aformulationoftruth.com.",
      });
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <header style={styles.header}>
          <h1 style={styles.h1}>Contact</h1>
          <p style={styles.lead}>
            By default the body of any message sent through this page is encrypted to our PGP key.
            <span style={{ color: theme.textMuted }}> (recommended)</span>.
          </p>
        </header>

        <form onSubmit={handleSubmit} style={styles.form} noValidate>
          <div style={styles.row2}>
            <Field
              label="Name"
              id="name"
              value={name}
              onChange={setName}
              placeholder="Your name"
              required
            />

            {/* Specialized email field with language ring */}
            <EmailFieldWithLanguageRing
              label="Email"
              id="email"
              value={email}
              onChange={setEmail}
              placeholder="your@email.org"
              required
              centerLang={centerLang}
              setCenterLang={setCenterLang}
              languages={languages}
            />
          </div>

          <Field
            label="Subject"
            id="subject"
            value={subject}
            onChange={setSubject}
            placeholder="What’s this regarding?"
          />

          <Field
            label="Message"
            id="message"
            as="textarea"
            value={message}
            onChange={setMessage}
            placeholder="Compose your message here…"
            required
            textareaMinHeight={170}
          />

          <div style={styles.toggleRow}>
            <button
              type="button"
              onClick={() => setEncryptOn((v) => !v)}
              aria-pressed={encryptOn}
              style={{
                ...styles.toggle,
                ...(encryptOn ? styles.toggleOn : {}),
              }}
              title={encryptOn ? "Encryption: ON (click to turn off)" : "Encryption: OFF (click to turn on)"}
            >
              <span
                style={{
                  ...styles.knob,
                  transform: encryptOn ? "translateX(26px)" : "translateX(0)",
                  background: encryptOn ? "#cdb7aa" : "#bbb",
                }}
              />
            </button>
            <div style={styles.keyStatus}>
              {encryptOn ? "Encrypt to site key • " : "Encryption off • "}
              {keyInfo}
            </div>
          </div>

          <div style={styles.actions}>
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                ...styles.button,
                ...(canSubmit ? {} : styles.buttonDisabled),
              }}
            >
              Send
            </button>

            <a
              href="mailto:formitselfisemptiness@aformulationoftruth.com?subject=Contact%20from%20site"
              style={styles.secondary}
            >
              Email instead
            </a>
          </div>

          {status.text ? (
            <p
              style={{
                ...styles.status,
                ...(status.kind === "ok"
                  ? { color: "#2f7d55" }
                  : status.kind === "warn"
                  ? { color: "#9b6b2f" }
                  : status.kind === "err"
                  ? { color: "#9b2f2f" }
                  : { color: theme.textMuted }),
              }}
              aria-live="polite"
            >
              {status.text}
            </p>
          ) : null}
        </form>

        <footer style={styles.footer}>
          <a href="/a4m_public.asc" style={styles.link} download>
            Download public key
          </a>
          <span style={{ ...styles.small, color: theme.textMuted }}>
            Subjects aren’t encrypted by email; we stash the original subject
            inside the ciphertext.
          </span>
        </footer>
      </div>
    </div>
  );
}

/* ------------------ Subcomponents ------------------ */

function Field({
  label,
  id,
  as,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  textareaMinHeight,
}) {
  const Tag = as === "textarea" ? "textarea" : "input";
  return (
    <div style={styles.field}>
      <label htmlFor={id} style={styles.label}>
        {label}
      </label>
      <Tag
        id={id}
        name={id}
        type={Tag === "input" ? type : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{
          ...styles.input,
          ...(Tag === "textarea" ? { minHeight: textareaMinHeight } : {}),
        }}
      />
    </div>
  );
}

/**
 * Email field with language "ring" badges around the input.
 * - Browser language appears centered.
 * - Other languages sit around the box; click a badge to move it to the center.
 */
function EmailFieldWithLanguageRing({
  label,
  id,
  value,
  onChange,
  placeholder,
  required,
  centerLang,
  setCenterLang,
  languages,
}) {
  const center = languages.find((l) => l.code === centerLang) || languages[0];
  const around = languages.filter((l) => l.code !== center.code);

  return (
    <div style={styles.field}>
      <label htmlFor={id} style={styles.label}>
        {label}
      </label>

      <div style={ringStyles.wrap}>
        {/* Input */}
        <input
          id={id}
          name={id}
          type="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          aria-describedby={`${id}-lang`}
          style={styles.input}
        />

        {/* Center badge (browser language) */}
        <div id={`${id}-lang`} style={ringStyles.centerBadge} title="Browser language">
          {center.label}
        </div>

        {/* Around badges: top / right / bottom (auto-fills with remaining languages) */}
        {around[0] && (
          <button
            type="button"
            onClick={() => setCenterLang(around[0].code)}
            style={{ ...ringStyles.badge, ...ringStyles.topBadge }}
            aria-label={`Switch to ${around[0].label}`}
          >
            {around[0].label}
          </button>
        )}
        {around[1] && (
          <button
            type="button"
            onClick={() => setCenterLang(around[1].code)}
            style={{ ...ringStyles.badge, ...ringStyles.rightBadge }}
            aria-label={`Switch to ${around[1].label}`}
          >
            {around[1].label}
          </button>
        )}
        {/* If you ever add a 4th language, you can add a left/bottom badge similarly */}
      </div>
    </div>
  );
}

/* ------------------ Styles ------------------ */

const styles = {
  page: {
    minHeight: "100dvh",
    background: theme.bg,
    color: theme.text,
    display: "grid",
    placeItems: "start center",
    padding: "32px 16px",
  },
  card: {
    width: "min(1040px, 100%)",
    background: theme.panel,
    border: `1px solid ${theme.panelBorder}`,
    borderRadius: 20,
    boxShadow: "0 8px 30px rgba(0,0,0,.08)",
    overflow: "hidden",
  },
  header: { padding: "22px 22px 0" },
  h1: {
    margin: 0,
    fontSize: "clamp(28px, 4vw, 48px)",
    fontWeight: 900,
    letterSpacing: ".02em",
  },
  lead: {
    margin: "8px 0 18px",
    fontSize: "clamp(16px, 2vw, 18px)",
    color: theme.textMuted,
    fontWeight: 600,
  },
  form: { padding: 22, display: "grid", gap: 14 },
  row2: {
    display: "grid",
    gap: 14,
    gridTemplateColumns: "1fr 1fr",
  },
  field: {},
  label: {
    display: "block",
    fontWeight: 800,
    fontSize: "1rem",
    marginBottom: 6,
    color: theme.text,
  },
  input: {
    width: "100%",
    background: theme.inputBg,
    color: theme.text,
    border: `2px solid ${theme.inputBorder}`,
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: "1.05rem",
    fontWeight: 700,
    outline: "none",
    position: "relative",
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    justifyContent: "space-between",
    flexWrap: "wrap",
    marginTop: 6,
  },
  toggle: {
    position: "relative",
    width: 58,
    height: 32,
    borderRadius: 32,
    border: `2px solid ${theme.inputBorder}`,
    background: "#e9e4df",
    cursor: "pointer",
  },
  toggleOn: {
    background: "#cdb7aa",
    borderColor: "#cdb7aa",
  },
  knob: {
    content: '""',
    position: "absolute",
    top: 3,
    left: 3,
    width: 26,
    height: 26,
    borderRadius: "50%",
    boxShadow: "inset 0 0 0 1px #00000022, 0 2px 6px #00000033",
    transition: "transform .22s ease",
  },
  keyStatus: {
    flex: 1,
    minWidth: 260,
    color: theme.textMuted,
    fontSize: ".95rem",
    fontWeight: 700,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 6,
  },
  button: {
    appearance: "none",
    border: "none",
    borderRadius: 12,
    padding: "14px 22px",
    background: theme.accent,
    color: "#fff",
    fontSize: "1.15rem",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 4px 10px rgba(0,0,0,.18)",
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  secondary: {
    fontWeight: 800,
    color: theme.textMuted,
    textDecoration: "none",
  },
  status: {
    marginTop: 6,
    fontWeight: 800,
  },
  footer: {
    padding: "0 22px 22px",
    display: "flex",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  link: {
    color: theme.accent,
    fontWeight: 900,
    textDecoration: "none",
  },
  small: {
    fontSize: ".9rem",
    fontWeight: 700,
  },
};

const ringStyles = {
  wrap: {
    position: "relative",
  },
  centerBadge: {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%,-50%)",
    background: "#fff",
    color: theme.text,
    border: `1px solid ${theme.inputBorder}`,
    borderRadius: 999,
    padding: "2px 10px",
    fontSize: ".8rem",
    fontWeight: 800,
    pointerEvents: "none", // non-interactive center
    boxShadow: "0 1px 2px rgba(0,0,0,.06)",
  },
  badge: {
    position: "absolute",
    background: "#fff",
    border: `1px solid ${theme.inputBorder}`,
    borderRadius: 999,
    padding: "2px 10px",
    fontSize: ".78rem",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(0,0,0,.06)",
  },
  topBadge: {
    left: "50%",
    transform: "translate(-50%,-50%)",
    top: 0,
  },
  rightBadge: {
    right: 6,
    top: "50%",
    transform: "translateY(-50%)",
  },
};
