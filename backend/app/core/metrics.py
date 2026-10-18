from prometheus_client import Counter, Histogram

HTTP_REQUESTS = Counter(
    "mofan_http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status"],
)
HTTP_DURATION = Histogram(
    "mofan_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path"],
)
