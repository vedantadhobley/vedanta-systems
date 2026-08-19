"""Canonical btop terminal-frame encoding for NATS and browser SSE."""

from datetime import datetime, timezone
import re
import uuid

COLS = 132
ROWS = 43
TOTAL_CELLS = COLS * ROWS
NODE_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")


def clone_cells(cells):
    return [cell[:] for cell in cells]


def encode_frame(cells, previous_cells=None, force_full=False):
    """Return the next canonical frame and an isolated current snapshot."""
    snapshot = clone_cells(cells)
    if force_full or previous_cells is None:
        return {"t": "f", "c": snapshot}, clone_cells(snapshot)

    deltas = []
    for index, (current, previous) in enumerate(zip(snapshot, previous_cells)):
        if current != previous:
            deltas.append([index] + current)

    if len(deltas) > TOTAL_CELLS * 0.5:
        return {"t": "f", "c": snapshot}, clone_cells(snapshot)

    # An empty delta is a lightweight liveness event. It advances sequence and
    # prevents a static terminal from being misclassified as an offline node.
    return {"t": "d", "d": deltas}, clone_cells(snapshot)


def build_envelope(node, session, sequence, frame, emitted_at=None, message_id=None):
    if not NODE_PATTERN.fullmatch(node):
        raise ValueError(f"invalid btop node name: {node!r}")
    if not session or len(session) > 128:
        raise ValueError("session must contain 1-128 characters")
    if not isinstance(sequence, int) or sequence < 0:
        raise ValueError("sequence must be a non-negative integer")

    subject = f"btop.{node}.frame"
    timestamp = emitted_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "id": message_id or str(uuid.uuid4()),
        "ts": timestamp,
        "source": f"btop-{node}",
        "version": 1,
        "subject": subject,
        "payload": {
            "node": node,
            "session": session,
            "sequence": sequence,
            "frame": frame,
        },
    }
