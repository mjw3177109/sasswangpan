"""Verify that the V3 storage-commerce migration is installed and seeded."""
from pathlib import Path
import sys

from sqlalchemy import inspect, select, text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import SessionLocal, engine
from app.models import StorageExpansionPlan

EXPECTED_HEAD = "d7b3a42e9c10"
EXPECTED_TABLES = {
    "storage_expansion_plans",
    "storage_expansion_requests",
    "storage_payment_records",
    "storage_quota_adjustments",
}
EXPECTED_CODES = {"storage-100mb", "storage-500mb", "storage-1gb", "storage-5gb"}


def main() -> int:
    tables = set(inspect(engine).get_table_names())
    missing = sorted(EXPECTED_TABLES - tables)
    if missing:
        print("[FAIL] Missing tables:", ", ".join(missing))
        print("Run: alembic upgrade head")
        return 2

    with SessionLocal() as db:
        version = db.execute(text("SELECT version_num FROM alembic_version")).scalar_one_or_none()
        if version != EXPECTED_HEAD:
            print(f"[FAIL] Alembic head is {version!r}; expected {EXPECTED_HEAD!r}")
            return 3
        codes = set(db.scalars(select(StorageExpansionPlan.code)).all())
        missing_codes = sorted(EXPECTED_CODES - codes)
        if missing_codes:
            print("[FAIL] Missing seeded plans:", ", ".join(missing_codes))
            return 4

    print("[OK] Storage V3 database schema verified")
    print("[OK] Alembic head:", EXPECTED_HEAD)
    print("[OK] Default plans:", ", ".join(sorted(EXPECTED_CODES)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
