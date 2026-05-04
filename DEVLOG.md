# AI Gateway 开发日志

> 目的：记录每次功能修改、部署、恢复、验证结果，方便下次继续，不靠聊天上下文回忆。

## 持续维护规则
- 每次**修改代码**后追加一条记录
- 每次**推送 / 部署 Render** 后追加一条记录
- 每次**恢复线上数据**、**修复关键问题**、**确认新限制** 后追加一条记录
- 记录内容尽量固定包含：时间、改了什么、影响范围、提交号、部署状态、待办

---

## 2026-04-28

### 1. Render 部署链修复
- 修复 Render Dockerfile 对前端产物路径的错误引用
- 修复数据库迁移脚本中旧 proxies 表字段引用错误
- 修复 render-keepalive workflow 在未配置 secret 时直接失败的问题
- 确认服务恢复可访问：
  - 管理后台：https://my-ai-gateway-p6on.onrender.com/
  - 网关地址：https://my-ai-gateway-p6on.onrender.com/v1
  - 健康检查：https://my-ai-gateway-p6on.onrender.com/health

### 2. 新增平台维度模型可见性功能
- 平台页支持一键抓取每个中转当前支持的模型
- 平台页支持展示模型数量、模型 ID 列表、抓取失败原因
- 新增平台级接口：
  - `GET /api/platforms/{id}/remote-models`

### 3. 新增平台级聊天测试能力
- 新增 ChatTest 页面
- 支持：
  - 选择平台
  - 选择远程模型
  - 手动输入模型 ID
  - 单个模型测试
  - 一键测试全部模型
- 测试结果支持展示：
  - 成功/失败
  - HTTP 状态
  - 延迟
  - 实际命中模型名
  - 错误信息
- 新增平台级接口：
  - `POST /api/platforms/{id}/chat-test`

### 4. 新增远程模型导入能力
- 平台页支持抓取后“一键导入模型”到本地 Models 库
- 自动跳过同平台已存在的 `model_id`
- 新增接口：
  - `POST /api/platforms/{id}/remote-models/import`

### 5. 线上数据空库恢复
- 发现 Render 线上平台/模型/虚拟模型/API Key 一度全部为空
- 通过全量注入脚本恢复：
  - 平台：5 个
  - 模型：11 个
  - 虚拟模型：11 个
- 说明当前 Render 部署存在“前端更新了但后端二进制或数据未同步”的问题

### 6. 自动恢复数据方案落地
- 新增：
  - `scripts/seed-render-data.js`
  - `docker-entrypoint.sh`
- Docker 启动后会：
  1. 启动 ai-gateway
  2. 等 `/health` 正常
  3. 如果开启开关，则自动执行幂等 seed 恢复数据
- `render.yaml` 已增加：
  - `AI_GATEWAY_SEED_ON_BOOT=1`
  - `AI_GATEWAY_BASIC_AUTH`（需在 Render 环境变量里补值）

### 7. 当前确认的中转行为
- `api.zaixianshauti.top`
  - `/v1/models` 返回空数组
  - `MiniMax-M2.7-highspeed` 聊天测试返回 `No available channel`
  - 结论：当前 key 无有效模型通道
- `ai.hhhl.cc`
  - `/v1/models` 与聊天测试都返回 `rate_limit_cooldown`
  - 结论：当前被限流/冷却，不是“0 个模型”
- `hiapi.work`
  - `/v1/models` 可返回 8 个模型
  - `K2.6` / `MiniMax-M2.7` 实际聊天可通
  - 结论：平台可用，但“显示模型名”与“实际命中模型名”可能不同

### 8. 关键提交号
- `34a70c1` feat: add platform model sync and chat test ui
- `8a93d1c` feat: add single and batch platform model testing
- `7cf4fcf` feat: add auto seed restore and batch model testing
- `7274cbf` chore: configure render auto seed env

