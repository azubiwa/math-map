type PointRule = {
  title: string;
  condition: string;
  points: string;
};

const pointRules: PointRule[] = [
  { title: "本日の初回学習", condition: "1日につき1回", points: "＋5 pt" },
  { title: "新しい単位に着手", condition: "1単位・1周につき初回", points: "＋1 pt" },
  { title: "問題を解決", condition: "1問・1周につき初回（自力・解答参照）", points: "＋2 pt" },
  { title: "読書単位を読了", condition: "1単位・1周につき初回", points: "＋5 pt" },
  { title: "章を完了", condition: "章の1周ごと", points: "＋15 pt" },
  { title: "教材を100%完了", condition: "教材の1周ごと", points: "＋50 pt" },
  { title: "連続学習", condition: "3日＋3・7日＋10・14日＋25・30日＋60・60日＋150・100日＋300", points: "＋3〜300 pt" },
  { title: "学習再開", condition: "3〜6日＋5・7〜13日＋10・14日以上＋20", points: "＋5〜20 pt" },
  { title: "日次目標を完了", condition: "学習3・完了2", points: "＋10 pt" },
  { title: "週間達成目標を完了", condition: "学習1・完了3の合計100", points: "＋50 pt" },
  { title: "時限達成報酬を受領", condition: "5単位の初回完了後、3時間後から24時間", points: "＋15 pt" },
];

function PointRuleItem({ rule }: { rule: PointRule }) {
  return (
    <article>
      <div><strong>{rule.title}</strong><small>{rule.condition}</small></div>
      <b>{rule.points}</b>
    </article>
  );
}

export function PointRulesSection() {
  return (
    <section className="point-rules-section">
      <div className="section-heading">
        <div><p className="eyebrow">POINT RULES</p><h3>ポイントの加算条件</h3></div>
        <span>同じ記録からの重複加算はありません</span>
      </div>
      <div className="point-rules">
        {pointRules.map((rule) => <PointRuleItem key={rule.title} rule={rule} />)}
      </div>
    </section>
  );
}
