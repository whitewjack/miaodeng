# 隐私政策 Privacy Policy

**最后更新日期 / Last Updated:** 2026-02-17

---

## 中文版

### 概述
秒登（MiaoDeng）是一款自动登录助手扩展程序。我们重视您的隐私，并致力于保护您的个人信息。

### 数据收集
本扩展程序**不收集任何用户数据**，具体包括：
- ❌ 不收集个人身份信息
- ❌ 不收集浏览历史
- ❌ 不收集网站内容
- ❌ 不使用 Cookies 或追踪技术
- ❌ 不与任何第三方共享数据

### 数据存储
所有数据均存储在用户本地设备：
- ✅ 登录凭据存储在浏览器本地存储（chrome.storage.local）
- ✅ 用户名和密码仅用于自动填充功能
- ✅ 数据不会上传到任何服务器
- ✅ 用户可随时通过浏览器设置清除数据

### 权限说明
本扩展请求以下权限及其用途：

1. **storage**：用于在本地存储用户配置和服务器地址
2. **activeTab**：用于检测当前标签页是否为登录页面
3. **host_permissions**：
   - `http://localhost:6680/*`：访问本地秒登服务器获取凭据
   - `*://*.dragonpass.com.cn/*`：自动填充登录表单
   - `*://*.dp-svc.com/*`：自动填充登录表单
   - `https://192.168.*.*/*`：自动填充内网登录表单

### 第三方服务
本扩展不使用任何第三方服务、分析工具或广告网络。

### 数据安全
- 所有凭据数据在本地浏览器中加密存储
- 建议用户使用强密码保护操作系统账户
- 定期更新密码以确保安全

### 儿童隐私
本扩展不针对 13 岁以下儿童，也不会故意收集儿童的个人信息。

### 政策变更
如本隐私政策发生变更，我们将在此页面更新"最后更新日期"。

### 联系我们
如有任何隐私相关问题，请联系：
- GitHub Issues: [项目地址]
- Email: [您的邮箱]

---

## English Version

### Overview
MiaoDeng is an auto-login assistant extension. We value your privacy and are committed to protecting your personal information.

### Data Collection
This extension **does not collect any user data**, including:
- ❌ No personal identification information
- ❌ No browsing history
- ❌ No website content
- ❌ No cookies or tracking technologies
- ❌ No data sharing with third parties

### Data Storage
All data is stored locally on the user's device:
- ✅ Login credentials are stored in browser local storage (chrome.storage.local)
- ✅ Usernames and passwords are used solely for auto-fill functionality
- ✅ Data is never uploaded to any server
- ✅ Users can clear data anytime through browser settings

### Permissions Explanation
This extension requests the following permissions and their purposes:

1. **storage**: Store user configuration and server address locally
2. **activeTab**: Detect if the current tab is a login page
3. **host_permissions**:
   - `http://localhost:6680/*`: Access local MiaoDeng server to fetch credentials
   - `*://*.dragonpass.com.cn/*`: Auto-fill login forms
   - `*://*.dp-svc.com/*`: Auto-fill login forms
   - `https://192.168.*.*/*`: Auto-fill intranet login forms

### Third-Party Services
This extension does not use any third-party services, analytics tools, or advertising networks.

### Data Security
- All credential data is encrypted in local browser storage
- Users are advised to use strong passwords to protect their OS accounts
- Regularly update passwords for security

### Children's Privacy
This extension is not intended for children under 13 and does not knowingly collect personal information from children.

### Policy Changes
If this privacy policy changes, we will update the "Last Updated" date on this page.

### Contact Us
For any privacy-related questions, please contact:
- GitHub Issues: [Project URL]
- Email: [Your Email]

---

## 开源许可 / Open Source License

MIT License

Copyright (c) 2026 MiaoDeng

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
