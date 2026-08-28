export type MilestoneGroup = {
  id: string;
  title: string;
  description: string;
  value: number;
  unit: string;
  steps: number[];
};

type MilestonesSectionProps = {
  groups: MilestoneGroup[];
  achievedCount: number;
  targetCount: number;
};

function MilestoneCard({ group }: { group: MilestoneGroup }) {
  const achieved = group.steps.filter((step) => group.value >= step).length;
  const next = group.steps.find((step) => group.value < step);
  const complete = next === undefined;

  return (
    <article className={`milestone-kind ${achieved > 0 ? "has-achievement" : ""} ${complete ? "unlocked" : ""}`}>
      <div className="milestone-kind-head">
        <span>{complete ? "✓" : achieved}</span>
        <div><strong>{group.title}</strong><small>{group.description}</small></div>
      </div>
      <div className="milestone-value"><b>{group.value}</b><small>{group.unit}</small></div>
      <div className="milestone-levels" aria-label={`${group.title}の達成段階`}>
        {group.steps.map((step) => <span className={group.value >= step ? "achieved" : ""} key={step}>{step}</span>)}
      </div>
      <p>{complete ? "すべての段階を達成" : `${next}${group.unit}まであと${next - group.value}${group.unit}`}</p>
    </article>
  );
}

export function MilestonesSection({ groups, achievedCount, targetCount }: MilestonesSectionProps) {
  return (
    <section className="milestone-section">
      <div className="section-heading">
        <div><p className="eyebrow">MILESTONES</p><h3>マイルストーン</h3></div>
        <span>{achievedCount} / {targetCount}段階を達成</span>
      </div>
      <div className="milestone-grid">
        {groups.map((group) => <MilestoneCard key={group.id} group={group} />)}
      </div>
    </section>
  );
}
