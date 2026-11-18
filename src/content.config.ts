import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { categories } from './data/categories';

// 試したい技法（ファイル名がそのまま技法IDになる 例: 平行眉.md）
const techniques = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/techniques' }),
  schema: z.object({
    name: z.string(),
    category: z.enum(categories),
    order: z.number().default(0),
  }),
});

// 制作ログ（ファイル名は日付 例: 2026-11-18.md）
const logs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/logs' }),
  schema: z.object({
    date: z.coerce.date(),
    doll: z.string(),
    techniques: z.array(reference('techniques')).default([]),
    impressions: z.array(z.string()).default([]),
  }),
});

export const collections = { techniques, logs };
