# 秒登 MiaoDeng 更新日志

## 2026-03-15 · v3.66

### 📚 模块28：开源文档中心与 GitHub About 跳转优化
- [新增] 新增 `docs/README.md` 文档中心，集中整理 README、部署、接口、架构、路线图、测试、安全与更新日志入口。
- [优化] GitHub About 的 Website 链接调整为文档中心，方便首次访问者快速找到核心说明。
- [优化] 门户首页的 Docs 链接同步切换到文档中心，不再只落到单一 README。
- [优化] Docker / 插件 / 安装文档版本同步提升到 `3.66`。

### 🧪 验证
- [通过] 已检查 README / README.en / docs 文档导航链接与门户首页 Docs 跳转配置，确保仓库与门户入口一致。

## 2026-03-15 · v3.65

### 🔄 模块27：首页 Release 版本改为优先使用本地最新版本
- [修复] 修复 GitHub API 触发限流时，首页 Release 仍可能回退显示旧版 `v3.55` 的问题。
- [优化] `/api/open-source-stats` 现在会优先使用本地更新日志中的最新版本作为兜底，避免第三方 badge 缓存导致版本展示滞后。
- [补强] 当仓库信息接口成功、但 latest release 接口失败时，首页也会继续展示当前最新版本，不再显示空值或旧值。
- [优化] Docker / 插件 / 安装文档版本同步提升到 `3.65`。

### 🧪 验证
- [通过] 新增接口回归测试，覆盖 GitHub API 限流与 latest release 单独失败两种场景，确保首页 Release 仍显示最新版本。

## 2026-03-15 · v3.64

### 📘 模块26：部署前置环境文档补齐
- [新增] README 中新增“部署前准备”说明，明确 Docker 与本地 Python 两种部署方式分别需要的环境。
- [新增] README / README.en / `DEPLOYMENT.md` 补充“如果电脑没装 Docker / Python 该如何安装”的说明，降低首次部署门槛。
- [优化] 明确本地 Python 运行当前无需额外 `pip install`，只要安装 Python 3.11+ 即可启动。
- [优化] Docker / 插件 / 安装文档版本同步提升到 `3.64`。

### 🧪 验证
- [文档] 本模块完成后继续执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、插件脚本语法检查（`node --check chrome-extension/content.js` / `popup.js` / `background.js`）、Python 单元测试（`python3 -m unittest tests.test_server_api tests.test_frontend_regressions -q`）、Node 测试（`node --test tests/test_autosubmit_utils.mjs`）、Docker 配置校验（`docker compose config`）以及版本中心验证（`/api/version-center`）。

## 2026-03-15 · v3.63

### ✂️ 模块25：首页 GitHub 入口继续精简
- [优化] 门户首页 GitHub 开源入口区移除 Forks / Issues，并新增 Docs，最终保留仓库、Stars、Release、Docs 四个常用入口，首屏更简洁。
- [优化] 保持 Stars 与 Release 继续走动态数据展示，避免无效信息占用首页空间。
- [优化] Docker / 插件 / 安装文档版本同步提升到 `3.63`。

### 🧪 验证
- [文档] 本模块完成后继续执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、插件脚本语法检查（`node --check chrome-extension/content.js` / `popup.js` / `background.js`）、Python 单元测试（`python3 -m unittest tests.test_server_api tests.test_frontend_regressions -q`）、Node 测试（`node --test tests/test_autosubmit_utils.mjs`）、Docker 配置校验（`docker compose config`）以及接口验证（`/api/open-source-stats`、`/api/version-center`）。

## 2026-03-15 · v3.62

### 🌟 模块24：门户首页 GitHub 数据实时化
- [优化] 将门户首页的 GitHub 开源入口从静态 badge 图片改为真实数据卡片，避免 Stars / Issues 因第三方缓存长期不更新。
- [新增] 服务端新增 `/api/open-source-stats`，拉取 GitHub 仓库 Stars、Forks、Issues 与最新 Release 信息，并供首页统一读取。
- [优化] GitHub 开源数据增加短时缓存，刷新首页后可更快看到最新 Star 变化，同时避免频繁请求 GitHub API。
- [优化] Docker / 插件 / 安装文档版本同步提升到 `3.62`。

### 🧪 验证
- [文档] 本模块完成后继续执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、插件脚本语法检查（`node --check chrome-extension/content.js` / `popup.js` / `background.js`）、Python 单元测试（`python3 -m unittest tests.test_server_api tests.test_frontend_regressions -q`）、Node 测试（`node --test tests/test_autosubmit_utils.mjs`）、Docker 配置校验（`docker compose config`）以及接口验证（`/api/open-source-stats`、`/api/version-center`）。

## 2026-03-15 · v3.61

### 🧾 模块23：README 首屏去图化 / 门户首页增加 GitHub 开源入口
- [移除] 去掉 README 中英版首页 Banner 图片，改为纯文字首屏，避免 GitHub 首页展示与产品风格不一致。
- [新增] 门户首页 Header 下新增 GitHub 开源入口区，提供仓库、Stars、Issues、Release 四类常用链接，展示形式对齐常见开源项目站点。
- [补充] README / README.en / `DEPLOYMENT.md` 补充“前后端一体部署”说明，明确 Docker 默认已包含前端页面与后端 API，并新增自定义 Nginx 反向代理示例。
- [清理] 移除仓库中的 `docs/assets/github/banner.svg`，继续收敛非必要展示素材，保持开源仓库简洁。
- [优化] Docker / 插件 / 安装文档版本同步提升到 `3.61`。

### 🧪 验证
- [文档] 本模块完成后继续执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、插件脚本语法检查（`node --check chrome-extension/content.js` / `popup.js` / `background.js`）、Python 单元测试（`python3 -m unittest tests.test_server_api tests.test_frontend_regressions -q`）、Node 测试（`node --test tests/test_autosubmit_utils.mjs`）以及 Docker 配置校验（`docker compose config`）。

## 2026-03-15 · v3.59

### 🧹 模块22：GitHub 首页素材收敛 / Banner 重做
- [移除] 删除 README 中的 GIF 登录演示，避免首页出现质量不稳定的动态图素材。
- [优化] 重做 `docs/assets/github/banner.svg`，改为更简洁的开源首页风格，去掉复杂伪界面，突出产品名、定位和核心能力。
- [优化] README 中英版首页信息收敛，保留首屏核心介绍，减少干扰项。
- [优化] Docker / 插件 / 安装文档版本同步提升到 `3.59`。

### 🧪 验证
- [文档] 本模块完成后继续执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、插件脚本语法检查（`node --check chrome-extension/content.js` / `popup.js` / `background.js`）、Python 单元测试（`python3 -m unittest tests.test_server_api tests.test_frontend_regressions -q`）、Node 测试（`node --test tests/test_autosubmit_utils.mjs`）以及 Docker 配置校验（`docker compose config`）。

