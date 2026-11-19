// 制作ログ一覧のページ切り替え
export const LOGS_PER_PAGE = 10;

/** n ページ目の URL（1ページ目は /logs/、2ページ目以降は /logs/page/n/） */
export function logsPageUrl(n: number) {
  return n === 1 ? '/logs/' : `/logs/page/${n}/`;
}

/** 全件を1ページあたり LOGS_PER_PAGE 件ずつに分ける */
export function splitPages<T>(items: T[]): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += LOGS_PER_PAGE) {
    pages.push(items.slice(i, i + LOGS_PER_PAGE));
  }
  return pages.length > 0 ? pages : [[]];
}
