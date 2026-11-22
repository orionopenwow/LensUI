#!/usr/bin/env python3
"""Generate TypeScript types for every Rust type that crosses the Tauri IPC boundary.

Reads src-tauri/src/**/*.rs (tests excluded), finds every `#[tauri::command]` function, and
emits src/types/generated.ts with:

  * an interface / union for each serde struct or enum a command takes or returns
    (and everything those types reference), honouring `rename_all`, `rename`, `skip`,
    `skip_serializing_if`, `flatten` and `tag`;
  * `LensCommands`, a map from command name to `{ args; returns }`, so `invoke` calls can be
    typed against the backend without hand-copying signatures.

Usage:
  python3 tools/gen-types/gen_types.py          # write src/types/generated.ts
  python3 tools/gen-types/gen_types.py --check  # exit 1 if the file is out of date (CI)

Standard library only. The parser is deliberately small: it understands the subset of Rust the
Lens backend uses for IPC types. Anything it cannot map becomes `unknown` and is listed in the
file header so drift is visible rather than silent.
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src-tauri" / "src"
OUT = ROOT / "src" / "types" / "generated.ts"

# Parameters Tauri injects itself; they never appear in the JS call.
INJECTED = re.compile(
    r"^(?:tauri::)?(?:State|AppHandle|Window|WebviewWindow|Webview|ipc::Channel|Manager)\b"
)

PRIMITIVES = {
    "String": "string", "str": "string", "char": "string", "PathBuf": "string", "Path": "string",
    "OsString": "string",
    "bool": "boolean",
    "u8": "number", "u16": "number", "u32": "number", "u64": "number", "u128": "number",
    "usize": "number", "i8": "number", "i16": "number", "i32": "number", "i64": "number",
    "i128": "number", "isize": "number", "f32": "number", "f64": "number",
    "Value": "unknown", "()": "null",
}


# ------------------------------------------------------------------------------------------------
# Source scanning
# ------------------------------------------------------------------------------------------------

# Doc-comment text lives here; the stripped source only carries `#[doc_line(N)]` markers so that
# brackets or arrows inside prose can never confuse the bracket matching below.
DOCS: list[str] = []
# String literals are swapped for `"@N"` placeholders for the same reason.
STRS: list[str] = []


def unstr(v: str) -> str:
    m = re.fullmatch(r'"@(\d+)"', v.strip())
    return STRS[int(m.group(1))] if m else v.strip().strip('"')


def strip_comments(src: str) -> str:
    """Removes // and /* */ comments but keeps /// doc lines (as `@doc:` markers) and strings."""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if src.startswith("///", i) and not src.startswith("////", i):
            j = src.find("\n", i)
            j = n if j < 0 else j
            DOCS.append(src[i + 3:j].strip())
            out.append(f"#[doc_line({len(DOCS) - 1})]")
            i = j
        elif src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
        elif src.startswith("/*", i):
            depth, i = 1, i + 2
            while i < n and depth:
                if src.startswith("/*", i):
                    depth, i = depth + 1, i + 2
                elif src.startswith("*/", i):
                    depth, i = depth - 1, i + 2
                else:
                    i += 1
        elif src.startswith('r#"', i) or src.startswith('r"', i):
            hashes = 1 if src[i + 1] == "#" else 0
            end = '"' + "#" * hashes
            j = src.find(end, i + 2 + hashes)
            j = n if j < 0 else j + len(end)
            STRS.append(src[i + 2 + hashes:j - len(end)])
            out.append(f'"@{len(STRS) - 1}"')
            i = j
        elif c == '"':
            j = i + 1
            while j < n and src[j] != '"':
                j += 2 if src[j] == "\\" else 1
            STRS.append(src[i + 1:j])
            out.append(f'"@{len(STRS) - 1}"')
            i = j + 1
        elif c == "'" and i + 2 < n and (src[i + 2] == "'" or (src[i + 1] == "\\" and "'" in src[i + 2:i + 5])):
            j = src.find("'", i + 2 if src[i + 1] != "\\" else i + 3)
            out.append("' '")
            i = j + 1
        else:
            out.append(c)
            i += 1
    return "".join(out)


def match_close(s: str, i: int, open_c: str, close_c: str) -> int:
    depth = 0
    for j in range(i, len(s)):
        if s[j] == open_c:
            depth += 1
        elif s[j] == close_c:
            depth -= 1
            if depth == 0:
                return j
    raise ValueError("unbalanced " + open_c)