## 2026-03-15 · v3.58

### 🖼 模块21：GitHub 双语视觉升级 / 登录跳转演示
- [优化] 重做 GitHub 首页 `banner.svg`，将标题、副标题与关键信息改成更清晰的中英双语表达，首屏识别度更高。
- [新增] 新增 `docs/assets/github/login-flow.gif`，用 4 步动态图示展示“点击系统卡片 → 命中规则 → 自动填充 → 自动登录”的完整跳转链路。
- [新增] 新增 `scripts/generate_github_assets.py`，沉淀 GitHub 视觉素材生成脚本，后续可继续复用生成 banner / GIF。
- [优化] README 中英版新增演示区域，并把示意说明改成中英双语，方便国内外用户快速理解产品链路。
- [优化] Docker / 插件版本号同步提升到 `3.58`，安装说明与镜像元数据版本同步更新。

### 🧪 验证
- [资源] 已执行 `python3 scripts/generate_github_assets.py` 成功生成双语 banner 与 GIF 演示资源。
- [文档] 本模块完成后继续执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、插件脚本语法检查（`node --check chrome-extension/content.js` / `popup.js` / `background.js`）、Python 单元测试（`python3 -m unittest tests.test_server_api tests.test_frontend_regressions -q`）、Node 测试（`node --test tests/test_autosubmit_utils.mjs`）以及 Docker 配置校验（`docker compose config`）。

## 2026-03-15 · v3.57

### 📚 模块20：API / 部署文档补齐
- [新增] 新增 `API.md`，对认证、系统管理、登录规则、审计、备份、版本中心等主要接口进行集中整理，方便开源用户快速接入。
- [新增] 新增 `DEPLOYMENT.md`，补齐 Docker 部署、本地 Python 启动、secure 网关、健康检查与升级流程说明。
- [优化] README 中英版新增 `API.md` / `DEPLOYMENT.md` 入口，开源仓库文档导航更完整。
- [优化] 继续完善 GitHub 首屏信息架构，方便外部开发者从 README 快速跳转到接入、部署与架构文档。

### 🧪 验证
- [文档] 本模块完成后已执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、插件脚本语法检查（`node --check chrome-extension/content.js` / `popup.js` / `background.js`）、Python 单元测试（`python3 -m unittest tests.test_server_api tests.test_frontend_regressions -q`）、Node 测试（`node --test tests/test_autosubmit_utils.mjs`）以及 Docker 配置校验（`docker compose config`）。

## 2026-03-15 · v3.56

### 🖼 模块19：GitHub 首页展示增强 / 架构文档补齐
- [新增] 新增轻量级 GitHub 首页 banner（`docs/assets/github/banner.svg`），用于提升仓库首页辨识度与产品感。
- [新增] 新增 `ARCHITECTURE.md`，补齐门户、后端、插件、规则中心与部署结构说明，方便开源用户快速理解系统边界。
- [新增] 新增 `ROADMAP.md`，把当前能力、下一步规划与长期方向独立沉淀，便于社区协作。
- [优化] README / README.en 新增 banner、架构文档与路线图入口，让 GitHub 首页信息结构更完整。
- [修复] 公众号隐私清理后，继续完成仓库收口，移除对应引用并保持开源仓库的轻量化方向。

### 🧪 验证
- [文档] 本模块完成后已执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、插件脚本语法检查（`node --check chrome-extension/content.js` / `popup.js` / `background.js`）、Python 单元测试（`python3 -m unittest tests.test_server_api tests.test_frontend_regressions -q`）、Node 测试（`node --test tests/test_autosubmit_utils.mjs`）以及 Docker 配置校验（`docker compose config`）。

## 2026-03-15 · v3.55

### 🌟 模块18：GitHub 开源仓库美化 / 首个发布准备
- [开源] GitHub 仓库命名准备切换为更品牌化的 `miaodeng`，相关插件主页链接同步更新为新的仓库地址。
- [优化] README 升级为更适合 GitHub 首页展示的样式，补充徽章、仓库说明，并新增 `README.en.md` 作为英文入口。
- [精简] 移除公众号排版稿、演示截图原图、品牌横幅等非核心大素材与配套文档，降低仓库体积，让开源仓库更聚焦核心代码。
- [优化] 开源测试文件继续去本地化：修复路径写死与字符串转义问题，确保仓库在他人环境下也能跑基础校验。
- [发布] 为首个 GitHub Release、topics 与 about 信息做准备，便于外部开发者快速理解项目定位。

### 🧪 验证
- [文档] 本模块完成后已执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、插件脚本语法检查（`node --check chrome-extension/content.js` / `popup.js` / `background.js`）、Python 单元测试（`python3 -m unittest tests.test_server_api tests.test_frontend_regressions -q`）、Node 测试（`node --test tests/test_autosubmit_utils.mjs`）以及 Docker 配置校验（`docker compose config`）。

## 2026-03-14 · v3.54

### 🌍 模块17：开源发布整理 / 敏感数据隔离
- [开源] 新增 `.gitignore`、`data/.gitignore` 与 `data/README.md`，默认隔离数据库、备份、密钥、证书、`.env` 等运行时敏感内容，避免误提交。
- [文档] README 重构为更适合 GitHub 开源首页的结构，补充项目介绍、快速开始、环境变量、测试命令、目录结构、数据隐私说明与协作入口。
- [文档] 新增 `LICENSE`、`CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`，补齐开源仓库基础治理文件。
- [工程] 新增 GitHub Actions CI 工作流与 Issue / PR 模板，方便后续社区协作与自动化校验。
- [优化] `.env.docker.example` 去除个人机器名示例，改为更通用的开源示例值。

### 🧪 验证
- [文档] 本模块完成后已执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、插件脚本语法检查（`node --check chrome-extension/content.js` / `popup.js` / `background.js`）、Python 单元测试（`python3 -m unittest tests.test_server_api tests.test_frontend_regressions -q`）、Node 测试（`node --test tests/test_autosubmit_utils.mjs`）以及 Docker 配置校验（`docker compose config`）。

## 2026-03-14 · v3.53

### 🧩 模块16：规则分组收口 / ZIP 安装统一
- [优化] 登录规则中心左侧规则列表按“内置规则 / 自定义规则”分组展示，并补充计数、说明和空态文案，规则资产结构更清晰。
- [优化] 规则列表卡片样式继续打磨，左侧资产区层级更明确，选中态与信息密度更适合高频维护场景。
- [优化] “安装秒登插件”弹窗正式统一为 ZIP 安装链路，移除一键脚本安装入口，避免 Mac / Windows 脚本流程给开源用户带来理解负担。
- [优化] ZIP 安装步骤新增“填写秒登服务地址并保存”，首次安装后的关键动作更完整，减少“装完不会配”的问题。
- [文档] README / README-INSTALL 同步切换为 ZIP-only 安装说明，避免页面与文档口径不一致。