### 10. Render 发布链切换（进行中）
- 原问题：前端能更新，但后端新版接口始终 404，根因是 Render 依赖 `render-bin/ai-gateway` 预编译二进制，而 GitHub Actions `Build Render Deployment` 连续失败，导致新版 Rust 后端没真正上线。
- 已采取措施：
  - 重写 `Dockerfile`，改成 Docker 构建时直接编译 Rust 后端，不再依赖 `render-bin/ai-gateway`
  - 重写 `.github/workflows/build-render.yml`，改为源码构建校验，不再回推二进制
- 已推送提交：
  - `a65f2df` `build: compile backend in docker for render`
- 当前验证：
  - `/health` 仍返回 200
  - 但 `POST /api/platforms/{id}/chat-test` 与 `POST /api/platforms/{id}/remote-models/import` 暂时仍是 404，说明 Render 新镜像尚未完成替换，需继续跟进部署是否真正切换到最新 commit。

### 11. Render Linux 编译失败根因已定位并修复
- 通过排查发现并不是 Render 配置随机异常，而是 `src/api/platform.rs` 在前序编辑中把 `test_platform_chat(...)` 的函数签名弄丢了。
- 现象：
  - `import_remote_models(...)` 后面直接接了一整段原本属于 `test_platform_chat(...)` 的函数体
  - 导致 Linux 下 `cargo build --release` 会失败，Render 无法产出新版后端镜像
  - 所以前端已更新但后端接口一直 404
- 已修复：
  - 补回 `pub async fn test_platform_chat(...) -> AppResult<HttpResponse>` 的完整函数头
- 已推送提交：
  - `9f42ae9` `fix: restore platform chat test handler definition`
- 当前状态：
  - 新一轮 `Build Render Deployment` 已触发并正在运行，等待确认这次是否通过

### 13. 号池 / 中转池控制台第一版开工
- 已创建规格文档：`POOL_CONSOLE_SPEC.md`
- 已将“OpenAI 兼容中转优先、异步并发、多 agent 调用”正式写入规格约束
- 已开始后端接口升级：新增平台级结构化探测入口 `POST /api/platforms/{id}/probe-model`
- 已升级前端 ChatTest 页面为第一版号池控制台结果面板：
  - 显示请求模型 / 实际命中模型
  - 显示 `/models` 探测是否成功及模型数量
  - 显示 chat 探测状态、延迟、错误分类、错误详情
  - 显示批量巡检结构化结果表
- 前端构建已通过，下一步需要继续完成后端接口部署验证与“快速组池”入口

### 15. Render 构建链已打通 & 号池控制台第一版部署中
- `Build Render Deployment` 运行 `25067139981` 已首次转为 `success`，说明 Render 上 Docker 直编 Rust 后端链路已经打通。
- 随后已推送号池/中转池控制台第一版提交：
  - `f023c4a` `feat: start pool console v1 probe workflow`
- 本次内容包含：
  - `probe-model` 结构化探测接口入口
  - ChatTest 第一版结构化结果面板与批量巡检表
  - `POOL_CONSOLE_SPEC.md`
  - `DEVLOG.md` 持续开发日志
- 当前 `Build Render Deployment` 新运行 `25070090617` 正在进行，待完成后需要立刻验证：
  - `/api/platforms/{id}/probe-model`
  - ChatTest 页面结构化结果展示
  - 批量巡检结果表

### 16. 当前下一步
- 等 `25070090617` 完成后立即做线上验证
- 若接口正常，继续推进“快速组池”入口
- 若异常，按日志继续修复并保持 DEVLOG / memory 同步

### 18. 虚拟大模型使用地址修复已验证
- 用户确认虚拟大模型页面的 `code` 弹窗地址已经从本地 `http://localhost:1994` 切换为 Render 线上地址。
- 当前虚拟大模型使用说明与 CC Switch 配置片段已可直接使用 Render 线上 `Base URL`。

