import logging
import smtplib
from email.message import EmailMessage

from .config import get_settings

log = logging.getLogger("nextround")


def send_mail(to: str, subject: str, body: str) -> None:
    s = get_settings()
    if not s.smtp_host:
        # Développement : le lien s'affiche dans la console du backend.
        log.info("E-mail (SMTP non configuré) pour %s : %s\n%s", to, subject, body)
        return
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = s.mail_from, to, subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as smtp:
            smtp.starttls()
            if s.smtp_user:
                smtp.login(s.smtp_user, s.smtp_password)
            smtp.send_message(msg)
    except (smtplib.SMTPException, OSError):
        log.exception("Envoi d'e-mail en échec vers %s", to)