def split_top(s: str, sep: str = ",") -> list[str]:
    parts, depth, cur = [], 0, []
    for ch in s:
        if ch in "<([{":
            depth += 1
        elif ch in ">)]}":
            depth -= 1
        if ch == sep and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    if "".join(cur).strip():
        parts.append("".join(cur))
    return [p.strip() for p in parts if p.strip()]


ATTR_RE = re.compile(r"#\[")


def take_attrs(text: str) -> tuple[list[str], str]:
    """Splits leading `#[...]` attributes (incl. doc markers) off `text`."""
    attrs = []
    t = text.lstrip()
    while t.startswith("#["):
        end = match_close(t, 1, "[", "]")
        attrs.append(t[2:end].strip())
        t = t[end + 1:].lstrip()
    return attrs, t


@dataclass
class Field:
    name: str
    ty: str
    attrs: list[str]
    docs: list[str]


@dataclass
class TypeDef:
    name: str
    module: str
    kind: str  # struct | tuple | enum
    attrs: list[str]
    docs: list[str]
    fields: list[Field] = field(default_factory=list)
    variants: list[tuple[str, str, list, list[str], list[str]]] = field(default_factory=list)
    generics: bool = False


@dataclass
class Command:
    name: str
    module: str
    params: list[tuple[str, str]]
    ret: str | None


def doc_lines(attrs: list[str]) -> list[str]:
    out = []
    for a in attrs:
        m = re.fullmatch(r"doc_line\((\d+)\)", a)
        if m:
            out.append(DOCS[int(m.group(1))])
    return out


def serde_attr(attrs: list[str]) -> dict[str, str | bool]:
    opts: dict[str, str | bool] = {}
    for a in attrs:
        m = re.fullmatch(r"serde\s*\((.*)\)", a, re.S)
        if not m:
            continue
        for part in split_top(m.group(1)):
            if "=" in part:
                k, v = part.split("=", 1)
                opts[k.strip()] = unstr(v)
            else:
                opts[part.strip()] = True
    return opts


def derives(attrs: list[str]) -> set[str]:
    out: set[str] = set()
    for a in attrs:
        m = re.fullmatch(r"derive\s*\((.*)\)", a, re.S)
        if m:
            out |= {d.strip().split("::")[-1] for d in m.group(1).split(",")}
    return out


def parse_fields(body: str) -> list[Field]:
    fields = []
    for part in split_top(body):
        attrs, rest = take_attrs(part)
        rest = re.sub(r"^pub(\s*\([^)]*\))?\s+", "", rest)
        if ":" not in rest:
            continue
        name, ty = rest.split(":", 1)
        fields.append(Field(name.strip().removeprefix("r#"), " ".join(ty.split()), attrs, doc_lines(attrs)))
    return fields


ITEM_RE = re.compile(
    r"(?P<vis>pub(?:\s*\([^)]*\))?\s+)?(?P<kw>struct|enum)\s+(?P<name>[A-Za-z_]\w*)\s*(?P<gen><)?"
)
CMD_FN_RE = re.compile(
    r"(?:pub(?:\s*\([^)]*\))?\s+)?(?:async\s+)?fn\s+(?P<name>\w+)\s*(?P<gen><[^>]*>)?\s*\("
)


