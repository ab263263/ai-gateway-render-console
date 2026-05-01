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
- 本轮继续补强 `Proxies` 页“快速组池”第一版，避免候选列表只能全自动纳入，用户没法精细挑选。
- 已修改：
  - `frontend/src/pages/Proxies.tsx`
  - `frontend/src/i18n.ts`
- 新增/调整：
  - 候选表增加行选择能力，可手动勾选或取消勾选平台/模型候选
  - 新增“详情”列，直接显示 `probe_detail`，便于区分 cooldown、兼容性问题、请求失败等原因
  - 保持原有“探测后自动只选 healthy 候选”的逻辑，同时允许用户人工覆盖结果
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
























