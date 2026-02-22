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

## GitHub 自动部署到 Cloudflare（推荐）

目标：`push main` 自动上线生产；PR 自动生成预览环境。

1. Cloudflare Dashboard -> `Workers & Pages` -> `Create` -> `Workers` -> `Connect to Git`
2. 连接 GitHub 仓库：`jackwude/eatwhat`
3. 生产分支设置为：`main`
4. 开启 PR Preview Deployments
5. 构建命令设置：
   - Install: `npm ci`
   - Build: `npm run cf:build`
   - Deploy: `npm run cf:deploy`
6. 在 Cloudflare 项目 `Settings -> Variables and Secrets` 配置环境变量（Production + Preview 都配置）

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

## 安全说明

- 所有密钥只放 Cloudflare Secrets，不要提交到 git。
- 你历史上暴露过密钥，建议上线前全部轮换。
