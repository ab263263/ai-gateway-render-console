# AI Gateway v1.5.x 功能增强规格文档

> 版本：1.5.1-dev
> 日期：2026-05-04
> 目标：补齐 New API 核心功能，将 AI Gateway 打造成稳定的中转网关

---

## 1. 背景与目标

**问题**：AI Gateway v1.5.0 缺少 4 个关键功能，无法作为稳定中转使用：
1. 多 Key 轮询（平台有多个 API Key 时无法负载均衡）
2. 平台健康检查（状态不准确，失败不切换）
3. SSE 错误处理（上游异常时客户端直接断开）
4. 网关 API Key 管理（已有表但无前端，无法对外服务）

**目标**：实现这 4 个功能后，AI Gateway 具备 New API 80% 核心能力，支持生产级中转使用。

---

## 2. 功能规格

### 功能 1：多 Key 轮询（Multi-Key Load Balancing）

**数据模型**（已有 `platform_keys` 表）：
```sql
platform_keys:
  id          TEXT PRIMARY KEY
  platform_id TEXT REFERENCES platforms(id) ON DELETE CASCADE
  api_key     TEXT NOT NULL
  weight      INTEGER NOT NULL DEFAULT 1
  status      TEXT NOT NULL DEFAULT 'Active'
  fail_count  INTEGER NOT NULL DEFAULT 0
  last_used   TEXT
  last_fail   TEXT
  created_at  TEXT NOT NULL
```

**路由选择逻辑**（BackendSelector 改造）：
1. 按权重（`weight`）构建加权随机池
2. 只选 `status='Active'` 且 `fail_count < 3` 的 Key
3. 请求失败后 `fail_count++`，超过阈值自动降级
4. 失败后延迟 30s 再重试（防抖动）
5. 下次选 Key 时优先选 `last_used` 最久的（公平轮转）

**验收标准**：
- 同一平台 2 个 Key，权重 1:1，请求 20 次分布 >= 8:12
- 单个 Key 失败 3 次后不再选它
- 失败 Key 恢复后自动重新加入池

---

### 功能 2：平台健康检查（Health Check）

**后台任务**：
- 每 5 分钟探测所有 `Active` 平台
- 探测方式：`POST /v1/chat/completions` with `{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}],"max_tokens":1}`
- 超时 10s 判定为失败

**状态更新**：
- `fail_count`：累计失败次数（不清零）
- `consecutive_fails`：连续失败次数（成功时归零）
- `auto_disabled`：连续失败 >= 5 时自动禁用
- `last_health_check`：最后检查时间

**前端展示**：
- 平台列表每行增加状态指示（绿色/黄色/红色）
- 支持手动触发健康检查按钮
- 显示最后探测时间和延迟

**API**：
- `GET /api/platforms/{id}/health` — 单个平台健康状态
- `POST /api/platforms/health-check` — 触发全量探测（异步）

**验收标准**：
- 探测自动运行，后台日志可见
- 前端显示探测时间/延迟
- `auto_disabled=true` 的平台不再被路由选择

---

### 功能 3：SSE 错误处理（Stream Error Handling）

**当前问题**：`handle_stream` 直接透传字节，上游返回非法 UTF-8 时客户端 JSON 解析崩溃。

**修复方案**：
```rust
// 每 chunk 做 UTF-8 校验
// 无效字节 → 跳过（不中断连接）
// 上游断开 → 发送 SSE error event 再关闭
// 超时 → 发送 timeout event 再关闭

// SSE 错误格式：
data: {"error":"stream_error","message":"upstream disconnected"}
data: {"error":"utf8_invalid","bytes_skipped":3}
data: {"error":"timeout","elapsed_ms":120000}

// 正常结束：
data: [DONE]
```

**验收标准**：
- 非法 UTF-8 不导致客户端崩溃
- 上游断开时客户端收到 error event 而非静默断开
- 前端显示流式错误信息（而非白屏）

---

