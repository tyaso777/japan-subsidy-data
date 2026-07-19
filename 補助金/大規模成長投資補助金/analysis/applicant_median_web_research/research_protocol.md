# 申請者中央値下位案件：外部情報調査プロトコル

## 対象

- 正本：申請公募回補正後28件
- 監査対象：当初29件から回次補正により外れた2件
- 合計：重複のない30社

浦島観光ホテルは当初29件には含まれず、補正後28件へ追加された。アサヒセイレン中部と八立製作所は当初29件には含まれたが、正しい申請公募回の中央値で再判定すると対象外となる。30社を調査することで、どちらの集合も取りこぼさない。

## 目的

公開企業PDFの9指標だけでは弱く見える案件について、採択評価と整合し得る企業別の外部事実を探す。単なる企業紹介ではなく、次の問いへ答える。

1. 投資前に確認できる需要・顧客・受注・供給不足はあったか。
2. 設備能力、老朽化、外注、物流、品質、許認可など明確な制約はあったか。
3. 新市場、内製化、垂直統合、事業承継、災害復旧など事業構造を変える投資か。
4. 地域の雇用、重要供給網、インフラ、観光、一次産業等で代替困難な役割があるか。
5. 国・自治体の政策、経済安全保障、輸出、脱炭素、レジリエンスと具体的に接続するか。
6. 用地取得、許認可、融資、共同申請、顧客合意など実行可能性を裏付ける外部事実があるか。
7. 採択後の結果が、申請時の蓋然性を間接的に裏付けるか。ただし事後情報を採択時点の審査理由と混同しない。

## 情報源の優先順位

1. 企業公式サイト、決算・統合報告書、ニュースリリース
2. 国・自治体・大学・業界団体・金融機関の一次資料
3. 顧客・仕入先・共同申請者の公式資料
4. 信頼できる報道、専門媒体
5. 求人、商業データベース等は補助的にのみ使用

検索結果の要約や転載サイトだけを根拠にしない。企業名が一般語に近い場合は所在地、代表者、事業内容、補助事業PDFと照合する。

## 時点と因果の区別

- `pre_or_contemporaneous`：採択前又は概ね同時期。採択時の評価材料になり得る。
- `post_adoption`：採択後。実行・結果の検証には使えるが、審査理由の直接証拠ではない。
- `undated`：時点不明。弱い根拠として扱う。

外部事実、そこから導く推論、反証・別解を分離する。「採択された理由」と断定せず、「評価された可能性と整合する」と記述する。

## 仮説スコア

各観点を0～3点で符号化する。

- 0：関連事実を確認できない
- 1：一般的な企業説明又は弱い示唆
- 2：案件固有の具体的事実がある
- 3：顧客名、数量、契約、設備能力、許認可、用地、政策指定等の検証可能な強い事実がある

観点は `demand`、`capacity_constraint`、`business_transformation`、`regional_supply_chain`、`policy_fit`、`execution_finance`、`crisis_or_succession`、`external_validation` の8つとする。

## 個社JSONの必須項目

```json
{
  "case_id": "...",
  "company": "...",
  "population": "core28 | removed_after_round_correction",
  "application_round": "1次",
  "identity_check": "補助事業PDFと外部企業の同一性確認",
  "web_facts": [
    {
      "claim": "外部資料から確認できる事実",
      "timing": "pre_or_contemporaneous | post_adoption | undated",
      "source_title": "資料名",
      "url": "https://...",
      "source_type": "company | government | customer_supplier | finance | media | other",
      "published_at": "YYYY-MM-DD | YYYY | unknown"
    }
  ],
  "scores": {
    "demand": 0,
    "capacity_constraint": 0,
    "business_transformation": 0,
    "regional_supply_chain": 0,
    "policy_fit": 0,
    "execution_finance": 0,
    "crisis_or_succession": 0,
    "external_validation": 0
  },
  "plausible_reason": "事実から導ける採択評価候補",
  "counterevidence": "推論を弱める事情・別解",
  "confidence": "High | Medium | Low",
  "research_gaps": "未確認事項"
}
```

最低2つ、可能なら3つ以上の相互に独立したURLを各社で確認する。同じプレスリリースの転載は独立ソースと数えない。
