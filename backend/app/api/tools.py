import re

from fastapi import APIRouter, Depends, Request

from app.api.deps import get_current_user
from app.core.responses import success
from app.models import User
from app.schemas.tools import AiActionInput

router = APIRouter(tags=["tools"])

TEMPLATES = [
    {
        "id": "blank",
        "name": "空白文档",
        "description": "从零开始写作",
        "content": "# 未命名文档\n\n",
    },
    {
        "id": "weekly",
        "name": "周报",
        "description": "目标、进展、问题、下周计划",
        "content": (
            "# 本周周报\n\n## 本周目标\n\n- \n\n## 已完成\n\n- \n"
            "\n## 问题与风险\n\n- \n\n## 下周计划\n\n- "
        ),
    },
    {
        "id": "meeting",
        "name": "会议纪要",
        "description": "会议结论与行动项",
        "content": (
            "# 会议纪要\n\n**时间：** \n\n**参与人：** \n\n## 讨论要点\n\n- \n"
            "\n## 结论\n\n- \n\n## Action Items\n\n- [ ] "
        ),
    },
    {
        "id": "prd",
        "name": "PRD",
        "description": "产品需求文档骨架",
        "content": (
            "# 产品需求文档\n\n## 背景\n\n## 用户问题\n\n## 目标\n\n## 功能范围\n\n## 验收标准\n"
        ),
    },
]


@router.get("/templates")
def templates(request: Request, _user: User = Depends(get_current_user)) -> dict[str, object]:
    return success(TEMPLATES, request=request)


def local_ai(action: str, content: str) -> str:
    text = content.strip()
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if action == "summary":
        plain = [line.lstrip("#>-* ") for line in lines if not line.startswith("---")]
        return "## 摘要\n\n" + "\n".join(f"- {line[:160]}" for line in plain[:6])
    if action == "outline":
        headings = [line for line in lines if line.startswith("#")]
        if headings:
            return "## 内容大纲\n\n" + "\n".join(
                f"- {line.lstrip('# ').strip()}" for line in headings
            )
        sentences = [part.strip() for part in re.split(r"[。！？.!?]", text) if part.strip()]
        return "## 内容大纲\n\n" + "\n".join(f"- {sentence[:80]}" for sentence in sentences[:8])
    if action == "polish":
        cleaned = re.sub(r"[ \t]+", " ", text)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
        return cleaned
    last = next((line.lstrip("# ") for line in reversed(lines) if line), "当前主题")
    return f"\n\n## 继续思考：{last[:40]}\n\n- 关键事实：\n- 核心判断：\n- 下一步行动：\n"


@router.post("/ai/action")
def ai_action(
    payload: AiActionInput,
    request: Request,
    _user: User = Depends(get_current_user),
) -> dict[str, object]:
    return success(
        {
            "action": payload.action,
            "result": local_ai(payload.action, payload.content),
            "provider": "local-assist",
        },
        request=request,
    )
