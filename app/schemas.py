from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class PwnedSuffix(BaseModel):
    suffix: str
    count: int

class PwnedRequest(BaseModel):
    prefix: str = Field(..., min_length=5, max_length=5, pattern="^[0-9a-fA-F]{5}$")

class PwnedResponse(BaseModel):
    prefix: str
    results: List[PwnedSuffix]
    cache_hit: bool

class PwnedCheckRequest(BaseModel):
    prefix: str = Field(..., min_length=5, max_length=5, pattern="^[0-9a-fA-F]{5}$")
    suffix: Optional[str] = Field(None, min_length=35, max_length=35, pattern="^[0-9a-fA-F]{35}$")

class PwnedCheckResponse(BaseModel):
    pwned: Optional[bool] = None
    count: Optional[int] = None
    prefix: Optional[str] = None
    results: Optional[List[PwnedSuffix]] = None

class ScoreRequest(BaseModel):
    password_metadata: Optional[Dict[str, Any]] = None
    zxcvbn: Optional[Dict[str, Any]] = None

class ScoreResponse(BaseModel):
    score: int
    entropy: float
    rating: str
    suggestions: List[str]
