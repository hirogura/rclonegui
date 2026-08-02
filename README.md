# rsyncGUI

rclone を利用したクラウド同期 Web GUI です。
Google ドライブ / OneDrive の同期・スケジュール実行・ジョブ履歴をブラウザから操作できます。

- リポジトリ: https://github.com/hirogura/rclonegui
- 動作環境: Ubuntu / Debian (Linux), systemd

## インストール

### 方法1: ダウンロードして実行

```bash
curl -fsSL https://raw.githubusercontent.com/hirogura/rclonegui/main/install-rclonegui.sh -o install-rclonegui.sh
sudo bash install-rclonegui.sh
```

### 方法2: リポジトリをクローンして実行

```bash
git clone https://github.com/hirogura/rclonegui.git
cd rclonegui
sudo bash install-rclonegui.sh
```

インストールスクリプトは以下を自動で行います。

1. タイムゾーン設定（Asia/Tokyo）
2. 前提パッケージ（git）のインストール
3. Node.js のインストール（未導入時のみ）
4. rclone のインストール（未導入時のみ）
5. GitHub から最新版を `/opt/rclonegui` に取得
6. npm 依存パッケージのインストール
7. systemd サービス（`rsyncgui`）の作成・起動

### ポート番号の変更

デフォルトは `3348` です。変更する場合はインストール時に指定します。

```bash
RSYNCGUI_PORT=3349 sudo bash install-rclonegui.sh
```

### アップデート

```bash
cd /opt/rclonegui
git pull
sudo systemctl restart rsyncgui
```

または、インストールスクリプトをもう一度実行するだけでも更新されます
（`config/` と `sync-jobs/` は自動的にバックアップ・復元されます）。

## 使い方

- Web UI: `http://<サーバーIP>:3348`
- サービス操作: `systemctl [start|stop|restart|status] rsyncgui`
- 設定ファイル: `/opt/rclonegui/config/rclone.conf`
- ログ確認: `journalctl -u rsyncgui -f`

## アンインストール

```bash
# 1. サービス停止・削除
sudo systemctl stop rsyncgui
sudo systemctl disable rsyncgui
sudo rm -f /etc/systemd/system/rsyncgui.service
sudo systemctl daemon-reload

# 2. スケジュール（cron）から同期設定を削除
crontab -l 2>/dev/null | grep -v 'cron-sync.sh' | crontab -

# 3. インストール先を削除（※ rclone の設定や同期履歴も削除されます）
sudo rm -rf /opt/rclonegui

# 4.（任意）Node.js と rclone も削除
sudo apt-get remove -y nodejs rclone
sudo apt-get autoremove -y
```

## 注意事項

- `config/`（rclone の認証トークン等）と `sync-jobs/`（同期履歴）は個人情報のため
  GitHub には公開されず、`.gitignore` で除外されています。
- バックアップは `/opt/rclonegui/config/rclone.conf` を保存しておけば
  アカウント認証をやり直さずに復元できます。