### 功能 4：网关 API Key 管理（Token Management）

**数据模型**（已有 `api_keys` 表）：
```sql
api_keys:
  id          TEXT PRIMARY KEY
  name        TEXT NOT NULL
  key         TEXT NOT NULL UNIQUE
  proxy_id    TEXT REFERENCES proxies(id)
  created_at  TEXT NOT NULL
  last_used   TEXT
```

**前端功能**：
- API Key 页面：列表/创建/删除
- 创建时自动生成 32 位随机 Key（格式：`sk-ag-` + 32位）
- 显示 `last_used` 时间
- 可绑定到特定代理（proxy）

**验收标准**：
- 创建/删除 Key 实时生效
- Key 绑定 proxy 后只能访问该 proxy 的模型
- `last_used` 在每次请求时更新

---

## 3. 架构设计

### 模块划分

```
src/
├── lb/
│   ├── mod.rs           # 导出
│   └── strategy.rs      # 轮询策略（RoundRobin/WeightedRandom/...）
│   └── key_selector.rs  # NEW: platform_key 选择逻辑
├── proxy/
│   └── handler.rs       # 代理入口（修改：支持多 key）
├── checkin.rs            # 签到逻辑（复用：health check 参考这里）
├── api/
│   └── platform.rs      # 平台 CRUD（修改：添加 health_check 端点）
│   └── api_key.rs       # API Key CRUD（已有）
├── models/
│   └── platform.rs      # Platform 模型（修改：添加 health 字段）
├── db/
│   └── platform_key.rs  # NEW: platform_keys DB 操作
│   └── checkin.rs       # 签到日志（参考：health check 可复用）
└── health.rs            # NEW: 健康检查后台任务
```

### 关键变更点

1. **BackendSelector**：选 Key 时从 `platform_keys` 表读，加权随机
2. **handle_request**：失败后调用 `mark_key_failed`，成功调用 `mark_key_used`
3. **HealthCheckJob**：定时任务，每 5 分钟运行，更新 `platforms` 表状态
4. **前端**：Platforms 页面增加状态列，ApiKeys 页面完整实现

---

## 4. 风险与依赖

| 风险 | 影响 | 缓解 |
|------|------|------|
| Windows Rust 编译失败 | 本地无法测试 | 依赖 GitHub Actions Linux 编译验证 |
| Render 冷启动慢 | 测试等待时间长 | 提前 warm up 或用本地 Docker 测试 |
| 多 Key 修改影响现有路由 | 回归风险 | 先在单平台测试，确认后再推全量 |
| 平台探测触发限流 | 平台被封 | 设置合理的探测间隔和超时 |

---

## 5. 验收标准总表

| 功能 | 验收条件 | 优先级 |
|------|---------|--------|
| 多 Key 轮询 | 2 Key 等权重分布 8:12，失败自动切换 | P0 |
| 平台健康检查 | 前端显示状态，每 5 分钟自动探测 | P0 |
| SSE 错误处理 | 非法 UTF-8 不崩溃，错误有 event | P1 |
| API Key 管理 | 前端完整 CRUD，Key 绑定 proxy | P1 |

---

## 6. 交付物清单

- [ ] `src/lb/key_selector.rs` — 多 Key 选择器
- [ ] `src/lb/strategy.rs` — 改造支持加权随机
- [ ] `src/proxy/handler.rs` — 失败标记 + key 标记
- [ ] `src/db/platform_key.rs` — DB 操作层
- [ ] `src/health.rs` — 健康检查任务
- [ ] `src/api/platform.rs` — 添加 health endpoint
- [ ] `frontend/src/pages/Platforms.tsx` — 状态列 + 手动探测
- [ ] `frontend/src/pages/ApiKeys.tsx` — 完整 CRUD 页面
- [ ] `src/proxy/handler.rs` — SSE 错误处理
- [ ] 更新 `SPEC.md` → `SPEC-IMPLEMENTED.md`

---

*文档状态：开发中*