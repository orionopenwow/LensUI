"""Finds each catalogue app's official icon and screenshots in its own GitHub repo and records them.

For every app with a `mediaRepo`, this does a shallow, blob-less clone (trees only), picks the app
icon and up to three README / screenshot images, fetches just those blobs, and writes:

  tools/apps/media.json        repo, pinned commit, chosen paths and sizes (committed)
  tools/apps/.media-cache/...  the fetched files, for the parity gallery only (gitignored)

The catalogue then references media as raw.githubusercontent.com URLs pinned to that commit, so
Lens loads them at runtime from the project's own repo. Nothing fetched here is committed except
the paths. Overrides (hand-checked choices) live in OVERRIDES below.

Usage: python3 tools/apps/fetch_media.py [app-id ...]
"""
import json, os, re, subprocess, sys, pathlib, shutil, concurrent.futures as cf

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORK = pathlib.Path(os.environ.get("LENS_MEDIA_WORK", "/tmp/lens-media-clones"))
CACHE = ROOT / "tools" / "apps" / ".media-cache"
OUT = ROOT / "tools" / "apps" / "media.json"

IMG = re.compile(r"\.(png|jpe?g|gif|webp|svg)$", re.I)
SKIP_DIR = re.compile(r"(^|/)(node_modules|vendor|3rdparty|third[_-]?party|external|extern|deps|test|tests|testdata|fixtures|examples?|locale|po|translations|\.github/ISSUE)(/|$)", re.I)

def git(args, cwd=None, check=True):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=False, timeout=600, check=check).stdout

def clone(repo):
    d = WORK / repo.replace("/", "__")
    if not (d / ".git").exists():
        d.mkdir(parents=True, exist_ok=True)
        git(["init", "-q"], d)
        git(["remote", "add", "origin", f"https://github.com/{repo}"], d)
        git(["-c", "protocol.version=2", "fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", "HEAD"], d)
    sha = git(["rev-parse", "FETCH_HEAD"], d).decode().strip()
    return d, sha

class LazySizes(dict):
    """path -> size, fetched on first access (a blob-less clone has no sizes; `ls-tree -l` would
    download every blob in the repo)."""

    def __init__(self, d, sha, paths):
        super().__init__((p, None) for p in paths)
        self.d, self.sha = d, sha

    def get(self, path, default=0):
        if path not in self:
            return default
        v = dict.__getitem__(self, path)
        if v is None:
            v = len(blob(self.d, self.sha, path))
            dict.__setitem__(self, path, v)
        return v

    def items(self):
        return ((p, self.get(p)) for p in self.keys())


def tree(d, sha):
    out = git(["ls-tree", "-r", "--name-only", sha], d).decode("utf-8", "replace")
    return LazySizes(d, sha, out.splitlines())

def blob(d, sha, path):
    return git(["cat-file", "-p", f"{sha}:{path}"], d)

def icon_score(path, size):
    p = path.lower()
    name = p.rsplit("/", 1)[-1]
    if not IMG.search(p) or SKIP_DIR.search(p) or size == 0:
        return None
    if not re.search(r"icon|logo|app[_-]?icon|favicon|brand|mark", name):
        return None
    if re.search(r"tray|badge|banner|social|og[-_.]|screenshot|preview|splash|installer|uninstall|wizard|header|dmg|file[_-]?(type|assoc)|mime|doc[-_]?icon|toolbar|button|small|mono|white|black|light|template|disabled|overlay|notification|status", name):
        return None
    s = 0
    if name.endswith(".png"): s += 30
    if name.endswith(".svg"): s += 20
    if name.endswith((".ico", ".gif")): s -= 20
    m = re.search(r"(\d{2,4})", name)
    if m:
        n = int(m.group(1))
        s += {512: 30, 256: 28, 1024: 24, 128: 18, 192: 18, 180: 15, 96: 5, 64: 2}.get(n, -10 if n < 64 else 0)
    if re.search(r"(^|[/_-])(app[_-]?)?icon\.(png|svg)$", p): s += 20
    if "logo" in name: s += 8
    if re.search(r"(^|/)(icons?|assets|resources|res|images?|img|art|branding|logo|data|static|public|build)(/|$)", p): s += 10
    if re.search(r"src-tauri/icons/", p): s += 15
    s -= p.count("/") * 2
    if size > 600_000: s -= 30
    if size < 1500 and name.endswith(".png"): s -= 20
    return s

README_IMG = re.compile(r"!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)|<img[^>]+src=[\"']([^\"']+)[\"']", re.I)

def readme_images(d, sha, files, repo):
    readme = next((p for p in files if re.fullmatch(r"readme(\.md|\.markdown|\.rst)?", p, re.I)), None)
    if not readme:
        readme = next((p for p in files if re.fullmatch(r"(docs/|\.github/)readme\.md", p, re.I)), None)
    if not readme:
        return []
    text = blob(d, sha, readme).decode("utf-8", "replace")
    owner, name = repo.split("/")
    out = []
    for m in README_IMG.finditer(text):
        url = (m.group(1) or m.group(2)).strip()
        path = None
        u = url.split("#")[0].split("?")[0]
        mm = re.match(rf"https://raw\.githubusercontent\.com/{re.escape(owner)}/{re.escape(name)}/[^/]+/(.+)$", u, re.I) or \
             re.match(rf"https://github\.com/{re.escape(owner)}/{re.escape(name)}/(?:raw|blob)/[^/]+/(.+)$", u, re.I) or \
             re.match(rf"https://cdn\.jsdelivr\.net/gh/{re.escape(owner)}/{re.escape(name)}@[^/]+/(.+)$", u, re.I)
        if mm:
            path = mm.group(1)
        elif not re.match(r"^[a-z]+:", u) and not u.startswith("//"):
            path = u.lstrip("./").lstrip("/")
        if path:
            from urllib.parse import unquote
            path = unquote(path)
            if path in files:
                out.append(path)
    return out

