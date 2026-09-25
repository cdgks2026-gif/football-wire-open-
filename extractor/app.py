import json
import os
from flask import Flask, request, jsonify
import trafilatura

app=Flask(__name__)

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/extract")
def extract():
    payload=request.get_json(silent=True) or {}
    url=str(payload.get("url") or "")
    if not url.startswith(("http://","https://")):
        return jsonify({"ok":False,"reason":"bad-url"}),400
    try:
        downloaded=trafilatura.fetch_url(url)
        if not downloaded:
            return jsonify({"ok":False,"reason":"fetch-failed"}),422
        raw=trafilatura.extract(
            downloaded,
            url=url,
            output_format="json",
            with_metadata=True,
            include_comments=False,
            include_links=False,
            include_images=False,
            favor_precision=True,
        )
        if not raw:
            return jsonify({"ok":False,"reason":"no-article"}),422
        data=json.loads(raw)
        text=(data.get("text") or "").strip()
        if len(text)<80:
            return jsonify({"ok":False,"reason":"too-short"}),422
        return jsonify({
            "ok":True,
            "text":text[:12000],
            "title":data.get("title") or "",
            "author":data.get("author") or "",
            "date":data.get("date") or "",
            "hostname":data.get("hostname") or "",
            "length":len(text),
        })
    except Exception as exc:
        return jsonify({"ok":False,"reason":type(exc).__name__}),500

if __name__=="__main__":
    app.run(host="127.0.0.1",port=int(os.environ.get("EXTRACTOR_PORT","8091")))
