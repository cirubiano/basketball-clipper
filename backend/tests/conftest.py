"""
Shared pytest fixtures.
"""
import numpy as np
import pytest
import cv2


@pytest.fixture(scope="session")
def sample_video_path(tmp_path_factory):
    """
    Creates a minimal synthetic MP4 (30 frames, 320×240, 30 fps) suitable for
    unit-testing the validator and detector services.  Two coloured rectangles
    simulate jersey colours and a circle simulates the ball.
    """
    tmp_dir = tmp_path_factory.mktemp("video")
    video_path = str(tmp_dir / "sample.mp4")

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(video_path, fourcc, 30.0, (320, 240))

    for _ in range(30):
        frame = np.zeros((240, 320, 3), dtype=np.uint8)
        # Blue rectangle — team A jersey
        cv2.rectangle(frame, (40, 80), (100, 180), (200, 100, 0), -1)
        # Red rectangle — team B jersey
        cv2.rectangle(frame, (220, 80), (280, 180), (0, 50, 200), -1)
        # Orange circle — ball
        cv2.circle(frame, (160, 120), 15, (0, 165, 255), -1)
        writer.write(frame)

    writer.release()
    return video_path
