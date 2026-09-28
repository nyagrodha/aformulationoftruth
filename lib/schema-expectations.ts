/**
 * Schema Expectations: what db/migrations/ says the database should contain.
 *
 * Pure: reads SQL text, never a database. lib/schema-check.ts compares the
 * result against information_schema; scripts/check-schema.ts and /api/health
 * report it.
 *
 * Why this exists: migrations are applied by hand, as the Postgres admin,
 * because a4m_app holds DML-only grants. The _migrations ledger that migrate.ts
 * keeps never sees a hand-applied file, so "which migrations ran" cannot be
 * answered from the ledger. In September 2026 015_pdf_delivery_queue.sql was
 * skipped while 016-018 were applied; the site booted, /api/health said ok, and
 * every PDF request failed for over a week. The only reliable record of what a
 * migration did is the schema itself, so this derives the end state the files
 * describe and lets the caller compare it with the end state that exists.
 *
 * What is tracked, and why only this:
 *   - tables, from CREATE TABLE, minus later DROP TABLE. Order matters:
 *     001_initial_schema.sql drops legacy tables, so files are applied in sorted
 *     filename order, the order migrate.ts uses.
 *   - columns added by ALTER TABLE ... ADD [COLUMN]. 004 and 017 create no
 *     tables at all, so a table-only check could never see either one skipped.
 *   Columns declared inside CREATE TABLE are not tracked: a missing table is
 *   already reported, and a table that exists with a different body is a
 *   different failure (CREATE TABLE IF NOT EXISTS against an older table) that
 *   this check does not claim to detect.
 *
 * The parser fails loudly and never guesses. A CREATE / DROP / ALTER TABLE it
 * cannot read throws a MigrationParseError naming the file, because the
 * alternative -- skipping it -- silently shrinks the expectation, and a check
 * with a shrunken expectation reports "ok" on exactly the database it exists to
 * catch. Statements that cannot change which tables or columns exist (indexes,
 * triggers, functions, grants, comments, DML) are ignored.
 *
 * Deliberately NOT understood (each either throws or is provably harmless):
 *   - DO $$ ... $$ blocks and function bodies: ignored. Their contents run
 *     conditionally or not at all, so nothing in them can be an unconditional
 *     expectation. 004's DO block alters gate_responses, which exists only on a
 *     legacy database. EXCEPT: a body that contains CREATE TABLE throws, because
 *     a table created that way would otherwise vanish from the expectation.
 *   - CREATE TABLE ... AS / PARTITION OF / OF type: throws.
 *   - CREATE TEMP / TEMPORARY / FOREIGN TABLE: throws.
 *   - ALTER TABLE ... RENAME (table or column) and SET SCHEMA: throws.
 *   - any table outside schema public: throws. The check reads only public.
 *   - SELECT ... INTO new_table, CREATE VIEW / MATERIALIZED VIEW: ignored. None
 *     is a table this check expects, and nothing here writes them.
 */

export interface MigrationFile {
  name: string;
  sql: string;
}

export interface ExpectedSchema {
  tables: Set<string>;
  columns: Map<string, Set<string>>;
  /** The file that introduced each table, so the report can say which migration to apply. */
  tableSources: Map<string, string>;
  /** table -> column -> the file that introduced it. */
  columnSources: Map<string, Map<string, string>>;
}

export interface ActualSchema {
  tables: Set<string>;
  columns: Map<string, Set<string>>;
}

export interface SchemaDrift {
  missingTables: { table: string; file: string }[];
  missingColumns: { table: string; column: string; file: string }[];
}

export class MigrationParseError extends Error {
  constructor(readonly file: string, reason: string) {
    super(`${file}: ${reason}`);
    this.name = 'MigrationParseError';
  }
}

export const MIGRATIONS_DIR = new URL('../db/migrations/', import.meta.url);

/** Every .sql file in the directory, unsorted; expectedSchema() owns the ordering. */
export async function readMigrationFiles(dir: URL = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const files: MigrationFile[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith('.sql')) continue;
    files.push({ name: entry.name, sql: await Deno.readTextFile(new URL(entry.name, dir)) });
  }
  return files;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * `word` is an unquoted identifier or keyword, folded to lower case the way
 * Postgres folds it. `ident` is a double-quoted identifier, kept exactly: that is
 * what lands in information_schema. Literals collapse to `other`, so text inside
 * a string can never be mistaken for a statement.
 */
type Token =
  | { kind: 'word'; value: string }
  | { kind: 'ident'; value: string }
  | { kind: 'punct'; value: string }
  | { kind: 'other' };

interface Statement {
  tokens: Token[];
  /** Offset of the first token, so an error can quote the statement. */
  start: number;
}

