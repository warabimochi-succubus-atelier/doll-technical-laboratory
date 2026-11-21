// 研究室サイトをホーム画面に追加したときの設定（投稿アプリは /post/manifest.webmanifest）
import type { APIRoute } from 'astro';
import { url } from '../lib/url';

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      name: 'どーる技術研究室',
      short_name: 'どーる技術研究室',
      start_url: url('/'),
      scope: url('/'),
      display: 'standalone',
      background_color: '#fbf4f1',
      theme_color: '#fffaf8',
      icons: [
        { src: url('/apple-touch-icon.png'), sizes: '180x180', type: 'image/png' },
        { src: url('/icon-192.png'), sizes: '192x192', type: 'image/png' },
        { src: url('/icon-512.png'), sizes: '512x512', type: 'image/png' },
      ],
    }),
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
