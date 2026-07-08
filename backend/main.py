from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse
from routers.auth_router import router as auth_router
from routers.products import router as products_router
from routers.golden import router as golden_router
from routers.notifications import router as notifications_router
from auth import get_current_user
from sse import keepalive_stream

security = HTTPBearer()

app = FastAPI(
    title="URBN Pipeline API",
    description="Internal product pipeline tracker — NPD through Golden Sample",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://72.60.77.63:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router,          prefix="/auth",          tags=["auth"])
app.include_router(products_router,      prefix="/products",      tags=["products"])
app.include_router(golden_router,        prefix="/golden",        tags=["golden"])
app.include_router(notifications_router, prefix="/notifications", tags=["notifications"])


@app.get("/")
def root():
    return {"message": "URBN Pipeline API running"}
