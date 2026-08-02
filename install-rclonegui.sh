#!/bin/bash
# =====================================================
#  rcloneGUI インストーラー
#  ソース: https://github.com/hirogura/rclonegui
# =====================================================
set -e

INSTALL_DIR="/opt/rclonegui"
REPO_URL="https://github.com/hirogura/rclonegui.git"
SERVICE_NAME="rclonegui"
unset PORT
APP_PORT="${RCLONEGUI_PORT:-3348}"

echo "========================================="
echo "  rcloneGUI Installer"
echo "========================================="
echo ""

if [ "$(id -u)" -ne 0 ]; then
  echo "エラー: root で実行してください"
  echo " sudo bash $0"
  exit 1
fi

echo "[1/6] タイムゾーン設定 (JST)..."
if command -v timedatectl &>/dev/null; then
  timedatectl set-timezone Asia/Tokyo 2>/dev/null || true
elif [ -f /usr/share/zoneinfo/Asia/Tokyo ]; then
  ln -sf /usr/share/zoneinfo/Asia/Tokyo /etc/localtime
  echo "Asia/Tokyo" > /etc/timezone
fi
echo "  $(date)"
echo ""

if [ -f /etc/os-release ]; then . /etc/os-release; OS=$ID; else OS=$(uname -s | tr '[:upper:]' '[:lower:]'); fi
echo "OS: $OS"
echo ""

echo "[Tailscale] IP / MagicDNS 検出..."
TS_IP=""
TS_HOSTNAME=""
if command -v tailscale &>/dev/null; then
  TS_JSON=$(tailscale status --json 2>/dev/null || true)
  if [ -n "$TS_JSON" ]; then
    TS_IP=$(echo "$TS_JSON" | python3 -c "import json,sys
try:
    d=json.load(sys.stdin)
    print(d.get('Self',{}).get('TailscaleIPs',[''])[0])
except Exception:
    print('')" 2>/dev/null)
    TS_HOSTNAME=$(echo "$TS_JSON" | python3 -c "import json,sys
try:
    d=json.load(sys.stdin)
    print(d.get('Self',{}).get('DNSName','').rstrip('.'))
except Exception:
    print('')" 2>/dev/null)
  fi
fi
if [ -n "$TS_IP" ]; then
  echo "  Tailscale IP: $TS_IP"
else
  echo "  Tailscale 未検出（ローカルURLのみ表示します）"
fi
echo ""

echo "[2/6] 前提パッケージ (git) チェック..."
if ! command -v git &>/dev/null; then
  case "$OS" in
    centos|rhel|rocky|alma|fedora) yum install -y git ;;
    *) apt-get update && apt-get install -y git ;;
  esac
fi
echo "  git $(git --version)"
echo ""

echo "[3/6] Node.js インストール..."
if command -v node &>/dev/null && [ "$(node -v | sed 's/v//' | cut -d. -f1)" -ge 18 ]; then
  echo "  Node.js $(node -v) は既にインストール済み"
else
  case "$OS" in
    ubuntu|debian) curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs ;;
    centos|rhel|rocky|alma|fedora) curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - && yum install -y nodejs ;;
    *) curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs 2>/dev/null || yum install -y nodejs ;;
  esac
fi
echo "  Node.js $(node -v)"
echo ""

echo "[4/6] rclone インストール..."
if ! command -v rclone &>/dev/null; then
  curl -fsSL https://rclone.org/install.sh | bash
fi
echo "  rclone $(rclone version | head -1)"
echo ""

echo "[5/6] GitHub からプロジェクト取得..."
mkdir -p "$INSTALL_DIR"

