# eatwhat（AI 智能菜谱辅助）

基于 `Next.js App Router` 的菜谱推荐应用，包含：
- 食材输入与推荐菜品
- 精确菜谱与缺失采购清单
- 历史记录持久化（Supabase）

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 配置环境变量（复制 `.env.example` 为 `.env.local`）

至少填写：
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

3. 启动开发服务（端口 3001）

```bash
npm run dev
```

浏览器访问：`http://localhost:3001`

## Cloudflare Workers 部署（OpenNext）

### 本地验证

```bash
npm run cf:build
npm run cf:preview
```

### 直接部署（CLI）

```bash
npx wrangler login
npm run cf:deploy
```

## GitHub Actions 自动部署到 Cloudflare（推荐）

目标：`push main` 自动上线生产；PR 自动跑构建校验。

已提供工作流文件：`.github/workflows/deploy-cloudflare-worker.yml`

### 1. GitHub Secrets（必须）

在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 添加：
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

说明：
- `CLOUDFLARE_API_TOKEN` 需要至少包含 Workers Script 的编辑发布权限。
- `CLOUDFLARE_ACCOUNT_ID` 使用你的 Cloudflare Account ID。

### 2. Cloudflare Worker Runtime 变量（必须）

在 Cloudflare Dashboard 的 Worker 项目中继续维护运行时变量（Production）：

建议配置：
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_RECOMMEND_MODEL`
- `OPENAI_API_STYLE`
- `OPENAI_IMAGE_MODEL`
- `OPENAI_IMAGE_SIZE`
- `IMAGE_API_KEY`
- `IMAGE_BASE_URL`
- `OPENAI_STT_MODEL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_HISTORY_TABLE`（默认 `HistoryEntry`）
- `RECOMMEND_CACHE_TTL_SEC`
- `NEXT_PUBLIC_ASR_GATEWAY_URL`（启用语音网关时）

### 3. 触发规则

- `push main`：执行 `build + wrangler deploy`，自动更新生产环境。
- `pull_request -> main`：仅执行 `cf:build` 作为预检，不发布。

## 安全说明

- 所有密钥只放 Cloudflare Secrets，不要提交到 git。
- 你历史上暴露过密钥，建议上线前全部轮换。
