import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from email_service import send_rejection_email
from models import (
    Product, ActivityLog, NpdReport, FactoryComm,
    FactoryCommEdit, GoldenWorkflow, GoldenSampleTrack, Notification, OrderDecision,
    GoldenDetails, ComplianceTrack, PackagingTrack,
)
from auth import get_current_user, require_role
from models import User

router = APIRouter()

NOTIFY_ALL = ["CEO", "Dev", "Purchase"]


CEO_NOTIFICATION_EMAIL = "samarthpande68@gmail.com"

def _fire_rejection_email(p, actor, db: Session):
    """Send rejection email to the CEO notification address."""
    try:
        npd = db.query(NpdReport).filter(NpdReport.product_id == p.id).first()
        send_rejection_email(
            ceo_email=CEO_NOTIFICATION_EMAIL,
            ceo_name="Samarth",
            product_name=p.code_name,
            factory=p.factory,
            npd_outcome=npd.outcome if npd else None,
            npd_notes=npd.notes if npd else None,
            verdict_remarks=p.verdict_remarks,
            rejected_by=p.rejected_by or actor.name,
            rejected_at=p.status_changed_at,
        )
        print(f"[email] Rejection email sent for {p.code_name}")
    except Exception as e:
        print(f"[email] Rejection email error: {e}")


# ── helpers ───────────────────────────────────────────────────────────────

def check_and_bump(product: Product, version: Optional[int]):
    """Optimistic concurrency check. Pass v=None to skip (read-only endpoints)."""
    if version is not None and product.version != version:
        raise HTTPException(
            status_code=409,
            detail="Someone else just updated this product. Refresh to see the latest state.",
        )
    product.version = (product.version or 1) + 1


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
    deadline: Optional[str] = None
    specifications: Optional[str] = None
    sample_received: bool = False
    sample_given_date: Optional[str] = None
    urbn_model_no: Optional[str] = None
    factory_sku: Optional[str] = None
    colors: Optional[list] = None
    image_url: Optional[str] = None


class UpdateProductReq(BaseModel):
    code_name: Optional[str] = None
    sku_code: Optional[str] = None
    factory: Optional[str] = None
    assigned_qa: Optional[str] = None
    priority: Optional[str] = None
    deadline: Optional[str] = None
    specifications: Optional[str] = None
    sample_received: Optional[bool] = None
    sample_given_date: Optional[str] = None
    urbn_model_no: Optional[str] = None
    factory_sku: Optional[str] = None
    colors: Optional[list] = None
    verdict_remarks: Optional[str] = None
    image_url: Optional[str] = None


class OrderDecisionReq(BaseModel):
    state: str                     # pending | placed | held | dropped
    internal_code: Optional[str] = None
    colors: Optional[list] = None
    improvement_notes: Optional[str] = None
    improved_golden_sample_expected: Optional[str] = None  # ISO date
    remarks: Optional[str] = None


class NpdReportReq(BaseModel):
    outcome: str                   # Pass | Not Pass
    notes: Optional[str] = None
    file_name: Optional[str] = None
    file_url: Optional[str] = None


class DecisionReq(BaseModel):
    decision: str                  # Approved | On hold | Rejected
    remarks: Optional[str] = None


class FactoryActionReq(BaseModel):
    action: str                    # EMAIL_FACTORY | DROP


class FactoryReplyReq(BaseModel):
    reply_text: str
    tentative_return_date: Optional[str] = None


# ── product CRUD ──────────────────────────────────────────────────────────

def _serialize_factory_comm(fc):
    if not fc:
        return None
    return {
        "decided_action": fc.decided_action,
        "decided_at": fc.decided_at.isoformat() if fc.decided_at else None,
        "acknowledged_at": fc.acknowledged_at.isoformat() if fc.acknowledged_at else None,
        "reply_at": fc.reply_at.isoformat() if fc.reply_at else None,
        "reply_text": fc.reply_text,
        "tentative_return_date": fc.tentative_return_date.isoformat() if fc.tentative_return_date else None,
        "expected_reply_date": fc.expected_reply_date.isoformat() if fc.expected_reply_date else None,
        "reply_received_at": fc.reply_received_at.isoformat() if fc.reply_received_at else None,
        "reply_summary": fc.reply_summary,
        "reply_notes": fc.reply_notes,
        "partial_resolved_at": fc.partial_resolved_at.isoformat() if fc.partial_resolved_at else None,
        "internal_decision": fc.internal_decision,
        "internal_decision_at": fc.internal_decision_at.isoformat() if fc.internal_decision_at else None,
        "internal_decision_by": fc.internal_decision_by,
        "internal_decision_notes": fc.internal_decision_notes,
        "improvement_sample_expected": fc.improvement_sample_expected or False,
        "improvement_sample_expected_date": fc.improvement_sample_expected_date.isoformat() if fc.improvement_sample_expected_date else None,
        "improvement_sample_received_at": fc.improvement_sample_received_at.isoformat() if fc.improvement_sample_received_at else None,
        "case_log": fc.case_log or [],
    }


