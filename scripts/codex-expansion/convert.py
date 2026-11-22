"""Turn the Codex Expansion DM book into an asetheria-codex JSON for scripts/import-codex-file.ts.

One entry per anchored section/card. Nested anchored cards become child entries
(parentSlug). Places that already exist in the live codex are matched by name and
only fill blanks / replace stubs. Anything absent from the Players' Guide is secret.
<details class="dm"> boxes go to dmNotes. Third-party material (bestiary, SRD
spellbook) and pure index/reference parts are left out.

usage: python convert.py <zip-root> <out.json>
"""
import json, os, re, sys, unicodedata
from collections import Counter, defaultdict
from bs4 import BeautifulSoup, NavigableString, Tag

ROOT, OUT = sys.argv[1], sys.argv[2]
dm = BeautifulSoup(open(os.path.join(ROOT, "Asetheria_Codex_Expansion.html"), encoding="utf-8").read(), "lxml")
player_ids = set(re.findall(r'id="([^"]+)"', open(os.path.join(ROOT, "Asetheria_Players_Guide.html"), encoding="utf-8").read()))

# ---------------------------------------------------------------- existing codex
def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", re.sub(r"['‘’.,]", "", s.lower())).strip()

def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"['‘’]", "", s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:80].strip("-")

existing = {}            # slug -> title
by_name = {}             # norm(title / alias) -> slug (shortest slug wins: "x" over "x-2")
def put(n, slug):
    cur = by_name.get(n)
    if cur is None or (len(slug), slug) < (len(cur), cur):
        by_name[n] = slug
edir = os.path.join(ROOT, "asetheria_build", "lore", "entries")
for f in os.listdir(edir):
    lines = open(os.path.join(edir, f), encoding="utf-8").read().splitlines()
    slug = f[:-3]
    title = next((l[2:].strip() for l in lines if l.startswith("# ")), slug)
    existing[slug] = title
    put(norm(title), slug)
    for l in lines[:4]:
        if l.startswith("Also known as "):
            for a in l[len("Also known as "):].split(","):
                put(norm(a), slug)
    head = re.split(r"[,;:]|\s+[-–—]\s+", title)[0].strip()
    if len(head) >= 4:
        put(norm(head), slug)

# ---------------------------------------------------------------- what to take
SKIP_PARTS = set()  # the DM has permission for the open-licence books; take everything
PART_KIND = {
    "overview": "lore", "empire-invicta": "location", "empire-hellenoria": "location",
    "empire-acheaoria": "location", "free": "location", "temples": "location",
    "champions": "npc", "systems": "system", "wilds": "location", "calendar": "event",
    "tables": "table", "hidden-city": "lore", "fools-hand": "rule", "five-meteors": "lore",
    "meteor-creatures": "creature", "next-sessions": "quest", "old-empires": "lore",
    "continental-war": "lore", "provinces": "location", "league": "location",
    "satrapies": "location", "the-rulers": "npc", "forces": "organization",
    "festivals": "event", "rifts-planes": "location", "daily-life": "lore",
    "pantheons": "deity", "great-houses": "family", "orders": "organization",
    "gazetteer": "location", "origins": "lore", "myths": "lore", "folklore": "lore",
    "arcs": "quest", "armoury": "item", "legendary-artifacts": "item",
    "heirlooms-relics": "item", "musters": "npc", "farshore-detail": "location",
    "dungeons": "quest", "new-creatures": "creature", "monster-templates": "rule",
    "great-dragons": "creature", "shops": "location", "lairs": "location",
    "rival-companies": "faction", "players": "rule", "subclasses": "rule",
    "travel": "rule", "powers": "faction", "handouts": "note", "names": "lore",
    "connections": "lore", "villages-book": "quest", "romulo-book": "location",
}
PREFIX_KIND = {"house": "family", "dist": "location", "site": "location", "champ": "npc",
               "ruler": "npc", "god": "deity", "order": "organization", "sys": "system",
               "item": "item", "heir": "item", "relic": "item", "tbl": "table", "arc": "quest",
               "faction": "faction", "rival": "faction", "handout": "note", "muster": "npc",
               "fest": "event", "folk": "lore", "myth": "lore", "origin": "lore", "web": "lore",
               "wild": "location", "temples": "location", "city": "location", "town": "location",
               "village": "location"}
