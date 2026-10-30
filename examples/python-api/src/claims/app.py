"""HTTP layer: JSON over the stdlib server. Routing is a small table, no framework."""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

from . import __version__
from .store import ClaimError, ClaimStore

Response = tuple[int, dict[str, Any] | list[Any]]
Route = tuple[str, re.Pattern[str], Callable[..., Response]]


class App:
    def __init__(self, store: ClaimStore | None = None) -> None:
        self.store = store or ClaimStore()
        self.routes: list[Route] = [
            ("GET", re.compile(r"^/health$"), self.health),
            ("GET", re.compile(r"^/claims$"), self.list_claims),
            ("POST", re.compile(r"^/claims$"), self.create_claim),
            ("GET", re.compile(r"^/claims/(\d+)$"), self.get_claim),
            ("POST", re.compile(r"^/claims/(\d+)/status$"), self.change_status),
        ]

    def handle(self, method: str, path: str, body: bytes = b"") -> Response:
        url = urlparse(path)
        for m, pattern, handler in self.routes:
            match = pattern.match(url.path)
            if match and m == method:
                try:
                    payload = json.loads(body) if body else {}
                except json.JSONDecodeError:
                    return 400, {"error": "invalid JSON body"}
                try:
                    return handler(*match.groups(), query=parse_qs(url.query), payload=payload)
                except ClaimError as e:
                    return e.status, {"error": str(e)}
        return 404, {"error": f"no route for {method} {url.path}"}

    def health(self, **_: Any) -> Response:
        return 200, {"status": "ok", "version": __version__}

    def list_claims(self, query: dict[str, list[str]], **_: Any) -> Response:
        status = query.get("status", [None])[0]
        return 200, [c.to_dict() for c in self.store.list(status)]

    def create_claim(self, payload: dict[str, Any], **_: Any) -> Response:
        claim = self.store.create(
            payload.get("policy_number", ""), payload.get("amount_cents"), payload.get("description", "")
        )
        return 201, claim.to_dict()

    def get_claim(self, claim_id: str, **_: Any) -> Response:
        return 200, self.store.get(int(claim_id)).to_dict()

    def change_status(self, claim_id: str, payload: dict[str, Any], **_: Any) -> Response:
        return 200, self.store.transition(int(claim_id), payload.get("status", "")).to_dict()


def make_handler(app: App) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def _respond(self, method: str) -> None:
            length = int(self.headers.get("content-length") or 0)
            status, data = app.handle(method, self.path, self.rfile.read(length) if length else b"")
            body = json.dumps(data).encode()
            self.send_response(HTTPStatus(status))
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802
            self._respond("GET")

        def do_POST(self) -> None:  # noqa: N802
            self._respond("POST")

    return Handler


def serve(host: str = "127.0.0.1", port: int = 8000) -> None:
    server = ThreadingHTTPServer((host, port), make_handler(App()))
    print(f"claims API on http://{host}:{port}")
    server.serve_forever()
