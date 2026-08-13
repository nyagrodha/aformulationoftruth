// Typeset a respondent's questionnaire.
//
// Data is read from a sibling file, NOT from --input. Process arguments are
// world-readable in /proc/<pid>/cmdline, so passing the decrypted document on
// the command line would expose every answer to any local user for the
// lifetime of the render -- on the one machine that also holds every private
// key. render.ts writes data.json 0600 into a tmpfs working directory and
// points --root at it; json() resolves against that root.

#let doc = json("data.json")

#set document(title: "a formulation of truth", author: "")
// The site wordmark, a4முலसत्यsya, set in the same glyphs the site uses. It
// needs three scripts in one run -- Latin, Tamil, Devanagari -- so the font
// list carries all three and Typst falls back per glyph.
#let wordmark = text(
  font: ("Noto Serif", "Noto Sans Tamil", "Noto Sans Devanagari"),
  size: 8pt,
  fill: luma(120),
)[a4#text(lang: "ta")[முல]#text(lang: "sa")[सत्य]sya]

#set page(
  margin: (x: 2.4cm, y: 2.6cm),
  numbering: "1",
  number-align: center,
  // Bottom right of every page, including the title page.
  footer: context [
    #set text(size: 8pt, fill: luma(130))
    #grid(
      columns: (1fr, auto, 1fr),
      align: (left + horizon, center + horizon, right + horizon),
      // Black, not the grey of the page furniture: this is where the document
      // came from, and it should still be legible on a photocopy years later.
      text(fill: black)[aformulationoftruth.com],
      counter(page).display("1"),
      wordmark,
    )
  ],
)

// Noto Serif carries the Latin and the ISO 15919 diacritics; Noto Sans Tamil
// carries the Tamil. Listing both makes Typst fall back per-glyph rather than
// per-run, so a Tamil question and its romanisation set correctly even when
// they sit in the same paragraph.
#set text(font: ("Noto Serif", "Noto Sans Tamil"), size: 10.5pt, lang: "en")
#set par(justify: false, leading: 0.72em)

#let rule = line(length: 100%, stroke: 0.4pt + luma(180))

// ── title page ──────────────────────────────────────────────────────────────
#align(center)[
  #v(3cm)
  #text(size: 17pt, tracking: 0.28em)[a formulation of truth]
  #v(0.6em)
  #text(size: 10pt, fill: luma(90), style: "italic")[your responses]
  #v(1.4em)
  #box(width: 40%, rule)
]

#v(2em)

#align(center)[
  #block(width: 74%)[
    #set text(size: 9.5pt, fill: luma(70))
    #set par(justify: false, leading: 0.7em)
    This document was produced from ciphertext that the server storing it cannot
    read. It was decrypted only to typeset these pages, and the plaintext was
    discarded when they were written.
  ]
]

#pagebreak()

// ── the questionnaire ───────────────────────────────────────────────────────
#for e in doc.entries [
  #block(breakable: false, width: 100%)[
    #grid(
      columns: (1.9cm, 1fr),
      gutter: 0.4em,
      // Tamil numeral with its Western digit set small to its left, as a gloss
      // for a reader who does not read Tamil numerals. index is 0-based and the
      // numerals are 1-based, hence +1.
      box(baseline: 0pt)[
        #text(size: 6.5pt, fill: luma(165))[#(e.index + 1)]#h(0.25em)#text(
          font: "Noto Sans Tamil",
          size: 13pt,
          fill: luma(120),
        )[#e.tamilNumeral]
      ],
      [
        #text(font: "Noto Sans Tamil", size: 11pt)[#e.tamil]
        #v(0.15em)
        #text(style: "italic", size: 9.5pt, fill: luma(95))[#e.transliteration]
        #v(0.15em)
        #text(size: 10pt, fill: luma(60))[#e.english]
      ],
    )

    // Separates the question from what was said in reply. The questions are
    // given; the answer is the respondent's own, and the page should say so
    // before they read it back years later.
    #v(0.55em)
    #pad(left: 1.9cm)[#line(length: 28%, stroke: 0.7pt + luma(15))]
    #v(0.55em)
    #pad(left: 1.9cm)[
      #if e.skipped [
        // Skipped questions are shown, not omitted. The absence is part of the
        // record, and dropping the entry would renumber everything after it
        // against the canonical set.
        #text(style: "italic", fill: luma(150))[— unanswered —]
      ] else [
        #set par(leading: 0.75em)
        #e.answer
      ]
    ]
  ]
  #v(1.6em)
]
