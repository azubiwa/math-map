"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "todo" | "trying" | "solved" | "with-answer" | "review";
type Problem = { id: number; status: Status };
type Chapter = { id: string; title: string; problems: Problem[] };
type Material = {
  id: string;
  title: string;
  kind: "教科書" | "授業";
  color: string;
  chapters: Chapter[];
};

const statusOrder: Status[] = [
  "todo",
  "trying",
  "solved",
  "with-answer",
  "review",
];

const statusLabel: Record<Status, string> = {
  todo: "未着手",
  trying: "取組中",
  solved: "自力で解決",
  "with-answer": "解答を見て解決",
  review: "復習待ち",
};

const seed: Material[] = [
  {
    id: "linear",
    title: "線形代数学入門",
    kind: "教科書",
    color: "#ff6b4a",
    chapters: [
      {
        id: "l1",
        title: "第1章 ベクトルと行列",
        problems: Array.from({ length: 14 }, (_, i) => ({
          id: i + 1,
          status: (["solved", "solved", "with-answer", "review", "todo", "trying", "solved", "todo", "todo", "with-answer", "solved", "todo", "review", "todo"] as Status[])[i],
        })),
      },
      {
        id: "l2",
        title: "第2章 連立一次方程式",
        problems: Array.from({ length: 12 }, (_, i) => ({
          id: i + 1,
          status: i < 4 ? "solved" : i === 4 ? "trying" : "todo",
        })),
      },
      {
        id: "l3",
        title: "第3章 線形写像",
        problems: Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          status: "todo",
        })),
      },
    ],
  },
  {
    id: "analysis",
    title: "解析学 I 演習",
    kind: "授業",
    color: "#2e7d6e",
    chapters: [
      {
        id: "a1",
        title: "第1回 数列の極限",
        problems: Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          status: i < 6 ? "solved" : i === 6 ? "review" : "todo",
        })),
      },
    ],
  },
  {
    id: "probability",
    title: "確率・統計",
    kind: "教科書",
    color: "#5267ad",
    chapters: [
      {
        id: "p1",
        title: "第1章 確率空間",
        problems: Array.from({ length: 16 }, (_, i) => ({
          id: i + 1,
          status: i < 3 ? "with-answer" : "todo",
        })),
      },
    ],
  },
];

const heat = [0, 1, 0, 2, 3, 0, 0, 1, 2, 4, 2, 0, 1, 3, 4, 1, 0, 2, 3, 1, 0, 0, 2, 4, 3, 2, 1, 0, 1, 3, 2, 0, 0, 1, 4, 3, 1, 2, 0, 0, 3, 2, 4, 1, 0, 2, 1, 3, 4];

function pct(chapters: Chapter[]) {
  const all = chapters.flatMap((c) => c.problems);
  const done = all.filter((p) => p.status === "solved" || p.status === "with-answer").length;
  return all.length ? Math.round((done / all.length) * 100) : 0;
}

