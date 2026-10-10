from __future__ import annotations

from datetime import datetime, timezone
from threading import Timer
from typing import Any, Dict, List, Optional, Set

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import SessionLocal
from app.models.ambulance import Ambulance, AmbulanceStatus
from app.models.allocation_request import AllocationRequest, AllocationRequestStatus
from app.models.emergency import EmergencyCase, EmergencyStatus
from app.models.hospital import Hospital
from app.services.allocation import rank_hospitals
from app.services.allocation.batch_allocation_service import batch_allocate
from app.services import ambulance_service
from app.services.reservation import create_allocation_request, accept_allocation_request
from app.websocket import WebSocketEvents, broadcast_event_sync


# Debounce timer for batch automation
_batch_timer: Optional[Timer] = None
_batch_emergency_ids: Set[int] = set()
_batch_timer_lock = False  # Simple reentrancy guard


def schedule_automated_workflow(emergency_id: int) -> None:
    """
    Schedule batch automation workflow with debounce.
    When an emergency is created, we wait a short window to see if more emergencies arrive,
    then process all pending emergencies together.
    """
    global _batch_timer, _batch_emergency_ids

    # Add emergency to the set
    _batch_emergency_ids.add(emergency_id)

    # Cancel existing timer if any
    if _batch_timer is not None:
        _batch_timer.cancel()

    # Start new timer
    delay_seconds = 5.0  # Wait 5 seconds for more emergencies
    _batch_timer = Timer(delay_seconds, _run_batch_workflow)
    _batch_timer.daemon = True
    _batch_timer.start()


def _run_batch_workflow() -> None:
    """
    Run batch allocation for all pending emergencies collected during debounce window.
    """
    global _batch_timer, _batch_emergency_ids, _batch_timer_lock

    # Prevent reentrancy
    if _batch_timer_lock:
        return
    _batch_timer_lock = True

    try:
        db = SessionLocal()
        try:
            # Collect emergencies that are still pending (CREATED or SEARCHING) and have no accepted allocation request
            pending_emergencies = (
                db.query(EmergencyCase)
                .filter(
                    EmergencyCase.status.in_([EmergencyStatus.CREATED, EmergencyStatus.SEARCHING]),
                    ~EmergencyCase.allocation_requests.any(
                        AllocationRequest.status == AllocationRequestStatus.ACCEPTED
                    ),
                )
                .all()
            )

            if not pending_emergencies:
                return

            emergency_ids = [e.id for e in pending_emergencies]
            print(f"[BATCH AUTOMATION] Processing {len(pending_emergencies)} emergencies: {emergency_ids}")

            # Run batch allocation
            batch_result = batch_allocate(db, emergency_ids)
            print(f"[BATCH AUTOMATION] Batch result: {batch_result}")
            results = batch_result.get("results", [])

            # Process each result
            for res in results:
                eid = res["emergency_id"]
                emergency = db.query(EmergencyCase).filter(EmergencyCase.id == eid).first()
                if not emergency:
                    continue

                # Update batch outcome fields
                emergency.batch_outcome = res["status"]  # ASSIGNED or UNSERVED
                emergency.batch_explanation = res["explanation"]
                print(f"[BATCH AUTOMATION] Emergency {eid}: outcome={emergency.batch_outcome}, explanation={emergency.batch_explanation}")

                if res["status"] == "ASSIGNED":
                    hospital_id = res["assigned_hospital_id"]
                    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
                    if not hospital:
                        continue

                    # Create allocation request
                    try:
                        request = create_allocation_request(db, emergency.id, hospital_id)
                    except HTTPException as exc:
                        # If creation fails, mark as failed and leave for manual intervention
                        emergency.batch_outcome = "FAILED"
                        emergency.batch_explanation = f"Failed to create allocation request: {exc.detail}"
                        print(f"[BATCH AUTOMATION] Emergency {eid}: creation failed: {exc.detail}")
                        continue

                    # If hospital requires manual approval, do not auto-accept
                    if not hospital.automatic_resource_allocation:
                        # Leave request as PENDING; emergency stays in SEARCHING (or we could set a custom status)
                        # We'll keep batch_outcome as ASSIGNED? Actually we have not secured resources yet.
                        # Better to keep batch_outcome as PENDING_MANUAL and leave emergency in SEARCHING.
                        emergency.batch_outcome = "PENDING_MANUAL"
                        emergency.batch_explanation = (
                            f"Allocation request created for Hospital {hospital.name} awaiting manual approval."
                        )
                        # Broadcast allocation request created event (already done in create_allocation_request)
                        print(f"[BATCH AUTOMATION] Emergency {eid}: hospital requires manual approval")
                        continue

                    # Hospital auto-accepts: accept the request to reserve resources
                    try:
                        accept_allocation_request(db, request.id)
                    except HTTPException as exc:
                        # If acceptance fails, mark as failed
                        emergency.batch_outcome = "FAILED"
                        emergency.batch_explanation = f"Failed to accept allocation request: {exc.detail}"
                        print(f"[BATCH AUTOMATION] Emergency {eid}: acceptance failed: {exc.detail}")
                        # The request remains PENDING? Actually accept_allocation_request would have raised and not changed status.
                        # We'll leave request as PENDING for manual intervention.
                        continue
                    # If acceptance succeeded, events are broadcast inside accept_allocation_request
                    print(f"[BATCH AUTOMATION] Emergency {eid}: allocated to hospital {hospital_id} and accepted")

                # For UNSERVED or FAILED or PENDING_MANUAL, we leave emergency in SEARCHING status
                # (dispatcher can intervene). No status change needed.

            db.commit()
            print("[BATCH AUTOMATION] Database commit completed")
        finally:
            db.close()
    finally:
        # Reset batch state
        _batch_timer = None
        _batch_emergency_ids.clear()
        _batch_timer_lock = False
        print("[BATCH AUTOMATION] Batch workflow finished, state reset")


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
    """
    Kept for backward compatibility (e.g., manual retry endpoint).
    Now delegates to batch workflow for single emergency (will still work via debounce).
    """
    # For single emergency, we still schedule the batch workflow (which may include other emergencies).
    schedule_automated_workflow(emergency_id)
    # Return immediate status; actual processing happens later.
    return {
        "status": "scheduled",
        "reason": "batch_debounce_scheduled",
    }