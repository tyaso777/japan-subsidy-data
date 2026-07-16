#!/usr/bin/env python3
"""Compare cases.csv with another extraction and embed the result in qa.html.

The implementation deliberately uses only the Python standard library so the
generated QA page remains usable as a local file without Node.js or a server.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import re
import subprocess
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ADDON_START = "<!-- comparison-addon:start -->"
ADDON_END = "<!-- comparison-addon:end -->"
QA_STATE_BOOTSTRAP = """const STORE='growth-investment-qa-v1';let reviews={};try{reviews=JSON.parse(localStorage.getItem(STORE)||'{}')||{}}catch(_){reviews={}}let selected=decodeURIComponent(location.hash.replace(/^#/,''))||DATA[0]?.case_id||'';
"""


def read_csv(path: Path, encoding: str | None = None) -> tuple[list[dict[str, str]], str]:
    encodings = [encoding] if encoding else ["utf-8-sig", "utf-8", "cp932"]
    last_error: Exception | None = None
    for candidate in encodings:
        if not candidate:
            continue
        try:
            with path.open("r", encoding=candidate, newline="") as handle:
                return list(csv.DictReader(handle)), candidate
        except UnicodeDecodeError as exc:
            last_error = exc
    raise ValueError(f"CSVの文字コードを判定できません: {path}") from last_error


def normalize_company(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).strip()
    text = text.replace("㈱", "株式会社").replace("(株)", "株式会社")
    return re.sub(r"[\s\u3000]+", "", text).casefold()


def normalize_round(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).strip()
    match = re.search(r"([1-9][0-9]*)", text)
    return f"{match.group(1)}次" if match else text.casefold()


def normalize_key_value(value: Any, field: str, normalizer: str | None = None) -> str:
    mode = normalizer or ("company" if "company" in field.lower() or "企業" in field else "round" if field == "round" else "text")
    if mode == "company":
        return normalize_company(value)
    if mode == "round":
        return normalize_round(value)
    return unicodedata.normalize("NFKC", str(value or "")).strip().casefold()


def is_missing(value: Any, null_values: list[str] | None = None) -> bool:
    if value is None:
        return True
    normalized = unicodedata.normalize("NFKC", str(value)).strip().casefold()
    configured = {unicodedata.normalize("NFKC", str(x)).strip().casefold() for x in (null_values or [])}
    return normalized == "" or normalized in configured


def parse_number(value: Any) -> float:
    text = unicodedata.normalize("NFKC", str(value)).strip()
    text = text.replace(",", "").replace("%", "").replace("％", "")
    text = re.sub(r"[¥￥円人]+$", "", text).strip()
    text = text.replace("△", "-").replace("▲", "-")
    if text.startswith("(") and text.endswith(")"):
        text = f"-{text[1:-1]}"
    match = re.search(r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)", text)
    if not match:
        raise ValueError(f"数値として解釈できません: {value!r}")
    return float(match.group(0))


def parse_year(value: Any) -> int:
    text = unicodedata.normalize("NFKC", str(value)).strip()
    four = re.search(r"(?<!\d)(20\d{2})(?!\d)", text)
    if four:
        return int(four.group(1))
    two = re.search(r"(?:FY\s*)?(?<!\d)(\d{2})(?:[/\.年年度期]|$)", text, re.IGNORECASE)
    if two:
        return 2000 + int(two.group(1))
    raise ValueError(f"年度として解釈できません: {value!r}")


def normalize_value(value: Any, spec: dict[str, Any], side: str) -> Any:
    if is_missing(value, spec.get("null_values")):
        return None
    value_type = spec.get("type", "text")
    if value_type in {"number", "percentage"}:
        number = parse_number(value)
        multiplier = float(spec.get(f"{side}_multiplier", 1))
        return number * multiplier
    if value_type == "year":
        return parse_year(value)
    text = unicodedata.normalize("NFKC", str(value)).strip()
    if spec.get("collapse_whitespace", True):
        text = re.sub(r"\s+", " ", text)
    if spec.get("ignore_whitespace", False):
        text = re.sub(r"\s+", "", text)
    return text.casefold() if spec.get("case_insensitive", False) else text


def compare_values(current_raw: Any, external_raw: Any, spec: dict[str, Any]) -> dict[str, Any]:
    current_missing = is_missing(current_raw, spec.get("null_values"))
    external_missing = is_missing(external_raw, spec.get("null_values"))
    if current_missing and external_missing:
        return {"status": "both_missing", "current_normalized": None, "external_normalized": None, "difference": None}
    if current_missing:
        return {"status": "current_missing", "current_normalized": None, "external_normalized": external_raw, "difference": None}
    if external_missing:
        return {"status": "external_missing", "current_normalized": current_raw, "external_normalized": None, "difference": None}
    try:
        current = normalize_value(current_raw, spec, "current")
        external = normalize_value(external_raw, spec, "external")
    except ValueError as exc:
        return {
            "status": "normalization_error",
            "current_normalized": None,
            "external_normalized": None,
            "difference": None,
            "message": str(exc),
        }
    value_type = spec.get("type", "text")
    if value_type in {"number", "percentage", "year"}:
        difference = float(external) - float(current)
        absolute_tolerance = float(spec.get("absolute_tolerance", 0))
        relative_tolerance = float(spec.get("relative_tolerance", 0))
        allowed = max(absolute_tolerance, abs(float(current)) * relative_tolerance)
        equal = math.isclose(float(current), float(external), rel_tol=0, abs_tol=1e-12)
        status = "equal" if equal else "within_tolerance" if abs(difference) <= allowed else "different"
        return {
            "status": status,
            "current_normalized": current,
            "external_normalized": external,
            "difference": difference,
        }
    return {
        "status": "equal" if current == external else "different",
        "current_normalized": current,
        "external_normalized": external,
        "difference": None,
    }


def build_key(row: dict[str, Any], columns: list[str], normalizers: list[str] | None = None) -> tuple[str, ...]:
    result = []
    for index, column in enumerate(columns):
        normalizer = normalizers[index] if normalizers and index < len(normalizers) else None
        result.append(normalize_key_value(row.get(column), column, normalizer))
    return tuple(result)


def make_indices(current_rows: list[dict[str, str]], key_specs: list[dict[str, Any]]) -> list[dict[tuple[str, ...], list[dict[str, str]]]]:
    indices = []
    for key_spec in key_specs:
        index: dict[tuple[str, ...], list[dict[str, str]]] = defaultdict(list)
        for row in current_rows:
            key = build_key(row, key_spec["current"], key_spec.get("normalizers"))
            if all(key):
                index[key].append(row)
        indices.append(index)
    return indices


def compare_dataset(current_rows: list[dict[str, str]], external_rows: list[dict[str, str]], mapping: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    key_specs = mapping.get("record_keys") or [{"current": ["case_id"], "external": ["case_id"]}]
    columns = mapping.get("columns") or []
    if not columns:
        raise ValueError("mapping JSONのcolumnsが空です")
    indices = make_indices(current_rows, key_specs)
    results: list[dict[str, Any]] = []
    matched_case_ids: set[str] = set()

    for row_number, external_row in enumerate(external_rows, start=2):
        current_row = None
        match_method = None
        ambiguous = False
        for index, key_spec, current_index in zip(range(len(key_specs)), key_specs, indices):
            key = build_key(external_row, key_spec["external"], key_spec.get("normalizers"))
            matches = current_index.get(key, []) if all(key) else []
            if len(matches) == 1:
                current_row = matches[0]
                match_method = f"key_{index + 1}"
                break
            if len(matches) > 1:
                ambiguous = True
                match_method = f"key_{index + 1}_ambiguous"
                break
        if current_row is None:
            results.append({
                "dataset_id": mapping["dataset_id"],
                "dataset_label": mapping.get("dataset_label", mapping["dataset_id"]),
                "case_id": None,
                "company": external_row.get(mapping.get("external_company_column", "company"), ""),
                "field": "__record__",
                "field_label": "レコード照合",
                "current_raw": None,
                "external_raw": json.dumps(external_row, ensure_ascii=False),
                "current_normalized": None,
                "external_normalized": None,
                "difference": None,
                "status": "record_ambiguous" if ambiguous else "external_only",
                "match_method": match_method or "unmatched",
                "external_row_number": row_number,
                "message": "複数候補が存在します" if ambiguous else "cases.csvに対応レコードがありません",
            })
            continue

        case_id = current_row.get("case_id", "")
        if case_id in matched_case_ids:
            results.append({
                "dataset_id": mapping["dataset_id"],
                "dataset_label": mapping.get("dataset_label", mapping["dataset_id"]),
                "case_id": case_id,
                "company": current_row.get("company", ""),
                "field": "__record__",
                "field_label": "レコード照合",
                "current_raw": case_id,
                "external_raw": json.dumps(external_row, ensure_ascii=False),
                "current_normalized": case_id,
                "external_normalized": None,
                "difference": None,
                "status": "record_ambiguous",
                "match_method": f"{match_method}_duplicate_external",
                "external_row_number": row_number,
                "message": "比較データの複数行が同じcase_idに対応します",
            })
            continue
        matched_case_ids.add(case_id)
        for spec in columns:
            current_column = spec["current"]
            external_column = spec["external"]
            compared = compare_values(current_row.get(current_column), external_row.get(external_column), spec)
            results.append({
                "dataset_id": mapping["dataset_id"],
                "dataset_label": mapping.get("dataset_label", mapping["dataset_id"]),
                "case_id": case_id,
                "company": current_row.get("company", ""),
                "field": current_column,
                "field_label": spec.get("label", current_column),
                "external_column": external_column,
                "current_raw": current_row.get(current_column),
                "external_raw": external_row.get(external_column),
                "current_normalized": compared.get("current_normalized"),
                "external_normalized": compared.get("external_normalized"),
                "difference": compared.get("difference"),
                "status": compared["status"],
                "match_method": match_method,
                "external_row_number": row_number,
                "message": compared.get("message", ""),
                "rule": {
                    "type": spec.get("type", "text"),
                    "current_unit": spec.get("current_unit"),
                    "external_unit": spec.get("external_unit"),
                    "conversion_note": spec.get("conversion_note"),
                    "absolute_tolerance": spec.get("absolute_tolerance", 0),
                    "relative_tolerance": spec.get("relative_tolerance", 0),
                    "current_multiplier": spec.get("current_multiplier", 1),
                    "external_multiplier": spec.get("external_multiplier", 1),
                },
            })

    if mapping.get("include_current_only", True):
        for current_row in current_rows:
            case_id = current_row.get("case_id", "")
            if case_id and case_id not in matched_case_ids:
                results.append({
                    "dataset_id": mapping["dataset_id"],
                    "dataset_label": mapping.get("dataset_label", mapping["dataset_id"]),
                    "case_id": case_id,
                    "company": current_row.get("company", ""),
                    "field": "__record__",
                    "field_label": "レコード照合",
                    "current_raw": case_id,
                    "external_raw": None,
                    "current_normalized": case_id,
                    "external_normalized": None,
                    "difference": None,
                    "status": "current_only",
                    "match_method": "unmatched",
                    "external_row_number": None,
                    "message": "比較データに対応レコードがありません",
                })

    counts = Counter(row["status"] for row in results)
    summary = {
        "dataset_id": mapping["dataset_id"],
        "dataset_label": mapping.get("dataset_label", mapping["dataset_id"]),
        "current_records": len(current_rows),
        "external_records": len(external_rows),
        "matched_records": len(matched_case_ids),
        "comparison_rows": len(results),
        "status_counts": dict(sorted(counts.items())),
    }
    return results, summary


def validate_mapping_columns(current_rows: list[dict[str, str]], external_rows: list[dict[str, str]], mapping: dict[str, Any]) -> None:
    current_headers = set(current_rows[0]) if current_rows else set()
    external_headers = set(external_rows[0]) if external_rows else set()
    required_current: set[str] = set()
    required_external: set[str] = set()
    for key_spec in mapping.get("record_keys") or [{"current": ["case_id"], "external": ["case_id"]}]:
        required_current.update(key_spec.get("current", []))
        required_external.update(key_spec.get("external", []))
    for spec in mapping.get("columns", []):
        required_current.add(spec["current"])
        required_external.add(spec["external"])
    missing_current = sorted(required_current - current_headers)
    missing_external = sorted(required_external - external_headers)
    errors = []
    if missing_current:
        errors.append(f"cases.csvに存在しない列: {', '.join(missing_current)}")
    if missing_external:
        errors.append(f"比較CSVに存在しない列: {', '.join(missing_external)}")
    if errors:
        raise ValueError(" / ".join(errors))


def write_results_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "dataset_id", "dataset_label", "case_id", "company", "field", "field_label", "external_column",
        "current_raw", "external_raw", "current_normalized", "external_normalized", "difference", "status",
        "match_method", "external_row_number", "message", "rule",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            output = {key: row.get(key) for key in fields}
            if isinstance(output.get("rule"), dict):
                output["rule"] = json.dumps(output["rule"], ensure_ascii=False, separators=(",", ":"))
            writer.writerow(output)


def addon_html(payload: dict[str, Any]) -> str:
    embedded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return f'''{ADDON_START}
<style id="comparisonAddonStyle">
.comparison-badge{{background:#fee4e2!important;color:#b42318!important;font-weight:700}}.comparison-warning{{background:#fff0d5!important;color:#9a6700!important}}
.case.comparison-problem{{border-left:5px solid #b42318;background:#fff8f7}}.comparison-section{{border:2px solid #b42318;box-shadow:0 0 0 3px #fee4e2}}
.comparison-section h3{{background:#fee4e2;color:#7a271a}}.comparison-table tr.diff{{background:#fff1f0}}.comparison-table tr.missing{{background:#fff8e8}}
.comparison-table .equal{{color:#18794e}}.comparison-table .different,.comparison-table .normalization_error{{color:#b42318;font-weight:700}}.comparison-table .missing{{color:#9a6700;font-weight:700}}
#qaComparison{{min-width:160px}}#comparisonCsv{{display:inline-flex;align-items:center;justify-content:center;padding:9px;border-radius:7px;background:#5b3f8c;color:#fff;text-decoration:none}}
#comparisonRun{{padding:9px 12px;border-radius:7px;border:1px solid #b42318;background:#fff;color:#b42318;font-weight:700;cursor:pointer}}#comparisonRun.active{{background:#b42318;color:#fff}}#comparisonRun:disabled{{border-color:#aeb8c1;color:#64717d;background:#eef1f3;cursor:not-allowed}}
</style>
<script id="comparisonAddonScript">
const COMPARISON_PAYLOAD={embedded};
(function(){{
  const rows=COMPARISON_PAYLOAD.rows||[],datasets=COMPARISON_PAYLOAD.datasets||[];
  let comparisonEnabled=false;
  const byCase=new Map();rows.forEach(row=>{{if(!row.case_id)return;if(!byCase.has(row.case_id))byCase.set(row.case_id,[]);byCase.get(row.case_id).push(row)}});
  const severe=new Set(['different','normalization_error','record_ambiguous']);
  const missing=new Set(['current_missing','external_missing','current_only','external_only']);
  const filters=document.querySelector('.filters');
  if(filters&&!document.querySelector('#qaComparison')){{
    const run=document.createElement('button');run.id='comparisonRun';run.type='button';run.textContent=rows.length?'比較検証を開始':'比較データなし';run.disabled=!rows.length;
    const select=document.createElement('select');select.id='qaComparison';select.disabled=true;select.innerHTML='<option value="">全比較状態</option><option value="problem">差異・欠損あり</option><option value="different">数値・文字列差異</option><option value="missing">片側欠損</option><option value="equal">全項目一致</option>';
    const exportLink=document.createElement('a');exportLink.id='comparisonCsv';exportLink.href='../data/processed/comparison_results.csv';exportLink.textContent='比較結果CSV';
    filters.insertBefore(run,filters.lastElementChild);filters.insertBefore(select,filters.lastElementChild);filters.insertBefore(exportLink,filters.lastElementChild);
    run.addEventListener('click',()=>{{comparisonEnabled=!comparisonEnabled;run.classList.toggle('active',comparisonEnabled);run.textContent=comparisonEnabled?'比較検証を終了':'比較検証を開始';select.disabled=!comparisonEnabled;if(!comparisonEnabled)select.value='';refresh()}});
    select.addEventListener('input',()=>setTimeout(refresh,0));
  }}
  const stats=document.querySelector('.top .stats');
  if(stats&&!document.querySelector('#comparisonDiffs')){{const span=document.createElement('span');span.innerHTML='<b id="comparisonDiffs">0</b><small> 外部差異</small>';stats.appendChild(span)}}
  const display=v=>v===null||v===undefined||v===''?'—':String(v);
  function caseState(id){{const rs=byCase.get(id)||[];if(rs.some(r=>severe.has(r.status)))return'different';if(rs.some(r=>missing.has(r.status)))return'missing';if(rs.length&&rs.every(r=>['equal','within_tolerance','both_missing'].includes(r.status)))return'equal';return'none'}}
  function decorateList(){{
    const filter=document.querySelector('#qaComparison')?.value||'';let visible=0;
    document.querySelectorAll('#caseList .case').forEach(el=>{{
      el.querySelectorAll('.comparison-generated').forEach(x=>x.remove());el.classList.remove('comparison-problem');
      if(!comparisonEnabled){{el.style.display='';visible++;return}}
      const rs=byCase.get(el.dataset.id)||[],state=caseState(el.dataset.id),problems=rs.filter(r=>severe.has(r.status)||missing.has(r.status)).length;
      if(problems){{el.classList.add('comparison-problem');const badge=document.createElement('span');badge.className='pill comparison-badge comparison-generated';badge.textContent='外部差異 '+problems;el.querySelector('.case-head')?.appendChild(badge)}}
      const show=!filter||(filter==='problem'&&['different','missing'].includes(state))||filter===state;
      el.style.display=show?'':'none';if(show)visible++;
    }});
    const shown=document.querySelector('#shown');if(shown)shown.textContent=visible;
    const diffCases=comparisonEnabled?[...byCase.keys()].filter(id=>['different','missing'].includes(caseState(id))).length:0;const diff=document.querySelector('#comparisonDiffs');if(diff)diff.textContent=diffCases;
  }}
  function comparisonHtml(caseRows){{
    if(!datasets.length)return'';
    if(!caseRows.length)return'<section id="comparisonSection" class="section"><h3>外部抽出データとの比較</h3><div class="section-body"><span style="color:#64717d">この案件に対応する比較レコードはありません。</span></div></section>';
    const issueCount=caseRows.filter(r=>severe.has(r.status)||missing.has(r.status)).length;
    const labels={{equal:'一致',within_tolerance:'許容差内',both_missing:'双方空欄',different:'相違',current_missing:'cases.csv欠損',external_missing:'比較データ欠損',normalization_error:'正規化エラー',current_only:'比較レコードなし'}};
    const table='<table class="comparison-table"><thead><tr><th>比較元</th><th>項目</th><th>cases.csv</th><th>比較データ</th><th>正規化後</th><th>差</th><th>判定</th></tr></thead><tbody>'+caseRows.map(r=>{{const cls=severe.has(r.status)?'diff':missing.has(r.status)?'missing':'';const units=(r.rule?.current_unit||r.rule?.external_unit)?'<br><small>単位: '+esc(r.rule?.current_unit||'—')+' ← '+esc(r.rule?.external_unit||'—')+(r.rule?.conversion_note?' / '+esc(r.rule.conversion_note):'')+'</small>':'';return'<tr class="'+cls+'"><td>'+esc(r.dataset_label)+'</td><td><b>'+esc(r.field_label)+'</b><br><small>'+esc(r.external_column||'')+'</small>'+units+'</td><td>'+esc(display(r.current_raw))+'</td><td>'+esc(display(r.external_raw))+'</td><td>'+esc(display(r.current_normalized))+' / '+esc(display(r.external_normalized))+'</td><td>'+esc(display(r.difference))+'</td><td class="'+esc(r.status)+'">'+esc(labels[r.status]||r.status)+(r.message?'<br><small>'+esc(r.message)+'</small>':'')+'</td></tr>'}}).join('')+'</tbody></table>';
    return'<section id="comparisonSection" class="section '+(issueCount?'comparison-section':'')+'"><h3>外部抽出データとの比較（差異・欠損 '+issueCount+'件）</h3><div class="section-body">'+table+'</div></section>';
  }}
  function decorateDetail(){{
    document.querySelector('#comparisonSection')?.remove();if(!comparisonEnabled)return;const id=decodeURIComponent(location.hash.replace(/^#/,''));if(!id)return;
    const panel=document.querySelector('.review-panel');if(!panel)return;panel.insertAdjacentHTML('afterend',comparisonHtml(byCase.get(id)||[]));
  }}
  function refresh(){{decorateList();decorateDetail()}}
  document.querySelectorAll('#qaQuery,#qaRound,#qaIssue,#qaReview').forEach(el=>el.addEventListener('input',()=>setTimeout(refresh,0)));
  document.addEventListener('click',event=>{{if(event.target.closest('.case,[data-status]'))setTimeout(refresh,0)}});window.addEventListener('hashchange',()=>setTimeout(refresh,0));
  setTimeout(refresh,0);
}})();
</script>
{ADDON_END}'''


def inject_qa(qa_path: Path, payload: dict[str, Any]) -> None:
    html = qa_path.read_text(encoding="utf-8-sig")
    pattern = re.compile(re.escape(ADDON_START) + r".*?" + re.escape(ADDON_END), re.DOTALL)
    html = pattern.sub("", html)
    if "const STORE='growth-investment-qa-v1'" not in html:
        anchor = "function reviewState(id)"
        if anchor not in html:
            raise ValueError(f"qa.htmlに状態初期化の挿入位置がありません: {qa_path}")
        html = html.replace(anchor, QA_STATE_BOOTSTRAP + anchor, 1)
    html = html.replace("...r.boxes.map(b=>b.text)", "...(r.boxes||[]).map(b=>b.text)")
    html = html.replace("'+r.boxes.length+'Box）',boxHtml(r.boxes)", "'+(r.boxes||[]).length+'Box）',boxHtml(r.boxes||[])")
    addon = addon_html(payload)
    if "</body>" not in html:
        raise ValueError(f"qa.htmlに</body>がありません: {qa_path}")
    html = html.replace("</body>", f"{addon}\n</body>", 1)
    qa_path.write_text(html, encoding="utf-8")


def resolve_path(value: str | None, base: Path, default: Path) -> Path:
    if not value:
        return default
    path = Path(value)
    return path if path.is_absolute() else (base / path).resolve()


def main() -> int:
    parser = argparse.ArgumentParser(description="cases.csvと別抽出CSVを比較し、qa.htmlへ差異を埋め込みます")
    parser.add_argument("--mapping", help="列名対応・比較設定JSON")
    parser.add_argument("--input", help="比較CSV。省略時はmapping JSONのcomparison_file")
    parser.add_argument("--project-root", help="プロジェクトルート")
    parser.add_argument("--cases", help="cases.csv")
    parser.add_argument("--qa", help="qa.html")
    parser.add_argument("--output-csv", help="比較結果CSV")
    parser.add_argument("--output-json", help="比較結果JSON")
    parser.add_argument("--install-only", action="store_true", help="比較データなしでqa.htmlへ表示機能だけを設置")
    args = parser.parse_args()

    project_root = Path(args.project_root).resolve() if args.project_root else Path(__file__).resolve().parents[1]
    qa_path = resolve_path(args.qa, Path.cwd(), project_root / "html" / "qa.html")
    output_csv = resolve_path(args.output_csv, Path.cwd(), project_root / "data" / "processed" / "comparison_results.csv")
    output_json = resolve_path(args.output_json, Path.cwd(), project_root / "html" / "data" / "comparison_results.json")
    if args.install_only:
        payload = {"datasets": [], "rows": [], "generated_at": dt.datetime.now(dt.timezone.utc).isoformat()}
        write_results_csv(output_csv, [])
        output_json.parent.mkdir(parents=True, exist_ok=True)
        output_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        inject_qa(qa_path, payload)
        print(json.dumps({
            "status": "ok", "mode": "install_only", "qa": str(qa_path),
            "output_csv": str(output_csv), "output_json": str(output_json),
        }, ensure_ascii=False, indent=2))
        return 0
    if not args.mapping:
        parser.error("--mapping または --install-only が必要です")

    mapping_path = Path(args.mapping).resolve()
    mapping = json.loads(mapping_path.read_text(encoding="utf-8-sig"))
    for required in ("dataset_id", "columns"):
        if required not in mapping:
            raise ValueError(f"mapping JSONに{required}がありません")
    input_path = resolve_path(args.input or mapping.get("comparison_file"), mapping_path.parent, mapping_path.parent / "comparison.csv")
    cases_path = resolve_path(args.cases, Path.cwd(), project_root / "data" / "processed" / "cases.csv")
    current_rows, current_encoding = read_csv(cases_path, mapping.get("cases_encoding"))
    external_rows, external_encoding = read_csv(input_path, mapping.get("encoding"))
    validate_mapping_columns(current_rows, external_rows, mapping)
    results, summary = compare_dataset(current_rows, external_rows, mapping)
    summary.update({
        "comparison_file": input_path.name,
        "cases_encoding": current_encoding,
        "comparison_encoding": external_encoding,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    })
    payload = {"datasets": [summary], "rows": results, "generated_at": summary["generated_at"]}
    write_results_csv(output_csv, results)
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    inject_qa(qa_path, payload)
    qa_v01_builder = project_root / "scripts" / "build_qa_v01.py"
    if qa_v01_builder.exists():
        subprocess.run([sys.executable, str(qa_v01_builder)], check=True)
    print(json.dumps({"status": "ok", "summary": summary, "output_csv": str(output_csv), "output_json": str(output_json), "qa": str(qa_path)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
