from pydantic import BaseModel, Field


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    parent_id: str | None = None


class FolderPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    parent_id: str | None = None
    sort_order: int | None = None


class DocumentCreate(BaseModel):
    title: str = Field(default="未命名文档", max_length=300)
    content: str = ""
    folder_id: str | None = None


class DocumentPatch(BaseModel):
    version: int = Field(ge=1)
    title: str | None = Field(default=None, max_length=300)
    content: str | None = None
    folder_id: str | None = None
    is_favorite: bool | None = None
