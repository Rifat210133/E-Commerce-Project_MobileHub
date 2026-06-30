from django.db import models


class YouTubeCache(models.Model):
    query = models.CharField(max_length=200, unique=True)
    results = models.JSONField(default=list)
    cached_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-cached_at",)

    def __str__(self) -> str:
        return self.query