def _serialize_golden_workflow(gw, db):
    gs = db.query(GoldenSampleTrack).filter(GoldenSampleTrack.workflow_id == gw.id).first()
    gd = db.query(GoldenDetails).filter(GoldenDetails.workflow_id == gw.id).first()
    ct = db.query(ComplianceTrack).filter(ComplianceTrack.workflow_id == gw.id).all()
    pt = db.query(PackagingTrack).filter(PackagingTrack.workflow_id == gw.id).first()
    return {
        "id": gw.id,
        "purchase_notified_at": gw.purchase_notified_at.isoformat() if gw.purchase_notified_at else None,
        "order_confirmed_at": gw.order_confirmed_at.isoformat() if gw.order_confirmed_at else None,
        "compliance_not_needed": gw.compliance_not_needed,
        "golden_sample_archived": gw.golden_sample_archived,
        "compliance_archived": gw.compliance_archived,
        "packaging_archived": gw.packaging_archived,
        # Golden sample fields
        "golden_sample_status": gs.status if gs else None,
        "golden_sample_requested_at": gs.requested_at.isoformat() if gs and gs.requested_at else None,
        "golden_sample_expected_date": gs.expected_date.isoformat() if gs and gs.expected_date else None,
        "golden_sample_received_at": gs.received_at.isoformat() if gs and gs.received_at else None,
        # Stage computation fields — enough for getPipelineTrail without calling /golden/{id}
        "details_saved": gd is not None,
        "colour_confirmed": gd.colour_confirmed if gd else False,
        "logo_marking_confirmed": gd.logo_marking_confirmed if gd else False,
        "rating_label_confirmed": gd.rating_label_confirmed if gd else False,
        "bom_confirmed": gd.bom_confirmed if gd else False,
        "details_saved_at": gd.saved_at.isoformat() if gd and gd.saved_at else None,
        "compliance_tracks": [
            {"confirmed_at": t.confirmed_at.isoformat() if t.confirmed_at else None}
            for t in ct
        ],
        "packaging_initiated": pt is not None,
        "packaging_sample_version": pt.sample_version if pt else 1,
        "packaging_sample_received_at": pt.sample_received_at.isoformat() if pt and pt.sample_received_at else None,
        "packaging_kld_acknowledged_at": pt.kld_acknowledged_at.isoformat() if pt and pt.kld_acknowledged_at else None,
        "packaging_kld_emailed_at": pt.kld_emailed_to_designer_at.isoformat() if pt and pt.kld_emailed_to_designer_at else None,
        "packaging_decision": pt.decision if pt else None,
        "packaging_decision_at": pt.decision_at.isoformat() if pt and pt.decision_at else None,
    }


