import { getCollection, type CollectionEntry } from 'astro:content';
import { categories } from '../data/categories';

export type Technique = CollectionEntry<'techniques'>;
export type Log = CollectionEntry<'logs'>;

/** 新しい順の制作ログ */
export async function getLogs(): Promise<Log[]> {
  const logs = await getCollection('logs');
  return logs.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
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

/** カテゴリごとの経験値（= そのカテゴリの技法を試した延べ回数） */
export async function getCategoryExperience() {
  const techniques = await getCollection('techniques');
  const counts = await getTryCounts();
  return categories.map((category) => {
    const inCategory = techniques.filter((t) => t.data.category === category);
    const exp = inCategory.reduce((sum, t) => sum + (counts.get(t.id) ?? 0), 0);
    return { category, exp };
  });
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

export function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
