from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict[str, bool | str]:
    return {"ok": True, "service": "tautology-api"}
