from __future__ import annotations

from datetime import datetime, timezone
from threading import Timer
from time import monotonic
from typing import Any, Dict, List, Optional, Set

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import SessionLocal
from app.models.ambulance import Ambulance, AmbulanceStatus
from app.models.allocation_request import AllocationRequest, AllocationRequestStatus
from app.models.emergency import EmergencyCase, EmergencyStatus
from app.models.hospital import Hospital
from app.models.account import Account
from app.models.handoff import Handoff, HandoffStatus
from app.services.allocation import rank_hospitals
from app.services.allocation.batch_allocation_service import batch_allocate
from app.services import ambulance_service
from app.services.reservation import create_allocation_request, accept_allocation_request
from app.services.allocation.distance import haversine_distance
from app.websocket import WebSocketEvents, broadcast_event_sync


# Debounce timer for batch automation
_batch_timer: Optional[Timer] = None
_batch_emergency_ids: Set[int] = set()
_batch_timer_lock = False  # Simple reentrancy guard
_batch_auto_mode = False
_auto_mode_emergency_ids: Set[int] = set()
_workflow_mode = "AUTO"


def set_workflow_mode(mode: str) -> None:
    global _workflow_mode
    _workflow_mode = mode


def get_workflow_mode() -> str:
    return _workflow_mode


def configure_workflow_mode_from_hospitals(db: Session) -> str:
    """Restore the global demo mode from the existing per-hospital settings.

    A mix of enabled and disabled hospitals represents per-hospital approval
    preferences, not a request to disable ambulance automation globally.
    """
    hospitals = db.query(Hospital.automatic_resource_allocation).all()
    if hospitals and all(not enabled for (enabled,) in hospitals):
        set_workflow_mode("MANUAL")
    elif hospitals and any(enabled for (enabled,) in hospitals):
        set_workflow_mode("AUTO")
    return _workflow_mode


def enable_auto_mode_for_emergencies(emergency_ids: Set[int]) -> None:
    """Keep the admin's one-click mode active through replans until handoff."""
    _auto_mode_emergency_ids.update(emergency_ids)


def schedule_automated_workflow(emergency_id: int, auto_mode: bool = False) -> None:
    """
    Schedule batch automation workflow with debounce.
    When an emergency is created, we wait a short window to see if more emergencies arrive,
    then process all pending emergencies together.
    """
    global _batch_timer, _batch_emergency_ids, _batch_auto_mode

    if _workflow_mode == "MANUAL" and not auto_mode:
        return

    # Add emergency to the set
    _batch_emergency_ids.add(emergency_id)
    _batch_auto_mode = _batch_auto_mode or auto_mode

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
    global _batch_timer, _batch_emergency_ids, _batch_timer_lock, _batch_auto_mode

    # Prevent reentrancy
    if _batch_timer_lock:
        return
    _batch_timer_lock = True
    auto_mode = _batch_auto_mode
    scheduled_emergency_ids = set(_batch_emergency_ids)

    try:
        db = SessionLocal()
        try:
            configure_workflow_mode_from_hospitals(db)
            if _workflow_mode == "MANUAL" and not auto_mode:
                return
            if not scheduled_emergency_ids:
                return

            # Only process the cases that triggered this debounced batch. A
            # broad pending-case query can pull in unrelated manual requests
            # when any new case is scheduled (for example, around a capacity
            # refill), silently reserving resources for cases the dispatcher
            # did not put into this run.
            pending_emergencies = (
                db.query(EmergencyCase)
                .filter(
                    EmergencyCase.id.in_(scheduled_emergency_ids),
                    EmergencyCase.status.in_([EmergencyStatus.CREATED, EmergencyStatus.SEARCHING]),
                    ~EmergencyCase.allocation_requests.any(
                        AllocationRequest.status == AllocationRequestStatus.ACCEPTED
                    ),
                )
                .all()
            )

            if not pending_emergencies:
                return

            for emergency in pending_emergencies:
                _mark_searching(db, emergency)

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
                    case_auto_mode = auto_mode or eid in _auto_mode_emergency_ids
                    if not hospital.automatic_resource_allocation and not case_auto_mode:
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
        _batch_auto_mode = False
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