interface Tokenized {
  statements: Statement[];
  /** Contents of every dollar-quoted string: DO blocks and function bodies. */
  bodies: string[];
}

const WORD_START = /[A-Za-z_\u0080-￿]/;
const WORD_PART = /[A-Za-z0-9_$\u0080-￿]/;
const DOLLAR_TAG = /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/y;

function tokenize(file: string, sql: string): Tokenized {
  const statements: Statement[] = [];
  const bodies: string[] = [];
  let tokens: Token[] = [];
  let start = -1;
  let i = 0;

  const push = (token: Token, at: number) => {
    if (tokens.length === 0) start = at;
    tokens.push(token);
  };
  const fail = (reason: string): never => {
    throw new MigrationParseError(file, reason);
  };

  while (i < sql.length) {
    const ch = sql[i];
    const at = i;

    if (/\s/.test(ch)) {
      i++;
    } else if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
    } else if (ch === '/' && sql[i + 1] === '*') {
      // Postgres block comments nest, unlike C's.
      let depth = 1;
      i += 2;
      while (depth > 0) {
        if (i >= sql.length) fail('unterminated /* comment');
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else i++;
      }
    } else if (ch === "'") {
      i = skipString(sql, i, false) ?? fail('unterminated string literal');
      push({ kind: 'other' }, at);
    } else if (ch === '"') {
      let value = '';
      i++;
      for (;;) {
        if (i >= sql.length) fail('unterminated quoted identifier');
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            value += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        value += sql[i++];
      }
      push({ kind: 'ident', value }, at);
    } else if (ch === '$' && dollarTag(sql, i)) {
      const tag = dollarTag(sql, i)!;
      const end = sql.indexOf(tag, i + tag.length);
      if (end === -1) fail(`unterminated ${tag} quote`);
      bodies.push(sql.slice(i + tag.length, end));
      i = end + tag.length;
      push({ kind: 'other' }, at);
    } else if (WORD_START.test(ch)) {
      let j = i + 1;
      while (j < sql.length && WORD_PART.test(sql[j])) j++;
      const word = sql.slice(i, j).toLowerCase();
      i = j;
      // E'...' strings take backslash escapes, so \' does not close them.
      if (word === 'e' && sql[i] === "'") {
        i = skipString(sql, i, true) ?? fail('unterminated string literal');
        push({ kind: 'other' }, at);
      } else {
        push({ kind: 'word', value: word }, at);
      }
    } else if (/[0-9]/.test(ch)) {
      while (i < sql.length && /[0-9.eE]/.test(sql[i])) i++;
      push({ kind: 'other' }, at);
    } else if (ch === ';') {
      if (tokens.length) statements.push({ tokens, start });
      tokens = [];
      i++;
    } else {
      push({ kind: 'punct', value: ch }, at);
      i++;
    }
  }
  if (tokens.length) statements.push({ tokens, start });
  return { statements, bodies };
}

/** `$tag$` or `$$` opening at i; null for a positional parameter like $1. */
function dollarTag(sql: string, i: number): string | null {
  DOLLAR_TAG.lastIndex = i;
  return DOLLAR_TAG.exec(sql)?.[0] ?? null;
}

