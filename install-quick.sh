#!/bin/bash

# 秒登插件快速安装（在线版本）
# 用法：
#   curl -fsSL http://[服务器IP]:6680/install-quick.sh | bash -s -- http://[服务器IP]:6680
#   或：MIAODENG_SERVER_URL=http://[服务器IP]:6680 ./install-quick.sh
#   Edge：BROWSER=edge bash install-quick.sh http://[服务器IP]:6680

set -e

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    echo "用法: bash install-quick.sh [服务器地址] [chrome|edge]"
    echo "默认: http://localhost:6680"
    echo "也可通过环境变量 MIAODENG_SERVER_URL / SERVER_URL / BROWSER 传入"
    exit 0
fi

echo "⚡ 秒登插件快速安装"
echo "===================="
echo ""

infer_server_url_from_source() {
    # 场景 1：脚本以 URL 形式执行（极少数 shell）
    if [[ "${BASH_SOURCE[0]}" =~ ^https?:// ]]; then
        echo "${BASH_SOURCE[0]%/install-quick.sh}"
        return 0
    fi

    # 场景 2：curl | bash，尝试从父进程命令中提取
    local pid="$PPID"
    local depth=0
    while [ -n "$pid" ] && [ "$pid" != "1" ] && [ "$depth" -lt 5 ]; do
        local cmd
        cmd="$(ps -o command= -p "$pid" 2>/dev/null || true)"
        local guessed
        guessed="$(printf '%s' "$cmd" | sed -nE 's#.*(https?://[^ ]+)/install-quick\.sh.*#\1#p' | head -1)"
        if [ -n "$guessed" ]; then
            echo "$guessed"
            return 0
        fi
        pid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
        depth=$((depth + 1))
    done
    return 1
}

SERVER_URL_INPUT="${1:-${MIAODENG_SERVER_URL:-${SERVER_URL:-}}}"
SERVER_URL_SOURCE="参数/环境变量"
if [ -z "$SERVER_URL_INPUT" ]; then
    if inferred="$(infer_server_url_from_source)"; then
        SERVER_URL_INPUT="$inferred"
        SERVER_URL_SOURCE="脚本来源自动推断"
    else
        SERVER_URL_INPUT="http://localhost:6680"
        SERVER_URL_SOURCE="默认值（localhost）"
    fi
fi
SERVER_URL="${SERVER_URL_INPUT%/}"
echo "📍 服务器: $SERVER_URL"
echo "🔎 地址来源: $SERVER_URL_SOURCE"

BROWSER_NAME="$(printf '%s' "${2:-${BROWSER:-chrome}}" | tr '[:upper:]' '[:lower:]')"
if [ "$BROWSER_NAME" = "edge" ] || [ "$BROWSER_NAME" = "msedge" ]; then
    BROWSER_LABEL="Microsoft Edge"
    BROWSER_APP="Microsoft Edge"
    EXTENSIONS_URL="edge://extensions/"
    ZIP_URL="$SERVER_URL/auto-login-extension-edge.zip"
    EXPECTED_DIR_NAME="edge-extension"
else
    BROWSER_LABEL="Google Chrome"
    BROWSER_APP="Google Chrome"
    EXTENSIONS_URL="chrome://extensions/"
    ZIP_URL="$SERVER_URL/auto-login-extension.zip"
    EXPECTED_DIR_NAME="chrome-extension"
fi
echo "🌐 浏览器: $BROWSER_LABEL"
echo ""

# 创建临时目录
TEMP_DIR=$(mktemp -d)
ZIP_FILE="$TEMP_DIR/miaodeng.zip"

echo "📥 正在下载插件..."
if ! curl -fsSL "$ZIP_URL" -o "$ZIP_FILE"; then
    echo "❌ 下载失败！请检查服务器是否运行"
    echo "   当前使用 URL: $SERVER_URL"
    echo "   确保服务器正在运行: python3 server.py"
    echo "   也可显式指定: bash install-quick.sh http://你的服务器:6680"
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "📦 正在解压..."
unzip -q "$ZIP_FILE" -d "$TEMP_DIR"

# 查找插件文件夹
EXTENSION_DIR="$TEMP_DIR/$EXPECTED_DIR_NAME"
if [ ! -d "$EXTENSION_DIR" ]; then
    EXTENSION_DIR=$(find "$TEMP_DIR" -type d -name "$EXPECTED_DIR_NAME" | head -1)
    if [ -z "$EXTENSION_DIR" ]; then
        EXTENSION_DIR="$TEMP_DIR"
    fi
fi

echo "✅ 准备完成！"
echo ""

echo "📋 安装步骤："
echo ""
echo "1️⃣  $BROWSER_LABEL 将自动打开扩展页面"
echo "2️⃣  开启右上角的「开发者模式」开关"
echo "3️⃣  点击「加载已解压的扩展程序」"
echo "4️⃣  选择这个文件夹："
echo "   $EXTENSION_DIR"
echo ""

# 打开浏览器扩展页面
open -a "$BROWSER_APP" "$EXTENSIONS_URL" || echo "⚠️ 请手动打开 $EXTENSIONS_URL"

# 复制路径到剪贴板
echo -n "$EXTENSION_DIR" | pbcopy

echo "✅ $BROWSER_LABEL 扩展页面已打开！"
echo "✅ 文件夹路径已复制到剪贴板"
echo ""
echo "💡 提示：在文件选择器中按 Cmd+Shift+G 可直接粘贴路径"
echo ""
