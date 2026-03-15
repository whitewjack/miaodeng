# 秒登 MiaoDeng

[English README](./README.en.md) · 中文

![License](https://img.shields.io/github/license/whitewjack/miaodeng)
![Release](https://img.shields.io/github/v/release/whitewjack/miaodeng)
![CI](https://img.shields.io/github/actions/workflow/status/whitewjack/miaodeng/ci.yml?branch=main)

一个面向团队内部系统的 **自托管自动登录门户 + Chrome 插件**。

它提供统一入口、账号凭据托管、规则化登录页适配、浏览器自动填充与一键跳转，适合测试 / UAT / 运维 / 内部平台等多系统高频登录场景。

> 部署说明：本项目当前为**前后端一体部署**。`server.py` 会同时提供门户前端页面（`/sso-portal.html`）和后端 API（`/api/*`），所以无论是 Docker 还是本地 Python 启动，默认都会把前端和后端一起启动。

## 项目组成

- **门户端**：系统卡片、凭据管理、规则中心、更新中心、审计与备份能力
- **Chrome 插件**：识别当前登录页、拉取凭据、自动填充并提交
- **规则中心**：把不同系统的登录页差异沉淀为可复用规则

## 主要特性

- ✨ 自动识别登录页面
- 🔐 支持账号密码、OTP、TOTP、Token 等登录方式
- 🧠 登录规则中心：支持内置规则 + 自定义规则 + 浏览器页面采样
- ⚡ 点击系统卡片自动登录
- 👥 多用户隔离
- 🧾 管理员审计日志
- 💾 自动备份 + 一键恢复
- 🧩 统一更新中心
- 🐳 Docker 部署

## 快速开始

### 方式一：Docker（推荐）

```bash
cp .env.docker.example .env
docker compose up -d --build
docker compose ps
docker compose logs -f sso-portal
```

默认访问：

- 门户：`http://localhost:6680`
- 数据目录：`./data`
- 当前内置镜像元数据版本：`3.63`

如需启用内置 HTTPS 网关：

```bash
docker compose --profile secure up -d
```

启用后可访问：

- HTTP 网关：`http://localhost:8080`
- HTTPS 网关：`https://localhost:8443`

> 注意：默认是自签证书，浏览器首次访问出现安全提示属于预期行为。

### 方式二：本地 Python

```bash
python3 server.py
```

启动后同样会同时提供：

- 前端页面：`http://localhost:6680/sso-portal.html`
- 默认入口：`http://localhost:6680`
- 后端接口：`http://localhost:6680/api/*`

### 方式三：接入你自己的 Nginx / 反向代理

如果你已经有自己的 Nginx，不需要再单独部署一个前端站点，**直接把同一个上游 `6680` 端口反向代理出去即可**，因为前端页面和 API 都由 `server.py` 提供。

最小示例：

```nginx
server {
    listen 80;
    server_name your-domain.example.com;

    location / {
        proxy_pass http://127.0.0.1:6680;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如果你使用 HTTPS，也只需要在这个反向代理层处理证书即可。

## 插件安装

当前推荐方式为 **ZIP 安装**：

1. 打开秒登门户
2. 点击右下角 **「🔌 安装秒登插件」**
3. 下载 ZIP 并解压
4. 在 Chrome 打开 `chrome://extensions/`
5. 开启 **开发者模式**
6. 点击 **加载已解压的扩展程序**
7. 选择解压后的 `chrome-extension` 目录
8. 打开插件，填写秒登服务地址并保存
9. 设置“切换用户”为你的用户名

详细安装说明见：[`README-INSTALL.txt`](./README-INSTALL.txt)

## 环境变量

| 变量 | 说明 | 默认行为 |
| --- | --- | --- |
| `ADMIN_PASSWORD` | 管理员密码 | 未设置时首次启动自动生成 |
| `DEFAULT_USER_PASSWORD` | 默认用户初始密码 | 未设置时首次启动自动生成 |
| `ENCRYPT_KEY` | 凭据加密密钥 | 未设置时写入 `data/.encrypt-key` |
| `SESSION_TTL_HOURS` | 普通会话有效期 | `8` |
| `REMEMBER_SESSION_TTL_DAYS` | 记住登录有效期 | `30` |
| `BACKUP_INTERVAL_HOURS` | 自动备份间隔 | `24` |
| `BACKUP_RETENTION_COUNT` | 备份保留数量 | `10` |
| `TLS_DOMAINS` | secure 网关证书域名 | `localhost 127.0.0.1 your-host.local` |
| `TLS_CERT_DAYS` | 证书有效期 | `825` |

## 开发与测试

### 基础验证命令

```bash
python3 - <<'PY'
from pathlib import Path
html = Path('sso-portal.html').read_text()
start = html.rfind('<script>')
end = html.rfind('</script>')
Path('/tmp/sso_portal_inline.js').write_text(html[start+len('<script>'):end])
print('/tmp/sso_portal_inline.js')
PY

node --check /tmp/sso_portal_inline.js
node --check chrome-extension/content.js
node --check chrome-extension/popup.js
node --check chrome-extension/background.js
python3 -m unittest tests.test_server_api tests.test_frontend_regressions -q
node --test tests/test_autosubmit_utils.mjs
docker compose config
```

## 目录结构

```text
.
├── chrome-extension/        # Chrome 插件源码
├── data/                    # 运行时数据（不提交）
├── deploy/                  # 部署相关配置
├── docs/                    # 项目文档与素材说明
├── tests/                   # 自动化测试
├── server.py                # Python 服务端
├── sso-portal.html          # 门户前端主页面
├── docker-compose.yml       # Docker 编排
└── .env.docker.example      # 环境变量示例
```

## 数据与隐私说明

本仓库 **不会提交任何真实业务数据**。

以下内容默认应只保留在本地或服务器上，不能进入 Git：

- `data/` 下所有真实文件
- `.env`
- SQLite 数据库 / 备份
- 自动生成的管理员密码哈希
- 加密密钥
- TLS 私钥 / 证书私钥

仓库已经通过 `.gitignore` 和 `data/.gitignore` 对这些内容做默认隔离。

## 常见问题

### Chrome 提示“禁用开发者模式扩展”

这是 Chrome 的正常安全提示，点击“保留”即可。

### 插件无法自动填充

请优先检查：

1. 插件里的服务地址是否正确
2. 当前用户名是否正确
3. 系统是否已在门户中配置
4. 登录页是否命中了对应规则

### 如何给同事使用

1. 部署好秒登门户
2. 让同事访问门户地址
3. 通过 ZIP 安装插件
4. 在插件里填入你的服务地址

## 开源协作

- 问题反馈：欢迎提 Issue
- 功能改动：欢迎提 PR
- 安全问题：请先查看 [`SECURITY.md`](./SECURITY.md)
- 参与方式：见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- API 文档：见 [`API.md`](./API.md)
- 部署文档：见 [`DEPLOYMENT.md`](./DEPLOYMENT.md)
- 系统架构：见 [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- 路线图：见 [`ROADMAP.md`](./ROADMAP.md)

## 仓库说明

为了让 GitHub 仓库更轻量、聚焦核心工程，本仓库已移除公众号排版稿、演示截图原图和品牌营销素材，只保留运行所需代码、测试与核心文档。

## License

MIT