# デフォルトブランチを自動検出（無ければ main を試す）
detect_branch() {
  local ref
  ref=$(git ls-remote --symref "$REPO_URL" HEAD 2>/dev/null | awk '/^ref:/{print $2}' | sed 's#refs/heads/##')
  if [ -n "$ref" ]; then echo "$ref"; else echo "main"; fi
}
BRANCH=$(detect_branch)

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "  既存リポジトリを更新します (branch: $BRANCH)..."
  git -C "$INSTALL_DIR" fetch origin "$BRANCH" 2>&1 | tail -2 || true
  git -C "$INSTALL_DIR" checkout "$BRANCH" 2>/dev/null || git -C "$INSTALL_DIR" checkout -B "$BRANCH" origin/"$BRANCH"
  git -C "$INSTALL_DIR" reset --hard origin/"$BRANCH"
else
  BK=""
  if [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
    # 旧インストール（config/sync-jobs）があれば退避
    if [ -d "$INSTALL_DIR/config" ] || [ -d "$INSTALL_DIR/sync-jobs" ]; then
      BK="/tmp/rclonegui-backup-$(date +%Y%m%d%H%M%S)"
      mkdir -p "$BK"
      echo "  既存データをバックアップ: $BK"
      [ -d "$INSTALL_DIR/config" ] && mv "$INSTALL_DIR/config" "$BK/"
      [ -d "$INSTALL_DIR/sync-jobs" ] && mv "$INSTALL_DIR/sync-jobs" "$BK/"
    fi
    rm -rf "$INSTALL_DIR"/*
    echo "  旧ファイルを削除しました"
  fi
  echo "  git clone (branch: $BRANCH)..."
  git clone -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  if [ -n "$BK" ]; then
    [ -d "$BK/config" ] && cp -a "$BK/config" "$INSTALL_DIR/" && echo "  config/ を復元しました"
    [ -d "$BK/sync-jobs" ] && cp -a "$BK/sync-jobs" "$INSTALL_DIR/" && echo "  sync-jobs/ を復元しました"
  fi
fi
mkdir -p "$INSTALL_DIR"/{public/css,public/js,config,sync-jobs}
echo "  取得完了"
echo ""

echo "[6/6] npm 依存関係インストール..."
cd "$INSTALL_DIR"
npm install --production 2>&1 | tail -3
echo ""

# 旧サービス easyrclone の移行
if systemctl list-unit-files 2>/dev/null | grep -q '^easyrclone.service'; then
  echo "旧サービス (easyrclone) を停止して削除します..."
  systemctl stop easyrclone || true
  systemctl disable easyrclone || true
  rm -f /etc/systemd/system/easyrclone.service
  systemctl daemon-reload || true
fi

if ss -tlnp 2>/dev/null | grep -q ":${APP_PORT} " && ! pgrep -f "node server.js" >/dev/null 2>&1; then
  echo "エラー: ポート${APP_PORT}は既に使用されています"
  echo "  別のポートを指定してください:  RCLONEGUI_PORT=3349 bash $0"
  exit 1
fi

echo "systemd サービス作成..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << SVCEOF
[Unit]
Description=rcloneGUI Web GUI
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) server.js
Restart=always
RestartSec=3
Environment=PORT=$APP_PORT
Environment=TZ=Asia/Tokyo

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl restart ${SERVICE_NAME}
echo "  サービス起動完了"
echo ""

echo "========================================="
echo "  インストール完了！"
echo "========================================="
echo ""
if [ -n "$TS_IP" ]; then
  echo "  Web UI : http://${TS_IP}:${APP_PORT}"
fi
if [ -n "$TS_HOSTNAME" ]; then
  echo "  Web UI : http://${TS_HOSTNAME%%.*}:${APP_PORT}  (MagicDNS)"
fi
echo "  Web UI (local) : http://localhost:$APP_PORT"
echo ""
echo "  サービス:  systemctl [start|stop|restart|status] ${SERVICE_NAME}"
echo "  設定ファイル: $INSTALL_DIR/config/rclone.conf"
echo "  ログ:      journalctl -u ${SERVICE_NAME} -f"
echo "  アンインストール: README.md 参照"
echo "  タイムゾーン: $(date)"
echo ""