def _serialize_product(p, db):
    od = db.query(OrderDecision).filter(OrderDecision.product_id == p.id).first()
    gw = db.query(GoldenWorkflow).filter(GoldenWorkflow.product_id == p.id).first()
    npd = db.query(NpdReport).filter(NpdReport.product_id == p.id).first()
    return {
        "id": p.id,
        "version": p.version or 1,
        "code_name": p.code_name,
        "sku_code": p.sku_code,
        "factory": p.factory,
        "assigned_qa": p.assigned_qa,
        "priority": p.priority,
        "status": p.status,
        "deadline": p.deadline.isoformat() if p.deadline else None,
        "specifications": p.specifications,
        "sample_received": p.sample_received,
        "sample_given_date": p.sample_given_date.isoformat() if p.sample_given_date else None,
        "image_url": p.image_url,
        "verdict_remarks": p.verdict_remarks,
        "urbn_model_no": p.urbn_model_no,
        "factory_sku": p.factory_sku,
        "colors": p.colors,
        "status_changed_at": p.status_changed_at.isoformat() if p.status_changed_at else None,
        "rejected_by": p.rejected_by,
        "archive_remarks": p.archive_remarks,
        "created_by": p.created_by,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "sample_version": p.sample_version or 1,
        "npd_report": {
            "outcome": npd.outcome,
            "notes": npd.notes,
            "file_name": npd.file_name,
            "file_url": npd.file_url,
            "submitted_at": npd.submitted_at.isoformat() if npd.submitted_at else None,
        } if npd else None,
        "order_decision": {
            "id": od.id,
            "state": od.state,
            "internal_code": od.internal_code,
            "colors": od.colors,
            "improvement_notes": od.improvement_notes,
            "improved_golden_sample_expected": od.improved_golden_sample_expected.isoformat() if od.improved_golden_sample_expected else None,
            "decided_at": od.decided_at.isoformat() if od.decided_at else None,
            "decided_by_name": od.decided_by_name,
            "remarks": od.remarks,
            "order_archived": od.order_archived,
        } if od else None,
        "factory_comm": _serialize_factory_comm(db.query(FactoryComm).filter(FactoryComm.product_id == p.id).first()),
        "golden_workflow": _serialize_golden_workflow(gw, db) if gw else None,
    }


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
    products = q.order_by(Product.created_at.desc()).all()
    return [_serialize_product(p, db) for p in products]