# Kinds whose same-name page in the live codex is the same thing (fill it, don't duplicate).
MATCH_KINDS = {"deity", "organization", "family", "npc", "location", "faction", "item"}
MATCH_PREFIXES = {"city", "town", "village", "god", "order", "site", "wild", "dist", "ruler", "faction",
                  "house", "champ", "item", "heir", "relic", "rift", "planes", "muster"}
UNIT_CLASSES = {"place", "card", "champ", "sysgroup", "champ-group"}
DM_PARTS = {"hidden-city", "fools-hand", "five-meteors", "next-sessions", "arcs", "dungeons",
            "handouts", "lairs", "rival-companies", "powers", "connections", "meteor-creatures"}

def is_unit(el):
    return (isinstance(el, Tag) and el.get("id") and el.name in ("section", "article", "div")
            and UNIT_CLASSES & set(el.get("class", [])))

def kind_for(part_id, el_id, el):
    pre = el_id.split("-")[0]
    if pre in PREFIX_KIND:
        return PREFIX_KIND[pre]
    if part_id in PART_KIND:
        return PART_KIND[part_id]
    if part_id.endswith("-book"):
        return "lore" if "sysgroup" in el.get("class", []) else "location"
    return "lore"

# ---------------------------------------------------------------- html -> markdown
def inline(node, links):
    out = []
    for c in node.children:
        if isinstance(c, NavigableString):
            out.append(re.sub(r"\s+", " ", str(c)))
            continue
        if not isinstance(c, Tag):
            continue
        t = c.name
        inner = inline(c, links)
        if t in ("b", "strong"):
            out.append(f"**{inner.strip()}**" if inner.strip() else "")
        elif t in ("i", "em", "cite"):
            out.append(f"*{inner.strip()}*" if inner.strip() else "")
        elif t == "a" and c.get("href", "").startswith("#"):
            target = links.get(c["href"][1:])
            label = inner.strip()
            if target and label:
                out.append(f"[[{target}]]" if norm(target) == norm(label) else f"[[{target}|{label}]]")
            else:
                out.append(label)
        elif t == "br":
            out.append("  \n")
        else:
            out.append(inner)
    return "".join(out)

def table_md(tbl, links):
    rows = []
    for tr in tbl.find_all("tr"):
        cells = [inline(td, links).strip().replace("|", "/") for td in tr.find_all(["th", "td"])]
        if cells:
            rows.append(cells)
    if not rows:
        return ""
    w = max(len(r) for r in rows)
    rows = [r + [""] * (w - len(r)) for r in rows]
    md = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * w]
    md += ["| " + " | ".join(r) + " |" for r in rows[1:]]
    return "\n".join(md)

def blocks(node, links, depth=3):
    """Block-level markdown for node's children; anchored units and dm boxes are skipped."""
    out = []
    for c in node.children:
        if isinstance(c, NavigableString):
            if str(c).strip():
                out.append(re.sub(r"\s+", " ", str(c)).strip())
            continue
        if not isinstance(c, Tag) or is_unit(c):
            continue
        cls = set(c.get("class", []))
        if c.name == "details" and "dm" in cls:
            continue
        if cls & {"kicker", "was", "tagline", "facts", "meta"}:
            continue
        t = c.name
        if t in ("h1", "h2", "h3", "h4", "h5", "h6"):
            txt = inline(c, links).strip()
            if txt:
                out.append("#" * min(6, depth) + " " + txt)
        elif t == "p":
            txt = inline(c, links).strip()
            if txt:
                out.append(txt)
        elif t in ("ul", "ol"):
            items = [("- " if t == "ul" else f"{i}. ") + inline(li, links).strip()
                     for i, li in enumerate(c.find_all("li", recursive=False), 1)]
            if items:
                out.append("\n".join(items))
        elif t == "table":
            md = table_md(c, links)
            if md:
                out.append(md)
        elif t == "dl":
            items = []
            for d in c.find_all("div", recursive=False) or [c]:
                for dt in d.find_all("dt"):
                    dd = dt.find_next_sibling("dd")
                    items.append(f"- **{inline(dt, links).strip()}:** {inline(dd, links).strip() if dd else ''}")
            if items:
                out.append("\n".join(items))
        elif t == "blockquote":
            txt = "\n".join("> " + l for l in blocks(c, links, depth).splitlines())
            out.append(txt)
        elif t in ("details",):
            out.append(blocks(c, links, depth))
        elif t == "summary":
            txt = inline(c, links).strip()
            if txt:
                out.append(f"**{txt}**")
        else:
            out.append(blocks(c, links, depth))
    return "\n\n".join(x for x in out if x and x.strip())

