import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from models import (
    Product, GoldenWorkflow, GoldenDetails,
    ComplianceTrack, PackagingTrack, GoldenSampleTrack,
    ActivityLog, Notification,
)
from auth import get_current_user, require_role
from models import User

router = APIRouter()

NOTIFY_ALL = ["CEO", "Dev", "Purchase"]


def log(db: Session, product_id: int, action: str, user: User, note: str = None):
    db.add(ActivityLog(
        product_id=product_id,
        action=action,
        note=note,
        performed_by_id=user.id,
        performed_by_name=user.name,
    ))


def push_notification(db, product_id, product_name, message, target_roles):
    db.add(Notification(
        product_id=product_id,
        product_name=product_name,
        message=message,
        target_roles=json.dumps(target_roles),
    ))


def get_workflow_or_404(product_id: int, db: Session) -> GoldenWorkflow:
    wf = db.query(GoldenWorkflow).filter(GoldenWorkflow.product_id == product_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="No golden workflow for this product")
    return wf


def get_cert_or_404(wf_id: int, name: str, db: Session) -> ComplianceTrack:
    tr = db.query(ComplianceTrack).filter(
        ComplianceTrack.workflow_id == wf_id,
        ComplianceTrack.name == name,
    ).first()
    if not tr:
        raise HTTPException(status_code=404, detail=f"No compliance track for {name}")
    return tr


# ── schemas ───────────────────────────────────────────────────────────────

class DetailsReq(BaseModel):
    product_name: str
    sku_code: Optional[str] = ""
    colour: Optional[str] = ""
    markings: Optional[str] = ""
    colour_confirmed: bool = False
    logo_marking_confirmed: bool = False
    rating_label_confirmed: bool = False
    bom_confirmed: bool = False


class CertNameReq(BaseModel):
    name: str


class CertDispatchReq(BaseModel):
    name: str
    expected_delivery_date: Optional[str] = None


class CertExpectedDateReq(BaseModel):
    name: str
    expected_delivery_date: str


class VendorReq(BaseModel):
    vendor_name: str


class PackagingDispatchReq(BaseModel):
    expected_delivery_date: Optional[str] = None


class PackagingExpectedDateReq(BaseModel):
    expected_delivery_date: str


class PackagingStatusReq(BaseModel):
    sample_status: str  # Awaiting | Received


class PackagingDecideReq(BaseModel):
    decision: str  # Approved | Improvement Required
    improvement_notes: Optional[str] = None


class GoldenSampleRequestReq(BaseModel):
    expected_date: Optional[str] = None


class GoldenSampleExpectedDateReq(BaseModel):
    expected_date: str


# ── read full workflow ─────────────────────────────────────────────────────

def _serialize(obj):
    if obj is None:
        return None
    result = {}
    for c in obj.__table__.columns:
        val = getattr(obj, c.name)
        if hasattr(val, 'isoformat'):
            val = val.isoformat()
        result[c.name] = val
    return result


