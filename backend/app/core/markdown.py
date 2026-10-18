import bleach
import markdown

ALLOWED_TAGS = set(bleach.sanitizer.ALLOWED_TAGS) | {
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "pre",
    "code",
    "blockquote",
    "ul",
    "ol",
    "li",
    "hr",
    "br",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
}
ALLOWED_ATTRIBUTES = {"a": ["href", "title", "rel"], "code": ["class"]}


def render_markdown_html(source: str) -> str:
    rendered = markdown.markdown(
        source,
        extensions=["extra", "sane_lists", "tables", "fenced_code"],
        output_format="html5",
    )
    return bleach.clean(
        rendered,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols={"http", "https", "mailto"},
        strip=True,
    )
