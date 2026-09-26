#!/usr/bin/env python3
"""Benchmarks a GGUF vision-language model with a native llama-server (GPU when available).

Usage: python3 scripts/bench_models.py --model models/X.gguf [--mmproj models/mmproj-X.gguf] [--ctx 8192]

Measures prompt/generation speed and runs a tiny accuracy suite (maths, reading a passage,
an image, schema-constrained JSON like the router). Standard library only, so it runs on
macOS, Linux and Windows with no installs beyond llama.cpp itself.
"""
import argparse, base64, json, re, shutil, struct, subprocess, sys, tempfile, time, urllib.request, zlib

def png_two_colours() -> str:
    w = h = 64
    raw = b"".join(b"\x00" + (b"\xff\x00\x00" * w if y < 32 else b"\x00\x00\xff" * w) for y in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    return "data:image/png;base64," + base64.b64encode(png).decode()

PASSAGE = ("Pump CP-4400 maintenance note: the discharge flange bolts are tightened to 460 Nm in a cross pattern. "
           "The rated flow is 440 cubic metres per hour and the maximum working pressure is 16 bar at 120 degrees Celsius.")

CASES = [
    ("maths-1", "A tank fills at 12 litres per minute and drains at 5 litres per minute. How many litres are in it after 45 minutes if it starts empty? Answer with just the number.", r"\b315\b"),
    ("maths-2", "What is 17 multiplied by 23? Answer with just the number.", r"\b391\b"),
    ("maths-3", "A pump runs 6 hours a day at 3.5 kW. How many kWh does it use in 30 days? Answer with just the number.", r"\b630\b"),
    ("read-1", f"{PASSAGE}\n\nWhat torque are the discharge flange bolts tightened to? Answer briefly.", r"460"),
    ("read-2", f"{PASSAGE}\n\nWhat is the maximum working pressure? Answer briefly.", r"16\s*bar"),
]

def post(url, body, timeout=600):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--mmproj")
    ap.add_argument("--ctx", type=int, default=8192)
    ap.add_argument("--port", type=int, default=8091)
    ap.add_argument("--ngl", default="99")
    args = ap.parse_args()
    if not shutil.which("llama-server"):
        sys.exit("llama-server not found on PATH (macOS: brew install llama.cpp; Windows: winget install llama.cpp)")

    cmd = ["llama-server", "-m", args.model, "--host", "127.0.0.1", "--port", str(args.port), "-c", str(args.ctx), "-np", "1", "--jinja", "-ngl", args.ngl]
    if args.mmproj:
        cmd += ["--mmproj", args.mmproj]
    log = tempfile.NamedTemporaryFile("w+", suffix=".log", delete=False)
    proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{args.port}"
    try:
        t0 = time.time()
        while True:
            try:
                urllib.request.urlopen(base + "/health", timeout=2).read()
                break
            except Exception:
                if proc.poll() is not None:
                    sys.exit(f"llama-server exited early, see {log.name}")
                if time.time() - t0 > 300:
                    sys.exit("timed out waiting for the model to load")
                time.sleep(1)
        print(f"model loaded in {time.time() - t0:.1f}s")

        def chat(messages, **extra):
            return post(base + "/v1/chat/completions", {"messages": messages, "temperature": 0, "max_tokens": 200, **extra})

        chat([{"role": "user", "content": "hi"}], max_tokens=4)  # warm-up
        passed, gen_speeds, prompt_speeds = 0, [], []
        for name, prompt, pattern in CASES:
            r = chat([{"role": "user", "content": prompt}])
            text = r["choices"][0]["message"]["content"]
            ok = re.search(pattern, text) is not None
            passed += ok
            t = r.get("timings", {})
            gen_speeds.append(t.get("predicted_per_second", 0))
            prompt_speeds.append(t.get("prompt_per_second", 0))
            print(f"  {'PASS' if ok else 'FAIL'} {name}: {text.strip()[:70]!r}  ({t.get('predicted_per_second', 0):.1f} tok/s)")
        total = len(CASES)

        if args.mmproj:
            r = chat([{"role": "user", "content": [{"type": "image_url", "image_url": {"url": png_two_colours()}}, {"type": "text", "text": "Which two colours are in this image? Answer briefly."}]}])
            text = r["choices"][0]["message"]["content"]
            ok = "red" in text.lower() and "blue" in text.lower()
            passed += ok; total += 1
            print(f"  {'PASS' if ok else 'FAIL'} image: {text.strip()[:70]!r}")

        schema = {"type": "object", "properties": {"agent": {"type": "string", "enum": ["general", "doc_qa", "code"]}}, "required": ["agent"]}
        t1 = time.time()
        r = chat([{"role": "system", "content": "Route the message. Reply JSON."}, {"role": "user", "content": "plot the downtime csv"}],
                 response_format={"type": "json_schema", "json_schema": {"name": "r", "schema": schema}}, max_tokens=40)
        route_s = time.time() - t1
        try:
            json.loads(r["choices"][0]["message"]["content"]); ok = True
        except Exception:
            ok = False
        passed += ok; total += 1
        print(f"  {'PASS' if ok else 'FAIL'} router-json: {route_s:.2f}s")

        avg = lambda xs: sum(xs) / len(xs) if xs else 0
        print(f"\nRESULT model={args.model.split('/')[-1]} score={passed}/{total} generation={avg(gen_speeds):.1f} tok/s prompt={avg(prompt_speeds):.0f} tok/s")
    finally:
        proc.terminate()
        try:
            proc.wait(15)
        except Exception:
            proc.kill()

if __name__ == "__main__":
    main()
