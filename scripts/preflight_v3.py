"""Preflight checker for SassWangpan V3 deployment (stdlib only)."""
from pathlib import Path
import json
import os
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_PATHS = [
    'vercel.json', 'frontend/package.json', 'frontend/package-lock.json',
    'frontend/src/App.tsx', 'backend/main.py', 'backend/app/main.py',
    'backend/requirements-prod.txt', 'backend/alembic.ini',
    'backend/migrations/versions/d7b3a42e9c10_storage_plans_orders_and_quota_audit.py',
]
REQUIRED_SECRETS = ['DATABASE_URL', 'REDIS_URL', 'SESSION_SECRET',
                    'STORAGE_BUCKET', 'STORAGE_ENDPOINT_URL',
                    'STORAGE_ACCESS_KEY_ID', 'STORAGE_SECRET_ACCESS_KEY',
                    'EMAIL_HOST_PASSWORD', 'DEFAULT_FROM_EMAIL', 'SITE_ADMIN_EMAILS']
PLACEHOLDERS = ('YOUR_', 'CHANGE_TO_', 'example.com', 'admin@example.com')


def get_env():
    env = dict(os.environ)
    dot_env = ROOT / '.env'
    if dot_env.is_file():
        for line in dot_env.read_text(encoding='utf-8-sig').splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            value = value.strip().strip('"').strip("'")
            env[key.strip()] = value
    return env


def main():
    failures = []
    for rel in REQUIRED_PATHS:
        if not (ROOT / rel).is_file():
            failures.append(f'missing source: {rel}')
    cfg = json.loads((ROOT / 'vercel.json').read_text(encoding='utf-8'))
    if set(cfg.get('services', {})) != {'frontend', 'backend'}:
        failures.append('vercel.json must include frontend and backend services')
    if not (ROOT / '.env').exists():
        failures.append('create .env from .env.example and fill in credentials')
    env = get_env()
    for k in REQUIRED_SECRETS:
        v = env.get(k, '').strip()
        if not v or any(x in v for x in PLACEHOLDERS):
            failures.append(f'{k} missing or still a placeholder')
    if len(env.get('SESSION_SECRET', '')) < 32:
        failures.append('SESSION_SECRET must be at least 32 characters')
    if env.get('STORAGE_PROVIDER', '').lower() != 'r2':
        failures.append('STORAGE_PROVIDER must be r2 in this deployment')
    for origin_key in ('FRONTEND_ORIGIN', 'FRONTEND_ORIGINS'):
        if not env.get(origin_key,'') or 'YOUR_PROJECT' in env.get(origin_key, ''):
            failures.append(f'{origin_key} needs a real deployed domain (or intentional temporary preview value)')
    quota = env.get('DEFAULT_USER_STORAGE_QUOTA_BYTES', '')
    if quota != '20971520':
        failures.append('DEFAULT_USER_STORAGE_QUOTA_BYTES must be 20971520 (20MiB)')
    if env.get('FREE_STORAGE_GLOBAL_CAP_BYTES') not in {'9000000000', '0'}:
        failures.append('Set FREE_STORAGE_GLOBAL_CAP_BYTES=9000000000 for conservative free-tier protection')
    if env.get('APP_ENV') != 'production':
        failures.append('APP_ENV must be production')
    if env.get('PAYMENTS_ENABLED', 'false').lower() != 'false':
        print('WARNING: automated Stripe payments enabled; verify provider and plan rules.')
    url = env.get('DATABASE_URL','')
    if url and not (url.startswith('postgresql://') or url.startswith('postgres://') or url.startswith('postgresql+psycopg://')):
        failures.append('DATABASE_URL must be a PostgreSQL URL')
    if url and ':6543/' not in url:
        print('NOTE: Supabase transaction pooler typically uses port 6543; verify your URI.')
    if failures:
        print('PREFLIGHT FAILED:')
        for err in failures:
            print(' - ' + err)
        return 1
    print('PREFLIGHT OK: source structure and required settings present (secrets not displayed).')
    print('Remember to set Vercel Framework to Services and R2 bucket CORS.')
    return 0

if __name__ == '__main__':
    sys.exit(main())