def scan(path: Path, module: str, types: list[TypeDef], commands: list[Command]) -> None:
    s = strip_comments(path.read_text(encoding="utf-8"))
    # Attribute blocks followed by an item.
    i = 0
    while True:
        m = re.compile(r"((?:#\[[^\n]*?\]\s*)+)").search(s, i)
        if not m:
            break
        start = m.start()
        # Re-parse attributes with bracket matching (the regex above is only a locator).
        try:
            attrs, rest = take_attrs(s[start:])
        except ValueError:
            i = m.end()
            continue
        consumed = len(s[start:]) - len(rest)
        after = start + consumed
        if any(a.strip() == "tauri::command" or a.startswith("tauri::command(") for a in attrs):
            fm = CMD_FN_RE.match(s, after)
            if fm:
                p_open = fm.end() - 1
                p_close = match_close(s, p_open, "(", ")")
                params = []
                for p in split_top(s[p_open + 1:p_close]):
                    _, p = take_attrs(p)
                    if ":" not in p:
                        continue
                    pname, pty = p.split(":", 1)
                    pty = " ".join(pty.split())
                    pname = pname.strip().removeprefix("mut ").strip()
                    if INJECTED.match(pty.lstrip("&")):
                        continue
                    params.append((pname, pty))
                body_at = s.find("{", p_close)
                sig_tail = s[p_close + 1:body_at]
                ret = None
                rm = re.search(r"->\s*(.*?)\s*(where\b.*)?$", sig_tail.strip(), re.S)
                if rm:
                    ret = " ".join(rm.group(1).split())
                commands.append(Command(fm.group("name"), module, params, ret))
        im = ITEM_RE.match(s, after)
        if im:
            d = derives(attrs)
            if {"Serialize", "Deserialize"} & d:
                name, kw = im.group("name"), im.group("kw")
                j = im.end()
                generics = bool(im.group("gen"))
                if generics:
                    j = match_close(s, j - 1, "<", ">") + 1
                # tuple struct / unit struct / braced
                k = j
                while k < len(s) and s[k] in " \t\r\n":
                    k += 1
                if kw == "struct" and s[k] == "(":
                    close = match_close(s, k, "(", ")")
                    inner = [re.sub(r"^pub(\s*\([^)]*\))?\s+", "", t) for t in split_top(s[k + 1:close])]
                    types.append(TypeDef(name, module, "tuple", attrs, doc_lines(attrs),
                                         [Field(str(n), " ".join(t.split()), [], []) for n, t in enumerate(inner)],
                                         generics=generics))
                elif s[k] == "{" or s.startswith("where", k):
                    k = s.find("{", k)
                    close = match_close(s, k, "{", "}")
                    body = s[k + 1:close]
                    td = TypeDef(name, module, "struct" if kw == "struct" else "enum", attrs,
                                 doc_lines(attrs), generics=generics)
                    if kw == "struct":
                        td.fields = parse_fields(body)
                    else:
                        for part in split_top(body):
                            vattrs, rest = take_attrs(part)
                            rest = rest.split("=")[0].strip()  # discriminants
                            vm = re.match(r"(\w+)\s*(.*)$", rest, re.S)
                            if not vm:
                                continue
                            vname, payload = vm.group(1), vm.group(2).strip()
                            if payload.startswith("("):
                                inner = split_top(payload[1:match_close(payload, 0, "(", ")")])
                                td.variants.append((vname, "tuple", [" ".join(t.split()) for t in inner], vattrs, doc_lines(vattrs)))
                            elif payload.startswith("{"):
                                inner = parse_fields(payload[1:match_close(payload, 0, "{", "}")])
                                td.variants.append((vname, "struct", inner, vattrs, doc_lines(vattrs)))
                            else:
                                td.variants.append((vname, "unit", [], vattrs, doc_lines(vattrs)))
                    types.append(td)
                elif s[k] == ";":
                    types.append(TypeDef(name, module, "struct", attrs, doc_lines(attrs)))
        i = max(after, m.end())


# ------------------------------------------------------------------------------------------------
# Rust -> TypeScript
# ------------------------------------------------------------------------------------------------

def words(name: str) -> list[str]:
    if "_" in name or name.islower():
        return [w for w in name.split("_") if w]
    return re.findall(r"[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+|[0-9]+", name)


def rename(name: str, rule: str | None) -> str:
    if not rule:
        return name
    w = words(name)
    lw = [x.lower() for x in w]
    return {
        "camelCase": lw[0] + "".join(x.capitalize() for x in lw[1:]) if lw else name,
        "PascalCase": "".join(x.capitalize() for x in lw),
        "snake_case": "_".join(lw),
        "SCREAMING_SNAKE_CASE": "_".join(lw).upper(),
        "kebab-case": "-".join(lw),
        "SCREAMING-KEBAB-CASE": "-".join(lw).upper(),
        "lowercase": "".join(lw),
        "UPPERCASE": "".join(lw).upper(),
    }.get(rule, name)


def ts_key(k: str) -> str:
    return k if re.fullmatch(r"[A-Za-z_$][\w$]*", k) else repr(k).replace("'", '"')


