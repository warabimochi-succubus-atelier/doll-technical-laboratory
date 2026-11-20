# どーる技術研究室 (doll-technical-laboratory)

未経験の技法を試し、その結果を記録するための研究室サイト。Astro 製。
コンセプトの元メモは [docs/concept.md](docs/concept.md)、運用方針の原文は [docs/policy.md](docs/policy.md)。
サイト上では「この研究室について」（`src/pages/about.astro`）にこの2つをまとめて掲載しています。
iPhone から制作ログを投稿するアプリの仕様は [docs/posting-app-spec.md](docs/posting-app-spec.md)。

> **このリポジトリについて**
> わらびもちサキュバス工房が自分の制作記録のために作っている、個人専用のサイトです。
> ほかの人が自分のサイトとして使うことを想定したテンプレートや、一般向けのアプリではありません。
> 投稿アプリも、このサイトとこのリポジトリだけで使う前提で作っています。
> そのため、汎用的な使い方のサポートや機能の要望には対応していません。
> 公開サイト：https://warabimochi-succubus-atelier.github.io/doll-technical-laboratory/

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

## 投稿アプリ（/post/）

iPhone から写真付きの制作ログを投稿するための、自分専用の Web アプリです。
https://warabimochi-succubus-atelier.github.io/doll-technical-laboratory/post/
（ナビゲーションには出しておらず、検索エンジンにも載せない設定です）

1. GitHub で [Fine-grained Personal Access Token](https://github.com/settings/personal-access-tokens/new) を作る
   - Repository access：このリポジトリだけ
   - Permissions：Contents を Read and write（ほかは付けない）
   - 有効期限：あり（切れたら作り直して入れ直す）
2. iPhone の Safari で上の URL を開き、右上の ⚙ にトークンを入力して「確認して保存」
3. 共有ボタン →「ホーム画面に追加」すると、アプリのように全画面で使える

投稿すると、写真（長辺1600px・JPEG・位置情報なし）とログが 1 コミットで `main` に追加され、数分でサイトに反映されます。
「過去の投稿」から、投稿済みのログを編集・削除できます（写真の追加・削除も可。削除しても Git の履歴には残ります）。
「技術リスト」から、技法の追加・名前の変更・カテゴリの変更・並べ替え・削除もできます。
名前を変えると、その技法を使っている制作ログもまとめて書き換えます。制作ログで使われている技法は削除できません。
手元でも作業する場合は、アプリで投稿・編集したあと `git pull` で取り込んでから作業してください。
トークンは端末のブラウザ内にだけ保存され、GitHub API 以外には送られません。
コードは `src/pages/post/` と `src/lib/post/`。

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

技法は投稿アプリの「技術リスト」からも追加・編集できます。カテゴリを増やすときは `src/data/categories.ts` に追加します（アプリからは増やせません）。

### 制作ログを追加する — `src/content/logs/<日付>.md`

> 今ある `2026-11-18.md`・`2026-11-19-2130.md`・`2026-12-01.md` は、表示確認用の**ダミーデータ**です（実際の制作記録ではありません）。
> 本物のログを書き始めたら、`public/images/logs/2026-11-19-2130-*.jpg`（ダミー写真）と一緒に削除してください。

```md
---
date: 2026-12-10
doll: DD桜
photos:              # public/images/logs/ に置いた写真のファイル名（省略可）
  - 2026-12-10-1.jpg
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

- 写真はログ詳細で同じ大きさの格子状に並び、タップで拡大できます。1枚目は一覧とトップのサムネイルになります。
- 同じ日に複数書くときは、ファイル名を `2026-12-10-2130.md` のように「日付-時刻」にします。
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
