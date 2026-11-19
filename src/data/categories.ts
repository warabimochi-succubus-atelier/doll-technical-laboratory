// 技術リストのカテゴリ（表示順）
export const categories = [
  '眉毛',
  'アイライン・まつ毛', // アニメ系ドールではラインとまつ毛を一体で描くことが多いため1つにまとめる
  'チーク',
  'レジンアイ',
] as const;

export type Category = (typeof categories)[number];
