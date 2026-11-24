import { getCollection, type CollectionEntry } from 'astro:content';
import { categories } from '../data/categories';
import { reactions } from '../data/reactions';
import { url } from './url';

export type Technique = CollectionEntry<'techniques'>;
export type Log = CollectionEntry<'logs'>;

/** 新しい順の制作ログ。同じ日付どうしはファイル名（日付-時刻）の新しい順 */
export async function getLogs(): Promise<Log[]> {
  const logs = await getCollection('logs');
  return logs.sort((a, b) => b.data.date.getTime() - a.data.date.getTime() || b.id.localeCompare(a.id));
}

/** 技法ID → 試した回数 */
export async function getTryCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const log of await getCollection('logs')) {
    for (const t of log.data.techniques) {
      counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
    }
  }
  return counts;
}

/** どやぁ / ぐぬぬ ごとの感想の延べ数 */
export async function getReactionCounts() {
  const logs = await getCollection('logs');
  return reactions.map((r) => ({
    ...r,
    count: logs.reduce((sum, log) => sum + log.data[r.key].length, 0),
  }));
}

/** 技法ID → 技法名（制作ログの技法は ID で入っているので、表示するときはこれで名前にする） */
export async function getTechniqueNames(): Promise<Map<string, string>> {
  return new Map((await getCollection('techniques')).map((t) => [t.id, t.data.name]));
}

/** カテゴリ別に並べた技法一覧（試した回数つき） */
export async function getTechniquesByCategory() {
  const techniques = await getCollection('techniques');
  const counts = await getTryCounts();
  return categories.map((category) => ({
    category,
    items: techniques
      .filter((t) => t.data.category === category)
      .sort((a, b) => a.data.order - b.data.order)
      .map((t) => ({ entry: t, count: counts.get(t.id) ?? 0 })),
  }));
}

/** ログの写真（URL・説明文・見出し）。説明文は「件名 日付 写真N」（見出しがあれば後ろに付ける）で自動生成する */
export function getLogPhotos(log: Log) {
  const date = formatDate(log.data.date);
  return log.data.photos.map((name, i) => {
    const caption = log.data.photoCaptions[i]?.trim() ?? '';
    return {
      src: url(`/images/logs/${name}`),
      alt: `${log.data.title} ${date} 写真${i + 1}${caption ? ` ${caption}` : ''}`,
      caption,
    };
  });
}

/** 代表写真（cover に書いた写真。なければ1枚目）。写真がなければ undefined */
export function getLogCover(log: Log) {
  const photos = getLogPhotos(log);
  const i = log.data.cover ? log.data.photos.indexOf(log.data.cover) : -1;
  return photos[Math.max(i, 0)];
}

export function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
