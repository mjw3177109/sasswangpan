import re

from pydantic import BaseModel, Field, field_validator


class PublishInput(BaseModel):
    slug: str = Field(min_length=3, max_length=180)

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*[a-z0-9]", normalized):
            raise ValueError("slug 只能包含小写字母、数字和连字符")
        return normalized
