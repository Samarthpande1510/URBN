from sqlalchemy import Column, Integer, String, DateTime, Date, ForeignKey, Text, Boolean
from datetime import datetime, timedelta
from database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password = Column(String, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)          # QA | CEO | Dev | Purchase | STAFF
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    token = Column(String, nullable=False)
    expires_at = Column(DateTime, default=lambda: datetime.utcnow() + timedelta(days=7))
    revoked = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True)
    code_name = Column(String, nullable=False)
    sku_code = Column(String, nullable=False)
    factory = Column(String)
    assigned_qa = Column(String)
    priority = Column(String, default="Medium")    # Low | Medium | High | Urgent
    status = Column(String, default="Pending NPD") # Pending NPD | Pending Decision | Approved | On hold | Rejected
    deadline = Column(Date, nullable=False)
    specifications = Column(Text)
    sample_received = Column(Boolean, default=False)
    sample_given_date = Column(Date)
    image_url = Column(String)                     # stored as S3/file URL, not base64
    status_changed_at = Column(DateTime)
    rejected_by = Column(String)                   # name of person who rejected
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), index=True)
    action = Column(String, nullable=False)
    note = Column(Text)
    performed_by_id = Column(Integer, ForeignKey("users.id"))
    performed_by_name = Column(String)             # denormalised for display speed
    timestamp = Column(DateTime, default=datetime.utcnow)


class NpdReport(Base):
    __tablename__ = "npd_reports"
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), unique=True)
    file_name = Column(String)
    file_url = Column(String)                      # S3 URL — not base64 in DB
    outcome = Column(String, nullable=False)       # Pass | Not Pass
    notes = Column(Text)
    submitted_by_id = Column(Integer, ForeignKey("users.id"))
    submitted_at = Column(DateTime, default=datetime.utcnow)


class FactoryComm(Base):
    __tablename__ = "factory_comms"
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), unique=True)
    decided_action = Column(String)                # EMAIL_FACTORY | DROP
    decided_at = Column(DateTime)
    acknowledged_at = Column(DateTime)
    reply_at = Column(DateTime)
    reply_text = Column(Text)
    tentative_return_date = Column(Date)


class FactoryCommEdit(Base):
    __tablename__ = "factory_comm_edits"
    id = Column(Integer, primary_key=True)
    factory_comm_id = Column(Integer, ForeignKey("factory_comms.id", ondelete="CASCADE"))
    edited_at = Column(DateTime, default=datetime.utcnow)
    previous_reply = Column(Text)
    previous_date = Column(Date)


class GoldenWorkflow(Base):
    __tablename__ = "golden_workflows"
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), unique=True)
    purchase_notified_at = Column(DateTime)
    order_confirmed_at = Column(DateTime)


class GoldenDetails(Base):
    __tablename__ = "golden_details"
    id = Column(Integer, primary_key=True)
    workflow_id = Column(Integer, ForeignKey("golden_workflows.id", ondelete="CASCADE"), unique=True)
    product_name = Column(String)
    sku_code = Column(String)
    colour = Column(String)
    markings = Column(String)
    saved_at = Column(DateTime, default=datetime.utcnow)


class ComplianceTrack(Base):
    __tablename__ = "compliance_tracks"
    id = Column(Integer, primary_key=True)
    workflow_id = Column(Integer, ForeignKey("golden_workflows.id", ondelete="CASCADE"), unique=True)
    status = Column(String, default="Pending")
    expected_date = Column(Date)
    confirmed_at = Column(DateTime)


class PackagingTrack(Base):
    __tablename__ = "packaging_tracks"
    id = Column(Integer, primary_key=True)
    workflow_id = Column(Integer, ForeignKey("golden_workflows.id", ondelete="CASCADE"), unique=True)
    vendor_name = Column(String)
    vendor_set_at = Column(DateTime)
    sample_id_received = Column(String)
    sample_received_at = Column(DateTime)
    kld_at = Column(DateTime)
    kld_image_url = Column(String)
    kld_approved_at = Column(DateTime)
    kld_rejected_at = Column(DateTime)
    artwork_started_at = Column(DateTime)
    artwork_image_url = Column(String)
    artwork_approved_at = Column(DateTime)
    artwork_rejected_at = Column(DateTime)
    released_at = Column(DateTime)


class GoldenSampleTrack(Base):
    __tablename__ = "golden_sample_tracks"
    id = Column(Integer, primary_key=True)
    workflow_id = Column(Integer, ForeignKey("golden_workflows.id", ondelete="CASCADE"), unique=True)
    status = Column(String, default="Not started")  # Not started | Requested | In progress | Received
    expected_date = Column(Date)
    received_at = Column(DateTime)


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"))
    product_name = Column(String)
    message = Column(Text, nullable=False)
    target_roles = Column(String, nullable=False)  # JSON: '["CEO","Dev"]'
    created_at = Column(DateTime, default=datetime.utcnow)


class NotificationDismissal(Base):
    __tablename__ = "notification_dismissals"
    id = Column(Integer, primary_key=True)
    notification_id = Column(Integer, ForeignKey("notifications.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    dismissed_at = Column(DateTime, default=datetime.utcnow)
