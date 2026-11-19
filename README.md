# どーる技術研究室 (doll-technical-laboratory)

未経験の技法を試し、その結果を記録するための研究室サイト。Astro 製。
コンセプトの元メモは [docs/concept.md](docs/concept.md)、運用方針の原文は [docs/policy.md](docs/policy.md)。
サイト上では「この研究室について」（`src/pages/about.astro`）にこの2つをまとめて掲載しています。
iPhone から制作ログを投稿するアプリ（開発予定）の仕様は [docs/posting-app-spec.md](docs/posting-app-spec.md)。

## 開発

Node.js 22.23.4 以上が必要です（Astro 7 の要件）。

```sh
npm install
npm run dev     # http://localhost:4321/doll-technical-laboratory/
npm run build   # dist/ に静的サイトを出力
```

## 公開

`main` に push すると、GitHub Actions（`.github/workflows/deploy.yml`）がビルドして GitHub Pages に公開します。

- 公開URL：https://warabimochi-succubus-atelier.github.io/doll-technical-laboratory/
- サイトはこの `/doll-technical-laboratory/` の下に置かれるため、ページ内のリンクや画像は
  `href="/logs/"` と直接書かず、`src/lib/url.ts` の `url('/logs/')` を通して書きます。

## コンテンツの追加

### 技法を追加する — `src/content/techniques/<技法名>.md`

```md
---
name: 下まつ毛
category: アイライン・まつ毛  # 眉毛 / アイライン・まつ毛 / チーク / レジンアイ
order: 1             # カテゴリ内の並び順
---
メモ（任意）
```

カテゴリを増やすときは `src/data/categories.ts` に追加します。

### 制作ログを追加する — `src/content/logs/<日付>.md`

> 今ある `2026-11-18.md` と `2026-12-01.md` は、表示確認用の**ダミーデータ**です（実際の制作記録ではありません）。
> 本物のログを書き始めたら削除してください。

```md
---
date: 2026-12-10
doll: DD桜
techniques:          # techniques/ のファイル名（拡張子なし）
  - 困り眉
  - 丸目
どやぁ:              # 成功。感想を1行ずつ
  - 困り眉がかわいく決まった
ぐぬぬ:              # 苦戦
  - 丸目の左右が揃わなかった
はて？:              # 疑問（3つとも空欄・省略可）
---
写真や細かいメモ（任意）
```

- 感想の数はトップページの「どやぁ／ぐぬぬ／はて？」の★（＝延べ数、分母なし）に反映されます。
- ログで使った技法は技術リストで自動的にチェック済みになり、試した回数が表示されます。
- 3つの言葉を変えるときは `src/data/reactions.ts` と `src/content.config.ts` を直します。

## ページ構成

| URL | 内容 |
| --- | --- |
| `/` | ヒーロー画像・コンセプト・どやぁ／ぐぬぬ／はて？の★・今日試す技法の提案・最近のログ |
| `/techniques/` | 技術リスト（カテゴリ別チェックリスト・技法ごとの試した回数） |
| `/techniques/<技法>/` | 技法の詳細と、それを試したログ |
| `/logs/` | 制作ログ一覧（新しい順に10件ずつ。2ページ目以降は `/logs/page/2/` など。件数は `src/lib/pagination.ts` で変更） |
| `/logs/<日付>/` | ログ詳細 |
