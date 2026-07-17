# 地域経済指標

採択企業の本社所在地・事業実施場所を、都道府県の経済・人口環境と重ねて見るための参照データです。ダッシュボードの「点の色」では、各指標を全国47都道府県の五分位に分けます。

## 収録指標と公式出典

| 指標 | 基準時点 | 単位 | 定義 | 公式出典 |
|---|---:|---:|---|---|
| 県内総生産（名目） | 2022年度 | 億円 | 県内の経済活動が生み出した付加価値の名目額。原表の100万円を億円に換算 | [内閣府・県民経済計算（2022年度、47都道府県）](https://www.esri.cao.go.jp/jp/sna/data/data_list/kenmin/files/contents/main_2022.html) / [原表Excel](https://www.esri.cao.go.jp/jp/sna/data/data_list/kenmin/files/contents/tables/2022/soukatu1.xlsx) |
| 1人当たり県民所得 | 2022年度 | 千円/人 | 県民所得を総人口で除した値。個人の給与、可処分所得、手取り所得ではない | [内閣府・県民経済計算](https://www.esri.cao.go.jp/jp/sna/data/data_list/kenmin/files/contents/main_2022.html) / [原表Excel](https://www.esri.cao.go.jp/jp/sna/data/data_list/kenmin/files/contents/tables/2022/soukatu7.xlsx) |
| 平均賃金 | 2025年6月 | 千円/月 | 賃金構造基本統計調査の一般労働者・男女計。6月分の所定内給与額平均で、超過労働給与を除き、税等控除前 | [厚生労働省・令和7年賃金構造基本統計調査](https://www.mhlw.go.jp/toukei/itiran/roudou/chingin/kouzou/z2025/index.html) / [用語の定義](https://www.mhlw.go.jp/toukei/itiran/roudou/chingin/kouzou/z2025/yougo.html) / [図表Excel](https://www.mhlw.go.jp/toukei/itiran/roudou/chingin/kouzou/z2025/xls/zuhyo.xlsx) |
| 人口 | 2024年10月1日 | 千人 | 総人口（男女計）。日本人人口だけではない | [総務省統計局・人口推計](https://www.stat.go.jp/data/jinsui/2024np/) / [第2表Excel](https://www.stat.go.jp/data/jinsui/2024np/zuhyou/05k2024-2.xlsx) |
| 人口増減率 | 2023年10月1日→2024年10月1日 | % | 前年10月から当年9月までの人口増減を前年10月1日人口で除した公式公表率。人口増減は自然増減と社会増減の合計 | [総務省統計局・人口推計](https://www.stat.go.jp/data/jinsui/2024np/) / [結果概要PDF・表6](https://www.stat.go.jp/data/jinsui/2024np/pdf/2024np.pdf) |

県民経済計算は、2026年6月10日時点で2023年度値が31都道府県分までのため、47都道府県を同じ年度で比較できる2022年度値を採用しています。統計ごとに基準年が違うため、5指標を合成した「地域経済力スコア」は作成していません。

## 企業データへの結合

- 本社指標は `head_office_prefecture` の都道府県値です。
- 事業実施場所指標は `project_location_prefectures` に含まれる都道府県の値です。
- 複数県に実施場所がある場合、同一県の重複を除いた単純平均です。投資額、拠点数、従業員数による加重平均ではありません。
- 地方区分は「北海道、東北、関東、中部、近畿、中国、四国、九州・沖縄」の8区分です。複数地方にまたがる企業は、色分けでは「複数地方」と表示します。地域フィルターでは、選択地方・都道府県を1か所でも含めば対象になります。

## 生成物と更新方法

- `data/reference/prefecture_economic_indicators.csv`: 47都道府県の値
- `data/reference/prefecture_economic_indicator_sources.csv`: 指標定義、基準時点、公式URL
- `data/reference/raw/prefecture_economy/`: 取得した公式原表
- `scripts/update_prefecture_economic_indicators.py`: 原表から参照CSVを再生成し、`cases.csv` と `cases.json` に結合

更新コマンド:

```powershell
python scripts/update_prefecture_economic_indicators.py
python scripts/build_analysis_dashboard.py
```

原表の列・シート構成が変わった場合、更新スクリプトは47都道府県がそろわなければエラーで停止します。
