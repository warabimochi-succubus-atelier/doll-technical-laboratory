// 技術リストのカテゴリと、それをまとめる研究分野（表示順）。
// 中身は categories.json にあり、投稿アプリの「技術リスト」→「カテゴリを編集」からも書き換えられる。
// 技法ファイル（src/content/techniques/*.md）の category には、ここにある名前だけが使える。
// 研究分野は「この研究室について」の研究分野と、技術リストの見出しに使う。
// （「アイライン・まつ毛」は、アニメ系ドールではラインとまつ毛を一体で描くことが多いため1つにまとめている）
import data from './categories.json';

export interface Field {
  name: string;
  categories: string[];
}

export const fields: Field[] = data.fields;

export type Category = string;

export const categories = fields.flatMap((f) => f.categories) as [string, ...string[]];

if (categories.length === 0) throw new Error('src/data/categories.json にカテゴリが1つもありません。');
if (new Set(categories).size !== categories.length) throw new Error('src/data/categories.json に同じ名前のカテゴリがあります。');

/** カテゴリが属する研究分野の名前 */
export const fieldOf = (category: string) => fields.find((f) => f.categories.includes(category))?.name ?? '';
