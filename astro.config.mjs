// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages（プロジェクトサイト）で公開する。
// サイトは https://warabimochi-succubus-atelier.github.io/doll-technical-laboratory/ に置かれるため、
// サイト内のリンクと画像は src/lib/url.ts の url() で base を付けて書く。
export default defineConfig({
  site: 'https://warabimochi-succubus-atelier.github.io',
  base: '/doll-technical-laboratory',
});