### 🧪 验证
- [文档] 本模块完成后已执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、插件脚本语法检查（`node --check chrome-extension/content.js` / `popup.js` / `background.js`）、后端单元测试（`python3 -m unittest tests.test_server_api -q`）以及 Docker 配置校验（`docker compose config`）。

## 2026-03-14 · v3.52

### 🧹 模块15：规则中心继续收口 / 关闭刷新回弹修复
- [优化] 登录规则中心移除了“智能识别生成”和“规则测试/命中诊断”区域，主路径进一步收口为：真实页面采样 → 一键导入 → 保存。
- [优化] 规则中心左右区域补充了更清晰的面板标题与说明，整体更像“规则资产 + 编辑确认页”，降低首次使用理解成本。
- [修复] 关闭登录规则中心时会自动清理 `#login-rules / #rule-center / #login-rules-sample` hash，解决“关闭后刷新页面又自动弹出来”的问题。
- [优化] 左侧规则列表改为独立内容容器，保留固定面板头部，不再因为列表重绘导致结构反复跳动。

### 🧪 验证
- [文档] 本模块完成后已执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）和后端单元测试（`python3 -m unittest tests.test_server_api -q`），均通过。

## 2026-03-14 · v3.51

### 🎨 模块14：登录规则中心按钮视觉优化
- [优化] 登录规则中心按钮重新设计了视觉层级：主操作采用高亮渐变，辅助操作采用柔和品牌色，次级操作采用轻量幽灵样式，危险操作采用独立红色语义样式。
- [优化] 顶部工具区、采样助手区、规则测试区、底部操作区的按钮统一了圆角、阴影、悬浮反馈和点击态，不再出现“按钮都挤在一起、层级不清晰”的问题。
- [优化] 关键按钮文案补充图标（如保存、测试、删除、重置），让非技术同事更容易一眼看懂“主操作”和“危险操作”。

### 🧪 验证
- [文档] 本模块完成后已执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）和后端单元测试（`python3 -m unittest tests.test_server_api -q`），均通过。

## 2026-03-14 · v3.50

### 🛠 模块13：内置规则保护 / 规则列表点击修复
- [修复] 登录规则列表点击选中逻辑改为基于 `data-rule-id` 绑定，不再使用有引号冲突风险的内联参数，修复“点击规则选不中”的问题。
- [修复] “删除当前规则”失效的根因已一并修复；选中规则后可正常删除普通规则。
- [优化] 4 条内置登录规则现在会自动补齐到规则中心，并强制保持启用状态，不再出现默认“停用”的体验。
- [优化] 内置规则新增保护逻辑：不可删除，删除按钮会自动禁用并提示“内置模板不可删除”。
- [优化] 规则中心加载/保存/导入时会自动做一次内置模板对账，避免因历史数据或旧版本导致内置规则缺失、停用或状态漂移。

### 🧪 验证
- [文档] 本模块完成后已执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、后端单元测试（`python3 -m unittest tests.test_server_api -q`）以及 Docker 配置校验（`docker compose config`），均通过。

## 2026-03-14 · v3.49

### 🧩 模块12：规则优先 / 类型自动跟随
- [优化] 系统配置弹窗中，绑定了明确登录流的登录规则后，会自动跟随规则里的登录类型，不再要求用户重复手动选择“登录类型”。
- [优化] 当绑定规则的登录流为 `basic / iam / k8s / vaadin` 时，系统表单会自动切换对应凭据区域；只有未绑定规则，或绑定的是 `AUTO` 规则时，才显示“默认登录类型”。
- [优化] 系统弹窗文案升级为“默认登录类型（仅自动规则时生效）”，减少“登录规则”和“登录类型”双重配置的理解成本。
- [优化] 登录规则中心继续做减法：登录流类型也收进高级字段，主表单只保留名称与启停状态，采样/URL 生成后默认无需再手填。
- [修复] 当系统绑定 `vaadin` 规则时，保存逻辑会正确保留 OTP/TOTP 相关字段，不再被误清空。

### 🧪 验证
- [文档] 本模块完成后已执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、插件脚本语法检查（`node --check chrome-extension/content.js` / `popup.js` / `background.js`）、后端单元测试（`python3 -m unittest tests.test_server_api -q`）以及 Docker 配置校验（`docker compose config`），均通过。

## 2026-03-14 · v3.48

### 🛰 模块11：真实页面采样 / 规则中心极简化
- [新增] 插件弹窗新增“🛰 采样当前页”：在真实登录页上可直接采集页面结构，自动识别账号框 / 密码框 / OTP / Token / 提交按钮等线索，并保存为最近一次浏览器采样。
- [新增] 规则中心新增“🛰 导入最近浏览器采样”：可把插件刚采到的真实页面结构直接转成规则草稿，自动带入域名、路径关键字、URL 关键字和推荐选择器。
- [新增] 采样完成后，插件会直接打开门户 `#login-rules-sample`，规则中心会自动尝试导入最新采样，形成“真实页面 → 一键采样 → 自动带入规则中心”的闭环。
- [优化] 规则中心进一步做减法：主表单只保留规则名称、登录流类型、启停状态；优先级、域名、路径关键字、URL 关键字及各种选择器全部收进高级字段。
- [优化] 保存规则时如果运营同事没有手填匹配域名/关键字，系统会优先从当前 URL 自动补齐，减少因隐藏字段导致的保存失败。

### 🧪 验证
- [文档] 本模块完成后已执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、插件脚本语法检查（`node --check chrome-extension/content.js` / `popup.js` / `background.js`）、后端单元测试（`python3 -m unittest tests.test_server_api -q`）以及 Docker 配置校验（`docker compose config`），均通过。

## 2026-03-14 · v3.47

### 🧠 模块10：规则中心易用化 / URL 智能生成
- [新增] 登录规则中心新增“✨ 智能识别生成”：运营同事只需粘贴登录页 URL，即可自动带出匹配域名、路径关键字、推荐登录流类型与一套默认选择器模板。
- [新增] 登录规则中心新增“📚 导入当前内置规则模板”，会把现有插件内置的标准登录、IAM+OTP、K8s Token、Vaadin/Jmix 兼容逻辑沉淀到规则中心，作为可复用模板资产。
- [新增] 登录规则中心支持“🧩 显示/隐藏高级字段”，默认收起复杂选择器与提交流程配置，降低非技术同事的填写门槛。
- [优化] 当运营同事粘贴的 URL 已经能命中现有规则时，系统会优先自动定位到对应规则，而不是重复生成新规则，减少重复配置。
- [优化] 规则中心保存 / 删除 / 加载后会同步刷新系统配置里的“绑定登录规则”下拉项，避免新增规则后系统表单感知不及时。
- [优化] 规则模板导入后默认以禁用模板形式沉淀；URL 智能生成出的规则草稿则默认启用，并立即给出当前 URL 命中测试结果，减少试错成本。

