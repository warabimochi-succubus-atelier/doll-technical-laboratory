// サイト内のパスに公開URLの base（/doll-technical-laboratory）を付ける。
// リンクや画像は必ず url('/logs/') のようにこの関数を通して書く。
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export function url(path: string) {
  return base + path;
}
