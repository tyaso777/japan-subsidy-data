#!/usr/bin/env python3
"""Remove Excel's cached absolute source path from workbook metadata.

This keeps workbook contents and formatting intact while removing the optional
x15ac:absPath metadata that can expose a local user directory.
"""

from __future__ import annotations

import argparse
import re
import shutil
import tempfile
import zipfile
from pathlib import Path


ABS_PATH_BLOCK = re.compile(
    rb"<mc:AlternateContent[^>]*>\s*"
    rb"<mc:Choice\s+Requires=\"x15\">\s*"
    rb"<x15ac:absPath\b[^>]*/>\s*"
    rb"</mc:Choice>\s*</mc:AlternateContent>"
)


def sanitize(path: Path) -> bool:
    temporary_path: Path | None = None
    with zipfile.ZipFile(path, "r") as source:
        workbook_xml = source.read("xl/workbook.xml")
        cleaned_xml, replacements = ABS_PATH_BLOCK.subn(b"", workbook_xml)
        if replacements == 0:
            return False

        with tempfile.NamedTemporaryFile(
            prefix=path.stem + "-", suffix=".xlsx", dir=path.parent, delete=False
        ) as handle:
            temporary_path = Path(handle.name)

        with zipfile.ZipFile(temporary_path, "w") as target:
            for item in source.infolist():
                data = cleaned_xml if item.filename == "xl/workbook.xml" else source.read(item)
                target.writestr(item, data)

    assert temporary_path is not None
    try:
        shutil.copystat(path, temporary_path)
        temporary_path.replace(path)
    finally:
        temporary_path.unlink(missing_ok=True)

    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbooks", nargs="+", type=Path)
    args = parser.parse_args()

    for workbook in args.workbooks:
        changed = sanitize(workbook)
        print(f"{'sanitized' if changed else 'already clean'}: {workbook}")


if __name__ == "__main__":
    main()