### 🧪 验证
- [文档] 本模块完成后已执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、插件脚本语法检查（`node --check chrome-extension/content.js` / `popup.js` / `background.js`）、后端单元测试（`python3 -m unittest tests.test_server_api -q`）以及 Docker 配置校验（`docker compose config`），均通过。

## 2026-03-14 · v3.46

### 🧪 模块9：规则测试器 / 命中诊断 / 系统绑定规则
- [新增] 登录规则中心新增“规则测试器”，可直接输入登录页 URL，测试当前规则是否命中，并查看命中/未命中的原因。
- [新增] 登录规则中心新增“诊断最佳匹配”，会按域名、路径关键字、完整 URL 关键字与优先级给出当前最可能命中的规则与候选排序。
- [新增] 系统配置弹窗新增“绑定登录规则”字段，适合同域名多套登录页场景，支持某个系统强制优先使用指定规则。
- [优化] 插件自动登录新增“系统绑定规则优先”逻辑；若系统显式绑定某条规则，则优先执行该规则，再回退到通用匹配链路。

### 🧪 验证
- [文档] 本模块完成后已执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、插件脚本语法检查（`node --check chrome-extension/content.js` / `popup.js` / `background.js`）、以及后端单元测试（`python3 -m unittest tests.test_server_api -q`），均通过。

## 2026-03-14 · v3.45

### 🧠 模块8：登录规则中心（可配置自动登录）
- [新增] 后端新增 `GET/PUT /api/login-rules`，支持按用户保存“登录规则中心”，用于沉淀不同系统登录页的域名、路径关键字、字段选择器、OTP 弹窗与提交流程。
- [新增] 门户新增「🧠 登录规则中心」管理界面，可在工具菜单与帮助中心直接配置规则，无需再把特殊登录页逻辑写死到插件代码中。
- [新增] 插件自动登录链路接入规则中心：命中规则时优先使用可配置选择器与提交策略，未命中或执行失败时自动回退到内置兼容逻辑，保证向后兼容。
- [优化] 插件版本提升到 `3.45`，并修复商店清单漏挂 `autosubmit-utils.js` 的问题，避免规则/自动提交辅助逻辑在商店包中失效。

### 🧪 验证
- [文档] 本模块完成后已执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、插件脚本语法检查（`node --check chrome-extension/content.js` / `popup.js` / `background.js`）、以及后端单元测试（`python3 -m unittest tests.test_server_api -q`），均通过。

## 2026-03-14 · v3.44

### 🧪 模块7：前端交互回归测试与管理台修复
- [修复] 管理员中心卡片（系统健康 / 审计日志 / 数据备份 / 版本中心）补齐统一触发链路，点击整张卡片或按钮都可正常打开，不再出现“点了没反应”。
- [修复] 首页帮助与反馈卡片同步升级为整卡可点，并兼容弹窗触发识别，避免弹窗被页面级点击关闭逻辑立即收起。
- [修复] 系统卡片顶部操作区改为基于 `--card-top-actions-offset` 统一预留收藏位，解决收藏按钮与删除按钮在高密度布局下重叠问题。
- [优化] 系统卡片操作区新增 `:focus-within` 显示逻辑，键盘导航时也能稳定看到快捷操作。

### 🧪 验证
- [文档] 本模块完成后已执行门户脚本语法检查（`node --check /tmp/sso_portal_inline.js`）、前端触发链路静态回归检查（管理员中心/帮助中心 popup trigger 校验）、以及后端单元测试（`python3 -m unittest tests.test_server_api -q`），均通过。

## 2026-03-14 · v3.43

### 🐳 模块6：Docker 元数据与升级流程补齐
- [新增] `Dockerfile` 新增 `APP_VERSION` 构建参数与 OCI 镜像标签，容器镜像可直接识别当前版本号。
- [新增] `docker-compose.yml` 改为显式透传 `APP_VERSION=3.43`，便于构建产物、容器环境与更新中心保持一致。
- [优化] `README.md` 补充 Docker 部署/升级命令，明确“重建并滚动更新”的推荐流程，降低线上升级出错概率。
- [优化] Docker 场景下门户版本中心、镜像元数据与部署文档已统一到 `v3.43`，避免出现版本显示不一致。

### 🧪 验证
- [文档] 本模块完成后已执行 `docker compose config` 做配置展开校验，并再次执行 `python3 -m unittest tests.test_server_api -q`，均通过。

## 2026-03-14 · v3.42

### 🧭 模块5：帮助/反馈/管理入口收口
- [新增] 首页新增「管理员中心」，将健康监控、审计日志、数据备份、版本中心从日常登录主路径中独立出来。
- [新增] 首页新增「帮助与反馈」区域，集中承载插件安装、使用帮助、支持范围、留言反馈、产品支持等入口。
- [优化] 原支持系统 / 留言板浮动按钮默认隐藏，改为从“帮助与反馈”区域进入，降低首页漂浮干扰。
- [优化] 点赞支持区默认折叠，由“帮助与反馈”区域统一展开，减少对主工作台的视觉抢占。

### 🧪 验证
- [文档] 本模块完成后已再次执行门户脚本语法检查（`node --check`）与后端单元测试（`python3 -m unittest tests.test_server_api -q`），均通过。

## 2026-03-14 · v3.41

### 🗂️ 模块4：系统族视图 + 服务端置顶/备注释放
- [新增] 首页分组方式新增「按系统族分组」，便于把同一业务系统的 Test / UAT / Prod / K8s 变体收拢查看。
- [新增] 系统表单新增「备注」与「加入服务端置顶」字段，支持记录登录说明、责任人、特殊提示等信息。
- [新增] 系统卡片与常用区支持显示服务端置顶状态（📌）与备注摘要（📝），高优系统更醒目。
- [新增] 系统卡片操作区新增跨设备置顶按钮，直接调用后端 `/api/systems/:id/pin` 能力。
- [优化] 系统搜索已纳入备注内容，置顶系统在展示时优先靠前。

### 🧪 验证
- [文档] 本模块完成后已再次执行门户脚本语法检查（`node --check`）与后端单元测试（`python3 -m unittest tests.test_server_api -q`），均通过。

## 2026-03-14 · v3.40

### 🔌 模块3：门户-插件衔接与 Popup 高频启动器
- [新增] 插件 Popup 设置区新增“默认用户”输入框，切换用户不再依赖原生 `prompt`，可直接在设置面板中修改并保存。
- [新增] 插件在“需要登录后读取凭据”场景下改为内嵌密码面板，登录后自动刷新系统列表，减少跳出感。
- [新增] 门户页会把当前用户的常用收藏 / 最近访问同步到插件本地存储，Popup 新增高频启动区，优先展示常用与最近访问系统。
- [优化] 插件设置保存时会同步刷新：服务器地址、默认用户、认证 token、工作台快捷系统与版本检查状态。
- [修复] 插件清单版本同步提升到 `3.40`（`manifest.json` / `manifest-store.json`），更新中心可正确感知本轮插件迭代。

