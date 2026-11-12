from pydantic import EmailStr, Field, field_validator

from src.common.schemas.schemas import ApiModel


class EmailInput(ApiModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower()


class LoginInput(EmailInput):
    password: str = Field(min_length=1, max_length=128)


class RegisterInput(EmailInput):
    display_name: str = Field(min_length=1, max_length=100)


class TokenInput(ApiModel):
    token: str = Field(min_length=20, max_length=512)


class ResetInput(TokenInput):
    password: str = Field(min_length=12, max_length=128)


class VerifyEmailInput(TokenInput):
    password: str = Field(min_length=12, max_length=128)


class User(ApiModel):
    id: str
    email: str
    display_name: str
    email_verified: bool
    login_methods: list[str]


class Tokens(ApiModel):
    access_token: str
    expires_in: int
    user: User
