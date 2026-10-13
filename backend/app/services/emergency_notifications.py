"""Deliver hospital assignment details to a user's saved emergency contacts."""
import base64
import logging
import re
import smtplib
from email.message import EmailMessage
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.account import Account
from app.models.emergency import EmergencyCase
from app.models.emergency_contact import EmergencyContact
from app.models.hospital import Hospital

logger = logging.getLogger(__name__)


def notify_emergency_contacts(db: Session, emergency: EmergencyCase, hospital: Hospital) -> None:
    if not emergency.created_by_account_id:
        return
    contacts = db.query(EmergencyContact).filter_by(account_id=emergency.created_by_account_id).all()
    if not contacts:
        return
    account = db.get(Account, emergency.created_by_account_id)
    location = f"{emergency.pickup_latitude}, {emergency.pickup_longitude}"
    message = (
        f"MediRoute emergency update for case {emergency.case_number}: "
        f"{account.display_name if account else 'Patient'} has been allocated to {hospital.name}. "
        f"Hospital address: {hospital.address or 'Address unavailable'}. Pickup location: {location}. "
        f"Severity: {emergency.severity.value if hasattr(emergency.severity, 'value') else emergency.severity}."
    )
    for contact in contacts:
        try:
            if contact.contact_type == "EMAIL":
                _send_email(contact.value, emergency.case_number, message)
            elif contact.contact_type == "PHONE":
                _send_sms(contact.value, message)
        except Exception:
            # A third-party delivery outage must not roll back an accepted allocation.
            logger.exception("Emergency notification failed for case %s contact %s", emergency.case_number, contact.id)


def _send_email(recipient: str, case_number: str, body: str) -> None:
    if not (settings.SMTP_HOST and settings.SMTP_FROM_EMAIL):
        logger.warning("SMTP is not configured; cannot send emergency assignment email")
        return
    message = EmailMessage()
    message["Subject"] = f"MediRoute hospital assigned · {case_number}"
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = recipient
    message.set_content(body)
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
        if settings.SMTP_USE_TLS:
            server.starttls()
        if settings.SMTP_USERNAME:
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD or "")
        server.send_message(message)


def _send_sms(recipient: str, body: str) -> None:
    sid, token, sender = settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN, settings.TWILIO_FROM_NUMBER
    if not (sid and token and sender):
        logger.warning("Twilio is not configured; cannot send emergency assignment SMS")
        return
    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    credentials = base64.b64encode(f"{sid}:{token}".encode()).decode()
    request = Request(
        url,
        data=urlencode({"To": re.sub(r"[ ()-]", "", recipient), "From": sender, "Body": body}).encode(),
        headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        if response.status >= 300:
            raise RuntimeError(f"Twilio returned HTTP {response.status}")
