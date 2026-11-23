import { defineCollection, z } from 'astro:content';
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
    // techniques/ のファイル名（拡張子なし）。技術リストにない名前があればビルドを止める
    // （Astro の reference() はエラーを表示するだけでビルドが通ってしまい、切れたリンクが公開されるため）
    techniques: z.preprocess(
      (v) => v ?? [],
      z
        .array(
          z.string().refine((id) => existsSync(`src/content/techniques/${id}.md`), {
            message: '技術リスト（src/content/techniques/）にこの技法がありません',
          }),
        )
        .transform((ids) => ids.map((id) => ({ collection: 'techniques' as const, id }))),
    ),
    // 使った材料（道具も含む。1行に1つ。省略・空欄可）
    '使った材料': impressionList,
    // 感想は どやぁ / ぐぬぬ に分けて書く（どちらも省略・空欄可）
    'どやぁ': impressionList,
    'ぐぬぬ': impressionList,
    // 「はて？」は廃止した。中身が残っていると黙って表示から消えるので、ビルドを止めて知らせる
    'はて？': z.preprocess(
      (v) => v ?? [],
      z.array(z.string()).max(0, { message: '「はて？」はなくなりました。中身を「ぐぬぬ」に移してください' }),
    ),
  }),
});

export const collections = { techniques, logs };
