"""Request bodies (validated at the boundary)."""
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.analytics.causes import CAUSES
from app.analytics.late_orders import check_times


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


class LateOrdersRequest(BaseModel):
    """Both default to the Order desk's settings (SAME_DAY_GRACE_UNTIL, SAME_DAY_HARD_STOP)."""
    grace_until: str | None = Field(default=None, description="Every same-day order is added until this time (HH:MM)")
    hard_stop: str | None = Field(default=None, description="Urgent orders only until this time; after it, tomorrow")

    @model_validator(mode="after")
    def _check(self):
        from app.config import get_settings

        s = get_settings()
        self.grace_until = self.grace_until or s.same_day_grace_until
        self.hard_stop = self.hard_stop or s.same_day_hard_stop
        check_times(self.grace_until, self.hard_stop)
        return self


class OrderIntakeRequest(BaseModel):
    email_text: str = Field(min_length=1, max_length=50000)
    received_at: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$",
                                    description="Override the received time (YYYY-MM-DD HH:MM)")


class DelayAlertRequest(BaseModel):
    delivery_id: str = Field(min_length=1, max_length=20)


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)


class AccountPlanRequest(BaseModel):
    client_id: str = Field(pattern=r"^C\d{3}$", examples=["C190"])


class WeeklyBriefRequest(BaseModel):
    week_of: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$",
                                description="Monday of the week (YYYY-MM-DD); default the latest week in the data")


class WeeklyBriefSendRequest(WeeklyBriefRequest):
    resend: bool = Field(default=False, description="Send again although this week's brief was already sent today. "
                                                    "Only when the server has a DEMO_TOKEN (sent as X-Demo-Token)")


class ClientReplyRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000, description="The client's reply to the address confirmation email")


class CarrierClaimRequest(BaseModel):
    carrier_id: str = Field(pattern=r"^[A-Z]$", examples=["D"])
    month: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}$", description="Delivered in this month (YYYY-MM)")


class MorningNoteRequest(BaseModel):
    day: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    warehouse: str | None = Field(default=None, pattern=r"^W\d$")
