from typing import Literal

from pydantic import BaseModel, EmailStr, Field

Role = Literal["owner", "admin", "editor", "viewer"]


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class InviteCreate(BaseModel):
    email: EmailStr
    role: Literal["admin", "editor", "viewer"] = "viewer"


class MemberRolePatch(BaseModel):
    role: Literal["admin", "editor", "viewer"]


class TeamDocumentCreate(BaseModel):
    title: str = Field(default="未命名文档", max_length=300)
    content: str = ""
    folder_id: str | None = None


class TeamDocumentPatch(BaseModel):
    version: int = Field(ge=1)
    title: str | None = Field(default=None, max_length=300)
    content: str | None = None
    folder_id: str | None = None
    is_favorite: bool | None = None


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    parent_id: str | None = None


class CommentPatch(BaseModel):
    body: str | None = Field(default=None, min_length=1, max_length=10000)
    resolved: bool | None = None


class TeamFolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    parent_id: str | None = None
    sort_order: int = 0


class TeamFolderPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    parent_id: str | None = None
    sort_order: int | None = None
