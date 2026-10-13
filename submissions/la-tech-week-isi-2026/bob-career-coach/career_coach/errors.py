"""Stable errors that an HTTP or subprocess adapter can turn into UI messages."""


class CareerCoachError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code

    def as_dict(self) -> dict:
        return {"code": self.code, "message": str(self)}
