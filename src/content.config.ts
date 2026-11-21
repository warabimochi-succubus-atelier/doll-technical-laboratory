import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { existsSync } from 'node:fs';
import { categories } from './data/categories';

// 試したい技法（ファイル名がそのまま技法IDになる 例: 細い線.md）
// Astro は標準ではファイル名を URL 向けに変形する（「・」や空白を消す、英大文字を小文字にする）。
// 投稿アプリと制作ログはファイル名で技法を指すので、変形せずにファイル名をそのまま ID にする
const techniques = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './src/content/techniques',
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
  schema: z.object({
    name: z.string(),
    category: z.enum(categories),
    order: z.number().default(0),
  }),
});

// 見出しだけ書いて中身が空（YAML の null）でも空リストとして扱う
const impressionList = z.preprocess((v) => v ?? [], z.array(z.string()));

// 制作ログ（ファイル名は日付 例: 2026-11-18.md。同じ日に複数書くときは 2026-11-18-2130.md など）
const logs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/logs' }),
  schema: z.object({
    date: z.coerce.date(),
    // 件名（ドール名でも、アイなどパーツの名前でもよい）
    title: z.string(),
    // public/images/logs/ に置いた写真のファイル名（省略・空欄可）。ファイルがなければビルドを止める
    photos: z.preprocess(
      (v) => v ?? [],
      z.array(
        z.string().refine((name) => existsSync(`public/images/logs/${name}`), {
          message: 'public/images/logs/ にこの写真がありません',
        }),
      ),
    ),
    techniques: z.array(reference('techniques')).default([]),
    // 感想は どやぁ / ぐぬぬ / はて？ に分けて書く（どれも省略・空欄可）
    'どやぁ': impressionList,
    'ぐぬぬ': impressionList,
    'はて？': impressionList,
  }),
});

export const collections = { techniques, logs };
