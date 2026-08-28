import { MilestonesSection, type MilestoneGroup } from "./MilestonesSection";
import { PointHistorySection, type PointChartRange } from "./PointHistorySection";
import { PointRulesSection } from "./PointRulesSection";
import { PointsCard } from "./PointsCard";
import { StreakCard } from "./StreakCard";
import { StudyGoalsCard, type GoalTargets } from "./StudyGoalsCard";

type PointAward = {
  points: number;
  earnedOn: string;
};

type GoalsViewProps = {
  goals: GoalTargets;
  weekCount: number;
  monthCount: number;
  streak: number;
  studyPoints: number;
  pointAwards: PointAward[];
  clockTime: number;
  pointChartRange: PointChartRange;
  milestoneGroups: MilestoneGroup[];
  achievedMilestoneCount: number;
  milestoneTargetCount: number;
  onGoalsChange: (goals: GoalTargets) => void;
  onPointChartRangeChange: (range: PointChartRange) => void;
};

export function GoalsView({
  goals,
  weekCount,
  monthCount,
  streak,
  studyPoints,
  pointAwards,
  clockTime,
  pointChartRange,
  milestoneGroups,
  achievedMilestoneCount,
  milestoneTargetCount,
  onGoalsChange,
  onPointChartRangeChange,
}: GoalsViewProps) {
  return (
    <section className="view-panel">
      <div className="view-heading">
        <div>
          <p className="eyebrow">GOALS & MILESTONES</p>
          <h2>目標・実績</h2>
          <p>無理のない目標を決めて、積み重ねを確認できます</p>
        </div>
      </div>
      <div className="goal-layout">
        <StudyGoalsCard goals={goals} weekCount={weekCount} monthCount={monthCount} onChange={onGoalsChange} />
        <StreakCard streak={streak} />
        <PointsCard studyPoints={studyPoints} />
      </div>
      <PointHistorySection
        awards={pointAwards}
        clockTime={clockTime}
        range={pointChartRange}
        studyPoints={studyPoints}
        onRangeChange={onPointChartRangeChange}
      />
      <PointRulesSection />
      <MilestonesSection
        groups={milestoneGroups}
        achievedCount={achievedMilestoneCount}
        targetCount={milestoneTargetCount}
      />
    </section>
  );
}
