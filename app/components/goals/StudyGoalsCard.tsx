export type GoalTargets = {
  weekly: number;
  monthly: number;
};

type StudyGoalsCardProps = {
  goals: GoalTargets;
  weekCount: number;
  monthCount: number;
  onChange: (goals: GoalTargets) => void;
};

function goalPercent(count: number, target: number) {
  return target > 0 ? Math.min(100, Math.round((count / target) * 100)) : 0;
}

export function StudyGoalsCard({ goals, weekCount, monthCount, onChange }: StudyGoalsCardProps) {
  return (
    <article className="settings-card">
      <p className="eyebrow">STUDY GOALS</p>
      <h3>学習目標</h3>
      <div className="goal-inputs">
        <label>
          週間目標
          <div>
            <input
              type="number"
              min="1"
              max="999"
              value={goals.weekly}
              onChange={(event) => onChange({
                ...goals,
                weekly: Math.max(1, Number(event.target.value) || 1),
              })}
            />
            <span>件</span>
          </div>
        </label>
        <label>
          月間目標
          <div>
            <input
              type="number"
              min="1"
              max="9999"
              value={goals.monthly}
              onChange={(event) => onChange({
                ...goals,
                monthly: Math.max(1, Number(event.target.value) || 1),
              })}
            />
            <span>件</span>
          </div>
        </label>
      </div>
      <div className="goal-detail">
        <div><span>今週</span><strong>{weekCount} / {goals.weekly}件</strong></div>
        <div className="goal-track"><i style={{ width: `${goalPercent(weekCount, goals.weekly)}%` }} /></div>
        <div><span>今月</span><strong>{monthCount} / {goals.monthly}件</strong></div>
        <div className="goal-track"><i style={{ width: `${goalPercent(monthCount, goals.monthly)}%` }} /></div>
      </div>
    </article>
  );
}
