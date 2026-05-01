from datetime import datetime

from pydantic import BaseModel, model_validator

from app.models.training import AbsenceReason


class TrainingDrillResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    training_id: int
    drill_id: int
    position: int
    notes: str | None
    drill_title: str | None = None
    drill_type: str | None = None


class TrainingAttendanceResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    training_id: int
    player_id: int
    attended: bool
    is_late: bool = False
    absence_reason: AbsenceReason | None = None
    notes: str | None = None
    player_first_name: str | None = None
    player_last_name: str | None = None


class TrainingResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    team_id: int
    season_id: int
    date: datetime
    title: str
    notes: str | None
    created_by: int | None
    created_at: datetime
    archived_at: datetime | None
    training_drills: list[TrainingDrillResponse] = []
    training_attendances: list[TrainingAttendanceResponse] = []


class TrainingCreate(BaseModel):
    title: str
    date: datetime
    season_id: int
    notes: str | None = None


class TrainingUpdate(BaseModel):
    title: str | None = None
    date: datetime | None = None
    notes: str | None = None


class TrainingDrillAdd(BaseModel):
    drill_id: int
    notes: str | None = None


class TrainingDrillReorderItem(BaseModel):
    drill_id: int
    position: int


class AttendanceUpdate(BaseModel):
    player_id: int
    attended: bool
    is_late: bool = False
    absence_reason: AbsenceReason | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def check_consistency(self) -> "AttendanceUpdate":
        if self.attended:
            if self.absence_reason is not None:
                raise ValueError("absence_reason debe ser null si attended=True")
        else:
            if self.absence_reason is None:
                raise ValueError("absence_reason es obligatorio si attended=False")
            if self.is_late:
                raise ValueError("is_late debe ser false si attended=False")
        return self