def dm_notes(el, links):
    notes = []
    for d in el.find_all("details", class_="dm"):
        if d.find_parent(is_unit) is not el and d.find_parent(is_unit) is not None:
            continue
        s = d.find("summary")
        if s:
            s.extract()
        notes.append(blocks(d, links, 4))
    return "\n\n---\n\n".join(n for n in notes if n.strip())

def title_of(el):
    h = el.find(["h2", "h3", "h4", "h5"])
    if not h:
        return None, ""
    small = " · ".join(s.get_text(" ", strip=True) for s in h.find_all("small"))
    hc = BeautifulSoup(str(h), "lxml").find(h.name)
    for s in hc.find_all("small"):
        s.decompose()
    return re.sub(r"\s+", " ", hc.get_text(" ", strip=True)).strip(" ·—-"), small

def facts(el):
    out = {}
    for dl in el.find_all("dl", class_="facts"):
        if dl.find_parent(is_unit) is not el:
            continue
        for dt in dl.find_all("dt"):
            dd = dt.find_next_sibling("dd")
            k = re.sub(r"[^a-zA-Z ]", "", dt.get_text(" ", strip=True)).strip()
            if k and dd:
                key = k[0].lower() + re.sub(r"\s+(\w)", lambda m: m.group(1).upper(), k[1:])
                out[key] = dd.get_text(" ", strip=True)
    return out

# ---------------------------------------------------------------- collect units
units = []
for part in dm.select("section.part"):
    pid = part.get("id")
    if pid in SKIP_PARTS:
        continue
    for el in [part] + [e for e in part.find_all(is_unit)]:
        units.append((pid, el))

# Names first so links can resolve anywhere.
info = {}
claimed = set()
used = set(existing)
for pid, el in units:
    eid = el["id"]
    name, small = title_of(el)
    if not name:
        continue
    is_part = el.name == "section" and "part" in el.get("class", [])
    k = ("empire" if pid.startswith("empire-") else "lore") if is_part else kind_for(pid, eid, el)
    match = None
    if is_part and pid.startswith("empire-"):
        match = by_name.get(norm(name)) or by_name.get(norm("Imperium " + name))
    elif eid.split("-")[0] in MATCH_PREFIXES and k in MATCH_KINDS:
        match = by_name.get(norm(name))
        if not match and eid.startswith(("city-", "town-", "village-")):
            match = by_name.get(norm(name + " City")) or by_name.get(norm(re.sub(r" City$", "", name)))
        if match in claimed:
            match = None
    if match:
        claimed.add(match)
    info[eid] = dict(pid=pid, el=el, name=name, small=small, kind=k, match=match)

# Parents: nearest anchored ancestor unit, else the part.
for eid, d in info.items():
    el = d["el"]
    par = el.find_parent(is_unit)
    if par is None and "part" not in el.get("class", []):
        par = el.find_parent("section", class_="part")
    d["parent"] = par.get("id") if par is not None and par.get("id") in info else None

