// 投稿内容から制作ログ（src/content/logs/*.md）を作る。
// 形式はサイトの制作ログと同じ（src/content.config.ts）。

export interface LogInput {
  date: string; // YYYY-MM-DD
  doll: string;
  photos: string[]; // public/images/logs/ のファイル名
  techniques: string[]; // 技法 ID（techniques/ のファイル名）
  doya: string[];
  gunu: string[];
  hate: string[];
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
    `doll: ${quote(input.doll)}`,
    list('photos', input.photos),
    list('techniques', input.techniques),
    list('どやぁ', input.doya),
    list('ぐぬぬ', input.gunu),
    list('はて？', input.hate),
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

/**
 * 制作ログを読み取って入力欄に戻せる形にする。
 * このサイトのログで使う書き方（「キー: 値」と「キー:」＋「  - 項目」）だけを読む。
 */
export function parseLogMarkdown(text: string): LogInput {
  const m = text.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/);
  if (!m) throw new Error('ログの形式を読み取れませんでした。');
  const data: Record<string, string | string[]> = {};
  let key: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = line.match(/^\s+-\s?(.*)$/);
    if (item && key && Array.isArray(data[key])) {
      (data[key] as string[]).push(scalar(item[1]));
      continue;
    }
    const kv = line.match(/^([^\s:][^:]*):(?:\s+(.*))?$/);
    if (kv) {
      key = kv[1].trim();
      const value = (kv[2] ?? '').replace(/^#.*$/, '').trim();
      data[key] = value === '' ? [] : scalar(value);
    }
  }
  const arr = (k: string) => (Array.isArray(data[k]) ? (data[k] as string[]) : []);
  const str = (k: string) => (typeof data[k] === 'string' ? (data[k] as string) : '');
  return {
    date: str('date'),
    doll: str('doll'),
    photos: arr('photos'),
    techniques: arr('techniques'),
    doya: arr('どやぁ'),
    gunu: arr('ぐぬぬ'),
    hate: arr('はて？'),
    memo: (m[2] ?? '').trim(),
  };
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