def is_badgey(path):
    return bool(re.search(r"badge|shield|logo|icon|banner|sponsor|star[-_]history|contrib|discord|twitter|donate|kofi|patreon|wordmark|button|header|title", path, re.I))

def pick(repo, d, sha, files, override):
    icon = override.get("icon")
    if not icon:
        # Score by name with a nominal size, then check real sizes of the best few only.
        named = [(icon_score(p, 10_000), p) for p in files.keys()]
        named = sorted([x for x in named if x[0] is not None], key=lambda x: -x[0])[:8]
        rescored = sorted(((icon_score(p, files.get(p)), p) for _, p in named), key=lambda x: (x[0] is None, -(x[0] or 0)))
        icon = next((p for sc, p in rescored if sc is not None), None)
    shots = override.get("screenshots")
    if shots is None:
        shots = []
        for p in readme_images(d, sha, files, repo):
            if is_badgey(p) or p == icon or p.lower().endswith(".svg"):
                continue
            if files.get(p, 0) < 20_000 or files.get(p, 0) > 8_000_000:
                continue
            if p not in shots:
                shots.append(p)
        if len(shots) < 3:
            for p in list(files.keys()):
                if re.search(r"screen[-_ ]?shot|screenshots?/", p, re.I) and IMG.search(p) and not p.lower().endswith(".svg") and not SKIP_DIR.search(p) and p not in shots:
                    if 20_000 < files.get(p) < 8_000_000:
                        shots.append(p)
                if len(shots) >= 3:
                    break
        shots = shots[:3]
    loop = override.get("loop")
    return icon, shots, loop

def raw_url(repo, sha, path):
    from urllib.parse import quote
    return f"https://raw.githubusercontent.com/{repo}/{sha}/{quote(path)}"


def resolve(ref, repo, d, sha, files):
    """`path` in the app's repo, or `owner/name:path` in another official repo."""
    if ":" in ref and "/" in ref.split(":", 1)[0]:
        other, path = ref.split(":", 1)
        od, osha = clone(other)
        ofiles = tree(od, osha)
        if path not in ofiles:
            raise FileNotFoundError(f"{other}:{path}")
        return other, od, osha, path
    if ref not in files:
        raise FileNotFoundError(f"{repo}:{ref}")
    return repo, d, sha, ref


def run(app_id, repo, override):
    try:
        d, sha = clone(repo)
        files = tree(d, sha)
        icon, shots, loop = pick(repo, d, sha, files, override)
        if override.get("noIcon"):
            icon = None
        rec = {"repo": repo, "commit": sha, "icon": None, "screenshots": [], "loop": None, "sizes": {}}
        dest = CACHE / app_id
        if dest.exists():
            shutil.rmtree(dest)
        dest.mkdir(parents=True)
        for role, ref in [("icon", icon), *[("screenshots", x) for x in shots], ("loop", loop)]:
            if not ref:
                continue
            r, rd, rsha, path = resolve(ref, repo, d, sha, files)
            data = blob(rd, rsha, path)
            if data.startswith(b"version https://git-lfs"):
                rec.setdefault("lfs", []).append(ref)
                continue
            url = raw_url(r, rsha, path)
            rec["sizes"][url] = len(data)
            (dest / (url.rsplit("/", 1)[-1])).write_bytes(data)
            if role == "screenshots":
                rec["screenshots"].append(url)
            else:
                rec[role] = url
        return app_id, rec, None
    except Exception as e:  # noqa: BLE001
        return app_id, None, f"{type(e).__name__}: {e}"


def main():
    sys.path.insert(0, str(ROOT / "tools" / "apps"))
    from media_sources import SOURCES, OVERRIDES
    want = set(sys.argv[1:])
    prev = json.loads(OUT.read_text()) if OUT.exists() else {}
    jobs = [(i, r) for i, r in SOURCES.items() if r and (not want or i in want)]
    WORK.mkdir(parents=True, exist_ok=True)
    with cf.ThreadPoolExecutor(6) as ex:
        for app_id, rec, err in ex.map(lambda j: run(j[0], j[1], OVERRIDES.get(j[0], {})), jobs):
            if err:
                print(f"FAIL {app_id}: {err}")
                continue
            prev[app_id] = rec
            print(f"ok   {app_id:16} icon={'yes' if rec['icon'] else 'NO '}  shots={len(rec['screenshots'])}{'  LFS!' if rec.get('lfs') else ''}")
    OUT.write_text(json.dumps(dict(sorted(prev.items())), indent=2) + "\n")

if __name__ == "__main__":
    main()