def _assign_receiving_clinician(db: Session, emergency: EmergencyCase) -> str:
    """Reserve a hospital staff account for this active case and persist the name."""
    if emergency.assigned_doctor_name:
        return emergency.assigned_doctor_name

    hospital_id = ambulance_service.get_accepted_hospital_id(db, emergency.id)
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first() if hospital_id else None
    staff = db.query(Account).filter(
        Account.role == "HOSPITAL",
        Account.hospital_id == hospital_id,
        Account.active.is_(True),
    ).order_by(Account.id.asc()).all() if hospital_id else []

    active_assignments = set()
    if hospital_id:
        active_assignments = {
            name
            for (name,) in db.query(EmergencyCase.assigned_doctor_name)
            .join(AllocationRequest, AllocationRequest.emergency_case_id == EmergencyCase.id)
            .filter(
                AllocationRequest.hospital_id == hospital_id,
                AllocationRequest.status == AllocationRequestStatus.ACCEPTED,
                EmergencyCase.id != emergency.id,
                EmergencyCase.status.in_([
                    EmergencyStatus.HOSPITAL_SELECTED,
                    EmergencyStatus.EN_ROUTE,
                    EmergencyStatus.ARRIVED,
                ]),
                EmergencyCase.assigned_doctor_name.isnot(None),
            ).all()
        }

    available_staff = next((member for member in staff if member.display_name not in active_assignments), None)
    emergency.assigned_doctor_name = (
        available_staff.display_name
        if available_staff
        else f"On-call receiving clinician — {hospital.name}" if hospital
        else "On-call receiving clinician"
    )
    db.commit()
    db.refresh(emergency)
    broadcast_event_sync(
        WebSocketEvents.EMERGENCY_STATUS_UPDATED,
        {
            "emergency_id": emergency.id,
            "status": emergency.status.value,
            "assigned_doctor_name": emergency.assigned_doctor_name,
        },
    )
    return emergency.assigned_doctor_name


def _complete_arrived_handoff(db: Session, emergency: EmergencyCase) -> None:
    receiving_clinician = _assign_receiving_clinician(db, emergency)
    handoff = db.query(Handoff).filter(Handoff.emergency_case_id == emergency.id).first()
    if not handoff or handoff.status == HandoffStatus.PENDING:
        handoff = ambulance_service.start_handoff(db, emergency.id)
    if handoff.status == HandoffStatus.IN_PROGRESS:
        ambulance_service.complete_handoff(
            db,
            emergency.id,
            receiving_clinician,
            "Automatically completed after ambulance arrival and receiving clinician assignment.",
        )
        _auto_mode_emergency_ids.discard(emergency.id)


