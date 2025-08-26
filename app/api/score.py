from fastapi import APIRouter, HTTPException
from ..schemas import ScoreRequest, ScoreResponse
from zxcvbn import zxcvbn

router = APIRouter()

@router.post("/score", response_model=ScoreResponse)
async def score_pw(req: ScoreRequest):
    # Não recebe password em claro, só metadados ou resultado zxcvbn do cliente
    if req.zxcvbn:
        # Consolidar resultado do cliente
        score = req.zxcvbn.get("score", 0)
        entropy = req.zxcvbn.get("entropy", 0.0)
        suggestions = req.zxcvbn.get("feedback", {}).get("suggestions", [])
    else:
        # Opcional: calcular server-side se password_metadata suficiente
        score = 0
        entropy = 0.0
        suggestions = ["Forneça resultado zxcvbn do cliente."]
    rating = ["Very weak", "Weak", "Good", "Excellent", "Excellent"][min(score, 4)]
    return ScoreResponse(
        score=score,
        entropy=entropy,
        rating=rating,
        suggestions=suggestions
    )
