# New API 迁移规格

## 目标

用开源 New API 替换旧 `ai-gateway-render-console` 网关，复用当前 Render 服务和 GitHub 仓库自动部署链路。

## 范围

- 保留旧仓库备份分支：`backup-old-ai-gateway-20260512`。
- 主分支切换为 New API 项目。
- Render 服务继续使用 `my-ai-gateway` 名称。
- 数据库先使用 Render persistent disk + SQLite：`/data/new-api.db`。
- 新服务健康检查：`/api/status`。
- 旧网关不在新服务验证成功前物理删除。

## 迁移策略

### 阶段 1：部署 New API 基础服务

- 使用 `calciumion/new-api:latest` 官方镜像作为 Render Docker 基础，避免 Render 免费实例长时间源码构建失败。
- 使用 `Dockerfile.render` 启动 `/new-api`。
- 使用 `render.yaml` 配置持久磁盘、SQLite、日志目录、Session/Crypto Secret。

### 阶段 2：初始化管理员

New API 默认首启进入 setup 流程。可通过 Web UI 完成，也可用 `/api/setup` 完成。

建议管理员：

- username: `root`
- password: 通过 Render 环境变量 `NEW_API_BOOTSTRAP_ADMIN_PASSWORD` 保存，不写入仓库。

### 阶段 3：迁移渠道

旧网关的 `scripts/seed-render-data.js` 中存在模型和上游配置。New API 渠道模型：

- 表：`channels`
- 类型：OpenAI 兼容渠道 `type = 1`
- 上游地址：`base_url`
- 上游 Key：`key`
- 可用模型：逗号分隔 `models`
- 分组：`default`

旧网关一个 `url + apiKey` 分组可迁移为 New API 一个 channel，`models` 合并为逗号分隔列表。

### 阶段 4：生成调用 Token

New API 的调用令牌在 `tokens` 表中，接口请求用 `Authorization: Bearer sk-<tokenKey>`。令牌 key 本体在数据库中不带 `sk-` 前缀。

## 验收标准

- `GET /api/status` 返回 200。
- Web UI 能打开。
- 能登录或完成 setup。
- 至少一个 OpenAI 兼容渠道可用。
- `/v1/chat/completions` 能用 New API token 调通。

## 风险

- 旧网关模型名与 New API 模型映射语义不同，可能需要补充 `model_mapping`。
- Render API token 当前无效，部署日志可能仍需通过 Dashboard 或有效 API token 查询。
- 上游密钥属于敏感信息，不写入公开说明文件。
