#!/usr/bin/env python3
"""Read-only V3 preview smoke test; no credentials or data modifications."""
import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "sasswangpan-preview-smoke/1"})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=20) as response:
            return response.status, response.headers.get("content-type", ""), response.read(1024 * 1024)
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("content-type", ""), exc.read(2048)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parsed = urllib.parse.urlsplit(parser.parse_args().url.strip())
    if (parsed.scheme != "https" or not parsed.hostname or
            not parsed.hostname.endswith(".vercel.app") or
            parsed.username or parsed.password or parsed.port or
            parsed.path not in ("", "/") or parsed.query or parsed.fragment):
        parser.error("Expected an HTTPS Vercel deployment origin, e.g. https://example.vercel.app")
    base = "https://" + parsed.hostname
    failures = []
    for path, kind in (("/", "html"), ("/admin/storage", "html"),
                       ("/api/ping", "ping"), ("/api/health", "health")):
        status, content_type, raw = fetch(base + path)
        obj = None
        try:
            if kind != "html":
                obj = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            pass
        ok = status == 200
        detail = ""
        if kind == "html":
            ok = ok and "text/html" in content_type.lower() and b"<html" in raw.lower()
        elif kind == "ping":
            ok = ok and isinstance(obj, dict) and obj.get("data", {}).get("message") == "pong"
        else:
            data = obj.get("data", {}) if isinstance(obj, dict) else {}
            services = data.get("services", {}) if isinstance(data, dict) else {}
            ok = ok and data.get("status") == "ok" and all(
                services.get(k) is True for k in ("supabase_postgres", "redis")
            )
            detail = " dependencies=" + str(services)
        print(("PASS" if ok else "FAIL") + " " + path + " HTTP " + str(status) + detail)
        if not ok:
            failures.append(path)
    if failures:
        print("FAILED: " + ", ".join(failures), file=sys.stderr)
        return 1
    print("All preview smoke checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
