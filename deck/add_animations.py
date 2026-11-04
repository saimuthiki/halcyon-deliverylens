"""Add click-by-click entrance animations and fade transitions to the deck built by build_deck.js.

pptxgenjs cannot write animations, so build_deck.js names every shape that should appear on a click
`anim_<click>_<effect>_<n>` (effect f = fade, w = wipe from the left). This script reads those names from
each slide's XML and writes the matching PowerPoint timing tree: one click per step number, and shapes in
the same step appear together, a little staggered. Every slide also gets a short fade transition.

Usage (from the repo root):  python deck/add_animations.py [deck/DeliveryLens-pitch.pptx]
"""
import os
import re
import shutil
import sys
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path

SHAPE = re.compile(r'<p:(sp|pic|cxnSp)>\s*<p:nv(?:Sp|Pic|CxnSp)Pr>\s*<p:cNvPr id="(\d+)" name="anim_(\d+)_([fw])_\d+"')
TRANSITION = '<p:transition spd="med"><p:fade/></p:transition>'
STAGGER_MS = 120


def effect_xml(ids, spid, effect, delay):
    preset, subtype, flt = (22, 8, "wipe(left)") if effect == "w" else (10, 0, "fade")
    a, b, c = next(ids), next(ids), next(ids)
    return (
        f'<p:par><p:cTn id="{a}" presetID="{preset}" presetClass="entr" presetSubtype="{subtype}" fill="hold" '
        f'nodeType="withEffect"><p:stCondLst><p:cond delay="{delay}"/></p:stCondLst><p:childTnLst>'
        f'<p:set><p:cBhvr><p:cTn id="{b}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>'
        f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName>'
        f'</p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>'
        f'<p:animEffect transition="in" filter="{flt}"><p:cBhvr><p:cTn id="{c}" dur="{450 if effect == "f" else 600}"/>'
        f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cBhvr></p:animEffect>'
        f'</p:childTnLst></p:cTn></p:par>'
    )


def timing_xml(steps):
    ids = iter(range(3, 100000))
    clicks = []
    for step in sorted(steps):
        shapes = steps[step]
        outer, inner = next(ids), next(ids)
        effects = "".join(effect_xml(ids, spid, eff, i * STAGGER_MS) for i, (spid, eff, _) in enumerate(shapes))
        # Step 0 plays as the slide opens; every other step waits for a click.
        start = "0" if step == 0 else "indefinite"
        clicks.append(
            f'<p:par><p:cTn id="{outer}" fill="hold"><p:stCondLst><p:cond delay="{start}"/></p:stCondLst><p:childTnLst>'
            f'<p:par><p:cTn id="{inner}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
            f'{effects}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>'
        )
    # The first effect of each click is the click effect; PowerPoint wants that node type on it.
    body = "".join(clicks)
    body = re.sub(r'(<p:cond delay="indefinite"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="\d+" fill="hold">'
                  r'<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="\d+" presetID="\d+" '
                  r'presetClass="entr" presetSubtype="\d+" fill="hold" nodeType=")withEffect', r'\1clickEffect', body)
    blds = "".join(f'<p:bldP spid="{spid}" grpId="0" animBg="1"/>'
                   for step in steps.values() for spid, _, kind in step if kind == "sp")
    body = body.replace('fill="hold" nodeType=', 'fill="hold" grpId="0" nodeType=')
    return (
        '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
        '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
        f'{body}</p:childTnLst></p:cTn>'
        '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
        '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>'
        '</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>'
        + (f'<p:bldLst>{blds}</p:bldLst>' if blds else '') + '</p:timing>'
    )


def animate(xml):
    steps = defaultdict(list)
    for kind, spid, step, eff in SHAPE.findall(xml):
        steps[int(step)].append((spid, eff, kind))
    extra = TRANSITION + (timing_xml(steps) if steps else "")
    xml = re.sub(r"<p:transition.*?</p:transition>|<p:timing>.*?</p:timing>", "", xml, flags=re.S)
    anchor = "</p:clrMapOvr>" if "</p:clrMapOvr>" in xml else "</p:cSld>"
    return xml.replace(anchor, anchor + extra, 1), sum(len(v) for v in steps.values()), len(steps)


def main(path):
    src = Path(path)
    fd, name = tempfile.mkstemp(suffix=".pptx")
    os.close(fd)
    tmp = Path(name)
    total = 0
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if re.fullmatch(r"ppt/slides/slide\d+\.xml", item.filename):
                xml, shapes, clicks = animate(data.decode("utf-8"))
                data = xml.encode("utf-8")
                total += shapes
                print(f"{item.filename}: {shapes} shapes in {clicks} steps")
            zout.writestr(item, data)
    shutil.move(str(tmp), src)
    print(f"animated {total} shapes in {src}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "deck/DeliveryLens-pitch.pptx")
