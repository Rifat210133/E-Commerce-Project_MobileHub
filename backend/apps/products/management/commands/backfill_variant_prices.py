"""One-shot backfill: rewrite ``variants[*].price`` and
``storage_options[*].price_delta`` so they match the product's ``price`` scale.

Some seed runs (e.g. early ``seed_catalog.py`` imports) stored variant prices
at ``product.price / 100``, which made the catalog card show "49,900TK" while
the product detail page showed "499TK" for the same item. The serializer now
fixes this on read, but this command makes the DB itself consistent so the
read-side normalization is a no-op.

Safe to run multiple times — the detector (variant_price ~= product_price /
100) only fires on rows that actually need fixing.

Usage (from backend/):
    .venv/bin/python manage.py backfill_variant_prices
    .venv/bin/python manage.py backfill_variant_prices --dry-run
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.products.models import Product


def _looks_mis_scaled(value, product_price) -> bool:
    """Return True if ``value`` is roughly 1/100 of ``product_price``.

    Conservative window so we never accidentally rewrite a price that just
    happens to be a small portion of the product (e.g. accessories).
    """
    try:
        v = float(value)
        pp = float(product_price)
    except (TypeError, ValueError):
        return False
    if v <= 0 or pp <= 0:
        return False
    ratio = v / pp
    # ~1/100 with a generous safety band so real variant deltas of 0.5×–2×
    # never get touched.
    return 0.005 < ratio < 0.05


class Command(BaseCommand):
    help = (
        "Rewrite variants[i].price and storage_options[i].price_delta whose "
        "values are stored ~1/100th of product.price so they match the same "
        "scale. Idempotent."
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
        fixed_storage = 0

        with transaction.atomic():
            sid = transaction.savepoint()
            for product in qs.iterator():
                touched = False

                new_variants = []
                for v in product.variants or []:
                    row = dict(v)
                    raw = row.get("price")
                    if raw is not None and _looks_mis_scaled(raw, product.price):
                        try:
                            row["price"] = float(raw) * 100
                            # Preserve Decimal if the original was Decimal.
                            if isinstance(raw, Decimal):
                                row["price"] = Decimal(str(row["price"]))
                        except (TypeError, ValueError):
                            pass
                        else:
                            fixed_variants += 1
                            touched = True
                    new_variants.append(row)
                if touched:
                    product.variants = new_variants

                new_storage = []
                for s in product.storage_options or []:
                    row = dict(s)
                    raw = row.get("price_delta")
                    if raw is not None and _looks_mis_scaled(raw, product.price):
                        try:
                            row["price_delta"] = float(raw) * 100
                            if isinstance(raw, Decimal):
                                row["price_delta"] = Decimal(
                                    str(row["price_delta"])
                                )
                        except (TypeError, ValueError):
                            pass
                        else:
                            fixed_storage += 1
                            touched = True
                    new_storage.append(row)
                if touched and len(new_storage) != len(product.storage_options or []):
                    product.storage_options = new_storage
                elif touched:
                    product.storage_options = new_storage

                if touched:
                    product.save(update_fields=["variants", "storage_options"])
                    fixed_products += 1

            if dry_run:
                transaction.savepoint_rollback(sid)
                self.stdout.write(self.style.WARNING("DRY-RUN — nothing written."))
            else:
                transaction.savepoint_commit(sid)

        self.stdout.write(
            self.style.SUCCESS(
                f"{'Would fix' if dry_run else 'Fixed'} "
                f"{fixed_variants} variant price{'s' if fixed_variants != 1 else ''} "
                f"and {fixed_storage} storage-option "
                f"{'prices' if fixed_storage != 1 else 'price'} "
                f"across {fixed_products} product{'s' if fixed_products != 1 else ''}."
            )
        )
