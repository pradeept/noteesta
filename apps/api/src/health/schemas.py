from src.common.schemas.schemas import ApiModel


class HealthResponse(ApiModel):
    status: str
    dependencies: dict[str, str]
