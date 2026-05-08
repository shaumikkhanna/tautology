from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.games.starnim.logic import Starnim

router = APIRouter(tags=["starnim"])


class ComputerMoveRequest(BaseModel):
    node_states: list[bool] = Field(min_length=3)
    difficulty: float = Field(ge=0.5, le=1)


class ComputerMoveResponse(BaseModel):
    move: list[int]


@router.post("/computer-move", response_model=ComputerMoveResponse)
def computer_move(payload: ComputerMoveRequest) -> ComputerMoveResponse:
    if len(payload.node_states) % 2 == 0:
        raise HTTPException(status_code=400, detail="Starnim requires an odd number of nodes.")

    try:
        game = Starnim(node_states=payload.node_states)
        move = game.next_move_node(error_probability=1 - payload.difficulty)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return ComputerMoveResponse(move=move)
