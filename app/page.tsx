"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Status = "todo" | "trying" | "solved" | "with-answer" | "review";
type Problem = { id: number; status: Status; studiedOn?: string };
type Chapter = { id: string; title: string; problems: Problem[] };
type Material = {
  id: string;
  title: string;
  kind: "教科書" | "授業";
  color: string;
  chapters: Chapter[];
  archived?: boolean;
};
type View = "home" | "materials" | "review" | "history" | "goals" | "exam";
type ChapterDraft = { title: string; count: number };
type Goals = { weekly: number; monthly: number };
type ExamSettings = { enabled: boolean; name: string; date: string; materialId: string };

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
    color: "#3b82f6",
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
    color: "#1764d9",
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
    color: "#275eb7",
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

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatHeatDate(date: Date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function startOfWeek(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay();
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  return start;
}

function sumActivity(activity: Record<string, number>, from: Date, to: Date) {
  return Object.entries(activity).reduce((sum, [key, count]) => {
    const date = new Date(`${key}T12:00:00`);
    return date >= from && date <= to ? sum + count : sum;
  }, 0);
}

function pct(chapters: Chapter[]) {
  const all = chapters.flatMap((c) => c.problems);
  const done = all.filter((p) => p.status === "solved" || p.status === "with-answer").length;
  return all.length ? Math.round((done / all.length) * 100) : 0;
}

export default function Home() {
  const [materials, setMaterials] = useState<Material[]>(seed);
  const [selected, setSelected] = useState("linear");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [view, setView] = useState<View>("home");
  const [dark, setDark] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<Material["kind"]>("教科書");
  const [chapterDrafts, setChapterDrafts] = useState<ChapterDraft[]>([
    { title: "第1章", count: 10 },
  ]);
  const [activity, setActivity] = useState<Record<string, number>>({});
  const [goals, setGoals] = useState<Goals>({ weekly: 20, monthly: 80 });
  const [exam, setExam] = useState<ExamSettings>({ enabled: false, name: "", date: "", materialId: "linear" });
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("math-map-data");
    const savedTheme = localStorage.getItem("math-map-theme");
    const savedActivity = localStorage.getItem("math-map-activity");
    const savedGoals = localStorage.getItem("math-map-goals");
    const savedExam = localStorage.getItem("math-map-exam");
    if (saved) {
      try { setMaterials(JSON.parse(saved)); } catch {}
    }
    if (savedTheme === "dark") setDark(true);
    if (savedActivity) {
      try { setActivity(JSON.parse(savedActivity)); } catch {}
    }
    if (savedGoals) {
      try { setGoals(JSON.parse(savedGoals)); } catch {}
    }
    if (savedExam) {
      try { setExam(JSON.parse(savedExam)); } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("math-map-data", JSON.stringify(materials));
  }, [materials]);

  useEffect(() => {
    localStorage.setItem("math-map-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    localStorage.setItem("math-map-activity", JSON.stringify(activity));
  }, [activity]);

  useEffect(() => {
    localStorage.setItem("math-map-goals", JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    localStorage.setItem("math-map-exam", JSON.stringify(exam));
  }, [exam]);

  const activeMaterials = materials.filter((material) => !material.archived);
  const archivedMaterials = materials.filter((material) => material.archived);
  const current = materials.find((m) => m.id === selected) ?? activeMaterials[0] ?? materials[0];
  const totalProblems = activeMaterials.flatMap((m) => m.chapters.flatMap((c) => c.problems));
  const solved = totalProblems.filter((p) => p.status === "solved" || p.status === "with-answer").length;
  const review = totalProblems.filter((p) => p.status === "review").length;
  const overall = totalProblems.length ? Math.round((solved / totalProblems.length) * 100) : 0;
  const heatDays = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 49 }, (_, index) => {
      const date = new Date(today);
      date.setHours(12, 0, 0, 0);
      date.setDate(today.getDate() - (48 - index));
      const key = localDateKey(date);
      const count = activity[key] ?? 0;
      const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 9 ? 3 : 4;
      return { key, date, count, level };
    });
  }, [activity]);
  const activeDays = heatDays.filter((day) => day.count > 0).length;
  const todayCount = activity[localDateKey()] ?? 0;
  const now = new Date();
  const weekStart = startOfWeek(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const weekCount = sumActivity(activity, weekStart, now);
  const monthCount = sumActivity(activity, monthStart, now);
  const goalPercent = (count: number, target: number) => target > 0 ? Math.min(100, Math.round((count / target) * 100)) : 0;
  const streak = useMemo(() => {
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    if (!(activity[localDateKey(cursor)] > 0)) cursor.setDate(cursor.getDate() - 1);
    let days = 0;
    while (activity[localDateKey(cursor)] > 0) {
      days += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return days;
  }, [activity]);
  const milestoneSteps = [10, 25, 50, 100, 250, 500];
  const unlockedMilestones = milestoneSteps.filter((step) => solved >= step);
  const completedMaterials = activeMaterials.filter((material) => pct(material.chapters) === 100).length;
  const nextMilestone = milestoneSteps.find((step) => solved < step);
  const examMaterial = activeMaterials.find((material) => material.id === exam.materialId) ?? activeMaterials[0];
  const examProblems = examMaterial?.chapters.flatMap((chapter) => chapter.problems) ?? [];
  const examSolved = examProblems.filter((problem) => problem.status === "solved" || problem.status === "with-answer").length;
  const examReview = examProblems.filter((problem) => problem.status === "review").length;
  const daysUntilExam = exam.date ? Math.ceil((new Date(`${exam.date}T12:00:00`).getTime() - now.getTime()) / 86400000) : null;
  const dateLabel = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(now);

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
    const targetProblem = current.chapters
      .find((chapter) => chapter.id === chapterId)
      ?.problems.find((problem) => problem.id === problemId);
    const shouldRecord = !targetProblem?.studiedOn;
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
                          : (() => {
                              return {
                                ...problem,
                                studiedOn: problem.studiedOn ?? localDateKey(),
                                status:
                                  statusOrder[
                                    (statusOrder.indexOf(problem.status) + 1) %
                                      statusOrder.length
                                  ],
                              };
                            })(),
                      ),
                    },
              ),
            },
      ),
    );
    if (shouldRecord) {
      const today = localDateKey();
      setActivity((days) => ({ ...days, [today]: (days[today] ?? 0) + 1 }));
    }
  };

  const resetProblem = (chapterId: string, problemId: number) => {
    const studiedOn = current.chapters
      .find((chapter) => chapter.id === chapterId)
      ?.problems.find((problem) => problem.id === problemId)
      ?.studiedOn;
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
                      problems: chapter.problems.map((problem) => {
                        if (problem.id !== problemId) return problem;
                        return { id: problem.id, status: "todo" as Status };
                      }),
                    },
              ),
            },
      ),
    );
    if (studiedOn) {
      setActivity((days) => {
        const next = { ...days };
        const remaining = Math.max(0, (next[studiedOn!] ?? 0) - 1);
        if (remaining === 0) delete next[studiedOn!];
        else next[studiedOn!] = remaining;
        return next;
      });
    }
  };

  const openAdd = () => {
    setEditingId(null);
    setNewTitle("");
    setNewKind("教科書");
    setChapterDrafts([{ title: "第1章", count: 10 }]);
    setAdding(true);
  };

  const openEdit = (material: Material) => {
    setEditingId(material.id);
    setNewTitle(material.title);
    setNewKind(material.kind);
    setChapterDrafts(
      material.chapters.map((chapter) => ({
        title: chapter.title,
        count: chapter.problems.length,
      })),
    );
    setAdding(true);
  };

  const saveMaterial = () => {
    if (!newTitle.trim() || chapterDrafts.length === 0) return;
    const normalized = chapterDrafts.map((chapter, index) => ({
      title: chapter.title.trim() || `第${index + 1}章`,
      count: Math.max(1, Math.min(500, Number(chapter.count) || 1)),
    }));

    if (editingId) {
      setMaterials((items) =>
        items.map((material) => {
          if (material.id !== editingId) return material;
          return {
            ...material,
            title: newTitle.trim(),
            kind: newKind,
            chapters: normalized.map((draft, index) => {
              const previous = material.chapters[index];
              return {
                id: previous?.id ?? `${material.id}-${Date.now()}-${index}`,
                title: draft.title,
                problems: Array.from({ length: draft.count }, (_, problemIndex) => (
                  previous?.problems[problemIndex] ?? {
                    id: problemIndex + 1,
                    status: "todo" as Status,
                  }
                )),
              };
            }),
          };
        }),
      );
    } else {
      const id = `material-${Date.now()}`;
      setMaterials((items) => [
        ...items,
        {
          id,
          title: newTitle.trim(),
          kind: newKind,
          color: "#6e7fbb",
          chapters: normalized.map((draft, index) => ({
            id: `${id}-${index + 1}`,
            title: draft.title,
            problems: Array.from({ length: draft.count }, (_, problemIndex) => ({
              id: problemIndex + 1,
              status: "todo" as Status,
            })),
          })),
        },
      ]);
      setSelected(id);
      setView("home");
    }
    setAdding(false);
  };

  const moveMaterial = (id: string, direction: -1 | 1) => {
    setMaterials((items) => {
      const index = items.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= items.length) return items;
      const next = [...items];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const toggleArchive = (id: string) => {
    setMaterials((items) => items.map((item) => item.id === id ? { ...item, archived: !item.archived } : item));
    if (id === selected) {
      const replacement = activeMaterials.find((item) => item.id !== id);
      if (replacement) setSelected(replacement.id);
    }
  };

  const exportData = () => {
    const backup = {
      version: 3,
      exportedAt: new Date().toISOString(),
      materials,
      activity,
      goals,
      exam,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "math-map-backup.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const restoredMaterials = Array.isArray(parsed) ? parsed : parsed.materials;
      if (!Array.isArray(restoredMaterials) || restoredMaterials.length === 0) {
        throw new Error("教材データがありません");
      }
      setMaterials(restoredMaterials);
      setActivity(
        !Array.isArray(parsed) && parsed.activity && typeof parsed.activity === "object"
          ? parsed.activity
          : {},
      );
      if (!Array.isArray(parsed) && parsed.goals) setGoals(parsed.goals);
      if (!Array.isArray(parsed) && parsed.exam) setExam(parsed.exam);
      setSelected(restoredMaterials[0].id);
      setView("home");
      alert("バックアップを反映しました。");
    } catch {
      alert("このファイルは読み込めませんでした。MATH MAPのJSONバックアップを選んでください。");
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
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
          <button className={`nav-item ${view === "home" ? "active" : ""}`} onClick={() => setView("home")}><span>⌂</span>ホーム</button>
          <button className={`nav-item ${view === "materials" ? "active" : ""}`} onClick={() => setView("materials")}><span>▦</span>教材一覧</button>
          <button className={`nav-item ${view === "review" ? "active" : ""}`} onClick={() => setView("review")}><span>↻</span>復習キュー <b>{review}</b></button>
          <button className={`nav-item ${view === "history" ? "active" : ""}`} onClick={() => setView("history")}><span>▥</span>学習記録</button>
          <button className={`nav-item ${view === "goals" ? "active" : ""}`} onClick={() => setView("goals")}><span>◎</span>目標・実績</button>
          <button className={`nav-item ${view === "exam" ? "active" : ""}`} onClick={() => setView("exam")}><span>旗</span>試験モード</button>
        </nav>
        <div className="side-section">
          <p>教材</p>
          {activeMaterials.map((material) => (
            <button
              key={material.id}
              className={`material-link ${selected === material.id ? "selected" : ""}`}
              onClick={() => { setSelected(material.id); setView("home"); }}
            >
              <i style={{ background: material.color }} />
              <span>{material.title}</span>
              <small>{pct(material.chapters)}%</small>
            </button>
          ))}
          <button className="add-link" onClick={openAdd}>＋ 教材を追加</button>
        </div>
        <div className="side-footer">
          <button onClick={exportData}>⇩ バックアップを書き出す</button>
          <button onClick={() => importInput.current?.click()}>⇧ バックアップを反映する</button>
          <input ref={importInput} className="file-input" type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importData(file);
          }} />
          <p>データはこの端末に保存されます</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{dateLabel}</p>
            <h1>おかえりなさい。</h1>
          </div>
          <div className="top-actions">
            <button className="icon-button" aria-label="テーマを切り替える" onClick={() => setDark((v) => !v)}>
              {dark ? "☀" : "☾"}
            </button>
            <button className="primary-button" onClick={openAdd}>＋ 教材を追加</button>
          </div>
        </header>

        {view === "materials" && (
          <section className="view-panel">
            <div className="view-heading">
              <div><p className="eyebrow">MATERIALS</p><h2>教材一覧</h2></div>
              <button className="primary-button" onClick={openAdd}>＋ 教材を追加</button>
            </div>
            <div className="material-cards">
              {activeMaterials.map((material) => {
                const count = material.chapters.reduce((sum, chapter) => sum + chapter.problems.length, 0);
                const sourceIndex = materials.findIndex((item) => item.id === material.id);
                return (
                  <article className="material-card" key={material.id}>
                    <button className="material-open" onClick={() => { setSelected(material.id); setView("home"); }}>
                      <span className="book-chip" style={{ background: material.color }}>{material.kind === "授業" ? "授" : "本"}</span>
                      <div><small>{material.kind}</small><h3>{material.title}</h3><p>{material.chapters.length}章・全{count}問</p></div>
                    </button>
                    <div className="material-card-progress"><strong>{pct(material.chapters)}%</strong><div><i style={{ width: `${pct(material.chapters)}%`, background: material.color }} /></div></div>
                    <div className="material-actions">
                      <button className="secondary-button" onClick={() => moveMaterial(material.id, -1)} disabled={sourceIndex === 0} aria-label={`${material.title}を上へ移動`}>↑</button>
                      <button className="secondary-button" onClick={() => moveMaterial(material.id, 1)} disabled={sourceIndex === materials.length - 1} aria-label={`${material.title}を下へ移動`}>↓</button>
                      <button className="secondary-button action-wide" onClick={() => openEdit(material)}>章・問題数を設定</button>
                      <button className="secondary-button" disabled={activeMaterials.length === 1} title={activeMaterials.length === 1 ? "使用中の教材を1件以上残してください" : ""} onClick={() => toggleArchive(material.id)}>アーカイブ</button>
                    </div>
                  </article>
                );
              })}
            </div>
            {archivedMaterials.length > 0 && (
              <section className="archive-section">
                <div className="archive-heading"><h3>アーカイブ済み</h3><span>{archivedMaterials.length}件</span></div>
                <div className="archive-list">
                  {archivedMaterials.map((material) => (
                    <article key={material.id}>
                      <div><small>{material.kind}</small><strong>{material.title}</strong></div>
                      <button className="secondary-button" onClick={() => toggleArchive(material.id)}>元に戻す</button>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </section>
        )}

        {view === "review" && (
          <section className="view-panel">
            <div className="view-heading"><div><p className="eyebrow">REVIEW QUEUE</p><h2>復習キュー</h2><p>{review}問が復習を待っています</p></div></div>
            <div className="review-list">
              {activeMaterials.flatMap((material) => material.chapters.flatMap((chapter) =>
                chapter.problems.filter((problem) => problem.status === "review").map((problem) => (
                  <article className="review-item" key={`${material.id}-${chapter.id}-${problem.id}`}>
                    <span className="review-number">{problem.id}</span>
                    <div><small>{material.title}</small><h3>{chapter.title}・問題 {problem.id}</h3></div>
                    <button className="secondary-button" onClick={() => { setSelected(material.id); setView("home"); setFilter("review"); }}>問題を開く</button>
                  </article>
                )),
              ))}
              {review === 0 && <div className="empty-state"><strong>復習待ちはありません</strong><p>問題マスを「復習待ち」にすると、ここにまとまります。</p></div>}
            </div>
          </section>
        )}

        {view === "history" && (
          <section className="view-panel">
            <div className="view-heading"><div><p className="eyebrow">STUDY LOG</p><h2>学習記録</h2><p>これまでの積み重ねを状態別に確認できます</p></div></div>
            <div className="history-grid">
              {statusOrder.map((status) => {
                const count = totalProblems.filter((problem) => problem.status === status).length;
                return <article key={status}><i className={`dot ${status}`} /><span>{statusLabel[status]}</span><strong>{count}<small>問</small></strong></article>;
              })}
            </div>
            <article className="heat-card history-heat">
              <div className="card-heading"><div><p>学習の足あと</p><h3>直近7週間</h3></div><span>今日 {todayCount}問</span></div>
              <div className="heatmap">{heatDays.map((day) => <i key={day.key} data-level={day.level} title={`${formatHeatDate(day.date)}・${day.count}問`} />)}</div>
              <div className="heat-foot"><span>直近49日で{activeDays}日学習</span><div className="heat-legend"><span>少ない</span>{[0,1,2,3,4].map((v) => <i key={v} data-level={v} />)}<span>多い</span></div></div>
            </article>
          </section>
        )}

        {view === "goals" && (
          <section className="view-panel">
            <div className="view-heading"><div><p className="eyebrow">GOALS & MILESTONES</p><h2>目標・実績</h2><p>無理のない目標を決めて、積み重ねを確認できます</p></div></div>
            <div className="goal-layout">
              <article className="settings-card">
                <p className="eyebrow">STUDY GOALS</p>
                <h3>学習目標</h3>
                <div className="goal-inputs">
                  <label>週間目標<div><input type="number" min="1" max="999" value={goals.weekly} onChange={(event) => setGoals((value) => ({ ...value, weekly: Math.max(1, Number(event.target.value) || 1) }))} /><span>問</span></div></label>
                  <label>月間目標<div><input type="number" min="1" max="9999" value={goals.monthly} onChange={(event) => setGoals((value) => ({ ...value, monthly: Math.max(1, Number(event.target.value) || 1) }))} /><span>問</span></div></label>
                </div>
                <div className="goal-detail">
                  <div><span>今週</span><strong>{weekCount} / {goals.weekly}問</strong></div>
                  <div className="goal-track"><i style={{ width: `${goalPercent(weekCount, goals.weekly)}%` }} /></div>
                  <div><span>今月</span><strong>{monthCount} / {goals.monthly}問</strong></div>
                  <div className="goal-track"><i style={{ width: `${goalPercent(monthCount, goals.monthly)}%` }} /></div>
                </div>
              </article>
              <article className="streak-card">
                <span className="streak-icon">✦</span>
                <p>現在の連続学習</p>
                <strong>{streak}<small>日</small></strong>
                <span>{streak > 0 ? "今日も一歩ずつ続けよう" : "今日1問解くとスタート"}</span>
              </article>
            </div>
            <section className="milestone-section">
              <div className="section-heading"><div><p className="eyebrow">MILESTONES</p><h3>マイルストーン</h3></div>{nextMilestone && <span>次は {nextMilestone}問まであと{nextMilestone - solved}問</span>}</div>
              <div className="milestone-grid">
                {milestoneSteps.map((step) => {
                  const unlocked = solved >= step;
                  return <article className={unlocked ? "unlocked" : ""} key={step}><span>{unlocked ? "✓" : "◇"}</span><strong>{step}問 解決</strong><small>{unlocked ? "達成しました" : `${Math.min(solved, step)} / ${step}問`}</small></article>;
                })}
                <article className={completedMaterials > 0 ? "unlocked" : ""}><span>{completedMaterials > 0 ? "✓" : "◇"}</span><strong>教材を完走</strong><small>{completedMaterials > 0 ? `${completedMaterials}冊達成` : "最初の1冊を100%へ"}</small></article>
              </div>
            </section>
          </section>
        )}

        {view === "exam" && (
          <section className="view-panel">
            <div className="view-heading"><div><p className="eyebrow">EXAM MODE</p><h2>試験モード</h2><p>試験日と範囲を決めて、残りの学習を絞り込みます</p></div></div>
            <div className="exam-layout">
              <article className="settings-card exam-settings">
                <label className="switch-row"><span><strong>試験モード</strong><small>ホームにも残り日数を表示します</small></span><input type="checkbox" checked={exam.enabled} onChange={(event) => setExam((value) => ({ ...value, enabled: event.target.checked }))} /></label>
                <label>試験名<input value={exam.name} onChange={(event) => setExam((value) => ({ ...value, name: event.target.value }))} placeholder="例：線形代数学 中間試験" /></label>
                <label>試験日<input type="date" value={exam.date} onChange={(event) => setExam((value) => ({ ...value, date: event.target.value }))} /></label>
                <label>対象教材<select value={exam.materialId} onChange={(event) => setExam((value) => ({ ...value, materialId: event.target.value }))}>{activeMaterials.map((material) => <option value={material.id} key={material.id}>{material.title}</option>)}</select></label>
              </article>
              <article className="exam-summary">
                <p>{exam.name.trim() || "試験名を設定してください"}</p>
                <strong>{daysUntilExam === null ? "—" : daysUntilExam >= 0 ? `あと${daysUntilExam}日` : `${Math.abs(daysUntilExam)}日前`}</strong>
                <span>{examMaterial?.title ?? "対象教材なし"}</span>
                <div className="exam-stats"><div><b>{examSolved}</b><small>解決済み</small></div><div><b>{Math.max(0, examProblems.length - examSolved)}</b><small>未解決</small></div><div><b>{examReview}</b><small>復習待ち</small></div></div>
                <div className="goal-track"><i style={{ width: `${examProblems.length ? Math.round((examSolved / examProblems.length) * 100) : 0}%` }} /></div>
                {examMaterial && <button className="primary-button" onClick={() => { setSelected(examMaterial.id); setView("home"); }}>対象教材を開く</button>}
              </article>
            </div>
          </section>
        )}

        {view === "home" && (<>
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
                <span><b>{activeMaterials.length}</b> 教材</span>
              </div>
            </div>
          </article>

          <article className="heat-card">
            <div className="card-heading">
              <div><p>学習の足あと</p><h3>直近7週間</h3></div>
              <span>今日 {todayCount}問</span>
            </div>
            <div className="heatmap" aria-label="学習ヒートマップ">
              {heatDays.map((day) => <i key={day.key} data-level={day.level} title={`${formatHeatDate(day.date)}・${day.count}問`} />)}
            </div>
            <div className="heat-foot"><span>直近49日で{activeDays}日学習</span><div className="heat-legend"><span>少ない</span>{[0,1,2,3,4].map((v) => <i key={v} data-level={v} />)}<span>多い</span></div></div>
          </article>
        </section>

        <section className="quick-stats" aria-label="目標と実績">
          <button onClick={() => setView("goals")}><span>今週の目標</span><strong>{weekCount}<small> / {goals.weekly}問</small></strong><i><b style={{ width: `${goalPercent(weekCount, goals.weekly)}%` }} /></i></button>
          <button onClick={() => setView("goals")}><span>連続学習</span><strong>{streak}<small>日</small></strong><em>自己ベストを伸ばそう</em></button>
          <button onClick={() => setView("goals")}><span>マイルストーン</span><strong>{unlockedMilestones.length + (completedMaterials > 0 ? 1 : 0)}<small>個獲得</small></strong><em>{nextMilestone ? `次は${nextMilestone}問` : "すべて達成"}</em></button>
          {exam.enabled && <button className="exam-quick" onClick={() => setView("exam")}><span>{exam.name.trim() || "試験モード"}</span><strong>{daysUntilExam === null ? "日付未設定" : daysUntilExam >= 0 ? `あと${daysUntilExam}日` : "試験終了"}</strong><em>{examMaterial?.title}</em></button>}
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
          <button className="secondary-button edit-material" onClick={() => openEdit(current)}>章・問題数を設定</button>
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
                      <div className="problem-wrap" key={problem.id}>
                        <button
                          className={`problem ${problem.status}`}
                          title={`${problem.id}番・${statusLabel[problem.status]}`}
                          aria-label={`${problem.id}番、${statusLabel[problem.status]}。押すと次の状態へ`}
                          onClick={() => cycleProblem(chapter.id, problem.id)}
                        >
                          {problem.id}
                        </button>
                        {problem.status !== "todo" && (
                          <button
                            className="problem-reset"
                            title={`${problem.id}番の記録を消す`}
                            aria-label={`${problem.id}番の学習記録を消す`}
                            onClick={() => resetProblem(chapter.id, problem.id)}
                          >×</button>
                        )}
                      </div>
                    ))}
                    {chapter.problems.length === 0 && <p className="empty">この状態の問題はありません。</p>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        </>)}
      </section>

      {adding && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAdding(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" aria-label="閉じる" onClick={() => setAdding(false)}>×</button>
            <p className="eyebrow">NEW MATERIAL</p>
            <h2 id="add-title">{editingId ? "教材の構成を編集" : "新しい教材を追加"}</h2>
            <div className="form-grid">
              <label>教材名<input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="例：微分積分学 演習" /></label>
              <label>種類<select value={newKind} onChange={(e) => setNewKind(e.target.value as Material["kind"])}><option>教科書</option><option>授業</option></select></label>
            </div>
            <div className="chapter-editor">
              <div className="chapter-editor-title"><strong>章と問題数</strong><button onClick={() => setChapterDrafts((items) => [...items, { title: `第${items.length + 1}章`, count: 10 }])}>＋ 章を追加</button></div>
              {chapterDrafts.map((chapter, index) => (
                <div className="chapter-draft" key={index}>
                  <span>{index + 1}</span>
                  <input aria-label={`${index + 1}章目の名前`} value={chapter.title} onChange={(e) => setChapterDrafts((items) => items.map((item, i) => i === index ? { ...item, title: e.target.value } : item))} placeholder={`第${index + 1}章`} />
                  <label><input aria-label={`${index + 1}章目の問題数`} type="number" min="1" max="500" value={chapter.count} onChange={(e) => setChapterDrafts((items) => items.map((item, i) => i === index ? { ...item, count: Number(e.target.value) } : item))} />問</label>
                  <button aria-label={`${index + 1}章目を削除`} disabled={chapterDrafts.length === 1} onClick={() => setChapterDrafts((items) => items.filter((_, i) => i !== index))}>×</button>
                </div>
              ))}
            </div>
            <p className="modal-note">章はあとから追加・変更できます。問題数を減らすと、末尾の問題の記録は削除されます。</p>
            <button className="primary-button wide" onClick={saveMaterial}>{editingId ? "変更を保存する" : "教材を作成する"}</button>
          </div>
        </div>
      )}
    </main>
  );
}
