"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Status = "todo" | "trying" | "solved" | "with-answer" | "review";
type ProblemState = { status: Status; studiedOn?: string };
type Problem = ProblemState & { id: number; rounds?: Record<string, ProblemState> };
type Chapter = { id: string; title: string; problems: Problem[] };
type Material = {
  id: string;
  title: string;
  kind: "教科書" | "授業";
  color: string;
  chapters: Chapter[];
  archived?: boolean;
  roundCount?: number;
  activeRound?: number;
};
type View = "home" | "materials" | "review" | "history" | "goals" | "exam";
type ChapterDraft = { title: string; count: number };
type Goals = { weekly: number; monthly: number };
type ExamSettings = { id: string; enabled: boolean; name: string; date: string; materialId: string; round?: number };
type PointAward = { key: string; points: number; label: string; earnedOn: string };

const streakBonuses: Record<number, number> = {
  3: 3,
  7: 10,
  14: 25,
  30: 60,
  60: 150,
  100: 300,
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

function getRoundCount(material: Material) {
  return Math.max(1, material.roundCount ?? 1);
}

function getActiveRound(material: Material) {
  return Math.min(getRoundCount(material), Math.max(1, material.activeRound ?? 1));
}

function getProblemState(problem: Problem, round: number): ProblemState {
  if (round === 1) return { status: problem.status, studiedOn: problem.studiedOn };
  return problem.rounds?.[String(round)] ?? { status: "todo" };
}

function withProblemState(problem: Problem, round: number, state: ProblemState): Problem {
  if (round === 1) return { ...problem, ...state };
  return { ...problem, rounds: { ...problem.rounds, [String(round)]: state } };
}

function pct(chapters: Chapter[], round = 1) {
  const all = chapters.flatMap((c) => c.problems);
  const done = all.filter((problem) => {
    const state = getProblemState(problem, round);
    return state.status === "solved" || state.status === "with-answer";
  }).length;
  return all.length ? Math.round((done / all.length) * 100) : 0;
}

function studiedDays(activity: Record<string, number>) {
  return Object.entries(activity).filter(([, count]) => count > 0).map(([date]) => date);
}

function isSolvedStatus(status: Status) {
  return status === "solved" || status === "with-answer";
}

function normalizePointDays(days: unknown) {
  if (!Array.isArray(days)) return [];
  return [...new Set(days.filter((day): day is string => typeof day === "string"))].sort();
}

function streakFromDays(days: string[], date = new Date()) {
  const studied = new Set(days);
  const cursor = new Date(date);
  cursor.setHours(12, 0, 0, 0);
  if (!studied.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (studied.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function longestStreak(days: string[]) {
  const sortedDays = normalizePointDays(days);
  let longest = 0;
  let current = 0;
  let previous: Date | null = null;
  sortedDays.forEach((day) => {
    const date = new Date(`${day}T12:00:00`);
    const consecutive = previous && Math.round((date.getTime() - previous.getTime()) / 86400000) === 1;
    current = consecutive ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  });
  return longest;
}

function validPointAwards(value: unknown): PointAward[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  return value.filter((award): award is PointAward => {
    if (!award || typeof award !== "object") return false;
    const candidate = award as Partial<PointAward>;
    const valid = typeof candidate.key === "string"
      && typeof candidate.points === "number"
      && candidate.points >= 0
      && typeof candidate.label === "string"
      && typeof candidate.earnedOn === "string";
    if (!valid || seen.has(candidate.key!)) return false;
    seen.add(candidate.key!);
    return true;
  });
}

function migratePointAwards(materials: Material[], pointDays: string[], legacyPoints = 0) {
  const awards: PointAward[] = pointDays.map((day) => ({
    key: `daily:${day}`,
    points: 5,
    label: "今日の初学習",
    earnedOn: day,
  }));

  materials.forEach((material) => {
    Array.from({ length: getRoundCount(material) }, (_, index) => index + 1).forEach((round) => {
      material.chapters.forEach((chapter) => {
        chapter.problems.forEach((problem) => {
          const state = getProblemState(problem, round);
          const awardId = `${material.id}:${round}:${chapter.id}:${problem.id}`;
          const earnedOn = state.studiedOn ?? localDateKey();
          if (state.studiedOn || state.status !== "todo") {
            awards.push({ key: `start:${awardId}`, points: 1, label: "新しい問題に着手", earnedOn });
          }
          if (isSolvedStatus(state.status) || state.status === "review") {
            awards.push({ key: `solve:${awardId}`, points: 2, label: "問題を解決", earnedOn });
          }
        });
      });
      if (pct(material.chapters, round) === 100) {
        awards.push({ key: `complete:${material.id}:${round}`, points: 50, label: `${material.title} 第${round}周を完走`, earnedOn: localDateKey() });
      }
    });
  });

  const bestStreak = longestStreak(pointDays);
  Object.entries(streakBonuses).forEach(([days, points]) => {
    if (bestStreak >= Number(days)) {
      awards.push({ key: `streak:${days}`, points, label: `${days}日連続学習`, earnedOn: localDateKey() });
    }
  });

  const migratedTotal = awards.reduce((sum, award) => sum + award.points, 0);
  if (legacyPoints > migratedTotal) {
    awards.push({ key: "legacy", points: legacyPoints - migratedTotal, label: "以前のポイント", earnedOn: localDateKey() });
  }
  return awards;
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
  const [exams, setExams] = useState<ExamSettings[]>([]);
  const [pointAwards, setPointAwards] = useState<PointAward[]>([]);
  const [pointDays, setPointDays] = useState<string[]>([]);
  const [pointToast, setPointToast] = useState("");
  const [restored, setRestored] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const saved = localStorage.getItem("math-map-data");
      const savedTheme = localStorage.getItem("math-map-theme");
      const savedActivity = localStorage.getItem("math-map-activity");
      const savedGoals = localStorage.getItem("math-map-goals");
      const savedExam = localStorage.getItem("math-map-exam");
      const savedPoints = localStorage.getItem("math-map-points");
      const savedPointDays = localStorage.getItem("math-map-point-days");
      const savedPointAwards = localStorage.getItem("math-map-point-awards");
      let restoredMaterials = seed;
      let restoredActivity: Record<string, number> = {};
      if (saved) {
        try {
          restoredMaterials = JSON.parse(saved);
          setMaterials(restoredMaterials);
        } catch {}
      }
      if (savedTheme === "dark") setDark(true);
      if (savedActivity) {
        try {
          restoredActivity = JSON.parse(savedActivity);
          setActivity(restoredActivity);
        } catch {}
      }
      if (savedGoals) {
        try { setGoals(JSON.parse(savedGoals)); } catch {}
      }
      if (savedExam) {
        try {
          const parsedExam = JSON.parse(savedExam);
          setExams(Array.isArray(parsedExam) ? parsedExam : [{ ...parsedExam, id: "exam-migrated" }]);
        } catch {}
      }
      let restoredPointDays = studiedDays(restoredActivity);
      if (savedPointDays) {
        try { restoredPointDays = normalizePointDays(JSON.parse(savedPointDays)); } catch {}
      }
      restoredPointDays = normalizePointDays(restoredPointDays);
      setPointDays(restoredPointDays);
      let restoredPointAwards: PointAward[] | null = null;
      if (savedPointAwards) {
        try { restoredPointAwards = validPointAwards(JSON.parse(savedPointAwards)); } catch {}
      }
      const hasSavedProgress = Boolean(saved || savedActivity || savedPointDays || savedPoints);
      setPointAwards(restoredPointAwards ?? (hasSavedProgress ? migratePointAwards(restoredMaterials, restoredPointDays, Math.max(0, Number(savedPoints) || 0)) : []));
      localStorage.removeItem("math-map-xp");
      localStorage.removeItem("math-map-points");
      setRestored(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!restored) return;
    localStorage.setItem("math-map-data", JSON.stringify(materials));
  }, [materials, restored]);

  useEffect(() => {
    if (!restored) return;
    localStorage.setItem("math-map-theme", dark ? "dark" : "light");
  }, [dark, restored]);

  useEffect(() => {
    if (!restored) return;
    localStorage.setItem("math-map-activity", JSON.stringify(activity));
  }, [activity, restored]);

  useEffect(() => {
    if (!restored) return;
    localStorage.setItem("math-map-goals", JSON.stringify(goals));
  }, [goals, restored]);

  useEffect(() => {
    if (!restored) return;
    localStorage.setItem("math-map-exam", JSON.stringify(exams));
  }, [exams, restored]);

  useEffect(() => {
    if (!restored) return;
    localStorage.setItem("math-map-point-awards", JSON.stringify(pointAwards));
    localStorage.setItem("math-map-point-days", JSON.stringify(pointDays));
  }, [pointAwards, pointDays, restored]);

  useEffect(() => {
    if (!pointToast) return;
    const timer = window.setTimeout(() => setPointToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [pointToast]);

  const activeMaterials = materials.filter((material) => !material.archived);
  const archivedMaterials = materials.filter((material) => material.archived);
  const current = materials.find((m) => m.id === selected) ?? activeMaterials[0] ?? materials[0];
  const currentRound = current ? getActiveRound(current) : 1;
  const totalProblems = activeMaterials.flatMap((material) => {
    const round = getActiveRound(material);
    return material.chapters.flatMap((chapter) => chapter.problems.map((problem) => getProblemState(problem, round)));
  });
  const allRoundProblems = activeMaterials.flatMap((material) =>
    Array.from({ length: getRoundCount(material) }, (_, index) =>
      material.chapters.flatMap((chapter) => chapter.problems.map((problem) => getProblemState(problem, index + 1))),
    ).flat(),
  );
  const solved = allRoundProblems.filter((problem) => problem.status === "solved" || problem.status === "with-answer").length;
  const studyPoints = pointAwards.reduce((sum, award) => sum + award.points, 0);
  const currentSolved = totalProblems.filter((problem) => problem.status === "solved" || problem.status === "with-answer").length;
  const review = totalProblems.filter((problem) => problem.status === "review").length;
  const overall = totalProblems.length ? Math.round((currentSolved / totalProblems.length) * 100) : 0;
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
  const streak = useMemo(() => streakFromDays(pointDays), [pointDays]);
  const milestoneSteps = [10, 25, 50, 100, 250, 500];
  const unlockedMilestones = milestoneSteps.filter((step) => solved >= step);
  const completedRounds = activeMaterials.flatMap((material) =>
    Array.from({ length: getRoundCount(material) }, (_, index) => pct(material.chapters, index + 1) === 100),
  ).filter(Boolean).length;
  const nextMilestone = milestoneSteps.find((step) => solved < step);
  const enabledExams = exams.filter((exam) => exam.enabled);
  const nextExam = [...enabledExams].sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  })[0];
  const nextExamMaterial = nextExam ? activeMaterials.find((material) => material.id === nextExam.materialId) : undefined;
  const nextExamDays = nextExam?.date ? Math.ceil((new Date(`${nextExam.date}T12:00:00`).getTime() - now.getTime()) / 86400000) : null;
  const dateLabel = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(now);

  const filteredChapters = current?.chapters.map((chapter) => ({
    ...chapter,
    problems: chapter.problems
      .map((problem) => ({ ...problem, ...getProblemState(problem, currentRound) }))
      .filter((problem) => filter === "all" || problem.status === filter),
  })) ?? [];

  const grantPointAwards = (candidates: PointAward[]) => {
    const existingKeys = new Set(pointAwards.map((award) => award.key));
    const newAwards = candidates.filter((award) => !existingKeys.has(award.key));
    if (newAwards.length === 0) return;
    setPointAwards((awards) => {
      const currentKeys = new Set(awards.map((award) => award.key));
      return [...awards, ...candidates.filter((award) => !currentKeys.has(award.key))];
    });
    const gained = newAwards.reduce((sum, award) => sum + award.points, 0);
    setPointToast(`＋${gained} pt　${newAwards.map((award) => award.label).join("・")}`);
  };

  const cycleProblem = (chapterId: string, problemId: number) => {
    const targetProblem = current.chapters
      .find((chapter) => chapter.id === chapterId)
      ?.problems.find((problem) => problem.id === problemId);
    if (!targetProblem) return;
    const targetState = getProblemState(targetProblem, currentRound);
    const shouldRecord = !targetState.studiedOn;
    const nextStatus = statusOrder[(statusOrder.indexOf(targetState.status) + 1) % statusOrder.length];
    const today = localDateKey();
    const nextPointDays = pointDays.includes(today) ? pointDays : [...pointDays, today];
    const awardId = `${current.id}:${currentRound}:${chapterId}:${problemId}`;
    const awards: PointAward[] = [];
    if (!pointDays.includes(today)) {
      setPointDays(nextPointDays);
      awards.push({ key: `daily:${today}`, points: 5, label: "今日の初学習", earnedOn: today });
      const nextStreak = streakFromDays(nextPointDays);
      if (streakBonuses[nextStreak]) {
        awards.push({ key: `streak:${nextStreak}`, points: streakBonuses[nextStreak], label: `${nextStreak}日連続学習`, earnedOn: today });
      }
    }
    if (shouldRecord) {
      awards.push({ key: `start:${awardId}`, points: 1, label: "新しい問題に着手", earnedOn: today });
    }
    if (nextStatus === "solved") {
      awards.push({ key: `solve:${awardId}`, points: 2, label: "問題を解決", earnedOn: today });
    }
    const willCompleteRound = isSolvedStatus(nextStatus) && current.chapters.every((chapter) =>
      chapter.problems.every((problem) => {
        if (chapter.id === chapterId && problem.id === problemId) return true;
        return isSolvedStatus(getProblemState(problem, currentRound).status);
      }),
    );
    if (willCompleteRound) {
      awards.push({ key: `complete:${current.id}:${currentRound}`, points: 50, label: `${current.title} 第${currentRound}周を完走`, earnedOn: today });
    }
    grantPointAwards(awards);
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
                      problems: chapter.problems.map((problem) => problem.id !== problemId
                        ? problem
                        : withProblemState(problem, currentRound, {
                            studiedOn: targetState.studiedOn ?? today,
                            status: nextStatus,
                          })),
                    },
              ),
            },
      ),
    );
    if (shouldRecord) {
      setActivity((days) => ({ ...days, [today]: (days[today] ?? 0) + 1 }));
    }
  };

  const resetProblem = (chapterId: string, problemId: number) => {
    const targetProblem = current.chapters
      .find((chapter) => chapter.id === chapterId)
      ?.problems.find((problem) => problem.id === problemId);
    const studiedOn = targetProblem ? getProblemState(targetProblem, currentRound).studiedOn : undefined;
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
                        if (currentRound === 1) {
                          return { ...problem, studiedOn: undefined, status: "todo" as Status };
                        }
                        const rounds = { ...problem.rounds, [String(currentRound)]: { status: "todo" as Status } };
                        return { ...problem, rounds };
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

  const setMaterialRound = (materialId: string, round: number) => {
    setMaterials((items) => items.map((material) => material.id === materialId ? { ...material, activeRound: round } : material));
    setFilter("all");
  };

  const startNextRound = () => {
    const nextRound = getRoundCount(current) + 1;
    if (!window.confirm(`${current.title}の第${nextRound}周を開始しますか？\nこれまでの記録は残したまま、新しい状態で取り組めます。`)) return;
    setMaterials((items) => items.map((material) => material.id === current.id ? { ...material, roundCount: nextRound, activeRound: nextRound } : material));
    setFilter("all");
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

  const addExam = () => {
    const id = `exam-${Date.now()}`;
    setExams((items) => [...items, { id, enabled: true, name: "", date: "", materialId: activeMaterials[0]?.id ?? "", round: activeMaterials[0] ? getActiveRound(activeMaterials[0]) : 1 }]);
  };

  const updateExam = (id: string, changes: Partial<ExamSettings>) => {
    setExams((items) => items.map((exam) => exam.id === id ? { ...exam, ...changes } : exam));
  };

  const deleteExam = (id: string) => {
    if (!window.confirm("この試験を削除しますか？")) return;
    setExams((items) => items.filter((exam) => exam.id !== id));
  };

  const exportData = () => {
    const backup = {
      version: 6,
      exportedAt: new Date().toISOString(),
      materials,
      activity,
      goals,
      exams,
      studyPoints,
      pointDays,
      pointAwards,
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
      const restoredActivity = !Array.isArray(parsed) && parsed.activity && typeof parsed.activity === "object" ? parsed.activity as Record<string, number> : {};
      setActivity(restoredActivity);
      const restoredPointDays = normalizePointDays(!Array.isArray(parsed) && Array.isArray(parsed.pointDays) ? parsed.pointDays : studiedDays(restoredActivity));
      const restoredPointAwards = !Array.isArray(parsed) ? validPointAwards(parsed.pointAwards) : null;
      const legacyPoints = !Array.isArray(parsed) && typeof parsed.studyPoints === "number" ? Math.max(0, parsed.studyPoints) : 0;
      setPointDays(restoredPointDays);
      setPointAwards(restoredPointAwards ?? migratePointAwards(restoredMaterials, restoredPointDays, legacyPoints));
      if (!Array.isArray(parsed) && parsed.goals) setGoals(parsed.goals);
      if (!Array.isArray(parsed)) {
        if (Array.isArray(parsed.exams)) setExams(parsed.exams);
        else if (parsed.exam) setExams([{ ...parsed.exam, id: parsed.exam.id ?? "exam-imported" }]);
      } else {
        setExams([]);
      }
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
              <small>{pct(material.chapters, getActiveRound(material))}%</small>
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
                    <div className="material-card-progress"><strong>第{getActiveRound(material)}周・{pct(material.chapters, getActiveRound(material))}%</strong><div><i style={{ width: `${pct(material.chapters, getActiveRound(material))}%`, background: material.color }} /></div></div>
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
              {activeMaterials.flatMap((material) => {
                const round = getActiveRound(material);
                return material.chapters.flatMap((chapter) => chapter.problems.filter((problem) => getProblemState(problem, round).status === "review").map((problem) => (
                  <article className="review-item" key={`${material.id}-${round}-${chapter.id}-${problem.id}`}>
                    <span className="review-number">{problem.id}</span>
                    <div><small>{material.title}・第{round}周</small><h3>{chapter.title}・問題 {problem.id}</h3></div>
                    <button className="secondary-button" onClick={() => { setSelected(material.id); setView("home"); setFilter("review"); }}>問題を開く</button>
                  </article>
                )));
              })}
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
              <article className="point-card">
                <span className="point-icon">◆</span>
                <p>累計ポイント</p>
                <strong>{studyPoints}<small> pt</small></strong>
                <span>問題・継続・完走でポイント</span>
              </article>
            </div>
            <section className="point-rules-section">
              <div className="section-heading"><div><p className="eyebrow">POINT RULES</p><h3>ポイントの貯め方</h3></div><span>同じ記録からの重複獲得はありません</span></div>
              <div className="point-rules">
                <article><span>☀</span><div><strong>今日の初学習</strong><small>その日のスタート</small></div><b>＋5 pt</b></article>
                <article><span>↗</span><div><strong>新しい問題に着手</strong><small>1問・1周につき初回</small></div><b>＋1 pt</b></article>
                <article><span>✓</span><div><strong>問題を解決</strong><small>1問・1周につき初回</small></div><b>＋2 pt</b></article>
                <article><span>✦</span><div><strong>連続学習</strong><small>3・7・14・30日など</small></div><b>＋3〜300 pt</b></article>
                <article><span>旗</span><div><strong>教材を100%完走</strong><small>教材の1周ごと</small></div><b>＋50 pt</b></article>
              </div>
            </section>
            <section className="milestone-section">
              <div className="section-heading"><div><p className="eyebrow">MILESTONES</p><h3>マイルストーン</h3></div>{nextMilestone && <span>次は {nextMilestone}問まであと{nextMilestone - solved}問</span>}</div>
              <div className="milestone-grid">
                {milestoneSteps.map((step) => {
                  const unlocked = solved >= step;
                  return <article className={unlocked ? "unlocked" : ""} key={step}><span>{unlocked ? "✓" : "◇"}</span><strong>{step}問 解決</strong><small>{unlocked ? "達成しました" : `${Math.min(solved, step)} / ${step}問`}</small></article>;
                })}
                <article className={completedRounds > 0 ? "unlocked" : ""}><span>{completedRounds > 0 ? "✓" : "◇"}</span><strong>教材を完走</strong><small>{completedRounds > 0 ? `${completedRounds}周達成` : "最初の1周を100%へ"}</small></article>
              </div>
            </section>
          </section>
        )}

        {view === "exam" && (
          <section className="view-panel">
            <div className="view-heading"><div><p className="eyebrow">EXAM MODE</p><h2>試験モード</h2><p>複数の試験日と範囲をまとめて管理できます</p></div><button className="primary-button" onClick={addExam}>＋ 試験を追加</button></div>
            <div className="exam-list">
              {exams.map((exam) => {
                const material = activeMaterials.find((item) => item.id === exam.materialId) ?? activeMaterials[0];
                const round = material ? Math.min(getRoundCount(material), Math.max(1, exam.round ?? getActiveRound(material))) : 1;
                const problems = material?.chapters.flatMap((chapter) => chapter.problems.map((problem) => getProblemState(problem, round))) ?? [];
                const solvedCount = problems.filter((problem) => problem.status === "solved" || problem.status === "with-answer").length;
                const reviewCount = problems.filter((problem) => problem.status === "review").length;
                const days = exam.date ? Math.ceil((new Date(`${exam.date}T12:00:00`).getTime() - now.getTime()) / 86400000) : null;
                return (
                  <article className="exam-card" key={exam.id}>
                    <div className="exam-settings">
                      <label className="switch-row"><span><strong>{exam.name.trim() || "新しい試験"}</strong><small>ホームの直近試験に表示</small></span><input type="checkbox" checked={exam.enabled} onChange={(event) => updateExam(exam.id, { enabled: event.target.checked })} /></label>
                      <label>試験名<input value={exam.name} onChange={(event) => updateExam(exam.id, { name: event.target.value })} placeholder="例：線形代数学 中間試験" /></label>
                      <label>試験日<input type="date" value={exam.date} onChange={(event) => updateExam(exam.id, { date: event.target.value })} /></label>
                      <label>対象教材<select value={exam.materialId} onChange={(event) => { const materialId = event.target.value; const selectedMaterial = activeMaterials.find((item) => item.id === materialId); updateExam(exam.id, { materialId, round: selectedMaterial ? getActiveRound(selectedMaterial) : 1 }); }}>{activeMaterials.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
                      {material && <label>対象の周<select value={round} onChange={(event) => updateExam(exam.id, { round: Number(event.target.value) })}>{Array.from({ length: getRoundCount(material) }, (_, index) => <option value={index + 1} key={index + 1}>第{index + 1}周</option>)}</select></label>}
                      <button className="danger-button" onClick={() => deleteExam(exam.id)}>試験を削除</button>
                    </div>
                    <div className="exam-summary">
                      <p>{exam.name.trim() || "試験名を設定してください"}</p>
                      <strong>{days === null ? "—" : days >= 0 ? `あと${days}日` : `${Math.abs(days)}日前`}</strong>
                      <span>{material ? `${material.title}・第${round}周` : "対象教材なし"}</span>
                      <div className="exam-stats"><div><b>{solvedCount}</b><small>解決済み</small></div><div><b>{Math.max(0, problems.length - solvedCount)}</b><small>未解決</small></div><div><b>{reviewCount}</b><small>復習待ち</small></div></div>
                      <div className="goal-track"><i style={{ width: `${problems.length ? Math.round((solvedCount / problems.length) * 100) : 0}%` }} /></div>
                      {material && <button className="primary-button" onClick={() => { setSelected(material.id); setView("home"); }}>対象教材を開く</button>}
                    </div>
                  </article>
                );
              })}
              {exams.length === 0 && <div className="empty-state"><strong>試験はまだ登録されていません</strong><p>試験日を登録すると、残り日数と対象教材の進捗を確認できます。</p><button className="primary-button" onClick={addExam}>最初の試験を追加</button></div>}
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
          <button className="point-quick" onClick={() => setView("goals")}><span>累計ポイント</span><strong>{studyPoints}<small> pt</small></strong><em>{pointDays.includes(localDateKey()) ? "今日の初学習ボーナス獲得済み" : "今日の最初の学習で＋5"}</em></button>
          <button onClick={() => setView("goals")}><span>今週の目標</span><strong>{weekCount}<small> / {goals.weekly}問</small></strong><i><b style={{ width: `${goalPercent(weekCount, goals.weekly)}%` }} /></i></button>
          <button onClick={() => setView("goals")}><span>連続学習</span><strong>{streak}<small>日</small></strong><em>自己ベストを伸ばそう</em></button>
          <button onClick={() => setView("goals")}><span>マイルストーン</span><strong>{unlockedMilestones.length + (completedRounds > 0 ? 1 : 0)}<small>個獲得</small></strong><em>{nextMilestone ? `次は${nextMilestone}問` : "すべて達成"}</em></button>
          {nextExam && <button className="exam-quick" onClick={() => setView("exam")}><span>{nextExam.name.trim() || "直近の試験"}</span><strong>{nextExamDays === null ? "日付未設定" : nextExamDays >= 0 ? `あと${nextExamDays}日` : "試験終了"}</strong><em>{nextExamMaterial?.title}</em></button>}
        </section>

        <section className="material-head">
          <div className="book-title">
            <span style={{ background: current.color }}>{current.kind === "授業" ? "授" : "本"}</span>
            <div><p>{current.kind}</p><h2>{current.title}</h2></div>
          </div>
          <div className="material-progress">
            <div><span>第{currentRound}周の進捗</span><strong>{pct(current.chapters, currentRound)}%</strong></div>
            <div className="progress-track"><i style={{ width: `${pct(current.chapters, currentRound)}%`, background: current.color }} /></div>
          </div>
          <div className="material-head-actions">
            <select aria-label="表示する周回" value={currentRound} onChange={(event) => setMaterialRound(current.id, Number(event.target.value))}>{Array.from({ length: getRoundCount(current) }, (_, index) => <option value={index + 1} key={index + 1}>第{index + 1}周</option>)}</select>
            <button className="secondary-button" onClick={startNextRound}>＋ 次の周を開始</button>
            <button className="secondary-button edit-material" onClick={() => openEdit(current)}>章・問題数を設定</button>
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
                      <h4>{chapter.title}</h4><p>{original.problems.length}問中 {original.problems.filter((problem) => { const state = getProblemState(problem, currentRound); return state.status === "solved" || state.status === "with-answer"; }).length}問 解決</p>
                    </div>
                    <div className="chapter-pct">
                      <span>{pct([original], currentRound)}%</span>
                      <div><i style={{ width: `${pct([original], currentRound)}%`, background: current.color }} /></div>
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
      {pointToast && <div className="point-toast" role="status" aria-live="polite">{pointToast}</div>}
    </main>
  );
}
