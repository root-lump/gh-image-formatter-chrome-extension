# GitHub Image Formatter

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/) [![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

GitHubのIssue・PRで貼り付けた画像を自動的にセンター揃え＆リサイズするChrome拡張機能です。

## 変換例

```html
<!-- Before -->
<img width="1013" height="826" alt="image" src="https://github.com/user-attachments/assets/xxx" />

<!-- After -->
<p align="center">
<img src="https://github.com/user-attachments/assets/xxx" width="100%" />
</p>
```

## 機能

- **自動検出** — 画像ペースト時に自動でフォーマット
- **手動ボタン** — エディタツールバーにフォーマットボタンを追加
- **幅の設定** — `%` / `px` 単位で画像幅をカスタマイズ

## インストール

1. このリポジトリをクローン
   ```bash
   git clone https://github.com/your-username/gh-image-formatter-chrome-extension.git
   ```
2. Chrome で `chrome://extensions` を開く
3. 「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」でクローンしたディレクトリを選択

## 設定

拡張機能のアイコンをクリックするとポップアップが開きます。

| 設定 | 説明 | デフォルト |
|------|------|-----------|
| フォーマットボタンを表示 | ツールバーにボタンを追加 | ON |
| 自動検出 | ペースト時に自動フォーマット | ON |
| 画像の幅 | 変換後の画像幅 | 100% |

## ディレクトリ構成

```
gh-image-formatter-chrome-extension/
├── icons/                  # 拡張機能アイコン
├── src/
│   ├── content/            # Content Script (GitHub上で動作)
│   │   ├── index.js
│   │   └── style.css
│   └── popup/              # ポップアップ設定画面
│       ├── index.html
│       ├── index.js
│       └── style.css
└── manifest.json
```

## Acknowledgements

This project uses SVG icons from [GitHub Primer Octicons](https://github.com/primer/octicons), licensed under the MIT License.
