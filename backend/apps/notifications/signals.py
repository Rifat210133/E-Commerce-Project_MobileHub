"""Emit notifications when interesting order events happen.

Kept separate from views so we catch every code path (checkout, admin status
update, manual mark-paid) without each view having to remember to call us.

Recipient split:
  - Admins are notified about everything (placement + paid).
  - Customers are notified about events that affect their order
    (paid + status transitions).

We capture the previous DB status with a `pre_save` receiver that stashes it
in thread-local storage (Django's sync request model guarantees per-request
isolation). The matching `post_save` reads it back so it can diff old vs new.
"""
import threading

from django.contrib.auth import get_user_model
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import Notification


# Thread-local stash used by `pre_save` to hand the previous status to the
# following `post_save` for the same instance.
_status_state = threading.local()


def _admin_user_ids():
    """Return the set of user IDs that should receive admin notifications.

    Centralised so we can later scope to a `staff_role` field or a settings-
    configured list without touching every call site.
    """
    User = get_user_model()
    return list(
        User.objects.filter(is_staff=True, is_active=True).values_list("id", flat=True)
    )


def _emit_to(kind, recipient_ids, level, title, body, order=None, meta=None):
    if not recipient_ids:
        return
    rows = [
        Notification(
            recipient_id=uid,
            kind=kind,
            level=level,
            title=title,
            body=body or "",
            order=order,
            meta=meta or {},
        )
        for uid in recipient_ids
    ]
    Notification.objects.bulk_create(rows)


def _emit_admins(kind, level, title, body, order=None, meta=None):
    """Fan out a notification row to every active staff user."""
    return _emit_to(kind, _admin_user_ids(), level, title, body, order=order, meta=meta)


def _emit_customer(order, kind, level, title, body, meta=None):
    """Fan out a notification row to the order's customer, if any."""
    if not order.user_id:
        return
    _emit_to(
        kind,
        [order.user_id],
        level,
        title,
        body,
        order=order,
        meta=meta,
    )


def _customer_display_name(order):
    try:
        if order.user_id:
            user = order.user
            return user.get_full_name() or user.username or user.email or ""
    except Exception:
        return ""
    return ""


@receiver(pre_save, sender="orders.Order")
def stash_previous_order_status(sender, instance, **kwargs):
    """Snapshot the DB's current status before save().

    Cheap single indexed PK lookup. New rows (`instance.pk is None`) have no
    previous status to stash, so we skip them.
    """
    if not instance.pk:
        return
    try:
        prev = sender.objects.only("status").get(pk=instance.pk)
    except sender.DoesNotExist:
        return
    bag = getattr(_status_state, "bag", None)
    if bag is None:
        bag = {}
        _status_state.bag = bag
    bag[instance.pk] = prev.status


def _previous_status(pk):
    return getattr(_status_state, "bag", {}).get(pk)


@receiver(post_save, sender="orders.Order")
def notify_on_order_event(sender, instance, created, **kwargs):
    """Dispatch notifications for order events.

    Admin gets: order_placed, order_paid.
    Customer gets: order_paid, order_status (when status actually changed).
    """
    order = instance
    money = f"{order.total_amount:,.2f}"
    customer = _customer_display_name(order)

    if created:
        _emit_admins(
            kind="order_placed",
            level="info",
            title=f"New order #{order.order_number} — {money}",
            body=(
                f"{customer or 'A customer'} placed an order for {money}. "
                f"Payment method: {order.paid_via or order.shipping_address.get('payment_method', 'cod').upper()}."
            ),
            order=order,
            meta={
                "total_amount": str(order.total_amount),
                "payment_method": order.shipping_address.get("payment_method", ""),
                "status": order.status,
            },
        )
        # Make sure the post-paid branch can't double-fire for newly created
        # orders that already have paid_at set (rare but possible).
        return

    # -------------------- paid transition (admin + customer) --------------------
    if order.paid_at:
        existing_paid = Notification.objects.filter(
            kind="order_paid", order=order
        ).exists()
        if not existing_paid:
            method = (
                order.paid_via
                or order.shipping_address.get("payment_method", "card")
            ).upper()
            body = f"{customer or 'Your order'} was paid via {method}."
            _emit_admins(
                kind="order_paid",
                level="success",
                title=f"Payment received for #{order.order_number} — {money}",
                body=body,
                order=order,
                meta={"total_amount": str(order.total_amount)},
            )
            _emit_customer(
                order,
                kind="order_paid",
                level="success",
                title=f"We received your payment for #{order.order_number}",
                body=body,
                meta={"total_amount": str(order.total_amount)},
            )

    # -------------------- status transition (customer only) --------------------
    prev_status = _previous_status(order.pk)
    if prev_status is None or prev_status == order.status:
        return

    # Skip transitions that the customer can't act on (internal warehouse
    # bookkeeping). Only notify on customer-visible movements.
    customer_facing_transitions = {
        ("Confirmed", "Processing"),
        ("Processing", "Shipped"),
        ("Shipped", "Delivered"),
        ("Pending", "Cancelled"),
        ("Confirmed", "Cancelled"),
        ("Processing", "Cancelled"),
    }
    if (prev_status, order.status) not in customer_facing_transitions:
        return

    notes = (getattr(order, "status_notes", "") or "").strip()
    body = f"Your order status changed from {prev_status} to {order.status}."
    if notes:
        body = f"{body} {notes}"

    _emit_customer(
        order,
        kind="order_status",
        level="info",
        title=f"Order #{order.order_number} is now {order.status}",
        body=body,
        meta={"from_status": prev_status, "to_status": order.status},
    )
