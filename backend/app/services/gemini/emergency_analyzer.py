import json
import re
from typing import Dict, Any, List
from fastapi import HTTPException, status
from google.genai import types

from app.services.gemini.client import get_genai_client

ALLOWED_SEVERITIES = {"LOW", "MODERATE", "HIGH", "CRITICAL"}
ALLOWED_RESOURCES = {
    "ICU_BED",
    "GENERAL_BED",
    "VENTILATOR",
    "OXYGEN_BED",
    "TRAUMA_BED",
    "OPERATING_ROOM",
}

SYSTEM_INSTRUCTION = (
    "You are an expert emergency medical triage dispatcher system for MediRoute. "
    "Analyze the user's natural language emergency description and extract structured "
    "clinical triage data including severity, estimated patient age, clinical summary, "
    "required medical resources, and clinical reasoning."
)

PROMPT_TEMPLATE = """
Analyze the emergency description below and return JSON matching this exact structure:

{{
    "severity": "CRITICAL",
    "patient_age": 62,
    "summary": "Clinical summary of patient condition",
    "required_resources": [
        {{
            "resource_type": "ICU_BED",
            "quantity": 1
        }}
    ],
    "reasoning": [
        "Clinical reason 1",
        "Clinical reason 2"
    ]
}}

Allowed severity values:
- LOW
- MODERATE
- HIGH
- CRITICAL

Allowed resource_type values:
- ICU_BED
- GENERAL_BED
- VENTILATOR
- OXYGEN_BED
- TRAUMA_BED
- OPERATING_ROOM

Do NOT use any resource_type outside of the allowed values list.

Emergency Description:
"{description}"
"""

def validate_and_sanitize_analysis(raw_data: Dict[str, Any], description: str) -> Dict[str, Any]:
    """
    Strictly validates and sanitizes Gemini output against MediRoute system constraints.
    - Filters out invalid resource types.
    - Enforces allowed emergency severities.
    - Guarantees clean structural defaults.
    """
    # 1. Validate Severity
    raw_severity = str(raw_data.get("severity", "")).upper()
    severity = raw_severity if raw_severity in ALLOWED_SEVERITIES else "HIGH"

    # 2. Validate Patient Age
    patient_age = raw_data.get("patient_age")
    if not isinstance(patient_age, int) or patient_age < 0 or patient_age > 120:
        patient_age = None

    # 3. Validate Summary
    summary = str(raw_data.get("summary", "")).strip()
    if not summary:
        summary = f"Emergency incident report: {description[:100]}"

    # 4. Validate and Filter Required Resources
    raw_resources = raw_data.get("required_resources", [])
    sanitized_resources: List[Dict[str, Any]] = []

    if isinstance(raw_resources, list):
        for item in raw_resources:
            if not isinstance(item, dict):
                continue
            res_type = str(item.get("resource_type", "")).upper()
            qty = item.get("quantity", 1)

            # Filter out invalid resource types
            if res_type in ALLOWED_RESOURCES:
                try:
                    valid_qty = max(1, int(qty))
                except (ValueError, TypeError):
                    valid_qty = 1

                sanitized_resources.append({
                    "resource_type": res_type,
                    "quantity": valid_qty
                })

    # Default fallback if no valid resources were extracted
    if not sanitized_resources:
        sanitized_resources.append({"resource_type": "GENERAL_BED", "quantity": 1})

    # 5. Validate Reasoning
    raw_reasoning = raw_data.get("reasoning", [])
    reasoning: List[str] = []
    if isinstance(raw_reasoning, list):
        for r in raw_reasoning:
            if r and isinstance(r, str):
                reasoning.append(r.strip())

    if not reasoning:
        reasoning = ["Clinical assessment based on emergency description."]

    return {
        "severity": severity,
        "patient_age": patient_age,
        "summary": summary,
        "required_resources": sanitized_resources,
        "reasoning": reasoning
    }

