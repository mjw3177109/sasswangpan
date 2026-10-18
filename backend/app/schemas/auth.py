from typing import Literal

from pydantic import BaseModel, EmailStr, Field

EmailPurpose = Literal["register", "login", "reset"]


class SendEmailCodeInput(BaseModel):
    email: EmailStr
    purpose: EmailPurpose


class RegisterInput(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=100)


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class EmailCodeLoginInput(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class ResetPasswordInput(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = Field(min_length=8, max_length=128)


class UserData(BaseModel):
    id: str
    email: str
    name: str
    avatar_url: str | None = None


class WorkspaceData(BaseModel):
    id: str
    name: str
    kind: str
    unfiled_name: str = "未归档"


class AuthData(BaseModel):
    user: UserData
    workspace: WorkspaceData