@router.post("", status_code=201)
def create_product(
    data: CreateProductReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    colors = data.colors if data.colors and data.colors != "null" else None
    product = Product(
        code_name=data.code_name,
        sku_code=data.sku_code or "",
        factory=data.factory or "",
        assigned_qa=data.assigned_qa,
        priority=data.priority,
        deadline=data.deadline or None,
        specifications=data.specifications,
        sample_received=data.sample_received,
        sample_given_date=data.sample_given_date or None,
        urbn_model_no=data.urbn_model_no,
        factory_sku=data.factory_sku,
        colors=colors,
        image_url=data.image_url,
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
    return _serialize_product(p, db)


@router.get("/{product_id}/activity")
def get_activity(product_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(ActivityLog).filter(ActivityLog.product_id == product_id).order_by(ActivityLog.timestamp.desc()).all()


# ── NPD report ────────────────────────────────────────────────────────────

@router.post("/{product_id}/npd-report")
def submit_npd_report(
    product_id: int,
    data: NpdReportReq,
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    check_and_bump(p, v)

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

    comm = db.query(FactoryComm).filter(FactoryComm.product_id == product_id).first()
    is_improvement = comm and comm.improvement_sample_expected

    if is_improvement:
        # Improvement sample NPD — decision stays in Hold Insights, not Decision Pending
        p.status = "On hold"
        p.status_changed_at = now
        outcome_label = "Pass" if data.outcome == "Pass" else "Fail"
        log(db, product_id, f"Improvement sample NPD submitted — {outcome_label} (v{p.sample_version or 1})", current_user, data.notes)
        push_notification(db, product_id, p.code_name, f"Improvement sample v{p.sample_version or 1} NPD result: {outcome_label} — awaiting internal decision.", ["CEO", "Dev", "Sales", "QA"])
    else:
        # Both Pass and Not Pass go to Pending Decision — CEO decides next step
        p.status = "Pending Decision"
        p.status_changed_at = now
        outcome_label = "Pass" if data.outcome == "Pass" else "Not Pass"
        log(db, product_id, f"NPD report submitted — {outcome_label}", current_user, data.notes)
        push_notification(db, product_id, p.code_name, f"NPD result: {outcome_label} — awaiting CEO decision.", ["CEO", "Dev"])

    db.commit()
    return {"message": "Report submitted", "status": p.status}


# ── CEO decision ──────────────────────────────────────────────────────────

@router.post("/{product_id}/decision")
def ceo_decision(
    product_id: int,
    data: DecisionReq,
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    check_and_bump(p, v)
    if p.status != "Pending Decision":
        raise HTTPException(status_code=400, detail="Product is not pending a decision")

    now = datetime.utcnow()
    p.status = data.decision
    p.status_changed_at = now
    if data.remarks:
        p.verdict_remarks = data.remarks

    if data.decision == "Approved":
        db.add(GoldenWorkflow(product_id=product_id))
        db.add(OrderDecision(
            product_id=product_id,
            state="pending",
            internal_code=f"ORD-{product_id}-{int(now.timestamp())}",
            decided_by_id=current_user.id,
            decided_by_name=current_user.name,
        ))
        log(db, product_id, f"CEO decision: Approved", current_user)
    elif data.decision == "On hold":
        db.add(FactoryComm(product_id=product_id, decided_action=None))
        log(db, product_id, "CEO decision: On hold", current_user)
    elif data.decision == "Rejected":
        p.rejected_by = current_user.name
        p.status_changed_at = now
        log(db, product_id, "CEO decision: Rejected", current_user)
        push_notification(db, product_id, p.code_name, "Product rejected by CEO.", NOTIFY_ALL)
    else:
        raise HTTPException(status_code=400, detail="Invalid decision")

    db.commit()

    if data.decision == "Rejected":
        _fire_rejection_email(p, current_user, db)

    return {"message": f"Product {data.decision.lower()}", "status": p.status}


# ── Restore rejected product ───────────────────────────────────────────────

@router.post("/{product_id}/restore")
def restore_product(
    product_id: int,
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p or p.status != "Rejected":
        raise HTTPException(status_code=400, detail="Product is not rejected")
    check_and_bump(p, v)
    now = datetime.utcnow()
    p.status = "Pending NPD"
    p.status_changed_at = now
    p.rejected_by = None
    log(db, product_id, "Restored to Pending NPD", current_user)
    push_notification(db, product_id, p.code_name, "Product restored to Pending NPD.", ["CEO", "Dev"])
    db.commit()
    return {"message": "Restored"}


# ── Archive product ────────────────────────────────────────────────────────

class ArchiveReq(BaseModel):
    remarks: Optional[str] = None

@router.post("/{product_id}/archive")
def archive_product(
    product_id: int,
    data: ArchiveReq = ArchiveReq(),
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev")),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    check_and_bump(p, v)
    p.status = "Archived"
    p.status_changed_at = datetime.utcnow()
    if data.remarks:
        p.archive_remarks = data.remarks
    log(db, product_id, f"Archived{f' — {data.remarks}' if data.remarks else ''}", current_user)
    push_notification(db, product_id, p.code_name, "Product archived.", ["CEO", "Dev"])
    db.commit()
    return {"message": "Archived"}


class RejectFromHoldReq(BaseModel):
    remarks: Optional[str] = None

@router.post("/{product_id}/reject-from-hold")
def reject_from_hold(
    product_id: int,
    data: RejectFromHoldReq = RejectFromHoldReq(),
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev")),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    if p.status != "On hold":
        raise HTTPException(status_code=400, detail="Product must be On hold to reject from hold")
    check_and_bump(p, v)
    p.status = "Rejected"
    p.status_changed_at = datetime.utcnow()
    p.rejected_by = current_user.name
    if data.remarks:
        p.verdict_remarks = data.remarks
    log(db, product_id, f"Rejected from On Hold{f' — {data.remarks}' if data.remarks else ''}", current_user)
    push_notification(db, product_id, p.code_name, f"{p.code_name} rejected from On Hold.", ["CEO", "Dev"])
    db.commit()
    _fire_rejection_email(p, current_user, db)
    return {"message": "Rejected"}


class MoveToHoldReq(BaseModel):
    remarks: Optional[str] = None

@router.post("/{product_id}/move-to-hold")
def move_rejected_to_hold(
    product_id: int,
    data: MoveToHoldReq = MoveToHoldReq(),
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev")),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    if p.status not in ("Rejected", "Archived"):
        raise HTTPException(status_code=400, detail="Product must be Rejected or Archived to move to On Hold")
    check_and_bump(p, v)
    p.status = "On hold"
    p.status_changed_at = datetime.utcnow()
    if data.remarks:
        p.verdict_remarks = (p.verdict_remarks + "\n\n" + data.remarks) if p.verdict_remarks else data.remarks
    existing_fc = db.query(FactoryComm).filter(FactoryComm.product_id == product_id).first()
    if not existing_fc:
        db.add(FactoryComm(product_id=product_id, decided_action=None))
    log(db, product_id, f"Moved to On Hold from Rejected{f' — {data.remarks}' if data.remarks else ''}", current_user)
    push_notification(db, product_id, p.code_name, f"{p.code_name} moved to On Hold.", ["CEO", "Dev"])
    db.commit()
    return {"message": "Moved to On Hold"}


@router.post("/{product_id}/restore-archived")
def restore_archived_product(
    product_id: int,
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev")),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p or p.status != "Archived":
        raise HTTPException(status_code=400, detail="Product is not archived")
    check_and_bump(p, v)
    p.status = "On hold"
    p.status_changed_at = datetime.utcnow()
    # Ensure FactoryComm exists so the Hold tab can pick it up
    existing_fc = db.query(FactoryComm).filter(FactoryComm.product_id == product_id).first()
    if not existing_fc:
        db.add(FactoryComm(product_id=product_id, decided_action=None))
    log(db, product_id, "Restored from archive to On Hold", current_user)
    push_notification(db, product_id, p.code_name, "Product restored from archive to On Hold.", ["CEO", "Dev"])
    db.commit()
    return {"message": "Restored to On Hold"}


# ── Factory communications ────────────────────────────────────────────────

@router.post("/{product_id}/factory-comm/action")
def factory_action(
    product_id: int,
    data: FactoryActionReq,
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    check_and_bump(p, v)
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


@router.patch("/{product_id}")
def update_product(
    product_id: int,
    data: UpdateProductReq,
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "QA")),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    check_and_bump(p, v)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(p, field, value)
    log(db, product_id, "Product updated", current_user)
    db.commit()
    db.refresh(p)
    return p


# ── Order decision (post-golden, order lifecycle) ─────────────────────────

@router.get("/{product_id}/order-decision")
def get_order_decision(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    od = db.query(OrderDecision).filter(OrderDecision.product_id == product_id).first()
    if not od:
        return None
    return od


@router.post("/{product_id}/order-decision", status_code=201)
def create_order_decision(
    product_id: int,
    data: OrderDecisionReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    if data.state not in ("pending", "placed", "held", "dropped"):
        raise HTTPException(status_code=400, detail="state must be pending, placed, held, or dropped")
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    existing = db.query(OrderDecision).filter(OrderDecision.product_id == product_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Order decision already exists — use PATCH to update")
    from datetime import date
    od = OrderDecision(
        product_id=product_id,
        state=data.state,
        internal_code=data.internal_code,
        colors=data.colors,
        improvement_notes=data.improvement_notes,
        improved_golden_sample_expected=date.fromisoformat(data.improved_golden_sample_expected) if data.improved_golden_sample_expected else None,
        decided_by_id=current_user.id,
        decided_by_name=current_user.name,
        remarks=data.remarks,
    )
    db.add(od)
    log(db, product_id, f"Order decision created: {data.state}", current_user)
    push_notification(db, product_id, p.code_name, f"Order decision: {data.state}.", NOTIFY_ALL)
    db.commit()
    db.refresh(od)
    return od


@router.patch("/{product_id}/order-decision")
def update_order_decision(
    product_id: int,
    data: OrderDecisionReq,
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    if data.state not in ("pending", "placed", "held", "dropped"):
        raise HTTPException(status_code=400, detail="state must be pending, placed, held, or dropped")
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    check_and_bump(p, v)
    od = db.query(OrderDecision).filter(OrderDecision.product_id == product_id).first()
    if not od:
        raise HTTPException(status_code=404, detail="No order decision found — use POST to create")
    from datetime import date
    od.state = data.state
    od.internal_code = data.internal_code
    od.colors = data.colors
    od.improvement_notes = data.improvement_notes
    od.improved_golden_sample_expected = date.fromisoformat(data.improved_golden_sample_expected) if data.improved_golden_sample_expected else None
    od.remarks = data.remarks
    od.decided_by_id = current_user.id
    od.decided_by_name = current_user.name
    od.decided_at = datetime.utcnow()
    log(db, product_id, f"Order decision updated: {data.state}", current_user)
    push_notification(db, product_id, p.code_name, f"Order decision updated: {data.state}.", NOTIFY_ALL)
    db.commit()
    db.refresh(od)
    return od


class PlaceOrderFromHoldReq(BaseModel):
    colors: list                          # [{"color": "Black", "quantity": 100}, ...]
    improvement_notes: str                # required — always mandatory from Hold
    remarks: Optional[str] = None

@router.post("/{product_id}/place-order-from-hold", status_code=201)
def place_order_from_hold(
    product_id: int,
    data: PlaceOrderFromHoldReq,
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    if p.status != "On hold":
        raise HTTPException(status_code=400, detail="Product must be On hold to place order from hold")
    if not data.improvement_notes or not data.improvement_notes.strip():
        raise HTTPException(status_code=400, detail="improvement_notes is required when placing order from hold")
    check_and_bump(p, v)
    now = datetime.utcnow()

    # Move product to Approved
    p.status = "Approved"
    p.status_changed_at = now

    # Create GoldenWorkflow (purchase-notified immediately)
    gw = db.query(GoldenWorkflow).filter(GoldenWorkflow.product_id == product_id).first()
    if not gw:
        gw = GoldenWorkflow(product_id=product_id, purchase_notified_at=now, order_confirmed_at=now)
        db.add(gw)
        db.flush()
    else:
        gw.purchase_notified_at = gw.purchase_notified_at or now
        gw.order_confirmed_at = gw.order_confirmed_at or now

    # Create GoldenSampleTrack
    gs = db.query(GoldenSampleTrack).filter(GoldenSampleTrack.workflow_id == gw.id).first()
    if not gs:
        db.add(GoldenSampleTrack(workflow_id=gw.id, status="Requested", requested_at=now))

    # Create or update OrderDecision — always improvement_sample_expected
    internal_code = f"ORD-{product_id}-{int(now.timestamp())}"
    od = db.query(OrderDecision).filter(OrderDecision.product_id == product_id).first()
    if od:
        od.state = "placed"
        od.internal_code = od.internal_code or internal_code
        od.colors = data.colors
        od.improvement_notes = data.improvement_notes.strip()
        od.improved_golden_sample_expected = None
        od.decided_by_id = current_user.id
        od.decided_by_name = current_user.name
        od.decided_at = now
        od.remarks = data.remarks
    else:
        od = OrderDecision(
            product_id=product_id,
            state="placed",
            internal_code=internal_code,
            colors=data.colors,
            improvement_notes=data.improvement_notes.strip(),
            improved_golden_sample_expected=None,
            decided_by_id=current_user.id,
            decided_by_name=current_user.name,
            decided_at=now,
            remarks=data.remarks,
        )
        db.add(od)

    log(db, product_id, f"Order placed from On Hold ({internal_code}) — improvement requirement: {data.improvement_notes.strip()}", current_user)
    push_notification(db, product_id, p.code_name, f"Order placed from On Hold. Improvement sample required.", NOTIFY_ALL)
    db.commit()
    return {"message": "Order placed", "internal_code": internal_code}


@router.post("/{product_id}/order-decision/archive")
def archive_order_decision(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    od = db.query(OrderDecision).filter(OrderDecision.product_id == product_id).first()
    if not od:
        raise HTTPException(status_code=404, detail="No order decision found")
    od.order_archived = True
    db.commit()
    return {"message": "Archived"}


class ExpectedDateReq(BaseModel):
    expected_reply_date: str  # ISO date

@router.post("/{product_id}/factory-comm/expected-date")
def set_expected_reply_date(
    product_id: int,
    data: ExpectedDateReq,
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    check_and_bump(p, v)
    comm = db.query(FactoryComm).filter(FactoryComm.product_id == product_id).first()
    if not comm:
        raise HTTPException(status_code=404, detail="No factory comm found")
    comm.expected_reply_date = data.expected_reply_date
    log(db, product_id, f"Expected factory reply date set: {data.expected_reply_date}", current_user)
    push_notification(db, product_id, p.code_name, f"Awaiting factory reply by {data.expected_reply_date}.", ["CEO", "Dev", "Sales", "QA"])
    db.commit()
    return {"message": "Saved"}


class LogReplyReq(BaseModel):
    reply_summary: str   # Fully Accepted | Decision Pending | Partially Rejected
    reply_notes: Optional[str] = None

@router.post("/{product_id}/factory-comm/log-reply")
def log_factory_reply(
    product_id: int,
    data: LogReplyReq,
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    check_and_bump(p, v)
    comm = db.query(FactoryComm).filter(FactoryComm.product_id == product_id).first()
    if not comm:
        raise HTTPException(status_code=404, detail="No factory comm found")
    now = datetime.utcnow()
    comm.reply_received_at = now
    comm.reply_summary = data.reply_summary
    comm.reply_notes = data.reply_notes
    log(db, product_id, f"Factory replied — {data.reply_summary}{f': {data.reply_notes}' if data.reply_notes else ''}", current_user)
    push_notification(db, product_id, p.code_name, f"Factory replied: {data.reply_summary}.", ["CEO", "Dev", "Sales", "QA"])
    db.commit()
    return {"message": "Reply logged"}


class PartialResolvedReq(BaseModel):
    notes: Optional[str] = None

@router.post("/{product_id}/factory-comm/partial-resolved")
def partial_resolved(
    product_id: int,
    data: PartialResolvedReq = PartialResolvedReq(),
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    check_and_bump(p, v)
    comm = db.query(FactoryComm).filter(FactoryComm.product_id == product_id).first()
    if not comm:
        raise HTTPException(status_code=404, detail="No factory comm found")
    comm.partial_resolved_at = datetime.utcnow()
    log(db, product_id, f"Factory finalized pending points{f' — {data.notes}' if data.notes else ''}", current_user)
    db.commit()
    return {"message": "Saved"}


class SendBackNpdReq(BaseModel):
    note: Optional[str] = None

@router.post("/{product_id}/factory-comm/send-back-npd")
def send_back_to_npd(
    product_id: int,
    data: SendBackNpdReq = SendBackNpdReq(),
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    check_and_bump(p, v)
    comm = db.query(FactoryComm).filter(FactoryComm.product_id == product_id).first()
    if not comm:
        raise HTTPException(status_code=404, detail="No factory comm found")
    # Set status back to Pending NPD so QA can re-submit report for this version
    p.status = "Pending NPD"
    p.status_changed_at = datetime.utcnow()
    note_text = f"Sent back to NPD Testing — v{p.sample_version or 1}{f' · {data.note}' if data.note else ''}"
    entry = {"stage": "Internal Decision Pending", "note": note_text, "by": current_user.name, "timestamp": datetime.utcnow().isoformat()}
    comm.case_log = (comm.case_log or []) + [entry]
    log(db, product_id, note_text, current_user)
    push_notification(db, product_id, p.code_name, f"{p.code_name} — sent back to NPD Testing (v{p.sample_version or 1}).", ["CEO", "Dev", "Sales", "QA"])
    db.commit()
    return {"message": "Sent back to NPD"}


class SendBackReq(BaseModel):
    expected_reply_date: str
    note: Optional[str] = None

@router.post("/{product_id}/factory-comm/send-back")
def send_back_to_factory(
    product_id: int,
    data: SendBackReq,
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    check_and_bump(p, v)
    comm = db.query(FactoryComm).filter(FactoryComm.product_id == product_id).first()
    if not comm:
        raise HTTPException(status_code=404, detail="No factory comm found")
    from datetime import date as date_type
    # Reset reply + sample state so stage goes back to "Factory Not Responded"
    comm.expected_reply_date = date_type.fromisoformat(data.expected_reply_date)
    comm.reply_received_at = None
    comm.reply_summary = None
    comm.reply_notes = None
    comm.partial_resolved_at = None
    comm.improvement_sample_received_at = None
    p.status = "On hold"
    p.status_changed_at = datetime.utcnow()
    note_text = f"Sent back to factory — awaiting reply by {data.expected_reply_date}{f' · {data.note}' if data.note else ''}"
    entry = {"stage": "Factory Not Responded", "note": note_text, "by": current_user.name, "timestamp": datetime.utcnow().isoformat()}
    comm.case_log = (comm.case_log or []) + [entry]
    log(db, product_id, note_text, current_user)
    push_notification(db, product_id, p.code_name, f"{p.code_name} — sent back to factory, reply expected by {data.expected_reply_date}.", ["CEO", "Dev", "Sales", "QA"])
    db.commit()
    return {"message": "Sent back"}


class ImprovementSampleReq(BaseModel):
    expected_date: Optional[str] = None

@router.post("/{product_id}/factory-comm/improvement-sample")
def mark_improvement_sample(
    product_id: int,
    data: ImprovementSampleReq = ImprovementSampleReq(),
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    check_and_bump(p, v)
    comm = db.query(FactoryComm).filter(FactoryComm.product_id == product_id).first()
    if not comm:
        raise HTTPException(status_code=404, detail="No factory comm found")
    next_version = (p.sample_version or 1) + 1
    p.sample_version = next_version
    p.status = "On hold"
    p.status_changed_at = datetime.utcnow()
    comm.improvement_sample_expected = True
    comm.improvement_sample_received_at = None
    # Reset reply state so stage loops back to "Factory Not Responded"
    comm.reply_received_at = None
    comm.reply_summary = None
    comm.reply_notes = None
    comm.partial_resolved_at = None
    if data.expected_date:
        comm.improvement_sample_expected_date = data.expected_date
    log(db, product_id, f"Improvement sample expected (v{next_version}) — back to factory", current_user)
    push_notification(db, product_id, p.code_name, f"{p.code_name} — improvement sample v{next_version} requested, awaiting factory.", ["CEO", "Dev", "Sales", "QA"])
    db.commit()
    return {"message": "Marked", "sample_version": next_version}


class ImprovementSampleReceivedReq(BaseModel):
    received_date: Optional[str] = None   # ISO date, defaults to today

@router.post("/{product_id}/factory-comm/improvement-sample-received")
def improvement_sample_received(
    product_id: int,
    data: ImprovementSampleReceivedReq = ImprovementSampleReceivedReq(),
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    check_and_bump(p, v)
    comm = db.query(FactoryComm).filter(FactoryComm.product_id == product_id).first()
    if not comm:
        raise HTTPException(status_code=404, detail="No factory comm found")
    now = datetime.utcnow()
    received_date = data.received_date or now.date().isoformat()
    comm.improvement_sample_received_at = received_date
    # Move product back to NPD Testing
    p.status = "Pending NPD"
    p.status_changed_at = now
    log(db, product_id, f"Improvement sample v{p.sample_version or 1} received ({received_date}) — sent to NPD Testing", current_user)
    push_notification(db, product_id, p.code_name, f"Improvement sample v{p.sample_version or 1} received for {p.code_name} — sent to NPD Testing.", ["CEO", "Dev", "Sales", "QA"])
    db.commit()
    return {"message": "Received", "sample_version": p.sample_version or 1}


class InternalDecisionReq(BaseModel):
    decision: str                   # Approved | Rejected | Order Placed
    notes: Optional[str] = None
    improvement_needed: bool = False
    improvement_remarks: Optional[str] = None
    colors: Optional[list] = None   # for Order Placed

@router.post("/{product_id}/factory-comm/internal-decision")
def internal_decision(
    product_id: int,
    data: InternalDecisionReq,
    v: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    check_and_bump(p, v)
    comm = db.query(FactoryComm).filter(FactoryComm.product_id == product_id).first()
    if not comm:
        raise HTTPException(status_code=404, detail="No factory comm found")
    now = datetime.utcnow()
    comm.internal_decision = data.decision
    comm.internal_decision_at = now
    comm.internal_decision_by = current_user.name
    comm.internal_decision_notes = data.notes

    if data.decision in ("Approved", "Order Placed"):
        p.status = "Approved"
        p.status_changed_at = now
        import random, string
        code = "AP-" + "".join(random.choices(string.ascii_uppercase, k=3))
        db.add(GoldenWorkflow(product_id=product_id))
        od = OrderDecision(
            product_id=product_id,
            state="placed" if data.decision == "Order Placed" else "pending",
            internal_code=code,
            colors=data.colors or [],
            decided_by_id=current_user.id,
            decided_by_name=current_user.name,
            decided_at=now,
            improvement_notes=data.improvement_remarks if data.improvement_needed else None,
            improved_golden_sample_expected=now.date() if data.improvement_needed else None,
        )
        db.add(od)
        log(db, product_id, f"Internal decision: {data.decision} — moved to Approved{f' — {data.notes}' if data.notes else ''}", current_user)
        push_notification(db, product_id, p.code_name, f"{p.code_name} approved from hold.", ["CEO", "Dev", "Sales", "QA"])
    elif data.decision == "Rejected":
        p.status = "Rejected"
        p.status_changed_at = now
        p.rejected_by = current_user.name
        log(db, product_id, f"Internal decision: Rejected{f' — {data.notes}' if data.notes else ''}", current_user)
        push_notification(db, product_id, p.code_name, f"{p.code_name} rejected from hold.", ["CEO", "Dev"])
    else:
        raise HTTPException(status_code=400, detail="Invalid decision")

    db.commit()
    return {"message": data.decision}


class AppendCaseLogReq(BaseModel):
    stage: str
    note: str

@router.post("/{product_id}/factory-comm/case-log")
def append_case_log(
    product_id: int,
    data: AppendCaseLogReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comm = db.query(FactoryComm).filter(FactoryComm.product_id == product_id).first()
    if not comm:
        raise HTTPException(status_code=404, detail="No factory comm found")
    entry = {"stage": data.stage, "note": data.note, "by": current_user.name, "timestamp": datetime.utcnow().isoformat()}
    comm.case_log = (comm.case_log or []) + [entry]
    db.commit()
    return {"message": "Logged"}


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
