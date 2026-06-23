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


# ── schemas ───────────────────────────────────────────────────────────────

class DetailsReq(BaseModel):
    product_name: str
    sku_code: str
    colour: str
    markings: str


class ComplianceReq(BaseModel):
    status: str
    expected_date: Optional[str] = None


class PackagingVendorReq(BaseModel):
    vendor_name: str
    sample_id_received: str


class GoldenSampleReq(BaseModel):
    status: str
    expected_date: Optional[str] = None


# ── read full workflow ─────────────────────────────────────────────────────

@router.get("/{product_id}")
def get_golden(product_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    details = db.query(GoldenDetails).filter(GoldenDetails.workflow_id == wf.id).first()
    compliance = db.query(ComplianceTrack).filter(ComplianceTrack.workflow_id == wf.id).first()
    packaging = db.query(PackagingTrack).filter(PackagingTrack.workflow_id == wf.id).first()
    golden_sample = db.query(GoldenSampleTrack).filter(GoldenSampleTrack.workflow_id == wf.id).first()
    return {
        "workflow": wf,
        "details": details,
        "compliance": compliance,
        "packaging": packaging,
        "golden_sample": golden_sample,
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
    existing = db.query(GoldenDetails).filter(GoldenDetails.workflow_id == wf.id).first()
    if existing:
        existing.product_name = data.product_name
        existing.sku_code = data.sku_code
        existing.colour = data.colour
        existing.markings = data.markings
        existing.saved_at = datetime.utcnow()
    else:
        db.add(GoldenDetails(
            workflow_id=wf.id,
            product_name=data.product_name,
            sku_code=data.sku_code,
            colour=data.colour,
            markings=data.markings,
        ))
    log(db, product_id, "Product details saved", current_user)
    push_notification(db, product_id, p.code_name, "Product details saved — compliance, packaging, and golden sample unlocked.", NOTIFY_ALL)
    db.commit()
    return {"message": "Details saved"}


# ── stage 3a: compliance ──────────────────────────────────────────────────

@router.post("/{product_id}/compliance")
def update_compliance(
    product_id: int,
    data: ComplianceReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    existing = db.query(ComplianceTrack).filter(ComplianceTrack.workflow_id == wf.id).first()
    now = datetime.utcnow()
    if existing:
        existing.status = data.status
        existing.expected_date = data.expected_date or None
        if data.status == "Confirmed":
            existing.confirmed_at = now
    else:
        db.add(ComplianceTrack(
            workflow_id=wf.id,
            status=data.status,
            expected_date=data.expected_date or None,
            confirmed_at=now if data.status == "Confirmed" else None,
        ))
    log(db, product_id, f"Compliance: {data.status}", current_user)
    push_notification(db, product_id, p.code_name, f"Compliance status updated: {data.status}.", NOTIFY_ALL)
    db.commit()
    return {"message": "Compliance updated"}


# ── stage 3b: packaging ───────────────────────────────────────────────────

@router.post("/{product_id}/packaging/vendor")
def set_vendor(
    product_id: int,
    data: PackagingVendorReq,
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
        existing.sample_id_received = data.sample_id_received
        existing.sample_received_at = now
    else:
        db.add(PackagingTrack(
            workflow_id=wf.id,
            vendor_name=data.vendor_name,
            vendor_set_at=now,
            sample_id_received=data.sample_id_received,
            sample_received_at=now,
        ))
    log(db, product_id, f"Packaging vendor set: {data.vendor_name}", current_user)
    push_notification(db, product_id, p.code_name, f"Packaging vendor set: {data.vendor_name}.", NOTIFY_ALL)
    db.commit()
    return {"message": "Vendor set"}


class ImageUploadReq(BaseModel):
    image_url: str
    file_name: str


@router.post("/{product_id}/packaging/kld")
def upload_kld(
    product_id: int,
    data: ImageUploadReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    pkg = db.query(PackagingTrack).filter(PackagingTrack.workflow_id == wf.id).first()
    if not pkg:
        raise HTTPException(status_code=400, detail="Set vendor first")
    pkg.kld_image_url = data.image_url
    pkg.kld_at = datetime.utcnow()
    pkg.kld_approved_at = None
    pkg.kld_rejected_at = None
    log(db, product_id, "Key line drawing uploaded", current_user)
    push_notification(db, product_id, p.code_name, "Key line drawing uploaded — awaiting approval.", NOTIFY_ALL)
    db.commit()
    return {"message": "KLD uploaded"}


class ApproveReq(BaseModel):
    approved: bool


@router.post("/{product_id}/packaging/kld/approve")
def approve_kld(
    product_id: int,
    data: ApproveReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    pkg = db.query(PackagingTrack).filter(PackagingTrack.workflow_id == wf.id).first()
    if not pkg or not pkg.kld_image_url:
        raise HTTPException(status_code=400, detail="No KLD uploaded")
    now = datetime.utcnow()
    if data.approved:
        pkg.kld_approved_at = now
        pkg.kld_rejected_at = None
        action = "Key line drawing approved"
    else:
        pkg.kld_rejected_at = now
        pkg.kld_approved_at = None
        action = "Key line drawing rejected"
    log(db, product_id, action, current_user)
    push_notification(db, product_id, p.code_name, f"{action}.", NOTIFY_ALL)
    db.commit()
    return {"message": action}


@router.post("/{product_id}/packaging/artwork")
def upload_artwork(
    product_id: int,
    data: ImageUploadReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    pkg = db.query(PackagingTrack).filter(PackagingTrack.workflow_id == wf.id).first()
    if not pkg or not pkg.kld_approved_at:
        raise HTTPException(status_code=400, detail="KLD must be approved before artwork")
    pkg.artwork_image_url = data.image_url
    pkg.artwork_started_at = datetime.utcnow()
    pkg.artwork_approved_at = None
    pkg.artwork_rejected_at = None
    log(db, product_id, "Artwork uploaded", current_user)
    push_notification(db, product_id, p.code_name, "Artwork uploaded — awaiting approval.", NOTIFY_ALL)
    db.commit()
    return {"message": "Artwork uploaded"}


@router.post("/{product_id}/packaging/artwork/approve")
def approve_artwork(
    product_id: int,
    data: ApproveReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    pkg = db.query(PackagingTrack).filter(PackagingTrack.workflow_id == wf.id).first()
    if not pkg or not pkg.artwork_image_url:
        raise HTTPException(status_code=400, detail="No artwork uploaded")
    now = datetime.utcnow()
    if data.approved:
        pkg.artwork_approved_at = now
        pkg.artwork_rejected_at = None
        action = "Artwork approved"
    else:
        pkg.artwork_rejected_at = now
        pkg.artwork_approved_at = None
        action = "Artwork rejected"
    log(db, product_id, action, current_user)
    push_notification(db, product_id, p.code_name, f"{action}.", NOTIFY_ALL)
    db.commit()
    return {"message": action}


@router.post("/{product_id}/packaging/release")
def release_packaging(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    pkg = db.query(PackagingTrack).filter(PackagingTrack.workflow_id == wf.id).first()
    if not pkg or not pkg.artwork_approved_at:
        raise HTTPException(status_code=400, detail="Artwork must be approved before release")
    pkg.released_at = datetime.utcnow()
    log(db, product_id, "Packaging released", current_user)
    push_notification(db, product_id, p.code_name, "Packaging released.", NOTIFY_ALL)
    db.commit()
    return {"message": "Packaging released"}


# ── stage 3c: golden sample ───────────────────────────────────────────────

@router.post("/{product_id}/golden-sample")
def update_golden_sample(
    product_id: int,
    data: GoldenSampleReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("CEO", "Dev", "Purchase")),
):
    wf = get_workflow_or_404(product_id, db)
    p = db.query(Product).filter(Product.id == product_id).first()
    existing = db.query(GoldenSampleTrack).filter(GoldenSampleTrack.workflow_id == wf.id).first()
    now = datetime.utcnow()
    if existing:
        existing.status = data.status
        existing.expected_date = data.expected_date or None
        if data.status == "Received":
            existing.received_at = now
    else:
        db.add(GoldenSampleTrack(
            workflow_id=wf.id,
            status=data.status,
            expected_date=data.expected_date or None,
            received_at=now if data.status == "Received" else None,
        ))
    log(db, product_id, f"Golden sample: {data.status}", current_user)
    push_notification(db, product_id, p.code_name, f"Golden sample status: {data.status}.", NOTIFY_ALL)
    db.commit()
    return {"message": "Golden sample updated"}