### 🧪 验证
- [文档] 本模块完成后已执行 `node --check chrome-extension/popup.js`、`node --check chrome-extension/content.js`、`node tests/test_autosubmit_utils.mjs` 与 `python3 -m unittest tests.test_server_api -q`，均通过。

## 2026-03-14 · v3.39

### 🚀 模块2：首屏聚焦与三步工作台
- [新增] 首页用户栏下方新增「三步完成秒登配置 / 开始今天的工作」聚焦工作台，围绕：用户、插件、系统 三条主路径展示当前状态。
- [新增] 新增显式「立即登录」入口，当前用户存在但未登录时可直接重新发起登录，不再依赖刷新页面或隐式触发。
- [优化] 根据当前状态动态展示首要动作：创建/切换用户、安装插件、搜索系统、添加首个系统、查看常用/最近访问。
- [优化] 当聚焦工作台显示时，底部悬浮安装 Banner 自动隐藏，减少首屏重复信息与注意力分散。

### 🧪 验证
- [文档] 本模块完成后再次执行门户脚本语法检查（`node --check`）与后端单元测试（`python3 -m unittest tests.test_server_api -q`），均通过。

## 2026-03-14 · v3.38

### 🎛️ 模块1：门户确认/认证交互产品化
- [优化] 门户新增统一业务弹窗组件，替代关键流程中的浏览器原生 `prompt / confirm`，交互更连续。
- [优化] 新用户注册、已有用户登录、记住登录、修改密码，统一改为页面内弹窗流程。
- [优化] 新建用户、删除用户、删除系统、恢复备份、关闭未保存表单、导入预检/导入模式选择，统一改为结构化确认弹窗。
- [优化] 认证与确认弹窗已兼容现有主题体系（默认 / AntD 白色 / AntD 黑色），减少“工具感”，提升产品完成度。

### 🧪 验证
- [文档] 本模块完成后已执行门户脚本语法检查（`node --check`）与后端单元测试（`python3 -m unittest tests.test_server_api -q`），均通过。

## 2026-02-18 · v3.37

### 🧩 插件版本号与更新提示对齐
- [修复] 将插件清单版本从 `3.3` 同步提升到 `3.37`（`manifest.json` / `manifest-store.json`）。
- [修复] 统一更新中心读取到的“插件最新版本”与实际代码更新节奏对齐，避免误判“长期未更新”。

### 🔐 TOTP 生产可用能力
- [新增] 系统表单新增 `OTP 模式`（固定/TOTP）与 `TOTP Secret` 配置（支持 Base32 与 `otpauth://`）。
- [新增] 插件在登录时支持本地实时生成 TOTP（30s/6位）并自动填充。
- [新增] 保存前增加 `TOTP Secret` 格式校验，避免误填导致验证码错误。

### 🎯 自动登录匹配与可视化优化
- [优化] 登录匹配加入协议评分（HTTP/HTTPS）与同分精度优先，降低同域多系统误匹配。
- [新增] 卡片显示“最近登录链路”彩色徽标；支持按系统记忆上次成功链路并优先复用。
- [优化] 插件列表增加账号行展示（账号 + URL），并支持按账号搜索。

## 2026-02-18 · v3.36

### 🌐 中英文切换（门户 UI）
- [新增] 功能菜单新增语言切换按钮，支持中文 / English 一键切换，并本地持久化记忆。
- [优化] 顶部关键区域支持双语：标题副文案、用户栏常用操作、功能菜单核心项、搜索提示、分组筛选、统计卡片等。
- [优化] 双语模式下用户状态文案（访客/只读/编辑/管理员）与顶部提示同步切换。

## 2026-02-18 · v3.35

### ↩️ 回退：移除快捷键中心
- [回退] 移除功能菜单中的「快捷键中心」入口。
- [回退] 移除快捷键中心弹窗与相关样式，恢复原有页面视觉。
- [回退] 移除快捷键中心相关键盘行为与命令面板入口（保留原有 `Ctrl/⌘+K`、`Ctrl/⌘+Shift+T`）。

## 2026-02-18 · v3.34

### 🧭 快捷键中心排版微调（左上+小字号）
- [优化] 标题改为左上对齐，避免视觉重心偏移。
- [优化] 快捷键中心文字与 `kbd` 统一缩小，减少压迫感。
- [优化] 列表回归紧凑单列，不再挤压其他区域视觉节奏。

## 2026-02-18 · v3.33

### 🎯 快捷键中心布局修正（居中不割裂）
- [优化] 快捷键项改为双列卡片式布局，减少“左重右轻”割裂感。
- [优化] 标题与内容整体居中，弹窗视觉重心更稳定。
- [优化] 移动端自动回落单列，保持阅读一致性。

## 2026-02-18 · v3.32

### 🎨 快捷键中心视觉重做
- [优化] 快捷键中心弹窗改为更成熟的卡片化样式（层次、边框、阴影、hover 反馈更清晰）。
- [优化] 深色/浅色主题下的快捷键标签（kbd）与关闭按钮统一风格，提升可读性。
- [优化] 移动端弹窗间距与布局细节优化，减少拥挤感。

## 2026-02-18 · v3.31

### ⌨️ P2-9 快捷键中心
- [新增] 功能菜单新增「快捷键中心」，可集中查看全局快捷键（搜索、切换用户、快速打开常用系统等）。
- [新增] 新增快捷键：`/` 聚焦搜索框、`Alt+U` 聚焦用户切换、`Alt+1~9` 直接打开对应常用收藏系统、`?` 打开快捷键中心。
- [优化] 命令面板新增“打开快捷键中心”命令；常用收藏区域新增快捷键映射提示。

## 2026-02-18 · v3.30

### 🔁 内网试运行模式回切（HTTP 优先）
- [调整] 默认访问入口回切为 `http://<host>:6680`，便于公司内网先试运行收集反馈。
- [调整] HTTPS 网关保留为可选增强入口：`https://<host>:8443`（按需启用 `secure` profile）。
- [文档] `README.md` 访问端口说明同步更新。

## 2026-02-18 · v3.29

### 🔐 HTTPS 主入口端口调整（6680）
- [调整] `secure` 网关 HTTPS 入口改为 `https://<host>:6680`，与原使用习惯保持一致。
- [调整] 后端直连调试端口调整为 `http://<host>:6681`，避免与 HTTPS 网关端口冲突。
- [文档] `README.md` 访问地址说明同步更新。

## 2026-02-18 · v3.28

