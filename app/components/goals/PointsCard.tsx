type PointsCardProps = {
  studyPoints: number;
};

export function PointsCard({ studyPoints }: PointsCardProps) {
  return (
    <article className="point-card">
      <p>累計ポイント</p>
      <strong>{studyPoints}<small> pt</small></strong>
      <span>学習記録と目標達成に応じて加算</span>
    </article>
  );
}
