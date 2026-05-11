# New API 迁移脚本

## `newapi-import-from-old-seed.mjs`

从旧 `ai-gateway-render-console/scripts/seed-render-data.js` 提取 `MODELS_CONFIG`，按 `url + apiKey` 聚合为 New API 渠道数据。

运行：

```bash
node scripts/newapi-import-from-old-seed.mjs
```

默认生成：

```text
scripts/newapi-channels.generated.json
```

注意：生成文件包含上游 API Key，已通过 `.git/info/exclude` 本地排除，禁止提交到 GitHub。