### 🔐 P0-1 HTTPS 网关稳定性修复（Nginx）
- [优化] `secure` profile 网关实现从 Caddy 调整为 Nginx，降低本机自签证书握手失败概率。
- [新增] 新增 `deploy/nginx/` 网关构建文件（`Dockerfile`、启动脚本、模板配置）。
- [新增] 网关启动时自动生成/复用自签证书（支持 `TLS_DOMAINS`、`TLS_CERT_DAYS`）。
- [文档] `README.md` 的 P0-1 章节同步更新为 Nginx 使用说明。

## 2026-02-18 · v3.27

### 🔐 P0-1 HTTPS + 反向代理（Docker Secure Profile）
- [新增] `docker-compose.yml` 新增 `gateway`（Caddy）服务，可通过 `--profile secure` 启用反向代理层。
- [新增] 新增 `deploy/caddy/Caddyfile`，提供 HTTP/HTTPS 双入口及基础安全响应头。
- [新增] HTTPS 入口默认支持内网自签证书（Caddy internal CA），便于内网先行落地。
- [文档] `README.md` 新增“P0-1：HTTPS + 反向代理”使用说明与端口说明（8080/8443）。

## 2026-02-18 · v3.26

### 🐳 Docker 化部署（更稳定运行）
- [新增] 新增 `Dockerfile`，支持容器化运行秒登服务（内置健康检查）。
- [新增] 新增 `docker-compose.yml`，支持一键启动、自动重启、`./data` 数据持久化挂载。
- [新增] 新增 `.env.docker.example`，统一管理管理员密码、加密密钥、会话与备份策略参数。
- [优化] `server.py` 支持通过环境变量 `PORT` 覆盖端口（默认 6680），便于容器部署。
- [文档] `README.md` 新增 Docker 部署步骤与说明。

## 2026-02-18 · v3.25

### 🧹 菜单精简：更新日志入口收敛
- [优化] 顶部功能菜单移除独立「更新日志」入口，避免与「统一更新中心」重复。
- [保留] 仍可在「统一更新中心」内点击“查看详细变更”打开完整更新日志。

## 2026-02-18 · v3.24

### 🧩 更新中心交互修复与定位优化
- [修复] 统一更新中心内点击“查看详细变更”时，更新日志弹窗会稳定打开（不再被全局点击事件瞬间关闭）。
- [优化] 更新中心内文案明确区分：更新中心用于看升级状态，更新日志用于看详细改动内容。
- [优化] 操作入口文案从“查看更新日志”调整为“查看详细变更”，减少功能重叠感。

## 2026-02-18 · v3.23

### 🧩 P1-9 统一版本号与更新提示中心
- [新增] 服务端新增 `GET /api/version-center`，统一输出门户版本、插件最新版本、服务运行时长等信息。
- [新增] 门户新增「🧩 统一更新中心」弹窗，可一屏查看：门户版本、插件本机版本、插件服务器最新版本、服务运行时长。
- [新增] 更新中心支持版本比对提示（检测到插件落后时给出升级提醒）。
- [新增] 命令面板支持“打开统一更新中心”快捷操作。
- [新增] 插件会在门户页面写入本机插件版本信息，供更新中心读取并展示。

## 2026-02-18 · v3.22

### 🩹 修复：门户页扩展上下文失效报错
- [修复] `content.js` 增加扩展上下文可用性检测，避免热重载后触发 `Extension context invalidated` 异常。
- [修复] 门户主题同步写入 `chrome.storage` 改为安全调用，失效时自动静默停用同步观察器。
- [优化] 用户信息读取增加兜底处理，降低扩展重载瞬间的异常风险。

## 2026-02-18 · v3.21

### 🎨 插件“默认样式（Classic）”恢复
- [修复] 插件主题新增「默认」选项（Classic），恢复原先渐变风格视觉。
- [修复] Popup 与 Options 页主题默认值改为 `classic`，避免看起来“默认样式丢失”。
- [优化] 门户默认主题同步到插件时，映射为 `classic`（AntD 白/黑仍同步为 light/dark）。

## 2026-02-18 · v3.20

### 🔄 门户主题/间距与插件自动同步
- [新增] 当访问 `sso-portal.html` 时，插件会自动监听门户页面主题变化并写入插件配置。
- [新增] 门户切换白/黑主题后，插件 Popup/Options 会同步为相同主题（下次打开即生效）。
- [新增] 门户“间距模式（标准/紧凑）”也会同步到插件弹窗密度设置。
- [兼容] 保留插件端手动修改能力；未打开门户时继续使用上次同步/手动保存的主题配置。

## 2026-02-17 · v3.19

### ⚙️ Chrome 插件 Options 独立设置页
- [新增] 插件新增 `options.html` 独立设置页，可通过扩展“详情 → 扩展程序选项”打开。
- [新增] Options 页支持统一配置：服务器地址、默认用户、自动提交、禁用自动提交域名。
- [新增] Options 页支持白/黑主题 + 标准/紧凑间距，设置与 Popup 同步并持久化。
- [新增] Options 页集成连接测试、版本检查、更新指南与“一键打开秒登首页”。
- [优化] Popup 设置区新增「更多设置」按钮，快速跳转 Options 页。

## 2026-02-17 · v3.18

### 🧩 Chrome 插件 Popup UI 同步（第一版）
- [优化] 插件弹窗整体视觉改为更成熟的后台风格（弱化渐变、统一边框/间距/层次）。
- [新增] 插件设置新增「主题」切换（白色 / 黑色），并本地持久化。
- [新增] 插件设置新增「间距」切换（标准 / 紧凑），适配高频办公场景。
- [新增] 搜索区新增系统数量与连接状态提示，排错更直观。
- [兼容] 保留原有服务器地址、用户、自动提交、禁用域名、版本检查等能力与行为。

## 2026-02-17 · v3.17

### 📏 间距模式（高信息密度）
- [新增] 功能菜单新增「间距模式」开关，可在“标准 / 紧凑”两种信息密度之间切换。
- [优化] 紧凑模式下统一收敛顶部区、筛选区、概览卡、系统卡片、弹窗表单的间距与字号，单屏可见信息更多。
- [优化] 系统卡片在紧凑模式下提升列表密度（更小卡片、更紧凑网格），适合同事高频办公使用。
- [新增] 命令面板新增“间距模式”快捷命令，便于键盘快速切换。
- [兼容] 密度设置本地持久化（`localStorage`），刷新后自动保持。

## 2026-02-17 · v3.16

### 💾 P0-4 自动备份 + 一键恢复
- [新增] 服务端新增自动备份能力：启动兜底备份 + 周期备份调度（默认 24 小时，可通过环境变量配置）。
- [新增] 管理员接口：`GET /api/backups`（列表）、`POST /api/backups`（立即备份）、`POST /api/backups/restore`（一键恢复）。
- [新增] 恢复前自动创建安全快照（`pre-restore`），降低误操作风险。
- [安全] 备份文件名严格校验（仅允许安全字符与 `.db`），防止路径穿越。
- [新增] 首页功能菜单新增「💾 数据备份」入口（仅管理员可见），支持可视化备份/恢复。

