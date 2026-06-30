from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_userprofile_address_line1_userprofile_city_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="userprofile",
            name="country",
            field=models.CharField(blank=True, default="Bangladesh", max_length=60),
        ),
    ]