from sqlalchemy import Column, Integer, String, DateTime, Date, ForeignKey, Text, Boolean, JSON
from datetime import datetime, timedelta
from database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password = Column(String, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)          # QA | CEO | Dev | Sales | STAFF
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
    deadline = Column(Date, nullable=True)
    specifications = Column(Text)
    sample_received = Column(Boolean, default=False)
    sample_given_date = Column(Date)
    image_url = Column(String)
    verdict_remarks = Column(Text)                 # QA verdict remarks
    urbn_model_no = Column(String)                 # URBN internal model number
    factory_sku = Column(String)                   # Factory's own SKU
    colors = Column(JSON)                          # list of color strings
    status_changed_at = Column(DateTime)
    rejected_by = Column(String)
    archive_remarks = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    version = Column(Integer, default=1, nullable=False)
    sample_version = Column(Integer, default=1)


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), index=True)
    action = Column(String, nullable=False)
    note = Column(Text)
    performed_by_id = Column(Integer, ForeignKey("users.id"))
    performed_by_name = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)


class NpdReport(Base):
    __tablename__ = "npd_reports"
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), unique=True)
    file_name = Column(String)
    file_url = Column(String)
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
    # Hold case workflow
    expected_reply_date = Column(Date)
    reply_received_at = Column(DateTime)
    reply_summary = Column(String)                 # Fully Accepted | Decision Pending | Partially Rejected
    reply_notes = Column(Text)
    partial_resolved_at = Column(DateTime)
    internal_decision = Column(String)             # Approved | Rejected | Order Placed
    internal_decision_at = Column(DateTime)
    internal_decision_by = Column(String)
    internal_decision_notes = Column(Text)
    improvement_sample_expected = Column(Boolean, default=False)
    improvement_sample_expected_date = Column(Date)
    improvement_sample_received_at = Column(DateTime)
    case_log = Column(JSON, default=list)


class FactoryCommEdit(Base):
    __tablename__ = "factory_comm_edits"
    id = Column(Integer, primary_key=True)
    factory_comm_id = Column(Integer, ForeignKey("factory_comms.id", ondelete="CASCADE"))
    edited_at = Column(DateTime, default=datetime.utcnow)
    previous_reply = Column(Text)
    previous_date = Column(Date)


class OrderDecision(Base):
    __tablename__ = "order_decisions"
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), unique=True)
    state = Column(String, nullable=False)         # pending | placed | held | dropped
    internal_code = Column(String)
    colors = Column(JSON)                          # list of color strings
    improvement_notes = Column(Text)
    improved_golden_sample_expected = Column(Date)
    decided_at = Column(DateTime, default=datetime.utcnow)
    decided_by_id = Column(Integer, ForeignKey("users.id"))
    decided_by_name = Column(String)
    remarks = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    order_archived = Column(Boolean, default=False)


class GoldenWorkflow(Base):
    __tablename__ = "golden_workflows"
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), unique=True)
    purchase_notified_at = Column(DateTime)
    order_confirmed_at = Column(DateTime)
    compliance_not_needed = Column(Boolean, default=False)
    golden_sample_archived = Column(Boolean, default=False)
    compliance_archived = Column(Boolean, default=False)
    packaging_archived = Column(Boolean, default=False)


class GoldenDetails(Base):
    __tablename__ = "golden_details"
    id = Column(Integer, primary_key=True)
    workflow_id = Column(Integer, ForeignKey("golden_workflows.id", ondelete="CASCADE"), unique=True)
    product_name = Column(String)
    sku_code = Column(String)
    colour = Column(String)
    markings = Column(String)
    # Part 1 confirmations (all four required to unlock compliance/packaging/golden sample)
    colour_confirmed = Column(Boolean, default=False)
    logo_marking_confirmed = Column(Boolean, default=False)
    rating_label_confirmed = Column(Boolean, default=False)
    bom_confirmed = Column(Boolean, default=False)
    saved_at = Column(DateTime, default=datetime.utcnow)


class ComplianceTrack(Base):
    """One row per certificate per workflow. Cert names: BIS, WPC, MFI (Apple), QI"""
    __tablename__ = "compliance_tracks"
    id = Column(Integer, primary_key=True)
    workflow_id = Column(Integer, ForeignKey("golden_workflows.id", ondelete="CASCADE"), index=True)
    name = Column(String, nullable=False)          # BIS | WPC | MFI (Apple) | QI
    initiated_at = Column(DateTime)
    sample_dispatched_at = Column(DateTime)
    expected_delivery_date = Column(Date)
    cert_received_at = Column(DateTime)
    confirmed_at = Column(DateTime)
    improvement_notes = Column(Text)


class PackagingTrack(Base):
    __tablename__ = "packaging_tracks"
    id = Column(Integer, primary_key=True)
    workflow_id = Column(Integer, ForeignKey("golden_workflows.id", ondelete="CASCADE"), unique=True)
    # Step 1: Vendor selection
    vendor_name = Column(String)
    vendor_set_at = Column(DateTime)
    # Step 2: Sample dispatch (version increments on rejection)
    sample_version = Column(Integer, default=1)
    sample_dispatched_at = Column(DateTime)
    # Step 3: Expected dummy package date
    expected_delivery_date = Column(Date)
    # Step 4: Status + decision cycle
    sample_status = Column(String)                 # Awaiting | Received
    decision = Column(String)                      # Approved | Improvement Required
    decision_at = Column(DateTime)
    improvement_notes = Column(Text)
    # KLD steps (after approval)
    kld_acknowledged_at = Column(DateTime)
    kld_emailed_to_designer_at = Column(DateTime)


class GoldenSampleTrack(Base):
    __tablename__ = "golden_sample_tracks"
    id = Column(Integer, primary_key=True)
    workflow_id = Column(Integer, ForeignKey("golden_workflows.id", ondelete="CASCADE"), unique=True)
    status = Column(String, default="Not started")  # Not started | Requested | In progress | Received
    requested_at = Column(DateTime)
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
