from django.apps import AppConfig


class SimulatorConfig(AppConfig):
    """A second Django app living next to ``apps.payments``.

    It implements the same wire protocol bKash and Nagad use (token
    grant → payment/create → hosted page → payment/execute) so the real
    ``BkashSandboxProvider`` / ``NagadSandboxProvider`` clients in
    ``apps/payments`` can talk to it without code changes — just point
    ``BKASH_BASE_URL`` / ``NAGAD_BASE_URL`` at this server's ``/sim``
    mount.

    State (which paymentIDs exist, what stage they're at, whether
    they're approved) is kept in a process-local dict. Fine for a
    single-process demo; swap for Redis if you ever need HA.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.payments.simulator"
    label = "payments_simulator"
    verbose_name = "bKash / Nagad simulator"
