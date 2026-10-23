"""Request bodies (validated at the boundary)."""
from pydantic import BaseModel, Field, field_validator

from app.analytics.causes import CAUSES


class SimulateRequest(BaseModel):
    fixes: dict[str, float] = Field(default_factory=dict,
                                    description="cause -> effectiveness between 0 and 1",
                                    examples=[{"incomplete_address": 1.0, "weak_carrier_lane": 0.5}])

    @field_validator("fixes")
    @classmethod
    def _check(cls, v: dict[str, float]):
        unknown = sorted(set(v) - set(CAUSES))
        if unknown:
            raise ValueError(f"unknown cause(s) {unknown}; valid: {list(CAUSES)}")
        bad = [c for c, e in v.items() if not 0 <= e <= 1]
        if bad:
            raise ValueError(f"effectiveness must be between 0 and 1 for {bad}")
        return v


class OrderIntakeRequest(BaseModel):
    email_text: str = Field(min_length=1, max_length=50000)
    received_at: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$",
                                    description="Override the received time (YYYY-MM-DD HH:MM)")


class DelayAlertRequest(BaseModel):
    delivery_id: str = Field(min_length=1, max_length=20)


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
