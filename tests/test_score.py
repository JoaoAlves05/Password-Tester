import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_score_endpoint():
    resp = client.post("/api/v1/score", json={
        "zxcvbn": {"score": 3, "entropy": 35.0, "feedback": {"suggestions": ["Use more symbols"]}}
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["score"] == 3
    assert data["entropy"] == 35.0
    assert "Use more symbols" in data["suggestions"][0]
