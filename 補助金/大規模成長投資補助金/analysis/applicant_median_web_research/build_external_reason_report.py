from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent
RESIDUAL_ROOT = ROOT.parent / "applicant_median_residual"

ROUND_ORDER = {"1次": 1, "2次": 2, "3次": 3, "4次": 4}
TIMING_ORDER = {"pre_or_contemporaneous": 0, "undated": 1, "post_adoption": 2}
TIMING_LABEL = {
    "pre_or_contemporaneous": "採択前・同時期",
    "undated": "時点不明",
    "post_adoption": "採択後（結果検証のみ）",
}
SOURCE_LABEL = {
    "company": "企業",
    "government": "行政・公的機関",
    "customer_supplier": "顧客・仕入先",
    "finance": "金融",
    "media": "報道",
    "other": "その他",
}
FEATURE_LABEL = {
    "demand": "需要の具体性",
    "capacity_constraint": "能力制約",
    "business_transformation": "事業転換",
    "regional_supply_chain": "地域・供給網",
    "policy_fit": "政策適合",
    "execution_finance": "実行・資金",
    "crisis_or_succession": "危機・承継",
    "external_validation": "外部検証可能性",
}
ARCHETYPE_LABEL = {
    "需要確約・能力制約": "需要・能力制約",
    "その他": "技術・工程高度化",
    "実行準備・財務": "既存運営基盤の拡張",
}


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def load_records(pattern: str) -> list[dict]:
    records: list[dict] = []
    for path in sorted(ROOT.glob(pattern)):
        with path.open(encoding="utf-8-sig") as handle:
            payload = json.load(handle)
        if isinstance(payload, dict):
            payload = payload.get("records", [])
        records.extend(payload)
    return records


def md(value: object) -> str:
    return str(value or "").replace("|", "\\|").replace("\n", " ").strip()


def pct(numerator: int, denominator: int) -> str:
    return f"{numerator / denominator * 100:.1f}%" if denominator else "—"


def first_sentence(text: str) -> str:
    if "。" in text:
        sentences = [part for part in text.split("。") if part]
        take = 2 if sentences and (len(sentences[0]) < 35 or "この案件の強み" in sentences[0]) else 1
        return "。".join(sentences[:take]) + "。"
    for mark in ("；",):
        if mark in text:
            return text.split(mark, 1)[0] + mark
    return text


def company_name(value: object) -> str:
    return " ".join(str(value or "").replace("　", " ").split())


def official_pdf_link(row: dict[str, str]) -> str:
    url = row.get("pdf_url", "")
    return f"[公開企業PDF]({url})" if url else "公開企業PDF未確認"


def render_score_table(record: dict) -> str:
    scores = record.get("scores") or {}
    cells = [
        f"| {FEATURE_LABEL[key]} | {scores.get(key, '')} |"
        for key in FEATURE_LABEL
    ]
    return "\n".join(["| 観点 | コード |", "|---|---:|", *cells])


def render_facts(record: dict) -> str:
    facts = sorted(
        record.get("web_facts") or [],
        key=lambda row: (
            TIMING_ORDER.get(row.get("timing", ""), 9),
            row.get("published_at", ""),
            row.get("source_title", ""),
        ),
    )
    output: list[str] = []
    for fact in facts:
        label = TIMING_LABEL.get(fact.get("timing", ""), fact.get("timing", ""))
        source_type = SOURCE_LABEL.get(fact.get("source_type", ""), fact.get("source_type", ""))
        title = md(fact.get("source_title", "出典"))
        url = fact.get("url", "")
        source = f"[{title}]({url})" if url else title
        published = md(fact.get("published_at", "unknown"))
        output.append(
            f"- **{label}**：{md(fact.get('claim', ''))}（{source}、{source_type}、{published}）"
        )
    return "\n".join(output) if output else "- 外部事実を確認できなかった。"


