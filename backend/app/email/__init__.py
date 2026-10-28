"""Shared email delivery: build an EmailMessage, render it from a template, send it with send_email()."""
from app.email.backends import EmailBackend, SendResult
from app.email.message import Attachment, EmailMessage, EmailValidationError
from app.email.service import (EmailConfigError, EmailDeliveryError, Recipients, describe, get_backend,
                               missing_recipients, recipients_for, send_email)
from app.email.templates import RenderedEmail, render_email

__all__ = ["Attachment", "EmailBackend", "EmailConfigError", "EmailDeliveryError", "EmailMessage",
           "EmailValidationError", "Recipients", "RenderedEmail", "SendResult", "describe", "get_backend",
           "missing_recipients", "recipients_for", "render_email", "send_email"]