class Generator:
    def __init__(self, types: list[TypeDef], commands: list[Command]):
        self.by_name: dict[str, list[TypeDef]] = {}
        for t in types:
            self.by_name.setdefault(t.name, []).append(t)
        self.commands = commands
        self.emitted: dict[str, TypeDef] = {}
        self.queue: list[TypeDef] = []
        self.unknown: set[str] = set()
        self.ambiguous: set[str] = set()

    def lookup(self, path: str, ctx_module: str) -> TypeDef | None:
        segs = [p for p in path.split("::") if p not in ("crate", "self", "super")]
        name = segs[-1]
        cands = self.by_name.get(name, [])
        if not cands:
            return None
        if len(cands) == 1:
            return cands[0]
        if len(segs) > 1:
            for c in cands:
                if c.module.endswith(segs[-2]):
                    return c
        for c in cands:
            if c.module == ctx_module:
                return c
        self.ambiguous.add(name)
        return cands[0]

    def ts(self, ty: str, ctx: str) -> str:
        ty = ty.strip()
        ty = re.sub(r"^&\s*('\w+\s+)?(mut\s+)?", "", ty)
        if ty.startswith("(") and ty.endswith(")"):
            inner = split_top(ty[1:-1])
            if not inner:
                return "null"
            return "[" + ", ".join(self.ts(t, ctx) for t in inner) + "]"
        if ty.startswith("[") and ty.endswith("]"):
            inner = ty[1:-1].rsplit(";", 1)[0]
            return self.wrap_array(self.ts(inner, ctx))
        m = re.fullmatch(r"([\w:]+)\s*(?:<(.*)>)?", ty, re.S)
        if not m:
            self.unknown.add(ty)
            return "unknown"
        head, args_s = m.group(1), m.group(2)
        base = head.split("::")[-1]
        args = split_top(args_s) if args_s else []
        args = [a for a in args if not a.startswith("'")]
        if base in PRIMITIVES and not args:
            return PRIMITIVES[base]
        if base in ("Option",):
            return self.ts(args[0], ctx) + " | null"
        if base in ("Vec", "VecDeque", "HashSet", "BTreeSet", "IndexSet"):
            return self.wrap_array(self.ts(args[0], ctx))
        if base in ("HashMap", "BTreeMap", "IndexMap", "Map"):
            if not args:  # serde_json::Map<String, Value>
                return "Record<string, unknown>"
            return f"Record<{self.key_ts(args[0], ctx)}, {self.ts(args[1], ctx)}>"
        if base in ("Box", "Arc", "Rc", "Cow"):
            return self.ts(args[-1], ctx)
        if base == "Result":
            return self.ts(args[0], ctx)
        td = self.lookup(head, ctx)
        if td is None:
            self.unknown.add(head)
            return "unknown"
        self.require(td)
        return td.name

    def key_ts(self, ty: str, ctx: str) -> str:
        t = self.ts(ty, ctx)
        return t if t in ("string", "number") else "string"

    @staticmethod
    def wrap_array(t: str) -> str:
        return f"({t})[]" if " " in t else f"{t}[]"

    def require(self, td: TypeDef) -> None:
        key = td.name
        if key not in self.emitted:
            self.emitted[key] = td
            self.queue.append(td)

    # --- emit ------------------------------------------------------------------------------

    def jsdoc(self, docs: list[str], indent: str = "") -> str:
        docs = [d for d in docs if d]
        if not docs:
            return ""
        if len(docs) == 1:
            return f"{indent}/** {docs[0]} */\n"
        return indent + "/**\n" + "".join(f"{indent} * {d}\n" for d in docs) + f"{indent} */\n"

    def struct_members(self, td: TypeDef, fields: list[Field], rule: str | None) -> tuple[list[str], list[str]]:
        lines, flattened = [], []
        for f in fields:
            fo = serde_attr(f.attrs)
            if fo.get("skip") or fo.get("skip_serializing") and fo.get("skip_deserializing"):
                continue
            if fo.get("flatten"):
                flattened.append(self.ts(f.ty, td.module))
                continue
            key = fo.get("rename") if isinstance(fo.get("rename"), str) else rename(f.name, rule)
            optional = "?" if ("skip_serializing_if" in fo or fo.get("skip_serializing")) else ""
            lines.append(self.jsdoc(f.docs, "  ") + f"  {ts_key(key)}{optional}: {self.ts(f.ty, td.module)};")
        return lines, flattened

    def emit(self, td: TypeDef) -> str:
        so = serde_attr(td.attrs)
        rule = so.get("rename_all") if isinstance(so.get("rename_all"), str) else None
        head = self.jsdoc(td.docs) + f"/** Rust: `{td.module}::{td.name}` */\n" if td.docs else f"/** Rust: `{td.module}::{td.name}` */\n"
        if td.docs:
            head = self.jsdoc(td.docs + ["", f"Rust: `{td.module}::{td.name}`"])
        if td.kind == "tuple":
            if len(td.fields) == 1:
                return head + f"export type {td.name} = {self.ts(td.fields[0].ty, td.module)};\n"
            return head + f"export type {td.name} = [{', '.join(self.ts(f.ty, td.module) for f in td.fields)}];\n"
        if td.kind == "struct":
            lines, flat = self.struct_members(td, td.fields, rule)
            if flat:
                body = "{\n" + "\n".join(lines) + "\n}" if lines else "{}"
                return head + f"export type {td.name} = {' & '.join(flat + [body])};\n"
            return head + f"export interface {td.name} {{\n" + "\n".join(lines) + ("\n" if lines else "") + "}\n"
        # enum
        tag = so.get("tag") if isinstance(so.get("tag"), str) else None
        content = so.get("content") if isinstance(so.get("content"), str) else None
        untagged = bool(so.get("untagged"))
        alts = []
        for vname, vkind, payload, vattrs, vdocs in td.variants:
            vo = serde_attr(vattrs)
            if vo.get("skip") or vo.get("skip_serializing"):
                continue
            key = vo.get("rename") if isinstance(vo.get("rename"), str) else rename(vname, rule)
            lit = f'"{key}"'
            if vkind == "unit":
                if tag and not untagged:
                    alts.append(f"{{ {ts_key(tag)}: {lit} }}")
                else:
                    alts.append("null" if untagged else lit)
                continue
            if vkind == "tuple":
                inner = self.ts(payload[0], td.module) if len(payload) == 1 else "[" + ", ".join(self.ts(p, td.module) for p in payload) + "]"
            else:
                vrule = vo.get("rename_all") if isinstance(vo.get("rename_all"), str) else so.get("rename_all_fields") if isinstance(so.get("rename_all_fields"), str) else None
                lines, flat = self.struct_members(td, payload, vrule)
                inner = "{ " + " ".join(l.strip() for l in lines) + " }"
                if flat:
                    inner = " & ".join(flat + [inner])
            if untagged:
                alts.append(inner)
            elif tag and content:
                alts.append(f"{{ {ts_key(tag)}: {lit}; {ts_key(content)}: {inner} }}")
            elif tag:
                alts.append(f"({{ {ts_key(tag)}: {lit} }} & {inner})")
            else:
                alts.append(f"{{ {ts_key(key)}: {inner} }}")
        body = "\n  | ".join(alts) if alts else "never"
        return head + f"export type {td.name} =\n  | {body};\n"

    def run(self) -> str:
        cmd_lines = []
        seen_cmds = set()
        for c in sorted(self.commands, key=lambda c: c.name):
            if c.name in seen_cmds:
                continue
            seen_cmds.add(c.name)
            args = []
            for pname, pty in c.params:
                args.append(f"{ts_key(rename(pname, 'camelCase'))}: {self.ts(pty, c.module)}")
            ret = "null" if c.ret is None else self.ts(c.ret, c.module)
            a = "{ " + "; ".join(args) + " }" if args else "Record<string, never>"
            cmd_lines.append(f"  {c.name}: {{ args: {a}; returns: {ret} }};")
        bodies = []
        i = 0
        while i < len(self.queue):
            td = self.queue[i]
            bodies.append((td.name, self.emit(td)))
            i += 1
        bodies.sort()
        header = [
            "// AUTO-GENERATED by tools/gen-types/gen_types.py — do not edit by hand.",
            "// Regenerate with `python3 tools/gen-types/gen_types.py`; CI fails if this file is stale.",
            f"// {len(seen_cmds)} commands, {len(bodies)} IPC types.",
        ]
        if self.unknown:
            header.append("// Mapped to `unknown` (not serde types this tool can see): " + ", ".join(sorted(self.unknown)) + ".")
        if self.ambiguous:
            header.append("// Names defined in more than one module (first match used): " + ", ".join(sorted(self.ambiguous)) + ".")
        out = "\n".join(header) + "\n/* eslint-disable */\n\n"
        out += "\n".join(b for _, b in bodies)
        out += (
            "\n/** Every `#[tauri::command]`: the camelCase args object `invoke` takes and what it resolves to. */\n"
            "export interface LensCommands {\n" + "\n".join(cmd_lines) + "\n}\n\n"
            "export type LensCommandName = keyof LensCommands;\n"
            "export type CommandArgs<K extends LensCommandName> = LensCommands[K][\"args\"];\n"
            "export type CommandResult<K extends LensCommandName> = LensCommands[K][\"returns\"];\n"
        )
        return out


def main() -> int:
    types: list[TypeDef] = []
    commands: list[Command] = []
    for path in sorted(SRC.rglob("*.rs")):
        rel = path.relative_to(SRC)
        if rel.parts[0] == "tests" or path.name == "build.rs":
            continue
        module = "::".join(rel.with_suffix("").parts).replace("::mod", "")
        if module == "lib":
            module = "crate"
        scan(path, module, types, commands)
    text = Generator(types, commands).run()
    if "--check" in sys.argv:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current.replace("\r\n", "\n") != text:
            sys.stderr.write(
                f"{OUT.relative_to(ROOT)} is out of date. Run `python3 tools/gen-types/gen_types.py` and commit the result.\n"
            )
            return 1
        print(f"{OUT.relative_to(ROOT)} is up to date.")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(commands)} commands)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
