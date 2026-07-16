#!/usr/bin/env python3
"""Normalize local PDF filenames while preserving case IDs and official URLs."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


LOCAL_PDF_RE = re.compile(r"(?P<prefix>(?:\.\./)?local_assets/pdfs/)(?P<stem>[A-Za-z0-9_-]+)(?P<suffix>\.pdf)")


def normalized_stem(value: str) -> str:
    return re.sub(r"_+", "_", value)


def normalize_text(text: str) -> tuple[str, int]:
    changes = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal changes
        old = match.group("stem")
        new = normalized_stem(old)
        if new != old:
            changes += 1
        return f'{match.group("prefix")}{new}{match.group("suffix")}'

    return LOCAL_PDF_RE.sub(replace, text), changes


def migrate(project: Path) -> dict[str, object]:
    pdf_dir = project / "local_assets" / "pdfs"
    renamed: list[dict[str, str]] = []
    if pdf_dir.exists():
        for source in sorted(pdf_dir.glob("*.pdf")):
            target = source.with_name(f"{normalized_stem(source.stem)}.pdf")
            if target == source:
                continue
            if target.exists():
                raise FileExistsError(f"Cannot normalize {source.name}: {target.name} already exists")
            source.rename(target)
            renamed.append({"before": source.name, "after": target.name})

    updated: dict[str, int] = {}
    relative_files = [
        "html/data/cases.json",
        "html/index.html",
        "html/qa.html",
        "html/qa_v0.1.html",
        "local_assets/manifest.json",
    ]
    for relative in relative_files:
        path = project / relative
        if not path.exists():
            continue
        original = path.read_text(encoding="utf-8-sig")
        normalized, count = normalize_text(original)
        if count:
            path.write_text(normalized, encoding="utf-8", newline="\n")
            updated[relative] = count

    # Confirm structured case JSON has exactly the portable path expected from
    # each case ID. This also repairs missing/stale local_pdf fields.
    cases_path = project / "html" / "data" / "cases.json"
    if cases_path.exists():
        cases = json.loads(cases_path.read_text(encoding="utf-8-sig"))
        repaired = 0
        for case in cases:
            expected = f"../local_assets/pdfs/{normalized_stem(case['case_id'])}.pdf"
            if case.get("local_pdf") != expected:
                case["local_pdf"] = expected
                repaired += 1
        if repaired:
            cases_path.write_text(json.dumps(cases, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
            updated["html/data/cases.json"] = updated.get("html/data/cases.json", 0) + repaired

    return {"renamed_count": len(renamed), "renamed": renamed, "updated_references": updated}


def main() -> int:
    parser = argparse.ArgumentParser(description="Collapse repeated underscores in portable local PDF filenames")
    parser.add_argument("--project-root", default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    result = migrate(Path(args.project_root).resolve())
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
