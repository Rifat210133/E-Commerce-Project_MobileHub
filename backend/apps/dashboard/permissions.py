from rest_framework.permissions import BasePermission


class IsAdminStaff(BasePermission):
    """Allow access only to authenticated users with is_staff=True."""

    message = "Admin access required."

    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)