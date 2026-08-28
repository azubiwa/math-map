type StreakCardProps = {
  streak: number;
};

export function StreakCard({ streak }: StreakCardProps) {
  return (
    <article className="streak-card">
      <p>現在の連続学習</p>
      <strong>{streak}<small>日</small></strong>
      <span>{streak > 0 ? "本日の学習状況を記録済み" : "1件記録すると継続日数が始まります"}</span>
    </article>
  );
}
