// 技術リストのカテゴリと、それをまとめる研究分野（表示順）。
// 技法ファイル（src/content/techniques/*.md）の category には、ここにある名前だけが使える。
// 研究分野は「この研究室について」の研究分野と、技術リストの見出しに使う。
export const fields = [
  {
    name: 'ドールメイク研究',
    // アニメ系ドールではラインとまつ毛を一体で描くことが多いため「アイライン・まつ毛」は1つにまとめている
    categories: ['下書き', '眉毛', 'アイライン・まつ毛', 'チーク', 'リップ', '陰影・ハイライト'],
  },
  { name: 'レジンアイ研究', categories: ['虹彩表現', '研磨・コーティング'] },
  { name: '撮影研究', categories: ['撮影'] },
  { name: '道具研究', categories: ['道具・材料'] },
] as const;

export type Category = (typeof fields)[number]['categories'][number];

export const categories = fields.flatMap((f) => f.categories) as [Category, ...Category[]];

/** カテゴリが属する研究分野の名前 */
export const fieldOf = (category: string) => fields.find((f) => (f.categories as readonly string[]).includes(category))?.name ?? '';