### 19. 下一阶段主线
- 进入“测试结果驱动虚拟大模型配置 / 快速组池”实现阶段
- 目标：让测试成功的模型可以更直观地进入虚拟大模型轮询池，而不是继续纯手工逐个挂 backend

### 20. ai.hhhl.cc 新 Key 已切换 & Render 新后端已在线验证
- 用户提供新的可用 hhhl key：`sk-1H9Z8EGLCRWHszyHa3bo5jJj5oxNNVKQ`
- 已同步更新本地恢复/导入脚本中的 hhhl 相关配置：
  - `fix_platform_keys.js`
  - `restore_all_keys.js`
  - `check_platform_models.js`
  - `probe_platforms.js`
  - `import_workbuddy_models.js`
  - `import_to_aigateway_console.js`
  - `inject_models_node.js`
  - `inject_full.js`
- 已执行线上平台修复脚本并确认 Render 线上 `ai.hhhl.cc` 当前平台配置为：
  - `base_url = https://ai.hhhl.cc/v1`
  - `api_key = sk-1...NVKQ`
- 已验证 Render 当前服务状态：
  - `/health` 返回 200
  - `GET /api/platforms` 返回 5 个平台真实 ID
  - 手工请求 `/api/platforms/{id}/probe-model` 与 `/api/platforms/{id}/chat-test` 不再是 404，而是进入请求体校验并返回 `missing field model_id`
- 结论：新版后端路由已在 Render 上，不再是旧镜像；下一步应继续用正确请求结构做线上功能验收，并推进“快速组池”入口。

### 21. 快速组池第一版已落到 Proxies 页（本地代码完成）
- 目标：把“平台拉模型 → 探测可用性 → 批量生成后端”直接收进虚拟大模型创建流程，减少手工逐个挂 backend。
- 已修改前端：
  - `frontend/src/pages/Proxies.tsx`
  - `frontend/src/i18n.ts`
- 已新增能力：
  - 在“新建虚拟大模型”弹窗内加入“快速组池”卡片
  - 支持输入目标 `model_id` 后批量扫描各平台 remote model / preset model
  - 支持调用 `probePlatformModel` 对候选平台做逐个探测
  - 仅把 `available` / `mapped_model_mismatch` 候选自动选中并回填为 `backends`
  - 扫描结果表可展示平台、模型、来源、探测状态、实际命中模型、错误分类
- 当前状态：
  - 代码已落地，本地 lint 通过
  - 尚未完成本轮 Render 发布；若要线上生效，下一步需要提交并推送触发 Render 自动部署，然后做页面验收
- 下一步：
  - 提交本轮前端改动
  - 推送并等待 Render 自动部署
  - 上线后验证 Proxies 页快速组池实际可用性

### 22. 快速组池补强：支持手动筛选候选并展示探测详情
- 本轮继续补强 `Proxies` 页"快速组池"第一版，避免候选列表只能全自动纳入，用户没法精细挑选。
- 已修改：
  - `frontend/src/pages/Proxies.tsx`
  - `frontend/src/i18n.ts`
- 新增/调整：
  - 候选表增加行选择能力，可手动勾选或取消勾选平台/模型候选
  - 新增"详情"列，直接显示 `probe_detail`，便于区分 cooldown、兼容性问题、请求失败等原因
  - 保持原有"探测后自动只选 healthy 候选"的逻辑，同时允许用户人工覆盖结果
- 本地验证：
  - `read_lints` 对改动文件返回 0 问题
  - 前端首次 `npm run build` 因 Node 堆内存不足失败，不是代码错误
  - 使用 `NODE_OPTIONS=--max-old-space-size=4096` 后重新构建通过
- 当前状态：
  - 本地功能与编译验证已完成
  - 仍未推送到远端仓库，也还未触发 Render 新一轮部署
- 下一步：
  - 若继续走闭环，下一步应直接提交/推送到 `origin/main` 或部署仓库分支
  - 触发 Render 自动部署后重点验收 `Proxies -> 新建虚拟大模型 -> 快速组池` 的候选勾选与详情展示

