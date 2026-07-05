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

    # -------------------- status transition (customer + admin) -----------
    prev_status = _previous_status(order.pk)
    if prev_status is None or prev_status == order.status:
        return

    # Customer notification policy:
    #
    # The customer cares about *every* status change that affects their
    # order, regardless of which intermediate step the admin skipped
    # (e.g. an admin can confirm a COD order without going through
    # "Processing", or mark a parcel delivered without an explicit
    # "Shipped" step). The previous strict `(from, to)` allow-list
    # silently dropped those transitions — that's why customers
    # never saw a "Pending → Delivered" or "Confirmed → Shipped"
    # notification.
    #
    # We now notify on *any* transition where the new status is a
    # state the customer can act on (i.e. not internal admin
    # bookkeeping). The set below is the canonical list of
    # customer-facing target states.
    customer_facing_target_statuses = {
        "Confirmed",
        "Processing",
        "Shipped",
        "Delivered",
        "Received",
        "Cancelled",
    }

    is_customer_visible = order.status in customer_facing_target_statuses

    # Edge case: an admin might temporarily revert an order (e.g. a
    # "Delivered" order gets bumped back to "Processing" because of a
    # failed delivery attempt). The customer should still be told —
    # the new status is in the allow-list above, so they'll get the
    # normal status update. We pick the level based on direction:
    # "Cancelled" is always a warning; everything else is info.
    if is_customer_visible:
        notes = (getattr(order, "status_notes", "") or "").strip()
        # Friendly label for the body — drop the all-caps Status.choices
        # form (e.g. "PROCESSING") in favour of a sentence-cased word.
        to_label = order.status.capitalize()
        from_label = prev_status.capitalize() if prev_status else ""
        body = (
            f"Your order status changed from {from_label} to {to_label}."
            if from_label
            else f"Your order status is now {to_label}."
        )
        if notes:
            body = f"{body} {notes}"

        level = "warning" if order.status == "Cancelled" else "info"
        _emit_customer(
            order,
            kind="order_status",
            level=level,
            title=f"Order #{order.order_number} is now {to_label}",
            body=body,
            meta={"from_status": prev_status, "to_status": order.status},
        )

    # Admin notification policy:
    #
    # Admins get a *separate* notification for every status transition
    # (including the internal ones) so the operator dashboard reflects
    # the live workflow. Without this, an admin walking in to check
    # "what's happening with order #X" only ever sees order_placed
    # and order_paid rows — never the in-flight status updates.
    admin_level = (
        "warning" if order.status == "Cancelled" else "info"
    )
    _emit_admins(
        kind="order_status",
        level=admin_level,
        title=(
            f"Order #{order.order_number}: {prev_status} → {order.status}"
        ),
        body=(
            f"{customer or 'The customer'}'s order #{order.order_number} "
            f"moved from {prev_status} to {order.status}."
        ),
        order=order,
        meta={"from_status": prev_status, "to_status": order.status},
    )

    # The (Delivered → Received) transition is unique: it's driven by
    # the customer themselves. The customer row above already says
    # "thank you for confirming receipt", so we only need to push
    # the admin notification so the support / fulfillment team sees
    # the buyer has confirmed the package arrived (closes out the
    # delivery loop). We use a distinct `order_received` kind so the
    # admin bell can highlight it differently.
    if (prev_status, order.status) == ("Delivered", "Received"):
        _emit_admins(
              kind="order_received",
              level="success",
              title=(
                  f"Order #{order.order_number} confirmed received "
                  f"by customer"
              ),
              body=(
                  f"{customer or 'The customer'} confirmed receipt of "
                  f"#{order.order_number}. Order is now closed."
              ),
              order=order,
              meta={"from_status": prev_status, "to_status": order.status},
          )
