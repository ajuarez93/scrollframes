#!/usr/bin/env python3
"""
scrollframes converter: turn a video into frames for the `scrollframes` player.

Two output formats:

  frames (default)  a folder with one image per frame + manifest.json
                    -> <ScrollFrames manifest="/frames/manifest.json" />

  json              a single JSON file [{ "id": "img_1", "img": "<base64 jpeg>" }, ...]
                    (the original format; handy for small clips you want to bundle)
                    -> <ScrollFrames base64Json="/frames.json" />

Examples:
  python scrollframes_convert.py hero.mp4 -o public/hero
  python scrollframes_convert.py hero.mp4 -o public/hero --format jpg --quality 75 --width 1600 --step 2
  python scrollframes_convert.py hero.mp4 -o public/hero.json --json
"""
import argparse
import base64
import json
import os
import sys

try:
    import cv2
except ImportError:  # pragma: no cover
    sys.exit("OpenCV is required: pip install -r requirements.txt")


def iter_frames(video_path, step=1, width=None, start=0, end=None):
    """Yield every `step`-th frame between `start` and `end` (frame indices), optionally resized to `width`."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Could not open video file {video_path}")
    try:
        index = 0
        while True:
            ok, frame = cap.read()
            if not ok or (end is not None and index >= end):
                break
            if index >= start and (index - start) % step == 0:
                if width and frame.shape[1] != width:
                    h = round(frame.shape[0] * width / frame.shape[1])
                    frame = cv2.resize(frame, (width, h), interpolation=cv2.INTER_AREA)
                yield frame
            index += 1
    finally:
        cap.release()


def encode(frame, fmt, quality):
    if fmt == "webp":
        ok, buf = cv2.imencode(".webp", frame, [int(cv2.IMWRITE_WEBP_QUALITY), quality])
    else:
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality, int(cv2.IMWRITE_JPEG_OPTIMIZE), 1])
    if not ok:
        raise RuntimeError(f"Could not encode frame as {fmt}")
    return buf.tobytes()


def to_frames_dir(video_path, out_dir, fmt="webp", quality=75, **kw):
    os.makedirs(out_dir, exist_ok=True)
    ext = "jpg" if fmt == "jpg" else "webp"
    names, total_bytes, size = [], 0, None
    for i, frame in enumerate(iter_frames(video_path, **kw), start=1):
        name = f"frame_{i:04d}.{ext}"
        data = encode(frame, fmt, quality)
        with open(os.path.join(out_dir, name), "wb") as f:
            f.write(data)
        names.append(name)
        total_bytes += len(data)
        size = size or (frame.shape[1], frame.shape[0])
    if not names:
        raise RuntimeError("No frames extracted (check --start/--end/--step)")
    manifest = {"version": 1, "width": size[0], "height": size[1], "format": ext, "frames": names}
    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    return len(names), total_bytes


def to_base64_json(video_path, json_path, quality=70, **kw):
    """Original format: [{ id, img }] with base64 JPEG frames."""
    items, total_bytes = [], 0
    for i, frame in enumerate(iter_frames(video_path, **kw), start=1):
        data = encode(frame, "jpg", quality)
        items.append({"id": f"img_{i}", "img": base64.b64encode(data).decode("ascii")})
        total_bytes += len(data)
    if not items:
        raise RuntimeError("No frames extracted (check --start/--end/--step)")
    os.makedirs(os.path.dirname(os.path.abspath(json_path)), exist_ok=True)
    with open(json_path, "w") as f:
        json.dump(items, f, separators=(",", ":"))
    return len(items), os.path.getsize(json_path)


def main(argv=None):
    p = argparse.ArgumentParser(description="Convert a video into scroll-scrubbable frames for scrollframes.")
    p.add_argument("video", help="input video (mp4, mov, webm...)")
    p.add_argument("-o", "--out", required=True, help="output folder (frames) or .json file (--json)")
    p.add_argument("--json", action="store_true", help="write a single base64 JSON instead of a folder")
    p.add_argument("--format", choices=["webp", "jpg"], default="webp", help="image format for folder output (default webp)")
    p.add_argument("--quality", type=int, default=75, help="encoder quality 1-100 (default 75)")
    p.add_argument("--step", type=int, default=1, help="keep every Nth frame (default 1 = all)")
    p.add_argument("--width", type=int, help="resize frames to this width, keeping aspect ratio")
    p.add_argument("--start", type=int, default=0, help="first frame index to keep")
    p.add_argument("--end", type=int, help="stop before this frame index")
    a = p.parse_args(argv)

    if a.step < 1:
        p.error("--step must be >= 1")
    kw = dict(step=a.step, width=a.width, start=a.start, end=a.end)
    if a.json:
        count, size = to_base64_json(a.video, a.out, quality=a.quality, **kw)
    else:
        count, size = to_frames_dir(a.video, a.out, fmt=a.format, quality=a.quality, **kw)
    print(f"{count} frames -> {a.out} ({size / 1_048_576:.1f} MB)")


if __name__ == "__main__":
    main()