def main() -> None:
    records = load_records("research_batch_*.json")
    control_records = load_records("control_research_batch_*.json")
    core = sorted(
        [row for row in records if row.get("population") == "core28"],
        key=lambda row: (ROUND_ORDER.get(row.get("application_round", ""), 99), row.get("company", "")),
    )
    removed = sorted(
        [row for row in records if row.get("population") == "removed_after_round_correction"],
        key=lambda row: row.get("company", ""),
    )
    # 回次補正で対象群から外れたアサヒセイレン中部は、補正後の対応表では
    # オティックスの採択対照として再利用する。対照比較スクリプトと同じ扱いにそろえる。
    asahi = next(
        (
            row
            for row in removed
            if company_name(row.get("company", "")) == "アサヒセイレン中部株式会社"
        ),
        None,
    )
    if asahi and not any(
        company_name(row.get("company", "")) == "アサヒセイレン中部株式会社"
        for row in control_records
    ):
        control_records.append({**asahi, "population": "matched_accepted_control"})
    if len(core) != 28 or len(removed) != 2:
        raise ValueError(f"対象レコード数が想定外: core={len(core)}, removed={len(removed)}")
    if len(control_records) != 28:
        raise ValueError(f"対照レコード数が想定外: controls={len(control_records)}")

    quantitative = {
        row["case_id"]: row
        for row in read_csv(RESIDUAL_ROOT / "core28_company_quantitative_table.csv")
    }
    qualitative = {
        row["case_id"]: row
        for row in read_csv(RESIDUAL_ROOT / "qualitative_coding_28.csv")
    }
    comparison = read_csv(ROOT / "target_control_feature_comparison.csv")
    matched = {
        row["feature"]: row
        for row in read_csv(ROOT / "matched_pair_summary.csv")
    }
    strong_comparison = {
        row["feature"]: row
        for row in comparison
        if row.get("threshold") == ">=3"
    }

    facts = [fact for row in core for fact in (row.get("web_facts") or [])]
    control_facts = [
        fact
        for row in control_records
        for fact in (row.get("web_facts") or [])
    ]
    control_pre_fact_n = sum(
        fact.get("timing") == "pre_or_contemporaneous"
        for fact in control_facts
    )
    unique_urls = {fact.get("url") for fact in facts if fact.get("url")}
    timing = Counter(fact.get("timing", "") for fact in facts)
    source_types = Counter(fact.get("source_type", "") for fact in facts)
    pre_source_types = Counter(
        fact.get("source_type", "")
        for fact in facts
        if fact.get("timing") == "pre_or_contemporaneous"
    )
    primary_fact_n = sum(
        source_types[key]
        for key in ("company", "government", "customer_supplier", "finance")
    )
    confidence = Counter(row.get("confidence", "") for row in core)
    pre_customer = sum(
        fact.get("timing") == "pre_or_contemporaneous"
        and fact.get("source_type") == "customer_supplier"
        for fact in facts
    )
    archetypes: dict[str, list[str]] = defaultdict(list)
    for row in core:
        archetype_raw = qualitative.get(row["case_id"], {}).get("dominant_archetype", "未分類") or "未分類"
        archetype = ARCHETYPE_LABEL.get(archetype_raw, archetype_raw)
        archetypes[archetype].append(company_name(row["company"]))

    if strong_comparison:
        comparison_rows = []
        for feature in FEATURE_LABEL:
            row = strong_comparison[feature]
            pair = matched.get(feature, {})
            comparison_rows.append(
                "| {label} | {tn}/28 ({tp:.1f}%) | {cn}/28 ({cp:.1f}%) | {diff:+.1f}pt | {mean:+.3f} | {q} |".format(
                    label=FEATURE_LABEL[feature],
                    tn=int(row["target_n"]),
                    tp=float(row["target_pct"]),
                    cn=int(row["control_n"]),
                    cp=float(row["control_pct"]),
                    diff=float(row["difference_pct_point"]),
                    mean=float(pair.get("mean_paired_difference", 0) or 0),
                    q=pair.get("sign_test_bh_q_8tests", "—") or "—",
                )
            )
        comparison_table = "\n".join(comparison_rows)
    else:
        comparison_table = "| 対照調査の集計待ち | — | — | — | — | — |"

    archetype_rows = "\n".join(
        f"| {md(name)} | {len(companies)} | {md('、'.join(companies))} |"
        for name, companies in sorted(archetypes.items(), key=lambda item: (-len(item[1]), item[0]))
    )

    company_index_rows: list[str] = []
    detail_sections: list[str] = []
    for number, record in enumerate(core, start=1):
        qrow = quantitative.get(record["case_id"], {})
        qual = qualitative.get(record["case_id"], {})
        observed = qrow.get("current9_observed_n_reproduced", "")
        below = qrow.get("current9_below_applicant_n", "")
        if below:
            below = str(int(float(below)))
        position = f"{below}/{observed}" if below and observed else "—"
        archetype_raw = qual.get("dominant_archetype", "未分類") or "未分類"
        archetype = ARCHETYPE_LABEL.get(archetype_raw, archetype_raw)
        display_company = company_name(record["company"])
        company_index_rows.append(
            f"| {number} | {record['application_round']} | {md(display_company)} | {position} | {md(archetype)} | {record.get('confidence', '')} | {md(first_sentence(record.get('plausible_reason', '')))} |"
        )
        strong = [
            FEATURE_LABEL[key]
            for key, score in (record.get("scores") or {}).items()
            if int(score) == 3 and key in FEATURE_LABEL
        ]
        detail_sections.append(
            f"""<details>
<summary><strong>{number}. {md(display_company)}</strong>（{record['application_round']}、申請者中央値未満 {position}、確度 {record.get('confidence', '')}）</summary>

**案件同一性。** {md(record.get('identity_check', ''))}

**評価された可能性と整合する個別理由。** {md(record.get('plausible_reason', ''))}

**外部情報で特に強く確認できた観点。** {md('、'.join(strong) if strong else '該当なし')}

**確認した外部事実。**

{render_facts(record)}

**反証・別解。** {md(record.get('counterevidence', ''))}

**未確認事項。** {md(record.get('research_gaps', ''))}

**公開資料。** {official_pdf_link(qrow)}

{render_score_table(record)}

</details>"""
        )

    removed_sections: list[str] = []
    for record in removed:
        removed_sections.append(
            f"""### {md(record['company'])}

申請公募回を補正した結果、正本28件からは外れた。ただし当初29件に含まれていたため、個社調査は保持した。

**理由候補。** {md(record.get('plausible_reason', ''))}

**反証・留保。** {md(record.get('counterevidence', ''))}

{render_facts(record)}
"""
        )

    report = f"""# 申請者中央値を多くの指標で下回る採択案件：外部情報から採択理由をどこまで説明できるか

## 結論

当初の29件は、公募回データの監査後には **28件** となる。旧29件からアサヒセイレン中部と八立製作所が外れ、浦島観光ホテルが加わる。本調査は情報を失わないよう、正本28件と旧集合から外れた2件の **計30社** を個別に調べた。

正本28件すべてについて、公開9指標が弱く見えても審査基準と整合し得る案件固有の事情を構成できた。外部事実と説明仮説の整合度は High {confidence['High']}件、Medium {confidence['Medium']}件、Low {confidence['Low']}件である。この確度は「採択された確率」ではない。代表的な事情は、実在する設備・物流・品質上の能力制約、内製化や垂直統合、地域インフラ・供給網の維持、事業承継・危機対応、用地・行政協定・既存運営実績による実行可能性である。

しかし、**これらを「採択理由」と同定することはできない。** 対照にした同じ公募回・近似規模の採択企業28社にも、需要、能力制約、政策適合、実行可能性は広く存在する。したがって「定性面が強かったから通った」という説明だけでは、低定量群を他の採択案件から識別できない。さらに非採択企業の企業別計画、審査点、プレゼン質疑がないため、採択／不採択を分ける因果要因は推定できない。

この調査で最も重要な発見は三つである。

1. **低定量群にも、数字を生む因果鎖の仮説を構成できる。** 多くの案件で「確認可能な需要又は社会的必要性 → 現在の制約 → 投資 → 生産・サービス能力 → 地域・顧客への効果 → 実行体制」を仮説として組み立てられる。ただし未確認のリンクがあり、実証済みの因果関係ではない。
2. **広いテーマの有無より、証拠の拘束力を次に検証すべきである。** 契約・内示、行政協定、用地、許認可、既存商品の販売実績、第三者認証、顧客側発表は、企業自身の市場予測より反証されにくい。ただし本調査で確認できた採択前・同時期の顧客・仕入先側資料は {pre_customer} 件であり、顧客コミットは最大の欠測である。
3. **共同申請・企業グループ境界は無視できない。** 既存データの共同申請フラグは28件中7件（25.0%）で、同回のその他採択企業は10/345件（2.9%）、公募回内置換 p=0.00025、探索39特徴のBH補正 q=0.00975だった。単独申請者の公開指標では、共同参加者の販路・技術・物流・資産を捉えにくい可能性がある。ただし共同申請が採択を生んだとは言えない。

## 目次

1. [問いと分析対象](#1-問いと分析対象)
2. [Web調査の設計と証拠量](#2-web調査の設計と証拠量)
3. [共通点：何が多く、何が識別に使えるか](#3-共通点何が多く何が識別に使えるか)
4. [28社の個別結論一覧](#4-28社の個別結論一覧)
5. [個社別の証拠・推論・反証](#5-個社別の証拠推論反証)
6. [第6次の申請支援にどう使うか](#6-第6次の申請支援にどう使うか)
7. [採択理由をさらに識別する60の方法](#7-採択理由をさらに識別する60の方法)
8. [限界](#8-限界)
9. [公式資料と再現用データ](#9-公式資料と再現用データ)

## 1. 問いと分析対象

主定義は、公開企業PDFから比較できる現行9指標のうち5指標以上を観測でき、同じ申請公募回の申請者全体中央値を下回る指標が60%以上ある採択・交付企業である。補正後は373判定可能レコード中28件（7.5%）。28件すべてに中央値以上の指標が少なくとも1つあり、「全指標で負けた企業」ではない。

No.8、No.10、No.13、No.14には公開PDFからの近似が含まれ、対象企業の構成は指標集合に敏感である。したがって「28」という数を構造的な真値と扱わず、「公開指標の多くで弱く見える案件」を掘り下げる探索集合として用いる。

### 境界・品質への感度

- 企業値が中央値を少しでも下回れば数える主定義では28件だが、5%以上の下振れだけを数えると20件、10%以上では14件になる。
- 28件の208比較セル中25セルは、申請者平均との差が5%未満である。
- 主要品質フラグのないレコードだけでも16件残るため、単純な抽出誤りだけで現象全体は消えない。
- 期間定義の曖昧さは28件中12件（42.9%）に対し、その他採択企業では53/345件（15.4%）。Fisher p=0.000915、8品質指標内のBH補正 q=0.00732であり、測定差は無視できない。
- 現行9指標からNo.8又はNo.14を除くと、総数だけでなく該当企業の構成も大きく変わる。28件は固定的な企業類型ではなく、追加調査対象を抽出するスクリーニング集合である。

### 公募回補正

| 企業 | 保存回次 → 申請公募回 | 影響 |
|---|---|---|
| 八立製作所 | 2次 → 1次 | 旧29件から除外 |
| アサヒセイレン中部 | 2次 → 1次 | 旧29件から除外 |
| 浦島観光ホテル | 1次 → 2次 | 補正後28件へ追加 |

公式採択一覧とのクロスウォークを再監査し、28組の類似採択対照はすべて正しい申請公募回で対応している。

## 2. Web調査の設計と証拠量

- 正本28社：外部事実 {len(facts)}件、重複しないURL {len(unique_urls)}件、原発表主体の資料 {primary_fact_n}件。
- 時点：採択前・同時期 {timing['pre_or_contemporaneous']}件、採択後 {timing['post_adoption']}件、時点不明 {timing['undated']}件。
- 情報源：行政・公的機関 {source_types['government']}件、企業 {source_types['company']}件、金融 {source_types['finance']}件、顧客・仕入先 {source_types['customer_supplier']}件、報道 {source_types['media']}件、その他 {source_types['other']}件。
- 各社について企業同一性を所在地・事業内容・公開企業PDFと照合し、最低2件、原則3件以上の独立URLを確認した。
- 採択後の資料は計画実行の検証にだけ使い、採択時点の審査理由へ遡及させない。
- 検索結果の要約や転載サイトを根拠にせず、会社、国・自治体、金融機関、取引先等の一次資料を優先した。

「一次資料が多い」ことと「需要が独立に検証された」ことは同義ではない。採択前・同時期{timing['pre_or_contemporaneous']}件の内訳は、行政・公的機関 {pre_source_types['government']}件、企業 {pre_source_types['company']}件、金融 {pre_source_types['finance']}件、その他 {pre_source_types['other']}件、顧客・仕入先 {pre_source_types['customer_supplier']}件である。多くの需要数量は企業PDF又は企業自身の発表に依存する。全期間で顧客・仕入先に分類された1件も企業サイト内の契約農家紹介で、独立した顧客発表ではない。したがって、本報告では外部事実、そこからの推論、反証を分離する。

## 3. 共通点：何が多く、何が識別に使えるか

### 3.1 正本28件の主な説明類型

| 説明類型 | 件数 | 企業 |
|---|---:|---|
{archetype_rows}

この分類は案件の主な筋書きを一つ選んだものであり、相互排他的な審査基準ではない。多くの案件は二つ以上にまたがる。

### 3.2 類似採択対照との比較

8観点を0～3で符号化し、3点（顧客名、数量、契約、設備能力、許認可、用地、政策指定等の強い事実）の比率を比較した。対照は同じ公募回・業種・事業費・補助額・基準売上・従業員規模を可能な範囲で近づけた他の採択企業である。右端のq値は28対応ペアの符号検定8本にBenjamini–Hochberg補正を施した探索値である。

| 観点 | 低定量28社：3点 | 類似採択28社：3点 | 差 | ペア平均差 | 符号検定BH q |
|---|---:|---:|---:|---:|---:|
{comparison_table}

8観点のいずれも、対応ペアの符号検定ではBH補正後 q<0.05にならなかった。3点比率は低定量群で地域・供給網が+21.4pt、政策適合が+17.9pt、能力制約が+14.3ptだった一方、需要の具体性は-10.7ptである。方向は仮説生成には使えるが、標本誤差・採点誤差を超える群差とは判断しない。

この比較には四つの制約がある。第一に、両群とも採択企業であり、採択確率は推定できない。第二に、Web公開量は上場区分・企業規模・案件類型に左右される。第三に、対象群は外部事実 {len(facts)}件（採択前・同時期 {timing['pre_or_contemporaneous']}件）、対照群は {len(control_facts)}件（同 {control_pre_fact_n}件）であり、探索量が非対称である。第四に、複数担当者によるコードの採点校正を行っておらず、審査結果を知った後の探索的評価で、盲検二重採点でもない。対象側のスコアが上振れした可能性を含むため、小さな差を一般化せず、差が再現するかを非採択データで検証する必要がある。

### 3.3 現時点で妥当な共通理解

- **採択企業一般の基礎条件らしいもの**：明確な投資対象、能力制約、事業変革、地域・政策との接続、金融機関確認。類似採択対照にも多く、低定量群だけの特殊事情とは言えない。
- **採択企業内で統計的な関連が確認できた構造**：共同申請・グループ連携。低定量28件では7件（25.0%）、同回のその他採択企業では10/345件（2.9%）だった。ただし相乗効果、企業別指標の測定境界、業種構成のどれが差を生んだかは分離できない。
- **個社説明として繰り返し現れた記述的候補**：地域インフラや供給網の代替困難性、承継・撤退回避、既存顧客・既存拠点を使った垂直統合。類似採択対照との差はBH補正後 q>0.8であり、低定量群固有の特徴とは判断しない。
- **次に測るべきもの**：テーマの有無ではなく、需要証拠の拘束力、投資準備の不可逆性、能力制約の実測値、因果鎖の欠落数、補助なし反実仮想。

### 3.4 有望なのは「因果鎖」と「最も弱いリンク」の評価

```text
既存需要・社会的必要性
        ↓
設備・工程・拠点・人材・許認可上の現在制約
        ↓
投資が制約を外す具体的機構
        ↓
売上・付加価値・賃金・雇用と地域・供給網への効果
        ↓
用地・資金・既存運営能力・共同申請による実行可能性
        ↓
補助金がなければ規模・時期・仕様が成立しない追加性
```

8観点の単純合計は、広い定義ゆえに飽和しやすい。今後は各リンクの最低点を「因果鎖スコア」とし、次の証拠階層を併記する方がよい。

- **E0**：申請者自身の将来予測、一般的な市場成長説明。
- **E1**：過去売上、顧客数、認証、既存設備等の実績。
- **E2**：自治体、顧客、提携先、金融機関が案件固有の内容を確認。
- **E3**：発注、LOI、運営契約、用地、許認可、融資契約等の拘束的又は不可逆なコミットメント。

本調査でE2の行政・金融資料は多数得られたが、需要を支える顧客側E2・E3はほぼ得られていない。ここが「本当に定量の弱さを補ったか」を確かめる最大の未観測領域である。

### 3.5 競合仮説の評価

| 仮説 | 現時点の評価 |
|---|---|
| 単純な抽出・計算誤り | 一部支持。回次、期間、近似指標の影響は大きいが、品質フラグなしでも16件残る |
| 一つの強い公開指標が他を補った | 記述的には支持。28件すべてに申請者中央値以上が最低1指標あるが、審査上の補償関係は不明 |
| 定性面が対象群だけ特に強い | 個社説明には支持、類似採択対照との識別には未支持 |
| 需要と能力制約の因果鎖 | 有望。ただし顧客側の拘束的証拠が最大の欠測 |
| 共同申請・企業境界効果 | 採択企業内で最も強い構造的関連。相乗効果、測定境界、業種交絡を分離できない |
| 政策加点 | 一部企業では候補。地域未来牽引企業6/28、宣言6/28、えるぼし3/28だけでは全体を説明しない |
| 金融機関確認 | 採択企業内の識別要因としては支持されない。28/28で確認でき、他の3・4次採択企業でもほぼ普遍的だが、必要・共通条件である可能性は残る |
| 事業承継・危機対応 | 8/28の有力な部分類型。全体説明ではない |
| 地域政策上の配慮 | 関連はあるが、業種・公募回・申請構成・抽出規則の交絡が残る |
| 経営者プレゼン・計画書の質 | 公式手続上重要だが、公開情報では完全に未観測 |
| 補助金の必要性・追加性 | 第6次公式基準上重要だが、公開情報ではほぼ未観測 |

## 4. 28社の個別結論一覧

「申請者中央値未満」は、比較可能な9指標のうち何個が下回ったかを示す。確度は採択理由そのものの確度ではなく、外部事実から導いた理由候補の裏付け強度である。

| No. | 回 | 企業 | 申請者中央値未満 | 主類型 | 確度 | 個別理由候補（要約） |
|---:|---|---|---:|---|---|---|
{chr(10).join(company_index_rows)}

外部資料によるプロセス・トレーシングが比較的強いのは、オティックス、浦島観光ホテル、シュゼット、南島酒販、明和工業、環境整備産業である。一方、山崎商事運輸、高知食糧、エム・ケー・ケー、コスモス食品、博多屋は、核心となる需要又は申請時点の契約を追加確認する必要がある。この差は採択順位ではなく、現時点で取得できた外部証拠の差である。

## 5. 個社別の証拠・推論・反証

以下では、各社について確認したURLを省略せず、採択前・同時期、時点不明、採択後を区別する。3点コードは「審査得点」ではなく、公開情報の具体性である。

{(chr(10) * 2).join(detail_sections)}

## 6. 第6次の申請支援にどう使うか

第6次公募要領の事前公開版は、経営力、先進性・成長性、地域への波及、大規模投資・費用対効果、実現可能性、補助金の必要性を定量・定性の両面で審査するとしている。過去案件の表現を模倣するより、次の証拠束を一貫した数値で作る方が再現性が高い。

1. **需要**：顧客名、LOI・内示・発注見込み、評価結果、数量、価格、需要予測の出所。
2. **現在制約**：稼働率、納期、受注残、外注、歩留まり、保管能力、人員、失注額。設備を入れなければ需要を取れないことを同じ単位で示す。
3. **差別化**：競合比較、認証、特許、品質、内製化、大学・顧客との共同開発。単に「最新設備」と書かない。
4. **因果鎖**：需要 → 能力制約 → 設備仕様 → 数量 → 粗利・付加価値 → 賃金・雇用を、様式・決算・プレゼンで一致させる。
5. **地域波及**：地域調達額、雇用の質、取引先数、代替困難性、BCPを数量化する。共同申請なら参加者別の役割と相乗効果を分ける。
6. **実行可能性**：用地、許認可、見積、工程、責任者、採用計画、金融コミット、下振れ時の返済・賃上げ継続策。
7. **補助金の必要性**：補助なしなら規模・時期・仕様がどう変わるか、補助によって初めて生じる追加効果を反実仮想で示す。
8. **経営者の説明**：計算式、主要仮定、下振れ感応度、競合優位、撤退条件を経営者自身が説明し、反証質問に答えられる状態にする。

申請者中央値は足切り線ではなく、過去の集団代表値である。数値を形式的に上げるのではなく、公式様式の主体・期間・定義で再計算し、実行可能な範囲で強くする。公開指標が弱い場合でも「定性で補う」と抽象化せず、どの低さを、どの外部証拠と因果関係が補うのかを一対一で示す必要がある。

## 7. 採択理由をさらに識別する60の方法

公開情報だけの今回調査で実施できたのは、個社プロセス・トレーシング、公式加点候補の照合、類似採択対照、時点監査、反証検索である。残る方法は [methodology_roadmap.md](methodology_roadmap.md) に、公開情報30案、協力・非公開データ12案、十分な標本がある場合の統計・因果分析13案として整理した。

### 優先順位が高い次の12手

| 優先 | 方法 | 何が分かるか | 必要条件 |
|---:|---|---|---|
| 1 | 不採択通知・相対順位の同意収集 | 採択者より弱かった審査項目を直接比較 | 申請企業・支援者の協力 |
| 2 | 再申請の不採択→採択前後比較 | 数値、証拠、範囲、プレゼンのどの変更が効いたか | 同一企業の両申請 |
| 3 | 採択・非採択の同業ペア盲検再採点 | 計画書品質と採否の関係、専門家一致度 | 匿名化計画書 |
| 4 | 審査項目別分布の情報公開請求 | 足切り、加点利用、1次・2次審査相関 | 個社非特定の開示 |
| 5 | 採択企業・金融機関への半構造化面接 | 実際の質疑、証拠、資金判断 | 面接協力 |
| 6 | 顧客コミットの標準台帳 | LOI、内示、契約、予約の拘束力と数量 | 申請者の機密同意 |
| 7 | 能力制約の標準台帳 | 稼働率・受注残・失注・外注の実測差 | 操業データ |
| 8 | 用地・許認可・見積の時系列 | 実行準備の不可逆性と遅延リスク | 行政・企業資料 |
| 9 | 共同申請の境界再集計 | 参加者全体での売上・雇用・波及を再評価 | 参加者別公式数値 |
| 10 | 採択後の竣工・稼働・賃上げ追跡 | 申請時の蓋然性と最終成功を分ける | 継続観測 |
| 11 | METI・RIETIのEBPMデータ連携 | 匿名申請母集団で採択予測・効果を検証 | 研究利用アクセス |
| 12 | 5次・6次への時系列外部検証 | 1～4次で見つけた規則の再現性 | 将来の申請・採否データ |

最短で識別力を上げる方法は、1次公募で公式に開示された不採択理由・相対順位を、企業の同意を得て匿名構造化することである。Web調査をさらに増やすより、採否の反実仮想に近い情報が得られる。

## 8. 限界

- 非採択企業の企業別指標、申請書全文、審査点、口頭審査、ローカルベンチマーク、金融機関資料は非公開である。
- 本調査は採択後に企業を選んだ事後探索で、理由候補を見つけやすい選択・確証バイアスがある。
- Web公開量の多い企業ほど外部検証スコアが高くなりやすい。
- 企業・行政の一次資料も、顧客契約や投資採算の独立監査ではない。
- 採択後の竣工、融資、提携は計画実行の検証には使えるが、採択時点の審査理由には使えない。
- 28社と類似対照28社はともに採択企業である。採択／非採択の因果効果は推定していない。
- 対照符号は盲検二重採点ではなく、8軸は広いため飽和しやすい。結果は探索的である。
- 第6次の事前公開要領は最終版で変更され得るため、申請時には最終版を確認する。

## 9. 公式資料と再現用データ

- [第6次公募要領・事前公開版](https://chukentou-seichotoushi-hojo.jp/assets/documents/common/youryou_6ji.pdf)
- [1次公募・不採択理由の詳細開示](https://seichotoushi-hojo.jp/1_2ji/information/2024/05/28.html)
- [経済産業省・行政事業レビュー資料](https://www.meti.go.jp/information_2/publicoffer/review2025/kokai/0606_3gaiyo.pdf)
- [外部調査の全事実](web_evidence_facts.csv)
- [30社の個社結論](company_findings_30.csv)
- [類似採択対照28社](matched_control_findings_28.csv)
- [対象・対照の対応比較](matched_pair_score_comparison.csv)
- [公式加点候補・外部コミット確認](policy_addon_and_external_commitment_audit.csv)
- [調査プロトコル](research_protocol.md)
- [追加分析60案](methodology_roadmap.md)

## 付録A：旧29件から外れた2社

{(chr(10) * 2).join(removed_sections)}
"""

    output = ROOT / "external_reason_investigation_report.md"
    output.write_text(report.rstrip() + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "output": str(output),
                "core": len(core),
                "removed": len(removed),
                "facts": len(facts),
                "urls": len(unique_urls),
                "controls_ready": bool(strong_comparison),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