---

## 2026-05-01

### 23. P0 五项核心优化 + 平台签到余额系统 (v1.4.0)

- **提交号**: `00668e2`
- **已推送 deploy remote**，Render 已触发自动构建
- **版本**: v1.2.0 → v1.4.0

#### P0 核心优化（对标 New API 开源项目）

**23.1 多Key渠道支持**
- 新增 `platform_keys` 表，每平台支持多个 API Key
- 加权轮询选 Key，单 Key 连续失败 3 次自动禁用，成功自动恢复
- 代理层请求时先查 platform_keys，无可用 Key 降级使用 platform.api_key
- 前端暂未暴露 Key 管理 UI（后续可加）

**23.2 渠道自动禁用 + 健康检查**
- platforms 表新增 `fail_count`、`consecutive_fails`、`auto_disabled`、`last_health_check`
- 代理层每次请求成功/失败自动更新计数
- 连续 5 次失败自动禁用平台，成功后自动恢复
- 前端 Platforms 页显示健康状态和连续失败次数

**23.3 模型名映射/别名**
- 新增 `model_aliases` 表（alias → actual_model_id）
- 代理层在路由前先 resolve 别名，支持 gpt-4 → gpt-4o 等透明映射
- 新增 API: `GET/POST/DELETE /api/model-aliases`

**23.4 SSE 流式错误过滤**
- `handle_stream()` 重写：过滤空 chunk、UTF-8 校验、非法字节跳过
- SSE 格式校验（data: / event: / id: / retry: 等行格式）
- stream error 转为 `data: {"error":"..."}` 优雅降级而非直接断开
- 新增 `X-Accel-Buffering: no` header 防代理缓冲

**23.5 请求日志系统**
- 新增 `request_logs` 表（14 个字段：timestamp, platform, model, proxy, status, latency, tokens, error 等）
- 新增 API: `GET /api/logs` 支持分页 + 多维过滤（platform_id, model_id, status_code, 时间范围）
- 前端新增 Logs 页面（第 8 个 Tab），支持筛选和分页

#### 平台签到余额系统

**23.6 NewAPI 签到协议对接**
- DB Schema V7: 新增 `checkin_logs` 表，platforms 新增 8 个签到/余额字段
- `src/checkin.rs`: 签到服务，调用 NewAPI 的 `/api/user/checkin` + Cookie 认证
- 余额查询: `GET /api/user/self` → quota - used_quota
- 平台级开关: `checkin_enabled`（支持签到才开启）+ `auto_checkin`（每日自动签到）
- 新增 API: `POST /api/checkin`, `POST /api/checkin/{id}`, `GET /api/balances`, `POST /api/balances/refresh`, `GET /api/checkin-logs`
- 前端: Platforms 页新增余额列 + 签到按钮 + 编辑弹窗签到配置区

#### DB 迁移
- V6: platform_keys, model_aliases, request_logs, platforms 健康字段
- V7: checkin_logs, platforms 签到/余额字段
- 迁移向后兼容，ALTER TABLE ADD COLUMN 用 IF IGNORE 容错

#### 文件变更清单（29 个文件，+2108 / -145 行）
- 新增 10 个文件: Logs.tsx, checkin.rs, checkin API/DB, model_alias API/DB, platform_key API/DB, request_log API/DB
- 修改 19 个文件: schema.rs, mod.rs, platform.rs, handler.rs, App.tsx, api.ts, i18n.ts, Platforms.tsx, Cargo.toml 等

#### 待验证
- [ ] Render 构建是否成功（Docker 直编 Rust）
- [ ] DB V6/V7 迁移是否自动执行
- [ ] 签到接口 `/api/checkin` 线上可用性
- [ ] 余额显示是否正确
- [ ] Logs 页面线上是否可访问

---

## 2026-05-03

### 24. v1.5.0 优化迭代

