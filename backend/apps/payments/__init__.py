"""MobileHub payment integrations.

Holds the bKash + Nagad sandbox adapters and the shared PaymentAttempt log.
Public URLs live at /api/payments/<provider>/<action>/.
"""
default_app_config = "apps.payments.apps.PaymentsConfig"