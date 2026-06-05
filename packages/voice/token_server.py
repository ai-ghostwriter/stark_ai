import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from livekit import api
from pydantic import BaseModel


load_dotenv()

app = FastAPI(title="FRIDAY LiveKit Token Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_current_mode: str = "gemini"
VALID_MODES = {"gemini", "jarvis", "anthropic", "openai"}


class ModePayload(BaseModel):
    mode: str


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise HTTPException(status_code=500, detail=f"Missing environment variable: {name}")
    return value


@app.get("/mode")
def get_mode_endpoint():
    return {"mode": _current_mode}


@app.post("/mode")
def set_mode_endpoint(payload: ModePayload):
    global _current_mode
    if payload.mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid mode. Valid: {list(VALID_MODES)}")
    _current_mode = payload.mode
    return {"mode": _current_mode}


@app.get("/token")
def get_token(room: str = "friday-room", identity: str = "user") -> dict[str, str]:
    livekit_url = require_env("LIVEKIT_URL")
    api_key = require_env("LIVEKIT_API_KEY")
    api_secret = require_env("LIVEKIT_API_SECRET")

    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(identity)
        .with_name(identity)
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .to_jwt()
    )

    return {"token": token, "url": livekit_url}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("token_server:app", host="0.0.0.0", port=8788, reload=True)