/** Index just past the closing quote, or null when the literal never closes. */
function skipString(sql: string, open: number, backslashEscapes: boolean): number | null {
  let i = open + 1;
  while (i < sql.length) {
    if (backslashEscapes && sql[i] === '\\') {
      i += 2;
    } else if (sql[i] === "'") {
      if (sql[i + 1] === "'") i += 2;
      else return i + 1;
    } else i++;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Statement parsing
// ---------------------------------------------------------------------------

type Op =
  | { op: 'create-table'; table: string }
  | { op: 'drop-table'; table: string }
  | { op: 'add-column'; table: string; column: string; ifTableExists: boolean }
  | { op: 'drop-column'; table: string; column: string };

/** ALTER TABLE actions that cannot change which tables or columns exist. */
const INERT_ALTER_ACTIONS = new Set([
  'alter', // ALTER [COLUMN] ... TYPE / SET DEFAULT / SET NOT NULL
  'enable',
  'disable',
  'owner',
  'reset',
  'cluster',
  'validate',
  'replica',
  'force',
  'no',
  'inherit',
  'attach',
  'detach',
  'of',
  'not',
]);

/** Words that may sit between CREATE and TABLE. Only UNLOGGED makes an ordinary table. */
const TABLE_MODIFIERS = new Set(['global', 'local', 'temp', 'temporary', 'unlogged', 'foreign']);

/** Keywords after ADD that introduce a constraint rather than a column. */
const ADD_CONSTRAINT = new Set(['constraint', 'primary', 'unique', 'check', 'foreign', 'exclude']);

/** A CREATE TABLE hidden in a DO block or function body would vanish from the expectation. */
const CREATE_TABLE_IN_BODY = /\bcreate\s+(?:(?:global|local)\s+)?(?:(?:temp|temporary|unlogged)\s+)?table\b/i;

class Cursor {
  i = 0;
  constructor(readonly tokens: Token[], readonly fail: (reason: string) => never) {}

  peek(offset = 0): Token | undefined {
    return this.tokens[this.i + offset];
  }
  done(): boolean {
    return this.i >= this.tokens.length;
  }
  /** The unquoted keyword at offset, if that is what is there. */
  word(offset = 0): string | undefined {
    const t = this.peek(offset);
    return t?.kind === 'word' ? t.value : undefined;
  }
  isWord(value: string, offset = 0): boolean {
    return this.word(offset) === value;
  }
  isPunct(value: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t?.kind === 'punct' && t.value === value;
  }
  /** Consume a run of keywords if all are present, e.g. IF NOT EXISTS. */
  accept(...words: string[]): boolean {
    if (!words.every((w, k) => this.isWord(w, k))) return false;
    this.i += words.length;
    return true;
  }
  identifier(what: string): string {
    const t = this.peek();
    if (t?.kind === 'word' || t?.kind === 'ident') {
      this.i++;
      return t.value;
    }
    return this.fail(`expected ${what}`);
  }
  /** [schema.]name, where only schema public is accepted: it is the only one the check reads. */
  tableName(): string {
    const first = this.identifier('a table name');
    if (!this.isPunct('.')) return first;
    this.i++;
    const second = this.identifier('a table name after the schema');
    if (this.isPunct('.')) this.fail('three-part table names are not supported');
    if (first !== 'public') this.fail(`table ${first}.${second} is outside schema public`);
    return second;
  }
}

function parseStatement(tokens: Token[], fail: (reason: string) => never): Op[] {
  const c = new Cursor(tokens, fail);

  if (c.accept('create')) {
    c.accept('or', 'replace');
    const modifiers: string[] = [];
    while (TABLE_MODIFIERS.has(c.word() ?? '')) {
      modifiers.push(c.word()!);
      c.i++;
    }
    if (!c.accept('table')) return []; // CREATE INDEX, FUNCTION, TRIGGER, VIEW, ...
    const unsupported = modifiers.filter((m) => m !== 'unlogged');
    if (unsupported.length) fail(`CREATE ${unsupported.join(' ').toUpperCase()} TABLE is not supported`);
    c.accept('if', 'not', 'exists');
    const table = c.tableName();
    if (!c.isPunct('(')) fail(`CREATE TABLE ${table} is not followed by a column list (AS / PARTITION OF / OF?)`);
    return [{ op: 'create-table', table }];
  }

  if (c.accept('drop', 'table')) {
    c.accept('if', 'exists');
    const ops: Op[] = [{ op: 'drop-table', table: c.tableName() }];
    while (c.isPunct(',')) {
      c.i++;
      ops.push({ op: 'drop-table', table: c.tableName() });
    }
    c.accept('cascade') || c.accept('restrict');
    if (!c.done()) fail('unexpected text after DROP TABLE');
    return ops;
  }

  if (c.accept('alter', 'table')) {
    const ifTableExists = c.accept('if', 'exists');
    c.accept('only');
    const table = c.tableName();
    if (c.isPunct('*')) c.i++;
    if (c.done()) fail(`ALTER TABLE ${table} has no action`);
    const ops: Op[] = [];
    for (const action of splitActions(c)) ops.push(...parseAlterAction(table, ifTableExists, action, fail));
    return ops;
  }

  return [];
}

/** Split the remainder of an ALTER TABLE on top-level commas: one action each. */
function splitActions(c: Cursor): Token[][] {
  const actions: Token[][] = [[]];
  let depth = 0;
  for (; !c.done(); c.i++) {
    const t = c.peek()!;
    if (t.kind === 'punct' && t.value === '(') depth++;
    if (t.kind === 'punct' && t.value === ')') depth--;
    if (t.kind === 'punct' && t.value === ',' && depth === 0) actions.push([]);
    else actions[actions.length - 1].push(t);
  }
  return actions;
}

function parseAlterAction(
  table: string,
  ifTableExists: boolean,
  tokens: Token[],
  fail: (reason: string) => never,
): Op[] {
  const c = new Cursor(tokens, fail);
  const head = c.word();
  if (head === undefined) return fail(`ALTER TABLE ${table} has an empty or unreadable action`);
  c.i++;

  switch (head) {
    case 'add': {
      if (ADD_CONSTRAINT.has(c.word() ?? '')) return [];
      c.accept('column');
      c.accept('if', 'not', 'exists');
      return [{ op: 'add-column', table, column: c.identifier('a column name after ADD'), ifTableExists }];
    }
    case 'drop': {
      if (c.accept('constraint')) return [];
      c.accept('column');
      c.accept('if', 'exists');
      return [{ op: 'drop-column', table, column: c.identifier('a column name after DROP') }];
    }
    case 'set':
      if (c.isWord('schema')) fail(`ALTER TABLE ${table} SET SCHEMA is not supported`);
      return [];
    case 'rename':
      return fail(`ALTER TABLE ${table} RENAME is not supported; the check would track the old name`);
    default:
      if (INERT_ALTER_ACTIONS.has(head)) return [];
      return fail(`ALTER TABLE ${table} ${head.toUpperCase()} is not understood`);
  }
}

function snippet(sql: string, start: number): string {
  const text = sql.slice(start, start + 200).replace(/\s+/g, ' ').trim();
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

// ---------------------------------------------------------------------------
// Expectation and diff
// ---------------------------------------------------------------------------

/**
 * The schema the migration files describe once all have been applied, in
 * sorted filename order. Throws MigrationParseError, naming the file, on any
 * table statement it cannot read.
 */
export function expectedSchema(files: MigrationFile[]): ExpectedSchema {
  const tables = new Set<string>();
  const columns = new Map<string, Set<string>>();
  const tableSources = new Map<string, string>();
  const columnSources = new Map<string, Map<string, string>>();

  const ordered = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const file of ordered) {
    const { statements, bodies } = tokenize(file.name, file.sql);

    if (bodies.some((body) => CREATE_TABLE_IN_BODY.test(body))) {
      throw new MigrationParseError(file.name, 'CREATE TABLE inside a DO block or function body cannot be tracked');
    }

    for (const { tokens, start } of statements) {
      const fail = (reason: string): never => {
        throw new MigrationParseError(file.name, `${reason} -- in: ${snippet(file.sql, start)}`);
      };
      for (const op of parseStatement(tokens, fail)) {
        switch (op.op) {
          case 'create-table':
            tables.add(op.table);
            if (!tableSources.has(op.table)) tableSources.set(op.table, file.name);
            break;
          case 'drop-table':
            tables.delete(op.table);
            tableSources.delete(op.table);
            columns.delete(op.table);
            columnSources.delete(op.table);
            break;
          case 'add-column': {
            // ALTER TABLE IF EXISTS on a table no migration creates is a no-op by
            // design; expecting its column would report drift that is not there.
            if (op.ifTableExists && !tables.has(op.table)) break;
            if (!columns.has(op.table)) columns.set(op.table, new Set());
            if (!columnSources.has(op.table)) columnSources.set(op.table, new Map());
            columns.get(op.table)!.add(op.column);
            const sources = columnSources.get(op.table)!;
            if (!sources.has(op.column)) sources.set(op.column, file.name);
            break;
          }
          case 'drop-column':
            columns.get(op.table)?.delete(op.column);
            columnSources.get(op.table)?.delete(op.column);
            break;
        }
      }
    }
  }

  return { tables, columns, tableSources, columnSources };
}

/**
 * What the database lacks. Objects the database has and the migrations do not
 * mention are not drift -- legacy tables, _migrations itself, anything created
 * by hand -- and are deliberately not reported.
 *
 * A missing table is reported once; its expected columns are implied and not
 * listed again.
 */
export function diff(expected: ExpectedSchema, actual: ActualSchema): SchemaDrift {
  const byFileThenName = <T extends { file: string }>(key: (x: T) => string) => (a: T, b: T) =>
    a.file.localeCompare(b.file) || key(a).localeCompare(key(b));

  const missingTables = [...expected.tables]
    .filter((table) => !actual.tables.has(table))
    .map((table) => ({ table, file: expected.tableSources.get(table) ?? 'unknown' }))
    .sort(byFileThenName((x) => x.table));

  const missingColumns: SchemaDrift['missingColumns'] = [];
  for (const [table, cols] of expected.columns) {
    if (expected.tables.has(table) && !actual.tables.has(table)) continue;
    const present = actual.columns.get(table);
    for (const column of cols) {
      if (present?.has(column)) continue;
      missingColumns.push({ table, column, file: expected.columnSources.get(table)?.get(column) ?? 'unknown' });
    }
  }
  missingColumns.sort(byFileThenName((x) => `${x.table}.${x.column}`));

  return { missingTables, missingColumns };
}

export function hasDrift(drift: SchemaDrift): boolean {
  return drift.missingTables.length > 0 || drift.missingColumns.length > 0;
}
