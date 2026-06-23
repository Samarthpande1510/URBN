import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from models import (
    Product, ActivityLog, NpdReport, FactoryComm,
    FactoryCommEdit, GoldenWorkflow, Notification,
)
from auth import get_current_user, require_role
from models import User

router = APIRouter()

NOTIFY_ALL = ["CEO", "Dev", "Purchase"]


# ── helpers ───────────────────────────────────────────────────────────────

def log(db: Session, product_id: int, action: str, user: User, note: str = None):
    db.add(ActivityLog(
        product_id=product_id,
        action=action,
        note=note,
        performed_by_id=user.id,
        performed_by_name=user.name,
    ))


def push_notification(db: Session, product_id: int, product_name: str, message: str, target_roles: list[str]):
    db.add(Notification(
        product_id=product_id,
        product_name=product_name,
        message=message,
        target_roles=json.dumps(target_roles),
    ))


# ── schemas ───────────────────────────────────────────────────────────────

class CreateProductReq(BaseModel):
    code_name: str
    sku_code: str
    factory: str
    assigned_qa: Optional[str] = None
    priority: str = "Medium"
    deadline: str                  # ISO date string YYYY-MM-DD
    specifications: Optional[str] = None
    sample_received: bool = False
    sample_given_date: Optional[str] = None


class NpdReportReq(BaseModel):
    outcome: str                   # Pass | Not Pass
    notes: Optional[str] = None
    file_name: Optional[str] = None
    file_url: Optional[str] = None


class DecisionReq(BaseModel):
    decision: str                  # Approved | On hold | Rejected


class FactoryActionReq(BaseModel):
    action: str                    # EMAIL_FACTORY | DROP


class FactoryReplyReq(BaseModel):
    reply_text: str
    tentative_return_date: Optional[str] = None


# ── product CRUD ──────────────────────────────────────────────────────────

@router.get("")
def list_products(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Product)
    if status:
        q = q.filter(Product.status == status)
    if search:
        term = f"%{search}%"
        q = q.filter(
            Product.code_name.ilike(term)
            | Product.sku_code.ilike(term)
            | Product.factory.ilike(term)
        )
    return q.order_by(Product.created_at.desc()).all()


