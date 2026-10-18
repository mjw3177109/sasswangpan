# Sass 笔记 / 墨帆 Markdown SaaS

本分支是面向 Vercel 的免费栈改造版：**React/Vite + FastAPI + Supabase Postgres + Cloudflare R2 + Upstash Redis**，并提供可选 Stripe Checkout。

## 已完成的架构改造

- MySQL / PyMySQL -> PostgreSQL / `psycopg`，可直接连接 Supabase Transaction Pooler。
- SQLAlchemy 长文本类型改为跨数据库 `Text`，附件大小改为 `BigInteger`。
- 每个新用户默认 `20MiB` 免费附件空间，并在工作区接口/前端显示使用量；接近上限时可提交付费扩容申请。
- 本地附件 -> R2/S3 兼容对象存储；生产环境使用预签名 URL 浏览器直传。
- 加入 9GB 默认公共存储保护线，避免免费 R2 用量被应用主动打穿。
- Redis 改为 `REDIS_URL`，可直接使用 Upstash TLS Redis。
- 邮件保留 SMTP 抽象，可配置 Resend 等免费档服务。
- 支付改成可选 Stripe Checkout；`PAYMENTS_ENABLED=false` 时完全不需要支付服务。
- 根目录 `vercel.json` 将 Vite 与 FastAPI 作为同一 Vercel 项目的两个服务部署。

## V3 首次线上部署

详见 [`DEPLOY_V3_README.md`](DEPLOY_V3_README.md)，Windows 自检及部署入口为 `DEPLOY_V3_WINDOWS.bat`，首次 GitHub 发布入口为 `PUBLISH_GITHUB_V3.bat`。

## 本地启动

### 后端

```bash
cp .env.example .env
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 前端

```bash
cd frontend
npm ci
npm run dev
```

Vite 开发服务器已经把 `/api` 与 WebSocket 转发到 `127.0.0.1:8000`。

## 生产部署

完整步骤见 [`docs/FREE_STACK_SETUP.md`](docs/FREE_STACK_SETUP.md)。环境变量模板见 [`.env.example`](.env.example)。

## 免费 20MB 与付费扩容

每个新账号默认获得 20MiB 免费附件空间。接近上限时前端会显示“申请付费扩容”，达到上限后后端会拒绝继续上传并返回扩容提示。用户提交扩容目标后会生成 `pending` 申请，管理员确认价格和收款后再调整该用户的 `storage_quota_bytes`。默认仍保留 9GB 公共物理存储保护线，避免应用主动超出对象存储免费额度。

## 扩容管理后台 V2

现在扩容流程已经完整闭环：用户申请 -> 管理员报价 -> 用户确认付款 -> 管理员核款 -> 一键批准 -> 用户额度立即生效。管理员页面为 `/admin/storage`，通过 `SITE_ADMIN_EMAILS` 环境变量配置白名单。默认使用人工收款，不强制接 Stripe，因此免费版部署不需要支付 API。

## 套餐、订单与用户容量管理 V3

`/admin/storage` 现在分为“扩容订单 / 套餐配置 / 用户容量”三个管理区。数据库迁移会自动创建 100MB、500MB、1GB、5GB 四个套餐，**默认关闭且价格为 0**，避免系统擅自替业务定价。管理员填好价格并启用后，用户的空间扩容弹窗会自动显示这些套餐；用户选择套餐后立即生成唯一订单号并冻结当时的套餐名称、容量与价格快照。

扩容订单继续采用人工收款也能完整运行：用户提交付款信息 -> 管理员确认收款 -> 批准扩容 -> 额度立即生效。系统同时保存付款事件记录和每次管理员容量调整记录。管理员也可以在“用户容量”页按邮箱/用户名查询用户并直接调整容量，但新容量不能小于该用户当前已使用空间，且必须填写调整原因。

升级 V3 后执行：

```bash
cd backend
alembic upgrade head
```

最新迁移 head：`d7b3a42e9c10`。
