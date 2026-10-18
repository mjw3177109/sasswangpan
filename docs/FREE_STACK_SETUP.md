# 免费栈部署清单

> 目标：把原 MySQL + 本地磁盘 + Redis 部署，改成 Supabase Postgres + Cloudflare R2 + Upstash Redis + Vercel。支付为可选 Stripe Checkout；不收费时完全可以关闭。

## 1. Supabase（数据库）

1. 新建 Supabase Free 项目。
2. 在 **Connect** 中复制 **Transaction pooler** 的连接 URI。
3. 把连接 URI 写入 Vercel 环境变量 `DATABASE_URL`。
4. 本地安装后执行迁移：

```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
```

项目已用 `psycopg` + SQLAlchemy `NullPool`，避免每个 Vercel Function 实例长期占用数据库连接。

## 2. Cloudflare R2（附件）

1. 创建 Standard R2 bucket，例如 `mofan-files`。
2. 创建有该 bucket Object Read/Write 权限的 R2 API Token。
3. 配置：`STORAGE_BUCKET`、`STORAGE_ENDPOINT_URL`、`STORAGE_ACCESS_KEY_ID`、`STORAGE_SECRET_ACCESS_KEY`。
4. 给 bucket 添加 `docs/R2_CORS.json` 中的 CORS；把 `YOUR_PROJECT.vercel.app` 换成实际域名。

附件流程是：浏览器 -> R2 预签名 PUT；FastAPI 只签发 URL 和登记元数据。大附件不会经过 Vercel Function。

### 免费 20MB 与扩容申请

每个新账号默认写入 `20971520` bytes（20MiB）免费附件配额。接近上限时前端显示“申请付费扩容”；达到上限后上传接口返回 `USER_STORAGE_QUOTA_EXCEEDED`，不会继续占用对象存储。

扩容采用申请制：`POST /api/billing/storage-expansion-requests` 提交目标容量（MB），后台生成 `pending` 记录。管理员确认报价与收款后，再将对应用户的 `storage_quota_bytes` 调整到购买容量。这样支付渠道未配置时也不影响免费版上线。

默认仍开启 `FREE_STORAGE_GLOBAL_CAP_BYTES=10737418240`（10GiB 公共免费物理池保护），防止全站存储主动超过免费层保护线。

## 3. 扩容管理后台（V2）

扩容支付默认采用**人工收款 + 后台确认**，不需要购买支付网关，也没有第三方支付接入月费。流程：

1. 用户在“空间管理 / 扩容”提交目标容量。
2. 管理员打开 `/admin/storage`，填写报价与备注。
3. 用户在扩容弹窗看到报价和付款说明，完成付款后点击“我已付款”。
4. 管理员核对到账后点击“确认收到付款”。
5. 管理员点击“批准扩容”，系统立即把 `users.storage_quota_bytes` 提升到申请容量。

管理员通过登录邮箱白名单控制。在 Vercel 环境变量中配置：

```env
SITE_ADMIN_EMAILS=admin@example.com,owner@example.com
STORAGE_PAYMENT_INSTRUCTIONS=请联系管理员完成扩容付款，付款后回到扩容页面点击“我已付款”。
```

只有白名单邮箱可以调用 `/api/billing/admin/*`。前端路由保护只用于体验，真正权限校验始终在 FastAPI 后端执行。

### 扩容状态

- `pending`：等待管理员报价
- `quoted + unpaid`：已报价，等待用户付款
- `quoted + submitted`：用户已提交付款确认，等待管理员核对
- `quoted + confirmed`：管理员已确认到账，可以批准扩容
- `approved`：额度已生效
- `rejected`：申请被拒绝

执行本次升级后需要再跑：

```bash
cd backend
alembic upgrade head
```

最新迁移 head 为 `c51e9d7a2f44`。
