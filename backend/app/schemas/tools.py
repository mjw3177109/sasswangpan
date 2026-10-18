from typing import Literal

from pydantic import BaseModel, Field


class AiActionInput(BaseModel):
    action: Literal["summary", "outline", "polish", "continue"]
    content: str = Field(min_length=1, max_length=200000)