@router.post("", status_code=201)
def create_product(
    data: CreateProductReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    product = Product(
        code_name=data.code_name,
        sku_code=data.sku_code,
        factory=data.factory,
        assigned_qa=data.assigned_qa,
        priority=data.priority,
        deadline=data.deadline,
        specifications=data.specifications,
        sample_received=data.sample_received,
        sample_given_date=data.sample_given_date or None,
        status="Pending NPD",
        status_changed_at=now,
        created_by=current_user.id,
    )
    db.add(product)
    db.flush()
    log(db, product.id, "Product added", current_user)
    db.commit()
    db.refresh(product)
    return product


@router.get("/{product_id}")
def get_product(product_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    return p


@router.get("/{product_id}/activity")
def get_activity(product_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(ActivityLog).filter(ActivityLog.product_id == product_id).order_by(ActivityLog.timestamp.desc()).all()


# ── NPD report ────────────────────────────────────────────────────────────

@router.post("/{product_id}/npd-report")
def submit_npd_report(
    product_id: int,
    data: NpdReportReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("QA")),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")

    now = datetime.utcnow()
    existing = db.query(NpdReport).filter(NpdReport.product_id == product_id).first()
    if existing:
        existing.outcome = data.outcome
        existing.notes = data.notes
        existing.file_name = data.file_name
        existing.file_url = data.file_url
        existing.submitted_by_id = current_user.id
        existing.submitted_at = now
    else:
        db.add(NpdReport(
            product_id=product_id,
            outcome=data.outcome,
            notes=data.notes,
            file_name=data.file_name,
            file_url=data.file_url,
            submitted_by_id=current_user.id,
        ))

    if data.outcome == "Not Pass":
        p.status = "Rejected"
        p.status_changed_at = now
        p.rejected_by = current_user.name
        log(db, product_id, "NPD report submitted — Not Pass", current_user, data.notes)
        log(db, product_id, "Archived — failed NPD", current_user)
    else:
        p.status = "Pending Decision"
        p.status_changed_at = now
        log(db, product_id, "NPD report submitted — Pass", current_user, data.notes)
        push_notification(db, product_id, p.code_name, "NPD report passed — awaiting CEO decision.", ["CEO", "Dev"])

    db.commit()
    return {"message": "Report submitted", "status": p.status}


# ── CEO decision ──────────────────────────────────────────────────────────

@router.post("/{product_id}/decision")
def ceo_decision(
    product_id: int,
    data: DecisionReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    if p.status != "Pending Decision":
        raise HTTPException(status_code=400, detail="Product is not pending a decision")

    now = datetime.utcnow()
    p.status = data.decision
    p.status_changed_at = now

    if data.decision == "Approved":
        db.add(GoldenWorkflow(product_id=product_id))
        log(db, product_id, f"CEO decision: Approved", current_user)
    elif data.decision == "On hold":
        db.add(FactoryComm(product_id=product_id, decided_action=None))
        log(db, product_id, "CEO decision: On hold", current_user)
    elif data.decision == "Rejected":
        p.rejected_by = current_user.name
        log(db, product_id, "CEO decision: Rejected", current_user)
        push_notification(db, product_id, p.code_name, "Product rejected by CEO.", NOTIFY_ALL)
    else:
        raise HTTPException(status_code=400, detail="Invalid decision")

    db.commit()
    return {"message": f"Product {data.decision.lower()}", "status": p.status}


# ── Restore rejected product ───────────────────────────────────────────────

@router.post("/{product_id}/restore")
def restore_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p or p.status != "Rejected":
        raise HTTPException(status_code=400, detail="Product is not rejected")
    now = datetime.utcnow()
    p.status = "Pending NPD"
    p.status_changed_at = now
    p.rejected_by = None
    log(db, product_id, "Restored to Pending NPD", current_user)
    push_notification(db, product_id, p.code_name, "Product restored to Pending NPD.", ["CEO", "Dev"])
    db.commit()
    return {"message": "Restored"}


# ── Factory communications ────────────────────────────────────────────────

@router.post("/{product_id}/factory-comm/action")
def factory_action(
    product_id: int,
    data: FactoryActionReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    comm = db.query(FactoryComm).filter(FactoryComm.product_id == product_id).first()
    if not comm:
        raise HTTPException(status_code=400, detail="No factory comm record found")
    now = datetime.utcnow()

    if data.action == "EMAIL_FACTORY":
        comm.decided_action = "EMAIL_FACTORY"
        comm.decided_at = now
        log(db, product_id, "Factory emailed", current_user)
        push_notification(db, product_id, p.code_name, "Factory has been emailed — acknowledge when ready.", ["Dev"])
    elif data.action == "DROP":
        if current_user.role == "QA":
            raise HTTPException(status_code=403, detail="QA cannot drop products")
        p.status = "Rejected"
        p.status_changed_at = now
        p.rejected_by = current_user.name
        log(db, product_id, "Dropped — product rejected", current_user)
        push_notification(db, product_id, p.code_name, "Product dropped from hold.", ["CEO", "Dev"])
    else:
        raise HTTPException(status_code=400, detail="Invalid action")

    db.commit()
    return {"message": "Done"}


@router.post("/{product_id}/factory-comm/acknowledge")
def acknowledge(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Dev")),
):
    comm = db.query(FactoryComm).filter(FactoryComm.product_id == product_id).first()
    if not comm:
        raise HTTPException(status_code=404, detail="No factory comm found")
    comm.acknowledged_at = datetime.utcnow()
    log(db, product_id, "Dev team acknowledged", current_user)
    db.commit()
    return {"message": "Acknowledged"}


@router.post("/{product_id}/factory-comm/reply")
def save_reply(
    product_id: int,
    data: FactoryReplyReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comm = db.query(FactoryComm).filter(FactoryComm.product_id == product_id).first()
    if not comm:
        raise HTTPException(status_code=404, detail="No factory comm found")
    now = datetime.utcnow()
    if comm.reply_at:
        db.add(FactoryCommEdit(
            factory_comm_id=comm.id,
            previous_reply=comm.reply_text,
            previous_date=comm.tentative_return_date,
        ))
    comm.reply_text = data.reply_text
    comm.tentative_return_date = data.tentative_return_date or None
    comm.reply_at = now
    log(db, product_id, "Factory reply updated" if comm.reply_at else "Factory reply logged", current_user, data.reply_text)
    db.commit()
    return {"message": "Reply saved"}


@router.post("/{product_id}/factory-comm/reject")
def reject_from_hold(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    now = datetime.utcnow()
    p.status = "Rejected"
    p.status_changed_at = now
    p.rejected_by = current_user.name
    log(db, product_id, "Rejected from hold", current_user)
    push_notification(db, product_id, p.code_name, "Product rejected after hold review.", ["CEO"])
    db.commit()
    return {"message": "Rejected"}