### 🎛️ AntD 主题细节优化（白/黑）
- [优化] 顶部统计卡升级为“图标 + 状态色”样式，健康可达率支持按阈值高亮（绿/黄/红）。
- [优化] 健康概览副文案增加最近扫描时间，便于同事快速判断数据新鲜度。
- [优化] 顶部功能区统一按钮与下拉控件高度，避免拥挤场景下视觉不齐。

## 2026-02-17 · v3.15

### 📊 AntD Pro 风格首页概览卡
- [新增] 首页新增顶部统计概览卡：系统总数、健康可达率、常用收藏、最近访问。
- [新增] 概览卡与现有收藏/最近访问、健康扫描结果联动，数据实时更新。
- [优化] 统计卡已适配 AntD 白/黑主题与移动端布局，保证桌面/手机展示一致性。

## 2026-02-17 · v3.14

### 🧩 Ant Design Pro 风格细化（白/黑双主题）
- [优化] 在 AntD 白色/黑色主题下进一步统一布局节奏：顶部区、用户栏、分组区、系统卡片、弹窗均按中后台风格收敛。
- [优化] 弱化装饰性渐变，卡片图标、按钮、标签、分组头改为更规范的边框+主色视觉体系。
- [优化] 深色主题补充对比度与交互态（hover/危险按钮/占位符）优化，提升夜间可读性。
- [兼容] 保留默认主题与功能逻辑，移动端和桌面端均可正常切换与展示。

## 2026-02-17 · v3.13

### 🖤🤍 Ant Design 风格双主题（白/黑）
- [新增] 首页功能菜单新增 Ant Design 风格主题切换：白色主题 / 黑色主题 / 还原默认样式。
- [新增] 双主题按 Ant Design 视觉规范重绘主界面（卡片、弹窗、按钮、输入框、工具菜单等）。
- [新增] 主题选择本地持久化，刷新后保持。
- [兼容] 保留原有默认风格与功能逻辑，快捷键切换在 AntD 模式下自动在白/黑主题间切换。

## 2026-02-17 · v3.12

### 🎨 UI 组件库风格预览（过渡版本）
- [新增] 首页新增“组件库风格预览”能力与主题开关机制（功能菜单入口）。
- [优化] 建立样式切换与本地持久化框架，为后续 Ant Design 双主题落地打基础。

## 2026-02-17 · v3.11

### 🔄 P1-8 插件版本检查与升级提示
- [新增] 插件弹窗设置区新增版本状态行，展示当前插件版本号。
- [新增] 插件支持一键“检查更新”，自动对比服务器 `chrome-extension/manifest.json` 远端版本。
- [新增] 发现新版本时给出明确提示（当前版本 vs 最新版本），并支持跳转“更新指南”页面。
- [优化] 切换服务器地址后自动重新检测版本，方便同事接入不同部署地址。

## 2026-02-17 · v3.10

### ↕️ P2-7 首页常用区拖拽排序
- [新增] 常用收藏区支持拖拽排序（桌面端浏览器），调整后自动保存顺序。
- [优化] 拖拽结束后增加误触抑制，避免松手时误打开系统页面。
- [兼容] 移动端/不支持拖拽环境自动回退为普通点击访问，不影响现有使用。

## 2026-02-17 · v3.9

### ⭐ P2-1 常用系统 + 最近访问
- [新增] 首页增加“常用系统 / 最近访问”快捷区，按当前用户本地隔离保存。
- [新增] 系统卡片支持一键收藏（☆/★），收藏后优先展示在常用区。
- [新增] 点击系统卡片自动记录最近访问，便于同事快速回访高频系统。

### 🏷️ P2-2 标签/部门分组视图
- [新增] 系统配置支持 `部门` 与 `标签`（逗号分隔）元数据。
- [新增] 首页增加“按环境/按部门/按标签”分组切换。
- [新增] 增加部门筛选与标签筛选，可叠加搜索使用。

### 📱 P2-3 移动端简版适配
- [优化] 新增移动端响应式布局（`<=900px`、`<=560px`），提升手机访问可用性。
- [优化] 顶部功能、筛选栏、系统卡片、弹窗、留言区在小屏下自动重排。
- [优化] 表单双列在小屏改为单列，触控区域与阅读性更友好。

### 📣 P2-4 首页发布公告卡片
- [新增] 首页新增“最新发布”公告卡片，自动展示更新要点。
- [新增] 优先解析 `CHANGELOG.md` 最新版本条目作为公告内容，失败时使用兜底提示。
- [新增] 支持“知道了”关闭，按用户记录已读状态。

## 2026-02-17 · v3.8

### 📈 P0-2 健康监控误报优化
- [优化] 健康检查升级为 `HEAD + GET` 多策略探测，并增加网络失败重试，降低误报离线概率。
- [优化] 非 2xx 响应（如 302/401/403/405/5xx）改为“可达”判定，不再一律算离线。
- [新增] 健康检查返回细分状态字段：`healthy/reachable/state/status_class/reason/method/attempts`，前端可显示更明确原因。
- [优化] 健康看板支持三态展示：绿色（2xx 健康）、橙色（可达但非 2xx）、红色（网络不可达）。

### 🧾 P0-5 操作审计日志
- [新增] SQLite 新增 `audit_logs` 表，持久化记录关键写操作审计事件。
- [新增] 审计覆盖：系统新增/编辑/删除/导入/重排/置顶、用户注册/改密/删除等关键动作。
- [新增] 审计字段包含：时间、操作者、角色、动作、目标用户、资源信息、客户端 IP、详情扩展字段。
- [新增] `GET /api/audit-logs` 查询接口（分页 + 用户/动作筛选），默认仅管理员可访问。
- [新增] 首页新增「🧾 审计日志」入口（管理员可见），支持筛选与翻页查看。

## 2026-02-17 · v3.7

### 🧭 P2-8 新手向导
- [新增] 首页新增「🚀 新手向导」入口，首次进入自动弹出，串联“安装插件 / 查看使用说明 / 连通性检测”。
- [新增] 新手向导支持一键完成并记忆状态（本地 `localStorage`），后续可随时手动再次打开。

### 📈 P2-9 系统健康监控
- [新增] 首页新增「📈 健康监控」面板，支持对当前账号下所有系统批量健康扫描。
- [新增] 健康面板提供总数、在线数、离线数、失败率统计与逐条状态明细。
- [新增] 扫描结果本地保留历史快照（按用户隔离，限量保留最近记录），支持刷新后恢复摘要。

### ✨ P2-11 交互优化
- [优化] Toast 提示扩展为 `success / error / warning / info` 四种类型，失败场景反馈更清晰。
- [优化] 系统列表加载失败时支持缓存兜底，并在空白失败态提供显式“重试”按钮。
- [优化] 用户列表、鉴权等关键失败路径增加可感知提示，减少“无反馈”操作。
- [优化] 命令面板新增快捷动作：打开新手向导、执行系统健康扫描。

