from fastapi import APIRouter
from ..schemas import ScoreRequest, ScoreResponse

router = APIRouter()

@router.post("/score", response_model=ScoreResponse)
async def score_pw(req: ScoreRequest):
    # Only receives zxcvbn result or metadata, never the password itself
    if req.zxcvbn:
        score = req.zxcvbn.get("score", 0)
        entropy = req.zxcvbn.get("entropy", 0.0)
        suggestions = req.zxcvbn.get("feedback", {}).get("suggestions", [])
    else:
        score = 0
        entropy = 0.0
        suggestions = ["Please provide zxcvbn result from client."]
    
    rating = ["Very weak", "Weak", "Good", "Excellent", "Excellent"][min(score, 4)]
    
    return ScoreResponse(
        score=score,
        entropy=entropy,
        rating=rating,
        suggestions=suggestions
    )