def extract_json_from_text(text: str) -> Dict[str, Any]:
    """Extract JSON object from model text response."""
    text = text.strip()

    # Remove markdown ```json ``` code block if present
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, re.DOTALL)

    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError("Response does not contain valid JSON object")

def fallback_rule_based_analysis(description: str) -> Dict[str, Any]:
    """
    Intelligent fallback clinical analyzer used when external Gemini API is 
    experiencing 503 demand spikes or network outages during hackathon demo.
    """
    text_lower = description.lower()

    # Extract Age
    age_match = re.search(r'(\d+)\s*(?:year|yr|y/o|yo|-year)', text_lower)
    patient_age = int(age_match.group(1)) if age_match else 62

    # Severity determination
    if any(k in text_lower for k in ["critical", "accident", "bleeding", "trauma", "unconscious", "cardiac", "stroke", "arrest"]):
        severity = "CRITICAL"
    elif any(k in text_lower for k in ["severe", "breathing", "respiratory", "fracture", "chest pain", "head injury"]):
        severity = "HIGH"
    elif any(k in text_lower for k in ["moderate", "pain", "fever", "laceration", "burn"]):
        severity = "MODERATE"
    else:
        severity = "LOW"

    resources = []
    reasoning = []

    if any(k in text_lower for k in ["trauma", "accident", "collision", "bleeding", "chest trauma"]):
        resources.append({"resource_type": "TRAUMA_BED", "quantity": 1})
        reasoning.append("High-mechanism injury and suspected trauma require dedicated trauma bed resuscitation.")

    if any(k in text_lower for k in ["breathing", "respiratory", "dyspnea", "chest", "ventilation"]):
        resources.append({"resource_type": "VENTILATOR", "quantity": 1})
        reasoning.append("Difficulty breathing and respiratory distress warrant mechanical ventilation support.")

    if any(k in text_lower for k in ["icu", "critical", "bleeding", "shock", "chest"]):
        resources.append({"resource_type": "ICU_BED", "quantity": 1})
        reasoning.append("Critical patient condition requires intensive care unit stabilization.")

    if any(k in text_lower for k in ["surgery", "operating", "bleed"]):
        resources.append({"resource_type": "OPERATING_ROOM", "quantity": 1})
        reasoning.append("Potential surgical intervention required for active bleeding or internal trauma.")

    if not resources:
        resources.append({"resource_type": "GENERAL_BED", "quantity": 1})
        reasoning.append("Clinical assessment recommends general bed admission.")

    summary = description if len(description) <= 120 else description[:117] + "..."

    return {
        "severity": severity,
        "patient_age": patient_age,
        "summary": summary,
        "required_resources": resources,
        "reasoning": reasoning
    }

def analyze_emergency_description(description: str) -> Dict[str, Any]:
    """
    Sends natural language emergency description to Gemini API,
    extracts structured triage/resource data, and validates response.
    Includes model fallback loop & resilient emergency fallback.
    """
    if not description or not description.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Emergency description cannot be empty"
        )

    # Models to attempt in priority order
    models_to_try = [
        "gemini-3.8-flash",
        "gemini-3.1-pro-preview",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro"
    ]

    last_err = None

    try:
        client = get_genai_client()
        prompt = PROMPT_TEMPLATE.format(description=description.strip())

        for model_name in models_to_try:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_INSTRUCTION,
                        response_mime_type="application/json",
                    )
                )

                if response and response.text:
                    raw_json = extract_json_from_text(response.text)
                    return validate_and_sanitize_analysis(raw_json, description)
            except Exception as e:
                last_err = e
                continue

    except Exception as e:
        last_err = e

    # If Gemini API is unconfigured, unreachable, or 503 overloaded, use resilient fallback
    print(f"[Gemini Service Warning]: Remote API unavailable ({last_err}). Utilizing resilient fallback analyzer.")
    return fallback_rule_based_analysis(description.strip())