import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.services.gemini.emergency_analyzer import (
    validate_and_sanitize_analysis,
    analyze_emergency_description,
)

@pytest.fixture
def client():
    return TestClient(app)

def test_1_valid_gemini_sanitization():
    """Test 1: Valid raw dict is sanitized correctly."""
    raw = {
        "severity": "CRITICAL",
        "patient_age": 62,
        "summary": "Trauma patient with respiratory distress",
        "required_resources": [
            {"resource_type": "ICU_BED", "quantity": 1},
            {"resource_type": "VENTILATOR", "quantity": 1},
            {"resource_type": "TRAUMA_BED", "quantity": 1},
        ],
        "reasoning": [
            "Severe bleeding indicates critical condition",
            "Difficulty breathing requires ventilator"
        ]
    }
    result = validate_and_sanitize_analysis(raw, "62 year old male accident")

    assert result["severity"] == "CRITICAL"
    assert result["patient_age"] == 62
    assert len(result["required_resources"]) == 3
    assert result["required_resources"][0]["resource_type"] == "ICU_BED"
    assert len(result["reasoning"]) == 2

def test_2_invalid_resource_type_filtered():
    """Test 2: Invalid resource types like MAGIC_BED are filtered out."""
    raw = {
        "severity": "HIGH",
        "patient_age": 45,
        "summary": "Chest pain case",
        "required_resources": [
            {"resource_type": "OXYGEN_BED", "quantity": 2},
            {"resource_type": "MAGIC_BED", "quantity": 5},
            {"resource_type": "INVALID_XRAY", "quantity": 1},
        ],
        "reasoning": ["Chest pain requires oxygen"]
    }
    result = validate_and_sanitize_analysis(raw, "45 year old male chest pain")

    # MAGIC_BED and INVALID_XRAY should be filtered out
    assert len(result["required_resources"]) == 1
    assert result["required_resources"][0]["resource_type"] == "OXYGEN_BED"
    assert result["required_resources"][0]["quantity"] == 2

def test_3_invalid_severity_fallback():
    """Test 3: Invalid severity string falls back to HIGH."""
    raw = {
        "severity": "EXTREME_SUPER_CRITICAL",
        "patient_age": 30,
        "summary": "Test summary",
        "required_resources": [{"resource_type": "GENERAL_BED", "quantity": 1}],
        "reasoning": ["Test reason"]
    }
    result = validate_and_sanitize_analysis(raw, "Test description")

    assert result["severity"] == "HIGH"

def test_4_malformed_response_handling(client):
    """Test 4: Gemini model throwing exception seamlessly utilizes resilient fallback analyzer."""
    with patch("app.services.gemini.emergency_analyzer.get_genai_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = RuntimeError("API rate limit exceeded")
        mock_get_client.return_value = mock_client

        response = client.post(
            "/api/ai/analyze-emergency",
            json={"description": "62 year old male highway accident with severe bleeding"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["severity"] == "CRITICAL"
        assert len(data["required_resources"]) > 0


def test_5_successful_api_endpoint(client):
    """Test 5: Full endpoint invocation returns expected structured schema when Gemini succeeds."""
    mock_genai_response = MagicMock()
    mock_genai_response.text = """{
        "severity": "CRITICAL",
        "patient_age": 62,
        "summary": "Critical trauma patient with respiratory distress",
        "required_resources": [
            {"resource_type": "ICU_BED", "quantity": 1},
            {"resource_type": "VENTILATOR", "quantity": 1},
            {"resource_type": "TRAUMA_BED", "quantity": 1}
        ],
        "reasoning": [
            "Severe bleeding indicates critical condition",
            "Difficulty breathing requires ventilator",
            "Chest trauma requires trauma bed"
        ]
    }"""

    with patch("app.services.gemini.emergency_analyzer.get_genai_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_genai_response
        mock_get_client.return_value = mock_client

        response = client.post(
            "/api/ai/analyze-emergency",
            json={"description": "62 year old male involved in a highway accident. Severe bleeding, difficulty breathing and suspected chest trauma."}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["severity"] == "CRITICAL"
        assert data["patient_age"] == 62
        assert len(data["required_resources"]) == 3
        assert len(data["reasoning"]) == 3
