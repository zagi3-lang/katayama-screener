# 片山晃流 AIスクリーニングエージェント

IRバンク・四季報等から最新財務データを取得し、片山晃（五月さん）の投資哲学でテンバガー候補を発掘・分析するAIエージェントです。

---

## Vercelへのデプロイ手順（完全版）

### ① GitHubにアップロード

1. https://github.com にアクセスしてログイン（なければ無料登録）
2. 右上の「+」→「New repository」をクリック
3. Repository name: `katayama-screener`
4. 「Create repository」をクリック
5. 表示されるコマンドをターミナルで実行：

```bash
cd katayama-screener
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/あなたのユーザー名/katayama-screener.git
git push -u origin main
```

---

### ② Vercelにデプロイ

1. https://vercel.com にアクセス（GitHubアカウントでログイン）
2. 「Add New Project」をクリック
3. GitHubの `katayama-screener` を選択して「Import」
4. **「Environment Variables」に以下を追加：**
   - Name: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-...`（Anthropic ConsoleのAPIキー）
5. 「Deploy」をクリック
6. 1〜2分で `https://katayama-screener.vercel.app` のURLが発行される

---

### ③ Anthropic APIキーの取得

1. https://console.anthropic.com にアクセス
2. 「API Keys」→「Create Key」
3. 発行されたキーをVercelの環境変数に貼り付け

---

## セキュリティについて

- APIキーは `pages/api/claude.js`（サーバーサイド）でのみ使用
- フロントエンドにAPIキーは一切露出しない
- ユーザーは `/api/claude` エンドポイントを経由してのみAPIにアクセス可能

---

## ポストプライムでの有料公開

デプロイ後のURLをポストプライムの有料投稿内にリンクとして貼るだけでOKです。
必要に応じてパスワード認証を追加することも可能です。

---

## API利用料の目安

- 1回の分析：約3〜8円
- 1回の発掘：約5〜12円（Web検索含む）
