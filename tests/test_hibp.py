import pytest
import asyncio
from app.core import hibp

@pytest.mark.asyncio
async def test_parse_hibp_response():
    text = "ABCDEF1234567890:10\n1234567890ABCDEF:5"
    results = hibp.parse_hibp_response(text)
    assert results == [
        {"suffix": "ABCDEF1234567890", "count": 10},
        {"suffix": "1234567890ABCDEF", "count": 5},
    ]
