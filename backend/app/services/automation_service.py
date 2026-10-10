from __future__ import annotations

from datetime import datetime, timezone
from threading import Timer
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import SessionLocal
from app.models.ambulance import Ambulance, AmbulanceStatus
from app.models.allocation_request import AllocationRequest, AllocationRequestStatus
from app.models.emergency import EmergencyCase, EmergencyStatus
from app.models.hospital import Hospital
from app.services.allocation import rank_hospitals
from app.services import ambulance_service
from app.websocket import WebSocketEvents, broadcast_event_sync


def schedule_automated_workflow(emergency_id: int) -> None:
    def _runner() -> None:
        db = SessionLocal()
        try:
            run_automated_emergency_workflow(db, emergency_id)
        finally:
            db.close()

    timer = Timer(0, _runner)
    timer.daemon = True
    timer.start()


def _emit_intervention_required(
    emergency: EmergencyCase,
    reason: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    payload: Dict[str, Any] = {
        "emergency_id": emergency.id,
        "case_number": emergency.case_number,
        "status": emergency.status.value if hasattr(emergency.status, "value") else str(emergency.status),
        "reason": reason,
        "message": message,
    }
    if details:
        payload["details"] = details

    broadcast_event_sync(WebSocketEvents.AUTOMATION_INTERVENTION_REQUIRED, payload)


def _mark_searching(db: Session, emergency: EmergencyCase) -> None:
    if emergency.status == EmergencyStatus.CREATED:
        emergency.status = EmergencyStatus.SEARCHING
        db.commit()
        db.refresh(emergency)
        broadcast_event_sync(
            WebSocketEvents.EMERGENCY_STATUS_UPDATED,
            {
                "emergency_id": emergency.id,
                "case_number": emergency.case_number,
                "status": emergency.status.value if hasattr(emergency.status, "value") else str(emergency.status),
            },
        )


def _pick_available_ambulance(db: Session) -> Optional[Ambulance]:
    return (
        db.query(Ambulance)
        .filter(Ambulance.status == AmbulanceStatus.AVAILABLE)
        .order_by(Ambulance.id.asc())
        .first()
    )


def _schedule_auto_arrival_update(emergency_id: int, ambulance_id: int, delay_seconds: int) -> None:
    if delay_seconds < 0:
        return

    def _arrival_callback() -> None:
        db = SessionLocal()
        try:
            emergency = db.query(EmergencyCase).filter(EmergencyCase.id == emergency_id).first()
            ambulance = db.query(Ambulance).filter(Ambulance.id == ambulance_id).first()
            if not emergency or not ambulance:
                return

            if emergency.status != EmergencyStatus.EN_ROUTE:
                return
            if ambulance.status != AmbulanceStatus.EN_ROUTE:
                return

            ambulance_service.update_ambulance_status(db, ambulance_id, AmbulanceStatus.ARRIVED)
        except Exception:
            # If auto-arrival fails, dashboards still keep manual override actions available.
            pass
        finally:
            db.close()

    timer = Timer(delay_seconds, _arrival_callback)
    timer.daemon = True
    timer.start()


def auto_assign_ambulance_for_emergency(db: Session, emergency_id: int) -> Dict[str, Any]:
    emergency = db.query(EmergencyCase).filter(EmergencyCase.id == emergency_id).first()
    if not emergency:
        raise HTTPException(status_code=404, detail=f"Emergency case with id {emergency_id} not found")

    if emergency.assigned_ambulance_id:
        return {
            "status": "already_assigned",
            "assigned_ambulance_id": emergency.assigned_ambulance_id,
        }

    if emergency.status not in [EmergencyStatus.HOSPITAL_SELECTED, EmergencyStatus.EN_ROUTE]:
        return {
            "status": "skipped",
            "reason": "emergency_not_ready_for_ambulance",
        }

    ambulance = _pick_available_ambulance(db)
    if not ambulance:
        _emit_intervention_required(
            emergency,
            reason="AMBULANCE_UNAVAILABLE",
            message="No available ambulance could be auto-assigned. Dispatcher action required.",
        )
        return {
            "status": "manual_intervention_required",
            "reason": "AMBULANCE_UNAVAILABLE",
        }

    updated_emergency = ambulance_service.assign_ambulance_to_emergency(db, emergency.id, ambulance.id)

    delay_seconds = max(0, int(settings.AUTO_ARRIVAL_DELAY_SECONDS))
    _schedule_auto_arrival_update(updated_emergency.id, ambulance.id, delay_seconds)

    return {
        "status": "assigned",
        "assigned_ambulance_id": ambulance.id,
        "auto_arrival_delay_seconds": delay_seconds,
    }


def _cancel_request_after_auto_failure(
    db: Session,
    request: AllocationRequest,
    reason: str,
) -> None:
    request.status = AllocationRequestStatus.CANCELLED
    request.rejection_reason = reason
    request.responded_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(request)

    broadcast_event_sync(
        WebSocketEvents.ALLOCATION_REQUEST_REJECTED,
        {
            "request_id": request.id,
            "emergency_id": request.emergency_case_id,
            "hospital_id": request.hospital_id,
            "status": "CANCELLED",
            "rejection_reason": reason,
            "responded_at": request.responded_at.isoformat() if request.responded_at else None,
        },
    )


def run_automated_emergency_workflow(db: Session, emergency_id: int) -> Dict[str, Any]:
    from app.services.reservation import create_allocation_request, accept_allocation_request

    emergency = db.query(EmergencyCase).filter(EmergencyCase.id == emergency_id).first()
    if not emergency:
        raise HTTPException(status_code=404, detail=f"Emergency case with id {emergency_id} not found")

    if emergency.status in [EmergencyStatus.CANCELLED, EmergencyStatus.HANDOFF_COMPLETED]:
        return {
            "status": "skipped",
            "reason": "terminal_emergency_state",
            "emergency_status": emergency.status.value,
        }

    _mark_searching(db, emergency)

    ranking = rank_hospitals(db, emergency_id)
    recommendations: List[Dict[str, Any]] = ranking.get("recommendations", [])
    if not recommendations:
        _emit_intervention_required(
            emergency,
            reason="NO_ELIGIBLE_HOSPITAL",
            message="No eligible hospital found. Dispatcher override is required.",
        )
        return {
            "status": "manual_intervention_required",
            "reason": "NO_ELIGIBLE_HOSPITAL",
        }

    attempted_hospitals: List[int] = []
    pending_manual_request_id: Optional[int] = None

    for recommendation in recommendations:
        hospital_id = int(recommendation["hospital_id"])
        hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
        if not hospital or hospital.status != "Active":
            continue

        attempted_hospitals.append(hospital_id)

        try:
            request = create_allocation_request(db, emergency.id, hospital_id)
        except HTTPException:
            continue

        if not hospital.automatic_resource_allocation:
            pending_manual_request_id = request.id
            _emit_intervention_required(
                emergency,
                reason="HOSPITAL_MANUAL_APPROVAL_REQUIRED",
                message=(
                    f"Hospital '{hospital.name}' requires manual approval. "
                    "Waiting for hospital acceptance/rejection."
                ),
                details={"hospital_id": hospital.id, "request_id": request.id},
            )
            break

        try:
            accept_allocation_request(db, request.id)
        except HTTPException as exc:
            _cancel_request_after_auto_failure(
                db,
                request,
                reason=f"AUTO_ACCEPT_FAILED: {exc.detail}",
            )
            continue

        ambulance_result = auto_assign_ambulance_for_emergency(db, emergency.id)
        return {
            "status": "completed",
            "hospital_id": hospital.id,
            "request_id": request.id,
            "ambulance": ambulance_result,
        }

    if pending_manual_request_id:
        return {
            "status": "waiting_hospital_manual_approval",
            "request_id": pending_manual_request_id,
            "attempted_hospitals": attempted_hospitals,
        }

    _emit_intervention_required(
        emergency,
        reason="AUTO_ALLOCATION_FAILED",
        message="Automated allocation could not complete. Dispatcher override is required.",
        details={"attempted_hospitals": attempted_hospitals},
    )

    return {
        "status": "manual_intervention_required",
        "reason": "AUTO_ALLOCATION_FAILED",
        "attempted_hospitals": attempted_hospitals,
    }
