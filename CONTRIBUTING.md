# Contributing

感谢你关注 **秒登 MiaoDeng**。

## 提交前请先确认

1. 不要提交任何真实业务数据、数据库文件、备份文件、证书、密钥、密码或 `.env`
2. 不要提交 `data/` 目录中的真实内容
3. 提交前至少运行一轮基础验证

## 本地开发

### 启动方式一：本地 Python

```bash
python3 server.py
```

### 启动方式二：Docker

```bash
cp .env.docker.example .env
docker compose up -d --build
```

## 建议的提交范围

- 一个 PR 只做一类事情：功能、修复、文档、重构分开提
- UI 改动请附截图或录屏
- 如果改了规则中心 / 插件逻辑，请补充验证步骤

## 提交前验证

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

## Pull Request 建议格式

- 背景 / 为什么做
- 改了什么
- 如何验证
- 风险与回滚方式

## 安全问题

如果你发现漏洞、数据泄露风险、认证绕过、凭据存储问题，请不要公开提 issue，改为走 `SECURITY.md` 的流程。

