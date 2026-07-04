"""Cancel abandoned online-payment orders and restore their stock.

Why this exists
---------------
The bKash / Nagad checkout flow creates the order in ``Pending`` state
without ``paid_at`` set, then redirects the customer to a hosted page.
If the customer closes the tab before confirming, the order never
transitions to ``Paid`` — but the checkout view has already decremented
stock. That leaves the order sitting in the DB forever holding stock it
shouldn't be holding.

This command flips those stranded orders to ``Cancelled`` and restores
the product stock, so analytics stay accurate and the items go back to
being purchasable.

Safety
------
Restricted to orders where:
  * ``status`` is still ``Pending`` (don't touch in-flight ones)
  * ``paid_at`` is null (never paid for — COD that hasn't paid yet is
    also captured by this branch, but COD has no hosted redirect to
    fail, so COD carts almost never end up here; if they do, cancelling
    is still the right move)
  * ``created_at < cutoff`` (default 30 minutes)
  * ``shipping_address.payment_method`` is one of the online gateway
    codes (``bkash`` / ``nagad``)

Dry-run by default in CI? No — the command defaults to a 30-second
``--dry-run``-friendly mode isn't necessary; the operator explicitly
invokes it. We do support ``--dry-run`` for safe previews.

Usage (from backend/):
    # 30-minute default window
    .venv/bin/python manage.py cancel_unpaid_online_orders

    # 1 hour
    .venv/bin/python manage.py cancel_unpaid_online_orders --minutes 60

    # Preview what would be cancelled, don't actually change anything
    .venv/bin/python manage.py cancel_unpaid_online_orders --dry-run

Once a cron / scheduled task is configured:
    */15 * * * *  cd /app/backend && .venv/bin/python manage.py cancel_unpaid_online_orders --minutes 30
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.orders.models import Order
from apps.products.models import Product


# Methods that mean "online redirect that might be abandoned". COD has
# no gateway to fail, so it's intentionally excluded — leaving a COD
# order Pending is the customer's choice (pay on delivery) and only an
# admin should cancel it.
ONLINE_METHODS = ("bkash", "nagad")

# Default grace window before we consider an order abandoned. The
# bKash/Nagad flow can take a few minutes while the customer fumbles
# with their phone, so 30 minutes is a comfortable floor.
DEFAULT_MINUTES = 30


class Command(BaseCommand):
    help = (
        "Cancel Pending unpaid online orders older than the grace window "
        "and restore their stock."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--minutes",
            type=int,
            default=DEFAULT_MINUTES,
            help=(
                "How old (in minutes) a Pending unpaid online order must be "
                "before it gets cancelled. Defaults to %(default)s."
            ),
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be cancelled without writing changes.",
        )

    def handle(self, *args, **opts):
        minutes = max(1, int(opts["minutes"]))
        dry_run = bool(opts["dry_run"])
        cutoff = timezone.now() - timedelta(minutes=minutes)

        # Online methods live in two places depending on how the order
        # was created:
        #   * ``shipping_address.payment_method`` — set by the checkout
        #     view via the JSONField snapshot.
        #   * ``paid_via`` — flipped to ``bkash``/``nagad`` by the
        #     PaymentAttempt execute endpoint when the gateway confirms.
        # An order with neither set is COD; we never cancel COD here.
        from django.db.models import Q

        candidates = (
            Order.objects.filter(
                status="Pending",
                paid_at__isnull=True,
                created_at__lt=cutoff,
            )
            .filter(
                Q(shipping_address__payment_method__in=list(ONLINE_METHODS))
                | Q(paid_via__in=list(ONLINE_METHODS))
            )
            .order_by("created_at")
        )

        # List for the operator so they can audit before any destructive
        # run; if dry-run we exit after printing.
        orders = list(candidates)
        if not orders:
            self.stdout.write(
                self.style.SUCCESS(
                    f"No Pending unpaid online orders older than {minutes}m. "
                    "Nothing to do."
                )
            )
            return

        self.stdout.write(
            f"Found {len(orders)} order(s) to cancel "
            f"(grace window: {minutes}m, dry_run={dry_run}):"
        )
        for o in orders:
            method = (o.shipping_address or {}).get("payment_method") or o.paid_via
            self.stdout.write(
                f"  - {o.order_number}  user={o.user_id}  method={method}  "
                f"created={o.created_at.isoformat(timespec='minutes')}  "
                f"total={o.total_amount}"
            )

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run — no changes written."))
            return

        cancelled = 0
        restored_lines = 0
        for order in orders:
            with transaction.atomic():
                # Restore stock per item. Snapshot keys: product_id, quantity.
                for item in order.items or []:
                    product_id = item.get("product_id")
                    qty = item.get("quantity")
                    if not product_id or not qty or qty < 1:
                        continue
                    try:
                        product = Product.objects.select_for_update().get(pk=product_id)
                    except Product.DoesNotExist:
                        # Product was deleted after the order was placed.
                        # Nothing to restore — leave a note on the order so
                        # the audit trail shows we tried.
                        continue
                    product.stock = product.stock + int(qty)
                    product.save(update_fields=["stock"])
                    restored_lines += 1

                order.status = "Cancelled"
                note = f"Auto-cancelled: unpaid online order older than {minutes}m."
                order.status_notes = (
                    f"{order.status_notes}\n{note}".strip() if order.status_notes else note
                )
                order.save(update_fields=["status", "status_notes", "updated_at"])
                cancelled += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Cancelled {cancelled} order(s), restored stock on "
                f"{restored_lines} product line(s)."
            )
        )


