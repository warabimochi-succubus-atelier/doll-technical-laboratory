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
