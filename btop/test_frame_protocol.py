import unittest

from btop.frame_protocol import TOTAL_CELLS, build_envelope, encode_frame


def cells(char=" "):
    return [[char, None, None, 0] for _ in range(TOTAL_CELLS)]


class FrameProtocolTests(unittest.TestCase):
    def test_first_frame_is_full(self):
        frame, snapshot = encode_frame(cells())

        self.assertEqual(frame["t"], "f")
        self.assertEqual(len(frame["c"]), TOTAL_CELLS)
        self.assertEqual(snapshot, frame["c"])
        self.assertIsNot(snapshot, frame["c"])

    def test_ordered_changes_become_a_delta(self):
        previous = cells()
        current = cells()
        current[10] = ["X", "a57fd8", None, 1]

        frame, snapshot = encode_frame(current, previous)

        self.assertEqual(frame, {"t": "d", "d": [[10, "X", "a57fd8", None, 1]]})
        self.assertEqual(snapshot[10], current[10])

    def test_static_frame_emits_an_empty_liveness_delta(self):
        current = cells()
        frame, _ = encode_frame(current, current)

        self.assertEqual(frame, {"t": "d", "d": []})

    def test_large_delta_falls_back_to_full(self):
        previous = cells()
        current = cells("X")
        frame, _ = encode_frame(current, previous)

        self.assertEqual(frame["t"], "f")

    def test_envelope_matches_the_shared_subject_contract(self):
        frame, _ = encode_frame(cells())
        envelope = build_envelope(
            "nexus0",
            "session-a",
            42,
            frame,
            emitted_at="2026-08-19T22:30:00Z",
            message_id="0198f3a0-1c2d-7e3f-8a4b-5c6d7e8f9a0c",
        )

        self.assertEqual(envelope["subject"], "btop.nexus0.frame")
        self.assertEqual(envelope["source"], "btop-nexus0")
        self.assertEqual(envelope["payload"]["sequence"], 42)

    def test_invalid_node_is_rejected(self):
        frame, _ = encode_frame(cells())
        with self.assertRaises(ValueError):
            build_envelope("../../bad", "session-a", 1, frame)


if __name__ == "__main__":
    unittest.main()