@router.get("/{product_id}")
def get_golden(product_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    wf = get_workflow_or_404(product_id, db)
    details = db.query(GoldenDetails).filter(GoldenDetails.workflow_id == wf.id).first()
    compliance_tracks = db.query(ComplianceTrack).filter(ComplianceTrack.workflow_id == wf.id).all()
    packaging = db.query(PackagingTrack).filter(PackagingTrack.workflow_id == wf.id).first()
    golden_sample = db.query(GoldenSampleTrack).filter(GoldenSampleTrack.workflow_id == wf.id).first()
    return {
        "workflow": _serialize(wf),
        "details": _serialize(details),
        "compliance": [_serialize(t) for t in compliance_tracks],
        "packaging": _serialize(packaging),
        "golden_sample": _serialize(golden_sample),
    }


# ── stage 1: purchase ─────────────────────────────────────────────────────

@router.post("/{product_id}/notify-purchase")
def notify_purchase(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    wf.purchase_notified_at = datetime.utcnow()
    log(db, product_id, "Purchase team notified", current_user)
    push_notification(db, product_id, p.code_name, "Purchase team notified for order.", NOTIFY_ALL)
    db.commit()
    return {"message": "Purchase notified"}


@router.post("/{product_id}/confirm-order")
def confirm_order(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    wf.order_confirmed_at = datetime.utcnow()
    log(db, product_id, "Order confirmed", current_user)
    push_notification(db, product_id, p.code_name, "Order confirmed — details stage unlocked.", NOTIFY_ALL)
    db.commit()
    return {"message": "Order confirmed"}


# ── stage 2: details ──────────────────────────────────────────────────────

@router.post("/{product_id}/details")
def save_details(
    product_id: int,
    data: DetailsReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    now = datetime.utcnow()
    existing = db.query(GoldenDetails).filter(GoldenDetails.workflow_id == wf.id).first()
    if existing:
        existing.product_name = data.product_name
        existing.sku_code = data.sku_code or ""
        existing.colour = data.colour or ""
        existing.markings = data.markings or ""
        existing.colour_confirmed = data.colour_confirmed
        existing.logo_marking_confirmed = data.logo_marking_confirmed
        existing.rating_label_confirmed = data.rating_label_confirmed
        existing.bom_confirmed = data.bom_confirmed
        existing.saved_at = now
    else:
        db.add(GoldenDetails(
            workflow_id=wf.id,
            product_name=data.product_name,
            sku_code=data.sku_code or "",
            colour=data.colour or "",
            markings=data.markings or "",
            colour_confirmed=data.colour_confirmed,
            logo_marking_confirmed=data.logo_marking_confirmed,
            rating_label_confirmed=data.rating_label_confirmed,
            bom_confirmed=data.bom_confirmed,
            saved_at=now,
        ))
    # Update product code_name if provided
    if data.product_name.strip():
        p.code_name = data.product_name.strip()
    log(db, product_id, "Product details saved", current_user)
    push_notification(db, product_id, p.code_name, "Product details saved.", NOTIFY_ALL)
    db.commit()
    return {"message": "Details saved"}


# ── compliance not needed ─────────────────────────────────────────────────

@router.post("/{product_id}/compliance-not-needed")
def set_compliance_not_needed(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    wf.compliance_not_needed = True
    log(db, product_id, "Compliance marked as not needed", current_user)
    db.commit()
    return {"message": "Compliance not needed"}


@router.post("/{product_id}/compliance-needed")
def set_compliance_needed(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    wf.compliance_not_needed = False
    log(db, product_id, "Compliance restored", current_user)
    db.commit()
    return {"message": "Compliance needed"}


# ── per-cert compliance ───────────────────────────────────────────────────

@router.post("/{product_id}/compliance/initiate")
def initiate_compliance(
    product_id: int,
    data: CertNameReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    existing = db.query(ComplianceTrack).filter(
        ComplianceTrack.workflow_id == wf.id,
        ComplianceTrack.name == data.name,
    ).first()
    if not existing:
        db.add(ComplianceTrack(
            workflow_id=wf.id,
            name=data.name,
            initiated_at=datetime.utcnow(),
        ))
    log(db, product_id, f"Compliance initiated — {data.name}", current_user)
    push_notification(db, product_id, p.code_name, f"Compliance initiated — {data.name}.", NOTIFY_ALL)
    db.commit()
    return {"message": f"{data.name} initiated"}


@router.post("/{product_id}/compliance/dispatch")
def dispatch_compliance_sample(
    product_id: int,
    data: CertDispatchReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    tr = get_cert_or_404(wf.id, data.name, db)
    tr.sample_dispatched_at = datetime.utcnow()
    if data.expected_delivery_date:
        tr.expected_delivery_date = data.expected_delivery_date
    log(db, product_id, f"Compliance sample dispatched — {data.name}", current_user)
    push_notification(db, product_id, p.code_name, f"Compliance sample dispatched — {data.name}.", NOTIFY_ALL)
    db.commit()
    return {"message": f"{data.name} sample dispatched"}


@router.put("/{product_id}/compliance/expected-date")
def update_compliance_expected_date(
    product_id: int,
    data: CertExpectedDateReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    tr = get_cert_or_404(wf.id, data.name, db)
    tr.expected_delivery_date = data.expected_delivery_date
    db.commit()
    return {"message": "Expected date updated"}


@router.post("/{product_id}/compliance/cert-received")
def mark_cert_received(
    product_id: int,
    data: CertNameReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    tr = get_cert_or_404(wf.id, data.name, db)
    tr.cert_received_at = datetime.utcnow()
    log(db, product_id, f"Certification received — {data.name}", current_user)
    push_notification(db, product_id, p.code_name, f"Certification received — {data.name}.", NOTIFY_ALL)
    db.commit()
    return {"message": f"{data.name} certification received"}


@router.post("/{product_id}/compliance/confirm")
def confirm_compliance(
    product_id: int,
    data: CertNameReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    tr = get_cert_or_404(wf.id, data.name, db)
    tr.confirmed_at = datetime.utcnow()
    log(db, product_id, f"Compliance confirmed — {data.name}", current_user)
    push_notification(db, product_id, p.code_name, f"Compliance confirmed — {data.name} ✓.", NOTIFY_ALL)
    db.commit()
    return {"message": f"{data.name} confirmed"}


# ── packaging ─────────────────────────────────────────────────────────────

@router.post("/{product_id}/packaging/vendor")
def set_vendor(
    product_id: int,
    data: VendorReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    existing = db.query(PackagingTrack).filter(PackagingTrack.workflow_id == wf.id).first()
    now = datetime.utcnow()
    if existing:
        existing.vendor_name = data.vendor_name
        existing.vendor_set_at = now
    else:
        db.add(PackagingTrack(
            workflow_id=wf.id,
            vendor_name=data.vendor_name,
            vendor_set_at=now,
            sample_version=1,
        ))
    log(db, product_id, f"Packaging vendor set: {data.vendor_name}", current_user)
    push_notification(db, product_id, p.code_name, f"Packaging vendor set: {data.vendor_name}.", NOTIFY_ALL)
    db.commit()
    return {"message": "Vendor set"}


@router.post("/{product_id}/packaging/dispatch")
def dispatch_packaging_sample(
    product_id: int,
    data: PackagingDispatchReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    pk = db.query(PackagingTrack).filter(PackagingTrack.workflow_id == wf.id).first()
    if not pk:
        raise HTTPException(status_code=400, detail="Set vendor first")
    pk.sample_dispatched_at = datetime.utcnow()
    if data.expected_delivery_date:
        pk.expected_delivery_date = data.expected_delivery_date
    log(db, product_id, f"Packaging sample dispatched (v{pk.sample_version})", current_user)
    push_notification(db, product_id, p.code_name, f"Packaging sample v{pk.sample_version} dispatched.", NOTIFY_ALL)
    db.commit()
    return {"message": "Sample dispatched"}


@router.put("/{product_id}/packaging/expected-date")
def update_packaging_expected_date(
    product_id: int,
    data: PackagingExpectedDateReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    pk = db.query(PackagingTrack).filter(PackagingTrack.workflow_id == wf.id).first()
    if not pk:
        raise HTTPException(status_code=400, detail="No packaging track")
    pk.expected_delivery_date = data.expected_delivery_date
    db.commit()
    return {"message": "Expected date updated"}


@router.post("/{product_id}/packaging/status")
def set_packaging_status(
    product_id: int,
    data: PackagingStatusReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    pk = db.query(PackagingTrack).filter(PackagingTrack.workflow_id == wf.id).first()
    if not pk:
        raise HTTPException(status_code=400, detail="No packaging track")
    pk.sample_status = data.sample_status
    if data.sample_status == "Received":
        pk.sample_received_at = datetime.utcnow()
    db.commit()
    return {"message": f"Status set: {data.sample_status}"}


@router.post("/{product_id}/packaging/decide")
def decide_packaging(
    product_id: int,
    data: PackagingDecideReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    pk = db.query(PackagingTrack).filter(PackagingTrack.workflow_id == wf.id).first()
    if not pk:
        raise HTTPException(status_code=400, detail="No packaging track")
    now = datetime.utcnow()
    if data.decision == "Improvement Required":
        # Save notes but reset decision so v{n+1} is not blocked
        pk.improvement_notes = data.improvement_notes
        pk.sample_version = (pk.sample_version or 1) + 1
        pk.decision = None
        pk.decision_at = None
        pk.sample_dispatched_at = None
        pk.sample_received_at = None
        pk.sample_status = None
    else:
        pk.decision = data.decision
        pk.decision_at = now
    log(db, product_id, f"Packaging decision: {data.decision}", current_user)
    push_notification(db, product_id, p.code_name, f"Packaging sample {data.decision}.", NOTIFY_ALL)
    db.commit()
    return {"message": data.decision}


@router.post("/{product_id}/packaging/kld-acknowledged")
def kld_acknowledged(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    pk = db.query(PackagingTrack).filter(PackagingTrack.workflow_id == wf.id).first()
    if not pk:
        raise HTTPException(status_code=400, detail="No packaging track")
    pk.kld_acknowledged_at = datetime.utcnow()
    log(db, product_id, "KLD received and acknowledged", current_user)
    push_notification(db, product_id, p.code_name, "KLD received — awaiting email to designer.", NOTIFY_ALL)
    db.commit()
    return {"message": "KLD acknowledged"}


@router.post("/{product_id}/packaging/kld-emailed")
def kld_emailed_to_designer(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    pk = db.query(PackagingTrack).filter(PackagingTrack.workflow_id == wf.id).first()
    if not pk:
        raise HTTPException(status_code=400, detail="No packaging track")
    pk.kld_emailed_to_designer_at = datetime.utcnow()
    log(db, product_id, "KLD emailed to designer — packaging complete", current_user)
    push_notification(db, product_id, p.code_name, "KLD emailed to designer — packaging complete.", NOTIFY_ALL)
    db.commit()
    return {"message": "KLD emailed to designer"}


# ── golden sample ─────────────────────────────────────────────────────────

@router.post("/{product_id}/golden-sample/request")
def request_golden_sample(
    product_id: int,
    data: GoldenSampleRequestReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    now = datetime.utcnow()
    existing = db.query(GoldenSampleTrack).filter(GoldenSampleTrack.workflow_id == wf.id).first()
    if existing:
        existing.status = "Requested"
        existing.requested_at = now
        if data.expected_date:
            existing.expected_date = data.expected_date
    else:
        db.add(GoldenSampleTrack(
            workflow_id=wf.id,
            status="Requested",
            requested_at=now,
            expected_date=data.expected_date or None,
        ))
    log(db, product_id, "Golden sample requested", current_user)
    push_notification(db, product_id, p.code_name, "Golden sample requested.", NOTIFY_ALL)
    db.commit()
    return {"message": "Golden sample requested"}


@router.put("/{product_id}/golden-sample/expected-date")
def update_golden_sample_expected_date(
    product_id: int,
    data: GoldenSampleExpectedDateReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    gs = db.query(GoldenSampleTrack).filter(GoldenSampleTrack.workflow_id == wf.id).first()
    if not gs:
        raise HTTPException(status_code=404, detail="No golden sample track")
    gs.expected_date = data.expected_date
    db.commit()
    return {"message": "Expected date updated"}


@router.post("/{product_id}/golden-sample/received")
def mark_golden_sample_received(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    gs = db.query(GoldenSampleTrack).filter(GoldenSampleTrack.workflow_id == wf.id).first()
    if not gs:
        raise HTTPException(status_code=404, detail="No golden sample track")
    now = datetime.utcnow()
    gs.status = "Received"
    gs.received_at = now
    log(db, product_id, "Golden sample received", current_user)
    push_notification(db, product_id, p.code_name, "Golden sample received ✓.", NOTIFY_ALL)
    db.commit()
    return {"message": "Golden sample received"}


# ── archive ───────────────────────────────────────────────────────────────

@router.post("/{product_id}/archive/golden-sample")
def archive_golden_sample(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    wf.golden_sample_archived = True
    db.commit()
    return {"message": "Golden sample archived"}


@router.post("/{product_id}/archive/compliance")
def archive_compliance(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    wf.compliance_archived = True
    db.commit()
    return {"message": "Compliance archived"}


@router.post("/{product_id}/archive/packaging")
def archive_packaging(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    wf.packaging_archived = True
    db.commit()
    return {"message": "Packaging archived"}
