# Security Policy

## Supported Scope

目前安全维护重点包括：

- 后端认证与会话
- 数据库存储与备份
- 凭据加密
- Chrome 插件与自动登录链路
- Docker 部署配置

## Sensitive Data Rules

请不要在 issue / PR / 截图 / 日志中公开以下内容：

- `data/` 目录任何真实文件
- `.env`
- 管理员密码
- 用户账号、密码、OTP、Token、TOTP Secret
- TLS 私钥 / 证书私钥
- 生产或公司内网地址（如无必要）

## Reporting a Vulnerability

如果你发现安全问题，请使用私下方式联系维护者，不要直接公开披露可利用细节。

建议至少包含：

1. 问题描述
2. 影响范围
3. 复现步骤
4. 可能的修复方向

## Open Source Release Notes

本仓库默认不包含任何真实数据库、备份、密钥和运行时证书。
如果你 fork 或重新发布本项目，请确认以下目录/文件未被提交：

- `data/`
- `.env`
- `*.db`
- `*.sqlite*`
- `*.key`
- 真实备份文件