def _schedule_auto_arrival_update(emergency_id: int, ambulance_id: int, delay_seconds: int) -> None:
    if delay_seconds < 0:
        return

    started_at = monotonic()
    interval_seconds = min(2.0, max(0.5, delay_seconds / 10)) if delay_seconds else 0

    def _arrival_callback() -> None:
        db = SessionLocal()
        try:
            # A dispatcher can explicitly start automation for a single case.
            # Preserve that choice even when the hospital-wide preferences are
            # mixed or all set to manual.
            if emergency_id not in _auto_mode_emergency_ids:
                configure_workflow_mode_from_hospitals(db)
            if _workflow_mode == "MANUAL":
                return
            emergency = db.query(EmergencyCase).filter(EmergencyCase.id == emergency_id).first()
            ambulance = db.query(Ambulance).filter(Ambulance.id == ambulance_id).first()
            if not emergency or not ambulance:
                return

            if emergency.status != EmergencyStatus.EN_ROUTE:
                return
            if ambulance.status != AmbulanceStatus.EN_ROUTE:
                return

            hospital_id = ambulance_service.get_accepted_hospital_id(db, emergency_id)
            hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first() if hospital_id else None
            destination = (
                (float(hospital.latitude), float(hospital.longitude))
                if hospital and hospital.latitude is not None and hospital.longitude is not None
                else None
            )
            pickup = (
                (float(emergency.pickup_latitude), float(emergency.pickup_longitude))
                if emergency.pickup_latitude is not None and emergency.pickup_longitude is not None
                else None
            )
            start = (
                (float(ambulance.current_latitude), float(ambulance.current_longitude))
                if ambulance.current_latitude is not None and ambulance.current_longitude is not None
                else destination
            )
            progress = 1.0 if delay_seconds == 0 else min(1.0, (monotonic() - started_at) / delay_seconds)

            if start and destination:
                if pickup:
                    if progress < 0.5:
                        leg_start, leg_end, leg_progress = start, pickup, progress * 2
                    else:
                        leg_start, leg_end, leg_progress = pickup, destination, (progress - 0.5) * 2
                else:
                    leg_start, leg_end, leg_progress = start, destination, progress
                ambulance.current_latitude = leg_start[0] + (leg_end[0] - leg_start[0]) * leg_progress
                ambulance.current_longitude = leg_start[1] + (leg_end[1] - leg_start[1]) * leg_progress

            if progress < 1.0:
                current = (ambulance.current_latitude, ambulance.current_longitude)
                if current[0] is not None and current[1] is not None and destination:
                    if pickup and progress < 0.5:
                        distance_remaining_km = haversine_distance(*current, *pickup) + haversine_distance(*pickup, *destination)
                    else:
                        distance_remaining_km = haversine_distance(*current, *destination)
                else:
                    distance_remaining_km = 0.0
                db.commit()
                broadcast_event_sync(
                    WebSocketEvents.AMBULANCE_STATUS_UPDATED,
                    {
                        "ambulance_id": ambulance.id,
                        "vehicle_number": ambulance.vehicle_number,
                        "status": ambulance.status.value,
                        "emergency_id": emergency.id,
                        "current_latitude": ambulance.current_latitude,
                        "current_longitude": ambulance.current_longitude,
                        "trip_progress": round(progress, 4),
                        "trip_phase": "TO_PATIENT" if pickup and progress < 0.5 else "TO_HOSPITAL",
                        "eta_seconds_remaining": max(0, int(delay_seconds * (1 - progress))),
                        "distance_remaining_km": distance_remaining_km,
                    },
                )
                timer = Timer(interval_seconds or 0.5, _arrival_callback)
                timer.daemon = True
                timer.start()
                return

            db.commit()
            ambulance_service.update_ambulance_status(db, ambulance_id, AmbulanceStatus.ARRIVED)
            broadcast_event_sync(
                WebSocketEvents.AMBULANCE_STATUS_UPDATED,
                {
                    "ambulance_id": ambulance_id,
                    "vehicle_number": ambulance.vehicle_number,
                    "status": "ARRIVED",
                    "emergency_id": emergency_id,
                    "current_latitude": ambulance.current_latitude,
                    "current_longitude": ambulance.current_longitude,
                    "trip_progress": 1.0,
                    "trip_phase": "ARRIVED",
                    "eta_seconds_remaining": 0,
                    "distance_remaining_km": 0.0,
                },
            )

            emergency = db.query(EmergencyCase).filter(EmergencyCase.id == emergency_id).first()
            if emergency:
                _complete_arrived_handoff(db, emergency)
        except Exception:
            # If auto-arrival fails, dashboards still keep manual override actions available.
            pass
        finally:
            db.close()

    timer = Timer(interval_seconds or 0.5, _arrival_callback)
    timer.daemon = True
    timer.start()


def auto_assign_ambulance_for_emergency(db: Session, emergency_id: int) -> Dict[str, Any]:
    emergency = db.query(EmergencyCase).filter(EmergencyCase.id == emergency_id).first()
    if not emergency:
        raise HTTPException(status_code=404, detail=f"Emergency case with id {emergency_id} not found")

    # run-pending marks cases explicitly authorized for automation. Do not let
    # persisted hospital approval preferences override the dispatcher's choice.
    if emergency_id not in _auto_mode_emergency_ids:
        configure_workflow_mode_from_hospitals(db)
    if _workflow_mode == "MANUAL":
        return {"status": "manual_dispatch_pending", "reason": "workflow_mode_is_manual"}

    if emergency.assigned_ambulance_id:
        if emergency.status == EmergencyStatus.EN_ROUTE:
            _assign_receiving_clinician(db, emergency)
            delay_seconds = max(0, int(settings.AUTO_ARRIVAL_DELAY_SECONDS))
            _schedule_auto_arrival_update(emergency.id, emergency.assigned_ambulance_id, delay_seconds)
        elif emergency.status == EmergencyStatus.ARRIVED:
            _complete_arrived_handoff(db, emergency)
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
        # The demo fleet can be fully occupied by earlier active cases. Add a
        # reserve unit instead of leaving an automatic case waiting for dispatch.
        ambulance = ambulance_service.ensure_available_automatic_ambulance(db)

    updated_emergency = ambulance_service.assign_ambulance_to_emergency(db, emergency.id, ambulance.id)
    _assign_receiving_clinician(db, updated_emergency)

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
