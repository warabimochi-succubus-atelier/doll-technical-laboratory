// トップページの経験値表示に使うカテゴリ（表示順）
export const categories = [
  '眉毛',
  'アイライン',
  'チーク',
  'まつ毛',
  'レジンアイ',
] as const;

export type Category = (typeof categories)[number];