export default function Home() {
  const [materials, setMaterials] = useState<Material[]>(seed);
  const [selected, setSelected] = useState("linear");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [dark, setDark] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("math-map-data");
    const savedTheme = localStorage.getItem("math-map-theme");
    if (saved) {
      try { setMaterials(JSON.parse(saved)); } catch {}
    }
    if (savedTheme === "dark") setDark(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("math-map-data", JSON.stringify(materials));
  }, [materials]);

  useEffect(() => {
    localStorage.setItem("math-map-theme", dark ? "dark" : "light");
  }, [dark]);

  const current = materials.find((m) => m.id === selected) ?? materials[0];
  const totalProblems = materials.flatMap((m) => m.chapters.flatMap((c) => c.problems));
  const solved = totalProblems.filter((p) => p.status === "solved" || p.status === "with-answer").length;
  const review = totalProblems.filter((p) => p.status === "review").length;
  const overall = totalProblems.length ? Math.round((solved / totalProblems.length) * 100) : 0;

  const filteredChapters = useMemo(
    () =>
      current?.chapters.map((chapter) => ({
        ...chapter,
        problems:
          filter === "all"
            ? chapter.problems
            : chapter.problems.filter((problem) => problem.status === filter),
      })) ?? [],
    [current, filter],
  );

  const cycleProblem = (chapterId: string, problemId: number) => {
    setMaterials((items) =>
      items.map((material) =>
        material.id !== current.id
          ? material
          : {
              ...material,
              chapters: material.chapters.map((chapter) =>
                chapter.id !== chapterId
                  ? chapter
                  : {
                      ...chapter,
                      problems: chapter.problems.map((problem) =>
                        problem.id !== problemId
                          ? problem
                          : {
                              ...problem,
                              status:
                                statusOrder[
                                  (statusOrder.indexOf(problem.status) + 1) %
                                    statusOrder.length
                                ],
                            },
                      ),
                    },
              ),
            },
      ),
    );
  };

  const addMaterial = () => {
    if (!newTitle.trim()) return;
    const id = `material-${Date.now()}`;
    setMaterials((items) => [
      ...items,
      {
        id,
        title: newTitle.trim(),
        kind: "教科書",
        color: "#8b5f9c",
        chapters: [
          {
            id: `${id}-1`,
            title: "第1章",
            problems: Array.from({ length: 10 }, (_, i) => ({
              id: i + 1,
              status: "todo" as Status,
            })),
          },
        ],
      },
    ]);
    setSelected(id);
    setAdding(false);
    setNewTitle("");
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(materials, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "math-map-backup.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!current) return null;

  return (
    <main className={dark ? "app dark" : "app"}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">Σ</span>
          <span>MATH MAP</span>
        </div>
        <nav className="main-nav" aria-label="メインナビゲーション">
          <button className="nav-item active"><span>⌂</span>ホーム</button>
          <button className="nav-item"><span>▦</span>教材一覧</button>
          <button className="nav-item"><span>↻</span>復習キュー <b>{review}</b></button>
          <button className="nav-item"><span>▥</span>学習記録</button>
        </nav>
        <div className="side-section">
          <p>教材</p>
          {materials.map((material) => (
            <button
              key={material.id}
              className={`material-link ${selected === material.id ? "selected" : ""}`}
              onClick={() => setSelected(material.id)}
            >
              <i style={{ background: material.color }} />
              <span>{material.title}</span>
              <small>{pct(material.chapters)}%</small>
            </button>
          ))}
          <button className="add-link" onClick={() => setAdding(true)}>＋ 教材を追加</button>
        </div>
        <div className="side-footer">
          <button onClick={exportData}>⇩ バックアップを書き出す</button>
          <p>データはこの端末に保存されます</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">2026年7月30日・木曜日</p>
            <h1>おかえりなさい。</h1>
          </div>
          <div className="top-actions">
            <button className="icon-button" aria-label="テーマを切り替える" onClick={() => setDark((v) => !v)}>
              {dark ? "☀" : "☾"}
            </button>
            <button className="primary-button" onClick={() => setAdding(true)}>＋ 教材を追加</button>
          </div>
        </header>

        <section className="summary">
          <article className="overall-card">
            <div className="ring" style={{ "--progress": `${overall * 3.6}deg` } as React.CSSProperties}>
              <div><strong>{overall}%</strong><span>全体進捗</span></div>
            </div>
            <div className="overall-copy">
              <p>今週の学習</p>
              <h2>積み重ねが、<br />見える形になってきました。</h2>
              <div className="mini-stats">
                <span><b>{solved}</b> 解決済み</span>
                <span><b>{review}</b> 復習待ち</span>
                <span><b>{materials.length}</b> 教材</span>
              </div>
            </div>
          </article>

          <article className="heat-card">
            <div className="card-heading">
              <div><p>学習の足あと</p><h3>直近7週間</h3></div>
              <span>23日継続中</span>
            </div>
            <div className="heatmap" aria-label="学習ヒートマップ">
              {heat.map((level, i) => <i key={i} data-level={level} title={`${i + 1}日目・学習レベル${level}`} />)}
            </div>
            <div className="heat-legend"><span>少ない</span>{[0,1,2,3,4].map((v) => <i key={v} data-level={v} />)}<span>多い</span></div>
          </article>
        </section>

        <section className="material-head">
          <div className="book-title">
            <span style={{ background: current.color }}>{current.kind === "授業" ? "授" : "本"}</span>
            <div><p>{current.kind}</p><h2>{current.title}</h2></div>
          </div>
          <div className="material-progress">
            <div><span>教材の進捗</span><strong>{pct(current.chapters)}%</strong></div>
            <div className="progress-track"><i style={{ width: `${pct(current.chapters)}%`, background: current.color }} /></div>
          </div>
        </section>

        <section className="problem-section">
          <div className="problem-toolbar">
            <div>
              <h3>章ごとの演習</h3>
              <p>問題番号を押すと状態が切り替わります</p>
            </div>
            <select aria-label="状態で絞り込む" value={filter} onChange={(e) => setFilter(e.target.value as Status | "all")}>
              <option value="all">すべての状態</option>
              {statusOrder.map((status) => <option value={status} key={status}>{statusLabel[status]}</option>)}
            </select>
          </div>
          <div className="legend">
            {statusOrder.map((status) => <span key={status}><i className={`dot ${status}`} />{statusLabel[status]}</span>)}
          </div>

          <div className="chapters">
            {filteredChapters.map((chapter) => {
              const original = current.chapters.find((c) => c.id === chapter.id)!;
              return (
                <article className="chapter-card" key={chapter.id}>
                  <div className="chapter-row">
                    <div className="chapter-info">
                      <button aria-label={`${chapter.title}を開閉`}>⌄</button>
                      <div><h4>{chapter.title}</h4><p>{original.problems.length}問中 {original.problems.filter((p) => p.status === "solved" || p.status === "with-answer").length}問 解決</p></div>
                    </div>
                    <div className="chapter-pct">
                      <span>{pct([original])}%</span>
                      <div><i style={{ width: `${pct([original])}%`, background: current.color }} /></div>
                    </div>
                  </div>
                  <div className="problem-grid">
                    {chapter.problems.map((problem) => (
                      <button
                        key={problem.id}
                        className={`problem ${problem.status}`}
                        title={`${problem.id}番・${statusLabel[problem.status]}`}
                        aria-label={`${problem.id}番、${statusLabel[problem.status]}。押すと次の状態へ`}
                        onClick={() => cycleProblem(chapter.id, problem.id)}
                      >
                        {problem.id}
                      </button>
                    ))}
                    {chapter.problems.length === 0 && <p className="empty">この状態の問題はありません。</p>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>

      {adding && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAdding(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" aria-label="閉じる" onClick={() => setAdding(false)}>×</button>
            <p className="eyebrow">NEW MATERIAL</p>
            <h2 id="add-title">新しい教材を追加</h2>
            <label>教材名<input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMaterial()} placeholder="例：微分積分学 演習" /></label>
            <p className="modal-note">まず10問の第1章を作成します。問題番号を押して進捗を記録できます。</p>
            <button className="primary-button wide" onClick={addMaterial}>教材を作成する</button>
          </div>
        </div>
      )}
    </main>
  );
}
