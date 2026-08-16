# Math Map

数学の演習・読書進捗を、教材・章・学習単位ごとに記録して可視化する個人用Webアプリです。

Codexでエンター押していたらできました。ありがとう。

## 主な機能

- 1つの教材・章に「読む」と「演習」を同時設定し、それぞれの単位数を登録・編集
- 読書（節・ページ・項目）と演習（問・項目）の進捗・周回を独立して記録
- 演習単位ごとの解決状況
- 日別ヒートマップ、週間・月間目標、連続学習日数
- 周回ごとに独立した学習記録
- 章・教材の完了、学習再開、完了単位数、連続学習に応じて加算されるポイント
- 演習・読書・学習日数・連続学習・章・周回・累計ポイントの種類別マイルストーン
- 日次目標、週間達成目標、完了単位数に応じた時限達成報酬
- 複数の試験を管理する試験モード
- 教材の並べ替え、アーカイブ、復元
- JSONバックアップの書き出し・読み込み
- メール認証によるPC・スマートフォン間の自動同期（任意）
- ダークモード

データは常にブラウザのローカルストレージに保存されます。Supabaseの接続情報がある場合だけ、同じメールアドレスでログインした端末間でも同期できます。

## 開発

```sh
npm install
npm run dev
```

確認用コマンド：

```sh
npm test
npm run build:pages
```

`main` ブランチへのpushでGitHub Pagesが自動更新されます。

## クラウド同期

SupabaseのSQL Editorで [`supabase/schema.sql`](supabase/schema.sql) を実行し、AuthenticationのSite URLを公開先（このリポジトリでは `https://azubiwa.github.io/math-map/`）に設定します。開発環境では `.env.example` を `.env.local` にコピーして、プロジェクトURLと公開用キーを入力してください。

GitHub Pagesでは、リポジトリのActions variablesに次の2件を設定します。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

この2件を削除して再ビルドすれば、Supabaseを使わない端末保存のみの状態へ戻せます。Supabaseの秘密鍵はブラウザやGitHub Pagesに設定しません。
