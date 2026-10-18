# SaaS 笔记 V3 — 部署交付与验收

> 状态：源码已合并为可部署目录；尚未执行云端数据库迁移、云端 Vercel 部署或真实登录/上传验收。必须先配置你自己的 Supabase / Cloudflare R2 / Upstash Redis / 邮箱凭据。

## 首次部署（Windows）

1. 解压**完整部署源码 ZIP**，不要只解压 V3 增量补丁；当前 GitHub 主分支仍是空仓库。
2. 在解压后的项目根目录将 `.env.example` 复制为 `.env`。修改 `.env` 中的 `DATABASE_URL`、`REDIS_URL`、`SESSION_SECRET`、邮件 SMTP 和 R2 参数，替换所有 `YOUR_...` 占位符。密钥不要复制到聊天、不要上传 GitHub。
3. Supabase 新建 PostgreSQL 项目。数据库链接从 Supabase **Connect → Transaction pooler (6543)** 获取。新库先做迁移，再开放注册；已有数据库先备份。
4. 在 Cloudflare R2 新建 bucket `mofan-files` 和 API Token，开通所需存储读写权限，按 `docs/R2_CORS.json` 配置实际 Vercel 域名跨域。
5. 在 Upstash 创建免费 TLS Redis，使用 `rediss://...`；在邮件服务建立已验证域名并填写 SMTP 凭据。没有这些服务，登录验证码或附件上传可能失败。
6. 双击 `PUBLISH_GITHUB_V3.bat`：将完整项目源码（排除 `.env`、缓存和依赖）提交到 GitHub 现存的 `supabase-vercel-free-stack` 分支。这一步需要 Git for Windows、GitHub 推送权限及已配置的 Git 凭据。
7. 双击 `DEPLOY_V3_WINDOWS.bat`：自检 → 建 Python venv → 安装依赖 → 数据库迁移到 V3 → 数据库自检 → 链接 Vercel → 同步环境变量 → 部署预览。确认预览检查无误后，输入 `yes` 才部署 Production。
8. 在 Vercel **Project Settings → Build and Deployment** 中确认 Framework Preset 是 **Services**，根目录是仓库根目录，配置与 `vercel.json` 一致。若 CLI 自动识别失败，需先在后台选择 Services。

> 如果只想部署而暂时不推 GitHub，可以跳过第 6 步，直接双击 `DEPLOY_V3_WINDOWS.bat`，从本地目录向 Vercel 上传源码。将来若要 GitHub 自动部署，再执行第 6 步并在 Vercel 连接 GitHub 仓库。

## 关键服务与费用

| 部分 | 服务 | 说明 |
|---|---|---|
| React 前端 + FastAPI 后端 | Vercel Services | 采用同域名转发 `/api` 到后端；Services 仍在 Beta，部署前确认账号能使用。 |
| 数据库 | Supabase Postgres | 免费额度有限、可暂停，后续超限需要调整策略。 |
| 文件附件 | Cloudflare R2 | 浏览器直传；默认 9GB 全站保护，不等于无限免费。 |
| 验证码/会话 | Upstash Redis + 邮件 SMTP | 均受免费额度和服务条款限制。 |
| 扩容收款 | 人工确认 | 初始 `PAYMENTS_ENABLED=false`；不是自动收款。 |

**特别注意：Vercel Hobby 免费计划仅适用于个人非商业使用。如果你要向真实用户收费（包括人工付费扩容），应选择符合商业使用条款的计划或更换允许商业免费部署的服务。**

## 必须填写的配置

- `APP_ENV=production`
- `DATABASE_URL=postgresql://...:6543/postgres?sslmode=require`（Supabase Transaction Pooler）
- `REDIS_URL=rediss://...`
- `SESSION_SECRET`（随机 32 字符以上）
- `EMAIL_HOST`、`EMAIL_HOST_USER`、`EMAIL_HOST_PASSWORD`、`DEFAULT_FROM_EMAIL`
- `STORAGE_PROVIDER=r2`、`STORAGE_BUCKET`、`STORAGE_ENDPOINT_URL`、`STORAGE_ACCESS_KEY_ID`、`STORAGE_SECRET_ACCESS_KEY`
- `SITE_ADMIN_EMAILS`（管理员邮箱）
- `DEFAULT_USER_STORAGE_QUOTA_BYTES=20971520`（20MiB）
- `FREE_STORAGE_GLOBAL_CAP_BYTES=9000000000`（全站约 9GB 保护线；不会保证所有 R2 请求都零费用）
- `PAYMENTS_ENABLED=false`（本阶段人工收款）
- `FRONTEND_ORIGIN` 和 `FRONTEND_ORIGINS`（正式 Vercel 域名；若预览域名变化，需要调整）

## 线上验收

| 路径/功能 | 预期 |
|---|---|
| `https://你的域名/` | 页面加载且刷新深链接正常 |
| `https://你的域名/api/ping` | 返回 pong JSON，不是 Vite HTML |
| `https://你的域名/api/health` | `status=ok`，Postgres 和 Redis 都是 true |
| `https://你的域名/api/ready` | 200，否则排查 DB/Redis 凭据 |
| 注册 / 邮箱验证码 | 邮件真实收到，登录会话维持正常 |
| 新用户空间 | `20MiB`，上传超限阻止继续 |
| 浏览器附件直传 | R2 CORS、上传完成确认、下载签名 URL 正常 |
| `/admin/storage` | 管理员可查看套餐、报价、订单；非管理员被 403 |
| 扩容订单 | 选择套餐 → 订单号 → 报价/确认收款 → 批准 → 配额改变 |
| 多人协作 | WebSocket 在 Python Services 下需实际测试；若不支持，需要独立实时服务或替代方案 |

## 不包含在本次已验证范围

- 云端 Supabase 凭据及真实迁移结果（暂未接入账户操作权限）
- 真实 Vercel URL 和线上 HTTP 验证（暂未创建部署）
- 完整前端打包验收（当前会话的 `npm ci` 网络安装未完成）
- FastAPI/Python WebSocket 在 Vercel Services 上的支持情况（Vercel WebSocket 2026 年新增 Node 支持，不等同于此项目的 ASGI 路由已验证）

## 下一步

可选：把 `supabase-vercel-free-stack` 作为 Vercel 的 Git Source 分支部署，做完上线测试再合并到 `main`，保留回滚路径。