# Slugs (new entries get name slugs, disambiguated by parent).
counts = Counter(norm(d["name"]) for d in info.values() if not d["match"])
for eid, d in info.items():
    if d["match"]:
        d["slug"] = d["match"]
        continue
    base = slugify(d["name"]) or slugify(eid)
    s = base
    if s in used or counts[norm(d["name"])] > 1:
        par = info.get(d["parent"] or "", {})
        s = f"{base}-{slugify(par.get('name', ''))[:30]}".strip("-") if par else base
        n = 2
        while s in used:
            s = f"{base}-{n}"; n += 1
    used.add(s)
    d["slug"] = s

def link_name(eid):
    d = info.get(eid)
    if not d:
        return None
    return existing.get(d["slug"], d["name"]) if d["match"] else d["name"]

links = {eid: link_name(eid) for eid in info}

# Names that appear more than once would make [[links]] ambiguous: link those by slug-unique name.
dupe_names = {n for n, c in Counter(links.values()).items() if c > 1}
for eid in list(links):
    if links[eid] in dupe_names and not info[eid]["match"]:
        par = info.get(info[eid]["parent"] or "")
        if par:
            links[eid] = f"{info[eid]['name']} ({par['name']})"
# Disambiguated display names become the entry names too, so links resolve.
for eid, d in info.items():
    if not d["match"]:
        d["name"] = links[eid]

def summary_for(el, small, body):
    for sel in ("p.tagline", "p.meta", "p.kicker"):
        p = el.find("p", class_=sel.split(".")[1])
        if p is not None and p.find_parent(is_unit) is el:
            t = p.get_text(" ", strip=True)
            if t:
                return t[:300]
    first = next((l for l in body.split("\n\n") if l and not l.startswith(("#", "|", "-", ">"))), "")
    first = re.sub(r"[*\[\]]", "", first)
    s = re.split(r"(?<=[.!?])\s", first)[0] if first else small
    return (s or small)[:300]

entries = []
for eid, d in info.items():
    el = d["el"]
    body = blocks(el, links)
    # Drop the title line duplicated as the first heading.
    body = re.sub(r"^#+ .*\n*", "", body, count=1) if body.startswith("#") else body
    # Headings with nothing under them (their content became child entries).
    parts = body.split("\n\n")
    keep = [b for i, b in enumerate(parts)
            if not (b.startswith("#") and (i + 1 == len(parts) or parts[i + 1].startswith("#")))]
    body = "\n\n".join(keep)
    meta = el.find("p", class_="meta")
    if meta is not None and meta.find_parent(is_unit) is el:
        body = "*" + inline(meta, links).strip() + "*\n\n" + body
    notes = dm_notes(el, links)
    secret = (eid not in player_ids) or d["pid"] in DM_PARTS
    fields = facts(el)
    if d["small"]:
        fields.setdefault("epithet", d["small"][:200])
    tags = ["codex-expansion", d["pid"]]
    parent = info.get(d["parent"] or "")
    e = dict(
        slug=d["slug"], kind=d["kind"], name=d["name"],
        summary=summary_for(el, d["small"], body), body=body.strip(), dmNotes=notes,
        fields=fields, tags=tags, visibility="secret" if secret else "public",
        sourcePath=f"Asetheria_Codex_Expansion.html#{eid}",
        parentSlug=parent["slug"] if parent else None,
    )
    if d["match"]:
        e["replaceBodyShorterThan"] = 600
    if not e["body"] and not e["dmNotes"]:
        continue
    entries.append(e)

# ---------------------------------------------------------------- bestiary + spellbook
html_text = open(os.path.join(ROOT, "Asetheria_Codex_Expansion.html"), encoding="utf-8").read()
def blob(i):
    m = re.search(r'<script type="application/json" id="%s">' % i, html_text)
    return json.loads(html_text[m.end():html_text.find("</script>", m.end())])

taken = {e["slug"] for e in entries} | set(existing)
def new_slug(name, suffix):
    base = slugify(name) or suffix
    s2 = base if base not in taken else f"{base}-{suffix}"
    n = 2
    while s2 in taken:
        s2 = f"{base}-{suffix}-{n}"; n += 1
    taken.add(s2)
    return s2

def part_slug(pid):
    d = info.get(pid)
    return d["slug"] if d else None

