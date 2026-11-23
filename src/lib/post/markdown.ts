// 投稿内容から制作ログ（src/content/logs/*.md）を作る。
// 形式はサイトの制作ログと同じ（src/content.config.ts）。

export interface LogInput {
  date: string; // YYYY-MM-DD
  title: string;
  photos: string[]; // public/images/logs/ のファイル名
  techniques: string[]; // 技法 ID（techniques/ のファイル名）
  used: string[]; // 使ったもの
  doya: string[];
  gunu: string[];
  memo: string;
}

// JSON の文字列はそのまま YAML のダブルクォート文字列として読める（: や # を含んでも壊れない）
const quote = (s: string) => JSON.stringify(s);

const list = (key: string, items: string[]) =>
  items.length === 0 ? `${key}:` : `${key}:\n${items.map((i) => `  - ${quote(i)}`).join('\n')}`;

export function buildLogMarkdown(input: LogInput): string {
  return [
    '---',
    `date: ${input.date}`,
    `title: ${quote(input.title)}`,
    list('photos', input.photos),
    list('techniques', input.techniques),
    list('使ったもの', input.used),
    list('どやぁ', input.doya),
    list('ぐぬぬ', input.gunu),
    '---',
    '',
    input.memo.trim(),
    '',
  ].join('\n');
}

// YAML の値1つを文字列にする（"…" はアプリが書いた JSON 形式、'…' や素の文字列は手書きのログ）
function scalar(raw: string): string {
  const s = raw.trim();
  if (s.startsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      /* 下へ */
    }
  }
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  return s.replace(/\s+#.*$/, ''); // 行末のコメントを外す
}

/** [a, "b, c", 'd'] の形のリストを項目に分ける（引用符の中の , では分けない） */
function flowList(raw: string): string[] {
  const inner = raw.trim().slice(1, -1);
  const items: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      if (c === '\\' && quote === '"') {
        cur += c + (inner[++i] ?? '');
        continue;
      }
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ',') {
      items.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  items.push(cur);
  return items.map((s) => s.trim()).filter(Boolean).map(scalar);
}

/**
 * Markdown の先頭の設定部分（--- で囲まれた YAML）と本文を読む。
 * 読めるのは「キー: 値」「キー: [項目, 項目]」と、「キー:」の下に「- 項目」を並べる書き方。
 * それ以外の書き方（| や > で複数行にする、値を次の行へ続けるなど）は、読み違えて
 * 上書き保存すると中身が消えるので、読まずにエラーにする。
 */
function parseFrontmatter(text: string) {
  const m = text.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/);
  if (!m) throw new Error('ファイルの形式を読み取れませんでした。');
  const data: Record<string, string | string[]> = {};
  let key: string | null = null;
  const unsupported = (line: string) =>
    new Error(`アプリでは読めない書き方の行があります：「${line.trim()}」。「キー: 値」か「- 項目」の形に直してください。`);
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = line.match(/^\s*-(?:\s+(.*))?$/);
    if (item) {
      if (!key || !Array.isArray(data[key])) throw unsupported(line);
      (data[key] as string[]).push(scalar(item[1] ?? ''));
      continue;
    }
    const kv = line.match(/^([^\s:#-][^:]*):(?:\s+(.*))?$/);
    if (!kv) throw unsupported(line);
    key = kv[1].trim();
    const value = (kv[2] ?? '').replace(/^#.*$/, '').trim();
    if (/^[|>{]/.test(value)) throw unsupported(line);
    if (value.startsWith('[')) {
      const list = value.replace(/\s+#[^\]]*$/, ''); // ] のあとの行末コメントを外す
      if (!list.endsWith(']')) throw unsupported(line); // 次の行へ続くリスト
      data[key] = flowList(list);
      continue;
    }
    data[key] = value === '' ? [] : scalar(value);
  }
  return {
    arr: (k: string) => (Array.isArray(data[k]) ? (data[k] as string[]) : []),
    str: (k: string) => (typeof data[k] === 'string' ? (data[k] as string) : ''),
    body: m[2] ?? '',
  };
}

/** 制作ログを読み取って入力欄に戻せる形にする */
export function parseLogMarkdown(text: string): LogInput {
  const { arr, str, body } = parseFrontmatter(text);
  return {
    date: str('date'),
    // 以前のログは doll: で書いていたので、そちらも読む
    title: str('title') || str('doll'),
    photos: arr('photos'),
    techniques: arr('techniques'),
    used: arr('使ったもの'),
    doya: arr('どやぁ'),
    // 「はて？」は廃止したので、以前のログに残っていればぐぬぬに含める
    gunu: [...arr('ぐぬぬ'), ...arr('はて？')],
    memo: body.trim(),
  };
}

// ---- 技術リスト（src/content/techniques/<技法名>.md） ----

export interface TechniqueInput {
  name: string; // ファイル名（＝技法 ID）と同じ
  category: string;
  order: number;
  memo: string;
}

// 手書きで作った技法ファイルに入っている、中身のないメモ欄
const MEMO_PLACEHOLDER = '<!-- この技法についてのメモ・参考資料など -->';

export function parseTechniqueMarkdown(text: string): TechniqueInput {
  const { str, body } = parseFrontmatter(text);
  const memo = body.trim();
  return {
    name: str('name'),
    category: str('category'),
    order: Number(str('order')) || 0,
    memo: memo === MEMO_PLACEHOLDER ? '' : memo,
  };
}

export function buildTechniqueMarkdown(t: TechniqueInput): string {
  const head = ['---', `name: ${quote(t.name)}`, `category: ${quote(t.category)}`, `order: ${t.order}`, '---', ''];
  const memo = t.memo.trim();
  return [...head, ...(memo ? ['', memo, ''] : [])].join('\n');
}

/** 技法名として使えるか（ファイル名・URL になるため）。問題があれば理由を返す */
export function techniqueNameProblem(name: string): string {
  if (!name) return '技法名を入力してください。';
  if (name.length > 40) return '技法名は40文字以内にしてください。';
  if (/[\\/:*?"<>|#%]/.test(name) || name.startsWith('.')) return '技法名に \\ / : * ? " < > | # % は使えません（先頭の . も不可）。';
  // Windows で扱えない名前（手元の Windows で git pull やビルドができなくなる）
  if (/[\x00-\x1f]/.test(name)) return '技法名に制御文字は使えません。';
  if (name.endsWith('.')) return '技法名の最後に . は使えません。';
  if (/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i.test(name)) return `「${name}」は Windows で使えない名前なので、技法名にできません。`;
  return '';
}

/** 複数行の入力を「1行＝1項目」に分ける（空行は捨てる） */
export const splitLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

/** 日本時間の「今日」（YYYY-MM-DD）と「時刻」（HHmm） */
export function nowInJapan() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}${parts.minute}` };
}
