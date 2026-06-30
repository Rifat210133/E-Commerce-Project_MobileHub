from django.urls import path

from . import views

app_name = "recommendations"

urlpatterns = [
    path("recommendations/ai-picks/", views.ai_picks, name="ai-picks"),
    path("recommendations/suggest/", views.suggest, name="suggest"),
    path("recommendations/facets/", views.facets, name="facets"),
    path("recommendations/youtube/", views.youtube_videos, name="youtube"),
]