def mod(v):
    m = (v - 10) // 2
    return f"{v} ({'+' if m >= 0 else '−'}{abs(m)})"

def statblock(v, books):
    lines = [f"*{v.get('z','')} {v.get('t','').lower()}, {v.get('al','')}*"]
    hp = f"{v['hp']}" + (f" ({v['hd']})" if v.get("hd") else "")
    lines.append(f"**Armor Class** {v.get('ac','')} · **Hit Points** {hp} · **Speed** {v.get('sp','')}")
    ab = v.get("ab") or []
    if len(ab) == 6:
        lines.append("| STR | DEX | CON | INT | WIS | CHA |\n|---|---|---|---|---|---|\n| " + " | ".join(mod(x) for x in ab) + " |")
    props = [("sv", "Saving Throws"), ("sk", "Skills"), ("dv", "Damage Vulnerabilities"), ("dr", "Damage Resistances"),
             ("di", "Damage Immunities"), ("ci", "Condition Immunities"), ("se", "Senses"), ("la", "Languages")]
    pl = [f"**{label}** {v[k]}" for k, label in props if v.get(k)]
    pl.append(f"**Challenge** {v.get('cr','')} ({v.get('xp',0):,} XP)")
    lines.append(" · ".join(pl))
    for key, head in (("tr", None), ("A", "Actions"), ("B", "Bonus Actions"), ("R", "Reactions"), ("L", "Legendary Actions")):
        items = v.get(key) or []
        if not items:
            continue
        if head:
            lines.append(f"#### {head}")
        for it in items:
            if isinstance(it, list) and len(it) >= 2:
                lines.append(f"***{it[0]}.*** {it[1]}")
            else:
                lines.append(str(it))
    if v.get("ad"):
        lines.append(f"*{v['ad']}*")
    book = books.get(v.get("b"), [v.get("b"), ""])
    lines.append(f"*Source: {book[0]}{' — ' + book[1] if len(book) > 1 and book[1] else ''}.*")
    return "\n\n".join(lines)

best = blob("bestiary-data")
adapt = blob("adapt-data")
books = best["books"]
bparent = part_slug("bestiary")
creature_names = {norm(e["name"]) for e in entries if e["kind"] == "creature"}
added_creatures = 0
for g in best["groups"]:
    a = adapt["core"].get(g["id"]) or adapt["wikidot"].get(g["id"].replace("wiki-", "")) or adapt["unique"].get(g["id"]) or {}
    name = g["n"]
    if norm(name) in creature_names:
        continue  # a hand-written creature section already covers it
    parts = []
    if a.get("as"):
        parts.append(f"**In Asetheria:** {a['as']}")
    if a.get("tagline"):
        parts.append(a["tagline"])
    if a.get("reskin"):
        parts.append(a["reskin"])
    local = a.get("local") or {}
    if local:
        parts.append("**Local names:** " + "; ".join(f"{k.title()}: *{v}*" for k, v in local.items()))
    where = a.get("where") or g.get("home")
    if where:
        parts.append(f"**Where:** {where}")
    if a.get("lore"):
        parts.append(a["lore"])
    if a.get("statnotes"):
        parts.append(f"**Stat notes:** {a['statnotes']}")
    for idx in g["v"]:
        v = best["variants"][idx]
        parts.append(f"### {v['n']} — CR {v.get('cr','')}")
        parts.append(statblock(v, books))
    wiki = best["wikidot"].get(g["id"]) if g["id"].startswith("wiki-") else None
    if wiki and not g["v"]:
        parts.append("### Statistics\n\n" + wiki["text"].replace("\n", "  \n"))
    hook = a.get("hook")
    match = by_name.get(norm(name))
    slug = match if match and match not in claimed else new_slug(name, "creature")
    if match and slug == match:
        claimed.add(match)
    e = dict(slug=slug, kind="creature", name=existing.get(slug, name),
             summary=(a.get("tagline") or (f"{g['t']}, CR {', '.join(g['cr'])}" + (f" — {g['home']}" if g.get('home') else "")))[:300],
             body="\n\n".join(parts), dmNotes=(f"**Hook.** {hook}" if hook else ""),
             fields={"type": g["t"], "challenge": ", ".join(g["cr"]), "habitat": g.get("home", "")[:300],
                     "sources": ", ".join(books.get(b, [b])[0] for b in g["bk"])},
             tags=["codex-expansion", "bestiary"] + [f"empire:{x}" for x in g.get("emp", [])],
             visibility="secret", sourcePath=f"Asetheria_Codex_Expansion.html#bestiary/{g['id']}",
             parentSlug=bparent)
    if match and slug == match:
        e["replaceBodyShorterThan"] = 600
    entries.append(e)
    added_creatures += 1

