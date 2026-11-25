#!/usr/bin/env python3
"""
scrollframes converter: turn a video into frames for the `scrollframes` player.

Two output formats:

  frames (default)  a folder with one image per frame + manifest.json
                    -> <ScrollFrames manifest="/frames/manifest.json" />
                    With --widths 640,1280,1920 it writes one subfolder per width and a
                    v2 manifest; the player downloads only the size that fits the screen.

  json              a single JSON file [{ "id": "img_1", "img": "<base64 jpeg>" }, ...]
                    (the original format; handy for small clips you want to bundle)
                    -> <ScrollFrames base64Json="/frames.json" />

Examples:
  python scrollframes_convert.py hero.mp4 -o public/hero
  python scrollframes_convert.py hero.mp4 -o public/hero --format jpg --quality 75 --width 1600 --step 2
  python scrollframes_convert.py hero.mp4 -o public/hero --widths 640,1280,1920 --format avif
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


def resize(frame, width):
    if not width or frame.shape[1] == width:
        return frame
    h = round(frame.shape[0] * width / frame.shape[1])
    interp = cv2.INTER_AREA if width < frame.shape[1] else cv2.INTER_CUBIC
    return cv2.resize(frame, (width, h), interpolation=interp)


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
                yield resize(frame, width)
            index += 1
    finally:
        cap.release()


def encode(frame, fmt, quality):
    if fmt == "avif":
        # OpenCV wheels don't ship an AVIF encoder; Pillow >= 11.3 does.
        try:
            from PIL import Image
        except ImportError:
            sys.exit("--format avif needs Pillow >= 11.3: pip install 'pillow>=11.3'")
        import io
        out = io.BytesIO()
        Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)).save(out, format="AVIF", quality=quality)
        return out.getvalue()
    if fmt == "webp":
        ok, buf = cv2.imencode(".webp", frame, [int(cv2.IMWRITE_WEBP_QUALITY), quality])
    else:
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality, int(cv2.IMWRITE_JPEG_OPTIMIZE), 1])
    if not ok:
        raise RuntimeError(f"Could not encode frame as {fmt}")
    return buf.tobytes()


def to_frames_dir(video_path, out_dir, fmt="webp", quality=75, widths=None, width=None, **kw):
    """Write frames + manifest.json. Several `widths` -> one subfolder each and a v2 manifest."""
    os.makedirs(out_dir, exist_ok=True)
    ext = fmt
    sizes = sorted(set(widths)) if widths else [width]
    multi = len(sizes) > 1
    variants = [{"width": w, "dir": str(w) if multi else "", "frames": [], "height": None} for w in sizes]
    for v in variants:
        os.makedirs(os.path.join(out_dir, v["dir"]), exist_ok=True)
    total_bytes = 0
    # Decode the video once; encode every size from the same frame.
    for i, frame in enumerate(iter_frames(video_path, **kw), start=1):
        name = f"frame_{i:04d}.{ext}"
        for v in variants:
            img = resize(frame, v["width"])
            data = encode(img, fmt, quality)
            with open(os.path.join(out_dir, v["dir"], name), "wb") as f:
                f.write(data)
            v["frames"].append(name)
            v["width"], v["height"] = img.shape[1], img.shape[0]
            total_bytes += len(data)
    count = len(variants[0]["frames"])
    if not count:
        raise RuntimeError("No frames extracted (check --start/--end/--step)")
    if multi:
        manifest = {"version": 2, "format": ext, "frameCount": count, "variants": variants}
    else:
        v = variants[0]
        manifest = {"version": 1, "width": v["width"], "height": v["height"], "format": ext, "frames": v["frames"]}
    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    return count, total_bytes


def to_base64_json(video_path, json_path, quality=70, **kw):  # kw: step, width, start, end
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
    p.add_argument("--format", choices=["webp", "jpg", "avif"], default="webp", help="image format for folder output (default webp; avif needs Pillow)")
    p.add_argument("--quality", type=int, default=75, help="encoder quality 1-100 (default 75)")
    p.add_argument("--step", type=int, default=1, help="keep every Nth frame (default 1 = all)")
    p.add_argument("--width", type=int, help="resize frames to this width, keeping aspect ratio")
    p.add_argument("--widths", help="comma-separated widths for responsive variants, e.g. 640,1280,1920")
    p.add_argument("--start", type=int, default=0, help="first frame index to keep")
    p.add_argument("--end", type=int, help="stop before this frame index")
    a = p.parse_args(argv)

    if a.step < 1:
        p.error("--step must be >= 1")
    widths = [int(w) for w in a.widths.split(",") if w.strip()] if a.widths else None
    if a.json and widths:
        p.error("--widths only works with folder output")
    kw = dict(step=a.step, start=a.start, end=a.end)
    if a.json:
        count, size = to_base64_json(a.video, a.out, quality=a.quality, width=a.width, **kw)
    else:
        count, size = to_frames_dir(a.video, a.out, fmt=a.format, quality=a.quality, widths=widths, width=a.width, **kw)
    print(f"{count} frames -> {a.out} ({size / 1_048_576:.1f} MB)")


if __name__ == "__main__":
    main()
