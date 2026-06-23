import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Notification, NotificationDismissal
from auth import get_current_user
from models import User

router = APIRouter()


@router.get("")
def get_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all notifications targeted at the current user's role that they haven't dismissed."""
    all_notifs = db.query(Notification).order_by(Notification.created_at.desc()).all()
    dismissed_ids = {
        d.notification_id
        for d in db.query(NotificationDismissal).filter(
            NotificationDismissal.user_id == current_user.id
        ).all()
    }
    result = []
    for n in all_notifs:
        roles = json.loads(n.target_roles)
        if current_user.role in roles and n.id not in dismissed_ids:
            result.append({
                "id": n.id,
                "product_id": n.product_id,
                "product_name": n.product_name,
                "message": n.message,
                "target_roles": roles,
                "created_at": n.created_at.isoformat(),
            })
    return result


@router.post("/{notification_id}/dismiss")
def dismiss(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.add(NotificationDismissal(notification_id=notification_id, user_id=current_user.id))
    db.commit()
    return {"message": "Dismissed"}