spells = blob("spell-data")
sbooks = spells["books"]
sparent = part_slug("spellbook")
LV = {0: "Cantrip"}
added_spells = 0
for g in spells["groups"]:
    name = g["n"]
    lvl = LV.get(g["l"], f"Level {g['l']}")
    parts = []
    for idx in g["v"]:
        v = spells["variants"][idx]
        book = sbooks.get(v["b"], [v["b"], ""])
        if len(g["v"]) > 1:
            parts.append(f"### {book[0]}")
        head = f"*{lvl if g['l'] == 0 else ('Level ' + str(v['l']))} {v['s'].lower()}{' (ritual)' if v.get('ri') else ''}*"
        props = [f"**Casting Time** {v.get('ct','')}", f"**Range** {v.get('r','')}", f"**Components** {v.get('cm','')}",
                 f"**Duration** {v.get('d','')}"]
        if v.get("c"):
            props.append("**Classes** " + ", ".join(v["c"]))
        parts.append(head + "\n\n" + " · ".join(props))
        if v.get("de"):
            parts.append(v["de"])
        if v.get("hl"):
            parts.append(f"***At Higher Levels.*** {v['hl']}")
        for k, label in (("lo", "Lore"), ("tr", "Tradition"), ("in", "In the world"), ("ba", "Background")):
            if v.get(k):
                parts.append(f"**{label}.** {v[k]}")
        parts.append(f"*Source: {book[0]}{' — ' + book[1] if len(book) > 1 and book[1] else ''}.*")
    slug = new_slug(name, "spell")
    entries.append(dict(
        slug=slug, kind="rule", name=name if norm(name) not in {norm(x) for x in existing.values()} else f"{name} (spell)",
        summary=f"{lvl} {g['s'].lower()} spell" + (f" · {', '.join(g['c'])}" if g.get('c') else "") + (" · Asetheria homebrew" if g.get("hb") else ""),
        body="\n\n".join(parts), dmNotes="",
        fields={"level": str(g["l"]), "school": g["s"], "classes": ", ".join(g.get("c") or []),
                "concentration": "yes" if g.get("co") else "no", "ritual": "yes" if g.get("ri") else "no",
                "sources": ", ".join(sbooks.get(b, [b])[0] for b in g["bk"])},
        tags=["codex-expansion", "spell", f"spell-level-{g['l']}", g["s"].lower()] + (["homebrew"] if g.get("hb") else []),
        visibility="public", sourcePath=f"Asetheria_Codex_Expansion.html#spellbook/{g['id']}",
        parentSlug=sparent))
    added_spells += 1
print("bestiary entries", added_creatures, "spell entries", added_spells)

# Parents must come before children in the file.
bys = {e["slug"]: e for e in entries}
def depth(e, seen=()):
    p = e.get("parentSlug")
    pe = bys.get(p)
    return 0 if not pe or p in seen else 1 + depth(pe, seen + (p,))
entries.sort(key=depth)

json.dump({"format": "asetheria-codex", "entries": entries}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
m = [e for e in entries if e.get("replaceBodyShorterThan")]
print("entries", len(entries), "matched-existing", len(m), "new", len(entries) - len(m))
print("kinds", Counter(e["kind"] for e in entries if not e.get("replaceBodyShorterThan")).most_common())
print("secret", sum(e["visibility"] == "secret" for e in entries))
print("bytes", os.path.getsize(OUT))
