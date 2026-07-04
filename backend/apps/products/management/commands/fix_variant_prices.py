"""One-shot fix: rewrite ``variants[*].price`` that fall wildly outside the
plausible band for the product's base ``price``.

MobileHub variants carry their *full* per-variant price (not a delta). When
manual edits or bad seed runs accidentally put values like 99 on a 20000TK
phone, the catalog detail page renders "99TK" while the base price is
20000TK — visibly wrong on the storefront and in any order placed against
the broken variant. The ``ProductDetailPage`` UI now has a defensive guard,
but this command makes the DB itself consistent so the read-side guard is
a no-op.

A variant is "implausible" when ``variant.price < base_price * 0.5`` or
``variant.price > base_price * 2``. (That band is wide enough to keep
legitimately-priced tier variants — flagship vs base SKU, color/storage
mark-ups — untouched.)

Safe to run multiple times — once a variant price is rewritten to
``product.price`` the detector stops firing.

Usage (from backend/):
    .venv/bin/python manage.py fix_variant_prices
    .venv/bin/python manage.py fix_variant_prices --dry-run
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.products.models import Product


# Below this ratio of variant-vs-base we treat the variant as suspicious.
# Above 2x we also treat it as suspicious.
LOW_RATIO = 0.5
HIGH_RATIO = 2.0


def _is_implausible(variant_price, product_price) -> bool:
    """True when ``variant_price`` is wildly outside the plausible band
    around ``product_price``.

    Mirrors the frontend guard in ``ProductDetailPage.jsx`` so the two
    stay in lockstep — a data fix here and a defensive UI there both
    agree on what "implausible" means.
    """
    try:
        v = float(variant_price)
        pp = float(product_price)
    except (TypeError, ValueError):
        return False
    if v <= 0 or pp <= 0:
        return True  # zero/negative is always wrong
    return v < pp * LOW_RATIO or v > pp * HIGH_RATIO


class Command(BaseCommand):
    help = (
        "Rewrite variants[i].price that are wildly outside the plausible band "
        "around product.price so they match product.price. Idempotent."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print the changes that would be made without writing to the DB.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        qs = Product.objects.exclude(variants=[]).exclude(variants=None)
        total = qs.count()
        self.stdout.write(f"Scanning {total} products with variants…")

        fixed_products = 0
        fixed_variants = 0

        with transaction.atomic():
            sid = transaction.savepoint()
            for product in qs.iterator():
                base = float(product.price)
                if base <= 0:
                    continue

                new_variants = []
                touched = False
                for v in product.variants or []:
                    row = dict(v)
                    raw = row.get("price")
                    if raw is None:
                        new_variants.append(row)
                        continue
                    if not _is_implausible(raw, base):
                        new_variants.append(row)
                        continue
                    # Rewrite as the same numeric type the original used
                    # (Decimal stays Decimal, float stays float) so we don't
                    # change storage representation in unrelated ways.
                    new_value = float(base)
                    if isinstance(raw, Decimal):
                        new_value = Decimal(str(new_value))
                    row["price"] = new_value
                    new_variants.append(row)
                    touched = True
                    fixed_variants += 1

                if touched:
                    product.variants = new_variants
                    product.save(update_fields=["variants"])
                    fixed_products += 1

            if dry_run:
                transaction.savepoint_rollback(sid)
                self.stdout.write(
                    self.style.WARNING("DRY-RUN — nothing written.")
                )
            else:
                transaction.savepoint_commit(sid)

        verb = "Would fix" if dry_run else "Fixed"
        self.stdout.write(
            self.style.SUCCESS(
                f"{verb} {fixed_variants} variant "
                f"price{'s' if fixed_variants != 1 else ''} "
                f"across {fixed_products} "
                f"product{'s' if fixed_products != 1 else ''}."
            )
        )