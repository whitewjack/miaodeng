#!/bin/bash

# 秒登插件一键安装脚本（Mac 版）
# 使用方法：bash install-mac.sh [服务器地址]
# 参数可选，默认：http://localhost:6680

set -e

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    echo "用法: bash install-mac.sh [服务器地址]"
    echo "示例: bash install-mac.sh http://192.168.1.100:6680"
    echo "默认: http://localhost:6680"
    exit 0
fi

echo "================================"
echo "⚡ 秒登插件一键安装脚本"
echo "================================"
echo ""
echo "💡 用法: bash install-mac.sh [服务器地址]（默认: http://localhost:6680）"
echo ""

# 获取服务器地址
SERVER_URL="${1:-${MIAODENG_SERVER_URL:-http://localhost:6680}}"
echo "📍 服务器地址: $SERVER_URL"
echo ""

# 检测系统
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ 此脚本仅支持 macOS"
    echo "Windows 用户请使用 install-windows.bat"
    exit 1
fi

# 创建临时目录
TEMP_DIR=$(mktemp -d)
ZIP_FILE="$TEMP_DIR/miaodeng.zip"
EXTENSION_DIR="$TEMP_DIR/chrome-extension"

echo "📥 正在下载插件..."
if ! curl -fsSL "$SERVER_URL/auto-login-extension.zip" -o "$ZIP_FILE"; then
    echo "❌ 下载失败！请检查服务器地址是否正确"
    echo "   确保服务器正在运行: python3 server.py"
    exit 1
fi

echo "📦 正在解压..."
unzip -q "$ZIP_FILE" -d "$TEMP_DIR"

if [ ! -d "$EXTENSION_DIR" ]; then
    # 如果 ZIP 里没有 chrome-extension 文件夹，尝试查找
    EXTENSION_DIR=$(find "$TEMP_DIR" -type d -name "chrome-extension" | head -1)
    if [ -z "$EXTENSION_DIR" ]; then
        # 如果还是找不到，可能 ZIP 直接包含文件
        EXTENSION_DIR="$TEMP_DIR"
    fi
fi

echo "✅ 准备完成！"
echo ""

# 检查 Chrome 是否在运行
if pgrep -x "Google Chrome" > /dev/null; then
    echo "⚠️  检测到 Chrome 正在运行"
    echo "   建议关闭 Chrome 后重新打开，以便正确加载扩展"
fi

echo "📋 最后一步："
echo ""
echo "1️⃣  Chrome 将自动打开扩展页面"
echo "2️⃣  开启右上角的「开发者模式」开关"
echo "3️⃣  点击「加载已解压的扩展程序」"
echo "4️⃣  选择这个文件夹："
echo "   $EXTENSION_DIR"
echo ""

read -p "按 Enter 继续..." -r

# 打开 Chrome 扩展页面
open -a "Google Chrome" "chrome://extensions/"

echo ""
echo "✅ Chrome 扩展页面已打开！"
echo ""
echo "💡 提示："
echo "   - 文件夹位置已复制到剪贴板（即将复制）"
echo "   - 在文件选择器中按 Cmd+Shift+G 可直接粘贴路径"
echo "   - 安装完成后可以删除临时文件夹："
echo "     rm -rf $TEMP_DIR"
echo ""

# 复制路径到剪贴板
echo -n "$EXTENSION_DIR" | pbcopy

echo "🎉 安装准备完成！文件夹路径已复制到剪贴板"
