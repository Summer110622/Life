# EMBER — トワと歩く、深層性格診断ゲーム

荒廃した夕暮れの町で18の場面を選ぶ、ピクセルアートの自己対話ゲーム。
**Liquid AI LFM2-350MをブラウザのWebGPUで推論**し、実際の選択と自由記述から個別の手紙を生成します。
加点計算を「LFM」と称する実装ではありません。

## 最短でGitHub Pagesに置く

1. このZIPを展開し、中身の `index.html`、JS/MJS、CSS、`assets/`、`.nojekyll` などを **Summer110622/Life の公開用ブランチのルート**に置きます。ZIPファイルそのものを置くのではありません。
2. リポジトリの **Settings → Pages → Deploy from a branch → 対象ブランチ / (root)** を選択します。
3. GitHubが表示するHTTPS公開URLを開きます。すべて相対パスなので、プロジェクトサイトのサブディレクトリでも使えます。
4. 「旅をはじめる」でモデル取得を開始します。初回は数百MB規模の通信とGPUメモリが必要です。モデルを待たずに旅の選択は進められます。WebGPUが使えない場合は画面上部の「CPUで実行」を選べます。
5. 18場面を終えると、準備済みのLFMが手紙を生成します。未読込なら結果画面から読み込めます。

この環境ではリポジトリに認証できず、push・Pages有効化は実施していません。既存ファイルを統合する際は、リポジトリ側の変更を保持してください。

## 実装

- 推論モデル: [onnx-community/LFM2-350M-ONNX](https://huggingface.co/onnx-community/LFM2-350M-ONNX)
- 元モデル: [LiquidAI/LFM2-350M](https://huggingface.co/LiquidAI/LFM2-350M)
- ランタイム: Transformers.js **4.3.0**、ONNX Runtime Web。WebGPUでは `q4`、手動で選ぶCPUモードでは `fp32` を使用します。
- モデル取得: Hugging Faceから公開ONNX重みを取得。重みは同梱せず、モデルを検証済みコミットに固定しています。
- CPUモードの重みは約1.5GBで、読み込み時にはさらにメモリが必要です。WebGPU非対応PCでの動作は端末のメモリとブラウザの制限に左右されます。
- 推論は専用Worker内。トークン単位の逐次表示、進捗、タイムアウト、再試行、キャンセルあり。
- CDN importはモデル起動時のみ。APIキー・サーバー・有料推論APIは不要。
- GitHub PagesのCOOP/COEP制約に備えて補助WASM処理は1スレッド設定。
- WebGPU非対応や通信失敗時はその旨を表示し、LFM生成済みとは表示しません。AIなしの物語とゲーム独自の傾向集計は区別しています。
- 推論失敗時の別モデルやCPUへの暗黙フォールバックはありません。
- 独自の7軸は単純なゲーム用指標です。LFMとは別であり、検証済み心理検査・信頼度・医学診断ではありません。
- 「守ろうとしたもの」「二つの願い」「もう一つの読み方」「明日への問い」を、選択の具体的根拠に沿って生成するプロンプトです。小型モデルの誤解釈や不自然な日本語は起こり得ます。

## キャラクター

| 役柄 | 新しい名前 |
| --- | --- |
| ボロボロのロボット主人公、よろよろ6コマ歩行 | トワ |
| 若いのに老人の姿勢をした人物 | ナギ |
| 白いフードの人物 | シロ |
| コンピューター頭の、おとぼけな人物 | ビット |
| 黒髪・白い服の優しい女の子 | スイ |

背景5場面・キャラクター10スプライト・アップロードされた **Lonely Chiptune Reverie** を同梱。BGMはボタンで再生、初期状態は無音です。過去の連結画像は使わず、場面ごとに元の背景へ切り替えます。公開前にBGM等の利用権をご確認ください。

## 操作とデータ

- 選択肢をクリック、または1〜4キー。任意の理由は選択前に記入。
- 「戻る」で選び直し可能。加点の二重計上はありません。
- 回答と生成済みの手紙はlocalStorageに保存。「つづきから」で復元。
- 結果画面でテキスト保存、端末内の回答削除が可能。
- 回答はサーバーへ送信しません。ライブラリ・モデル・フォントの取得には外部通信があります。
- この作品は娯楽と自己対話のためのものです。性格を断定したり、医療・心理専門家による診断の代わりになるものではありません。

## ローカル実行

```sh
python3 -m http.server 4173
# ブラウザで http://localhost:4173 を開く
```

`file://` での直接起動はES Modules/Worker制限のため不可。HTTPSかlocalhostのセキュアコンテキストが必要です。

```sh
npm test
```

ビルド・npm installは不要。テストにはNode.js、配信には任意のHTTPサーバーを使います。

## 検証状況

- JavaScript/Workerの構文検査: 通過。
- 11件のユニットテスト: 通過。
- ChromeでWebGPUモデルの読み込みと短い日本語の生成を確認。
- GPUアダプターがないChromeでも、旅の画面にすぐ進めることを確認。
- CPUモードは重みが大きいため、端末ごとのメモリ・通信速度に左右されます。

モデルカード掲載のq4/WebGPU APIに合わせていますが、GPU/ブラウザごとのメモリやONNX実行互換性は公開先端末で確認が必要です。

## ファイル

`index.html` / `styles.css` / `enhancements.css`: 画面と見た目  
`story.mjs`: 物語・選択肢・人物名  
`game-core.mjs`: 純粋関数の集計・保存検証・LFMプロンプト  
`app.js`: UI・音楽・歩行・進行・Worker連携  
`lfm-worker.mjs`: 実際のLFMモデルのロードとWebGPU生成  
`assets/`: ゲーム素材  
`tests/core.test.mjs`: ユニットテスト

参照: [LFM2モデルの実行例](https://huggingface.co/onnx-community/LFM2-350M-ONNX)、[Transformers.js WebGPU](https://huggingface.co/docs/transformers.js/guides/webgpu)、[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)。
モデルの利用にはモデルカードが示すLFM Open License v1.0が適用されます。外部ライブラリ・BGMはそれぞれの権利条件に従います。