**24.1 版本号统一 (F1)**
- Cargo.toml: 1.4.0 → 1.5.0
- 前端 App.tsx: v1.2.0 → v1.5.0

**24.2 前端导航优化 (F3)**
- Tab 栏添加文字标签（图标+文字纵向排列）
- 添加 Tooltip 悬浮提示
- 响应式 overflow 处理

**24.3 Dashboard 增强 (F4)**
- 新增余额概览卡片（调用 `/api/balances`）
- 平台卡片添加健康状态指示灯（Badge + Tag）
  - 绿色 = Active / 0 fails
  - 黄色 = 有 consecutive_fails
  - 红色 = auto_disabled
- 平台卡片显示余额信息

**24.4 一键备份 (F6)**
- 后端新增 `GET /api/backup` 导出全部配置为 JSON
- 包含: platforms + models + proxies + proxy_routes + api_keys
- Settings 页添加"导出备份"按钮，下载 JSON 文件
- 前端 api.ts 新增 `exportBackup()` 方法

**24.5 管理后台认证确认**
- 确认 main.rs 已有 HTTP Basic Auth 中间件
- 当 ADMIN_USERNAME 和 ADMIN_PASSWORD 环境变量非空时生效
- /v1/* 和 /health 路径不受认证影响

**前端构建验证**
- `npm run build` 通过，新 hash: `index-EEYzxJER.js`
- static/index.html 自动更新

**待推送到 GitHub + 触发 Render 部署**

---

## 2026-05-05

### 25. UI 收口版已推送，等待 Render 新版本上线验证

- **提交号**: `0165c4a`
- **提交信息**: `feat: ship unified UI polish and render seed updates`
- **已执行**:
  - 已提交本轮前端 UI 收口与恢复脚本更新
  - 已推送到 `origin/main`
  - 已同步推送到 `deploy/main`
- **本轮覆盖范围**:
  - `frontend/src/App.tsx`
  - `frontend/src/ThemeContext.tsx`
  - `frontend/src/main.tsx`
  - `frontend/src/api.ts`
  - `frontend/src/i18n.ts`
  - `frontend/src/pages/Logs.tsx`
  - `frontend/src/pages/Proxies.tsx`
  - `frontend/src/pages/Platforms.tsx`
  - `frontend/src/pages/Models.tsx`
  - `frontend/src/pages/ApiKeys.tsx`
  - `frontend/src/pages/Dashboard.tsx`
  - `frontend/src/pages/Settings.tsx`
  - `frontend/src/pages/Checkin.tsx`
  - `frontend/src/pages/ChatTest.tsx`
  - `frontend/src/components/chat/MarkdownMessage.tsx`
  - `scripts/seed-render-data.js`

### 26. Render 构建触发状态

- **GitHub Actions 运行号**: `25334659193`
- **工作流**: `Build Render Deployment`
- **当前状态**: `in_progress`
- **检查链接**:
  - `https://github.com/ab263263/ai-gateway-render-console/actions/runs/25334659193`

### 27. 线上版本即时验证（部署尚未切换完成）

- 当前访问首页仍命中旧静态资源：
  - 线上 hash：`index-EEYzxJER.js`
  - 本地新构建 hash：`index-uXtwWAnu.js`
- 首页响应头显示：
  - `last-modified: Sun, 03 May 2026 05:31:14 GMT`
- 结论：
  - 代码已推送
  - Render 构建已触发
  - 但此刻线上仍在提供旧前端静态产物，说明新部署尚未完成切换

### 28. 本轮待继续验证项

- [ ] 等 `25334659193` 构建完成并确认 `success`
- [ ] 再次检查首页静态资源 hash 是否切换到新版本
- [ ] 上线后抽查关键页面：Logs / Proxies / Platforms / Models / Settings / Checkin / Dashboard / ApiKeys
- [ ] 若部署后线上数据丢失，优先恢复 `data/ai-gateway.db`；若无数据库文件，再用 `scripts/seed-render-data.js` 重建中转配置数据

### 29. Render 部署失败根因已定位（待重推验证）

- 通过下载 GitHub Actions `25334659193` 的完整日志，已拿到 Linux 下真实 Rust 编译错误，不再只是 exit code 101。
- 已定位并修复 3 个直接导致 Render 构建失败的问题：
  1. `src/api/platform.rs`
     - `trigger_health_check()` 中错误使用 `ai_gateway::health::check_all_platforms(...)`
     - 在 crate 内部应改为 `crate::health::check_all_platforms(...)`
  2. `src/health.rs`
     - `web::block` 返回值解包错误，导致 `platforms` 被推断成错误类型，继发 `status / id / base_url / api_key` 字段不存在报错
     - 同时 `check_single_platform()` 把借用引用直接 move 进 `web::block`，触发 borrowed data escapes outside of function (`E0521`)
     - 已改为：正确解包 `Ok(Ok(items))`，并传入 owned 的 `DbPool / Client / String`
  3. `src/proxy/handler.rs`
     - SSE `streaming(...).map_err(...)` 闭包缺少类型信息，触发 `E0282`
     - 已为错误映射闭包补显式类型 `bytes::Bytes`
- 额外确认：
  - 本机 Windows 上 `cargo build` 的 `link.exe` 报错主要是本地 MSVC/SDK 环境问题，不等于 Render 根因
  - Render 失败日志中的关键错误已经与上述 3 处源码问题对上
- 当前状态：
  - 修复代码已在本地工作区
  - 尚未重新提交 / 推送 / 触发下一轮 Render 构建
- 下一步：
  - 提交这 3 处 Rust 修复
  - 推送到 `main`
  - 等待新一轮 `Build Render Deployment`
  - 再次检查线上 hash 是否从 `index-EEYzxJER.js` 切到新版本

### 30. Render 构建回归已修复，线上版本与数据已恢复（2026-05-05 04:09）

- **新增提交**:
  - 本地提交：`64a07e5` `fix: resolve remaining render build regressions`
  - 部署远端提交：`a673457` `fix: resolve remaining render build regressions`
- **本轮重新定位的真实编译错误**（来自 `Build Render Deployment #25338788538` 完整日志）:
  1. `src/proxy/handler.rs:475`
     - `bytes::Bytes` 不实现 `Display`，`e.to_string()` 触发 `E0599`
     - 已改为 `String::from_utf8_lossy(&e).to_string()`
  2. `src/api/platform.rs:714`
     - `trigger_health_check()` 传入了 `Arc<Arc<ProxyState>>`，触发 `E0308`
     - 已把 `proxy_state.into_inner()` 改为 `proxy_state.get_ref().clone()`
- **新一轮 GitHub Actions**:
  - 运行号：`25340508866`
  - 工作流：`Build Render Deployment`
  - 结果：`success`
  - 链接：`https://github.com/ab263263/ai-gateway-render-console/actions/runs/25340508866`
- **线上版本验证**:
  - 首页静态资源已从旧版 `index-EEYzxJER.js` 切换到新版 `index-uXtwWAnu.js`
  - 新资源包中可检索到 `quickPool` 关键字，说明 UI 收口版已真正上线
  - `/health` 返回正常
  - `POST /api/platforms/health-check` 已可返回成功，说明新后端接口生效
- **部署后数据状态**:
  - 刚切换完成时线上 `platforms / proxies / models` 一度为空
  - 已使用 `scripts/seed-render-data.js` 对 Render 线上重新执行恢复
  - 最终复验结果：
    - `platforms = 8`
    - `models = 57`
    - `proxies = 57`
    - `stats.overview` 返回 `active_platforms = 8`、`active_proxies = 57`
- **当前结论**:
  - Render 构建已成功
  - 新 UI 已上线
  - 新后端修复已生效
  - 中转数据已恢复，可继续做功能验收

### 31. 后续主线与工程要求升级（2026-05-05 04:27）

- **项目主线更新**:
  - 接下来前端与后端都不是只做“能用”，而是继续做“抗卡顿、抗阻塞、可持续维护”的长期优化
  - 前端要重点解决：移动端滚动锁死、按钮遮挡、长内容溢出、复杂页面交互阻塞、批量列表渲染压力
  - 后端要重点解决：上游 502/503 透传体验差、平台健康检查与失败隔离不足、慢请求/批量测试对主流程的阻塞、恢复脚本与线上数据一致性
- **性能与稳定性原则**:
  - 前端默认按移动端优先验证：可滚动、可点击、不卡住、长列表可读、固定底栏不遮挡正文
  - 后端默认按高可用思路推进：错误分层、超时控制、失败快速回退、平台降级、批量任务不拖死主线程
  - 任何新功能都要考虑“坏情况下怎么退化”，而不是只考虑“正常时能跑”
- **代码质量要求**:
  - 继续保持代码干净、模块边界清晰、命名直接、少魔法值、少脏兮兮补丁式写法
  - 前端组件要避免壳层样式散落和重复内联逻辑，逐步收口布局与交互约束
  - 后端要减少脆弱 borrow/async/blocking 混写，优先保证接口职责清晰、日志可追踪、错误信息可定位
- **顶级工程标准（作为后续默认约束）**:
  - 先考虑可维护性，再考虑快速堆功能
  - 先保证稳定退化，再做炫功能
  - 改动时同步考虑：性能、可读性、错误处理、移动端体验、部署一致性、数据恢复路径
  - 所有关键链路都要能被验证：本地构建、线上接口、移动端交互、部署后数据状态
- **接下来执行方向**:
  1. 继续清洗批量模型测试结果，按 502 / 503 / 401 / 403 分类处理上游问题
  2. 推进移动端 UI 第二轮修正并上线验证
  3. 逐步把前后端易卡段、易阻塞、易脏代码的部分系统化重构

### 32. 移动端滚动与遮挡修复已上线（2026-05-05 04:39）

- **部署提交**:
  - `c1143eb` `fix: improve mobile layout and scroll stability`
- **GitHub Actions**:
  - `Build Render Deployment #25342412835`
  - 结果：`success`
- **本轮前端修复点**:
  - `frontend/index.html`
    - 去掉 `html/body/#root` 的全局 `overflow: hidden`
    - 改为允许纵向滚动，保留横向禁滚，并开启触摸滚动
  - `frontend/src/App.tsx`
    - 根布局从 `100vh` 调整为 `100dvh`
    - 增加移动端正文底部安全区留白，避免被底部导航压住
    - 底部导航改为 5 列网格，缩小移动端按钮尺寸和文字占用，减少遮挡
  - `frontend/src/pages/ChatTest.tsx`
    - 聊天历史块去掉容易撑爆布局的写法，补充 `overflow: hidden`
- **线上移动端复验结果**:
  - 新静态资源已切换到：`index-BhkYD6Xr.js`
  - 手机视口下页面样式已从 `bodyOverflowY=hidden` 变为 `bodyOverflowY=auto`
  - 首页可实际滚动：`scrollY ≈ 1009.6`
  - 聊天测试页可实际滚动：`scrollY = 1084`
  - 说明“手机端无法上下滑动像卡死”这一类问题已被直接修掉
- **仍需注意的问题**:
  - Render 每次新部署后，线上 `platforms / proxies / models` 仍会再次清空
  - 本轮部署完成后又发生一次空库，已再次执行 `scripts/seed-render-data.js` 恢复
  - 恢复后复验：`platforms = 8`、`proxies = 57`、`stats.overview.active_proxies = 57`
- **当前结论**:
  - 移动端滚动锁死问题已上线修复
  - 按钮遮挡和底部压内容问题已明显缓解
  - 但“部署后数据被清空”仍是后端/持久化链路的 P0 问题，必须继续根治
