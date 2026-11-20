// 投稿アプリをホーム画面に追加するための設定
import type { APIRoute } from 'astro';
import { url } from '../../lib/url';

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      name: 'どーる技術研究室 投稿',
      short_name: '研究室投稿',
      start_url: url('/post/'),
      scope: url('/post/'),
      display: 'standalone',
      background_color: '#fbf4f1',
      theme_color: '#c9577a',
      icons: [{ src: url('/apple-touch-icon.png'), sizes: '180x180', type: 'image/png' }],
    }),
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