### ✅ P2-12 自动化测试
- [新增] `tests/test_server_api.py`：覆盖注册/登录会话、系统写读、改密鉴权等核心 API 回归场景。
- [新增] `tests/test_autosubmit_utils.mjs`：覆盖自动提交域名规则解析、归一化、域名命中判断逻辑。
- [验证] 补充 `python3 -m py_compile server.py` 与插件 JS `node --check` 语法校验。

## 2026-02-17 · v3.6

### 🗄️ P0-3 SQLite 持久层迁移
- [新增] `server.py` 引入内置 `sqlite3`，新增数据库文件 `data/sso.db`，并自动初始化 `users/systems/likes/messages/meta` 表。
- [迁移] 首次升级时自动将 `data/*.json`（含 `users.json`、`systems-*.json`、`likes.json`、`messages.json`）导入 SQLite，仅执行一次，不会反复覆盖。
- [兼容] 保留原有函数接口（如 `load_users/save_users/load_systems/save_systems/load_likes/load_messages` 等）和现有 API 路径，业务调用方式不变。
- [兼容] 继续兼容历史用户格式（`users.json` 字符串密码）与系统凭据加密前缀（`enc:`/`enc2:`）读取。
- [兼容] 保留历史 JSON 文件作为备份，不再作为主数据源。

## 2026-02-17 · v3.5.2

### ⚙️ 自动提交策略优化
- [优化] 插件默认保持“自动提交开启”，登录页仍按原有流程自动点击登录/确认按钮。
- [新增] 插件设置新增“自动提交”开关：可一键切换为“仅填充不自动提交”。
- [新增] 插件设置新增“禁用自动提交域名”列表（每行一个域名）；命中域名时强制只填充不提交。
- [优化] 自动提交开关与禁用域名规则通过 `chrome.storage.local` 持久化，重启浏览器后保持。

## 2026-02-17 · v3.5.1

### 🔐 记住登录 30 天
- [新增] `POST /api/auth` 支持 `remember`（兼容 `remember_me`）；`remember=true` 时发放长会话 token，并在响应返回 `remember` 字段。
- [新增] `GET /api/session` 返回 `remember`，前端可感知当前会话是否为“记住登录”。
- [新增] 长会话时长支持环境变量覆盖：`REMEMBER_SESSION_TTL_DAYS` 或 `REMEMBER_SESSION_TTL_SECONDS`（默认 30 天）。
- [优化] `sso-portal.html` 登录时增加“记住登录 30 天”确认；记住态使用 `localStorage`，非记住态继续使用 `sessionStorage`。
- [优化] 页面加载优先恢复持久化 token 并通过 `/api/session` 校验；会话失效/切换用户时同时清理 `sessionStorage` 与 `localStorage` 的 token 缓存。

## 2026-02-17 · v3.5

### 🔐 P0-1 权限模型升级
- [新增] `server.py` 引入短期 Session Token（默认 8h，支持 `SESSION_TTL_SECONDS` / `SESSION_TTL_HOURS` 覆盖），`/api/auth` 登录成功返回 `token/token_type/expires_in/expires_at/role/user`。
- [新增] `GET /api/session`：基于 `X-Auth-Token` 或 `Authorization: Bearer <token>` 校验会话并返回当前登录态。
- [新增] 用户角色模型支持 `readonly/editor/admin`，新用户默认 `editor`，`default` 用户自动确保为 `admin`。
- [优化] 写操作鉴权升级为“优先 Token，兼容 `X-Auth-Password`”，并对 `readonly` 角色禁止增删改导入/重排/置顶等写操作。
- [优化] `users.json` 兼容旧字符串密码格式并自动迁移为 `{password, role}` 结构。
- [新增] 管理员删除用户接口支持 admin token；保留 `X-Admin-Password` 兼容路径。
- [优化] `sso-portal.html` 登录流程改为 token 会话缓存（`sessionStorage`）+ 刷新自动校验 `/api/session`，失效时提示重新登录。
- [优化] 前端写请求改用 `X-Auth-Token`（并携带 `Authorization`），保留旧密码头兜底；用户栏新增角色态展示（admin/editor/readonly）。
- [优化] 前端修改密码支持 token 直改（无需 old_password）；删除用户在 admin 角色下可直接用 token 执行。
- [安全] CORS 放行新增认证请求头：`X-Auth-Token` 与 `Authorization`。

## 2026-02-17 · v3.4

### 🔐 安全加固
- [安全] `server.py` 移除硬编码管理员密码，支持 `ADMIN_PASSWORD` 环境变量；未设置时自动生成并安全保存哈希到 `data/.admin-password`。
- [安全] 凭据加密密钥改为 `ENCRYPT_KEY` 环境变量优先；未设置时使用本地持久化 `data/.encrypt-key`，避免重启后无法解密历史数据。
- [安全] `default` 用户初始密码改为 `DEFAULT_USER_PASSWORD` 可配置；未设置时首次自动生成随机密码并提示。
- [优化] 兼容历史加密数据读取（旧 `enc:` 格式继续可用），新写入使用 `enc2:`。

### 🚀 部署改造
- [部署] `install-quick.sh` 不再写死服务器地址，支持参数传入。
- [部署] `install-quick.sh` 支持环境变量 `MIAODENG_SERVER_URL` / `SERVER_URL`。
- [部署] `install-quick.sh` 支持 `curl | bash` 场景自动推断脚本来源。
- [部署] `install-quick.sh` 最终兜底 `http://localhost:6680`。
- [部署] `install-mac.sh` / `install-windows.bat` 统一为“参数可选，默认 localhost”并补充帮助说明。
- [文档] `README.md`、`README-INSTALL.txt` 同步更新安装命令和地址传参方式。

### 🧭 首页可见更新说明
- [新增] 首页新增「📝 更新日志」按钮，可直接查看 `CHANGELOG.md` 内容。
- [优化] 安装命令与指南中的服务器地址改为按当前访问地址动态生成（不再写死本机名）。

## 2026-02-15 · v1.0.0（初始发布）

### 🎉 首发功能列表
- [新增] 首页系统门户：支持按环境展示系统卡片、搜索系统、点击直达登录页。
- [新增] 系统配置管理：支持新增/编辑/删除系统，支持账号密码、OTP、Token 等凭据字段。
- [新增] 多用户数据隔离：支持通过 `?user=用户名` 使用独立系统与凭据数据。
- [新增] 自动登录插件（Chrome）：自动识别登录页并按系统配置匹配后填充凭据。
- [新增] 插件弹窗能力：支持配置服务器地址、切换用户、搜索系统并快速跳转。
- [新增] 数据能力：支持系统导入/导出、点赞与留言互动。
- [新增] 一键安装能力：提供 Mac/Windows 安装脚本与 ZIP 包安装方式。
