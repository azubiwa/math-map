"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { cloudSyncConfigured, supabase } from "@/lib/supabase";

type Status = "todo" | "trying" | "solved" | "with-answer";
type StudyMode = "exercise" | "reading";
type StudyUnit = "問" | "節" | "ページ" | "項目";
type MaterialKind = "教科書" | "参考書" | "授業";
type ProblemState = {
  status: Status;
  studiedOn?: string;
};
type Problem = ProblemState & { id: number; rounds?: Record<string, ProblemState> };
type Chapter = { id: string; title: string; problems: Problem[]; readingItems?: Problem[] };
type Material = {
  id: string;
  title: string;
  kind: MaterialKind;
  color: string;
  chapters: Chapter[];
  studyMode?: StudyMode;
  unit?: StudyUnit;
  activeTrack?: StudyMode;
  exerciseEnabled?: boolean;
  readingEnabled?: boolean;
  exerciseUnit?: StudyUnit;
  readingUnit?: StudyUnit;
  exerciseRoundCount?: number;
  exerciseActiveRound?: number;
  readingRoundCount?: number;
  readingActiveRound?: number;
  archived?: boolean;
  roundCount?: number;
  activeRound?: number;
};
type View = "home" | "materials" | "history" | "goals" | "exam";
type ProblemFilter = Status | "all";
type ChapterDraft = { id?: string; title: string; exerciseCount: number; readingCount: number };
type Goals = { weekly: number; monthly: number };
type ExamSettings = { id: string; enabled: boolean; name: string; date: string; materialId: string; round?: number };
type PointAward = { key: string; points: number; label: string; earnedOn: string };
type StudyEvent = {
  id: string;
  type: "study" | "solve";
  date: string;
  problemKey?: string;
};
type TimedReward = { id: string; unlockAt: string; expiresAt: string };
type TimedRewardState = { solvedProgress: number; rewards: TimedReward[] };
type StudySnapshot = {
  version: number;
  exportedAt: string;
  materials: Material[];
  activity: Record<string, number>;
  goals: Goals;
  exams: ExamSettings[];
  pointDays: string[];
  pointAwards: PointAward[];
  studyEvents: StudyEvent[];
  timedRewardState: TimedRewardState;
};
type PendingCloudData = { snapshot: StudySnapshot; updatedAt: string };
type SyncStatus = "local" | "checking" | "choose" | "synced" | "error";

const dailyTargets = { study: 3, solve: 2 };
const weeklyTarget = 100;
const timedRewardRequiredSolves = 5;
const timedRewardDelayMs = 3 * 60 * 60 * 1000;
const timedRewardWindowMs = 24 * 60 * 60 * 1000;
const exerciseCompletionPoints = 2;
const readingCompletionPoints = 5;

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
];

const statusLabel: Record<Status, string> = {
  todo: "未着手",
  trying: "取組中",
  solved: "完了（自力・読了）",
  "with-answer": "完了（参照）",
};

const exerciseStatusLabel: Record<Status, string> = {
  todo: "未着手",
  trying: "取組中",
  solved: "自力で解決",
  "with-answer": "解答を見て解決",
};

const readingStatusLabel: Record<Status, string> = {
  todo: "未着手",
  trying: "読書中",
  solved: "読了",
  "with-answer": "読了",
};

function getPrimaryMode(material: Material): StudyMode {
  return material.studyMode === "reading" ? "reading" : "exercise";
}

function isTrackEnabled(material: Material, mode: StudyMode) {
  if (mode === "exercise" && typeof material.exerciseEnabled === "boolean") return material.exerciseEnabled;
  if (mode === "reading" && typeof material.readingEnabled === "boolean") return material.readingEnabled;
  return getPrimaryMode(material) === mode;
}

function getEnabledModes(material: Material): StudyMode[] {
  return (["reading", "exercise"] as StudyMode[]).filter((mode) => isTrackEnabled(material, mode));
}

function getStudyMode(material: Material): StudyMode {
  if (material.activeTrack && isTrackEnabled(material, material.activeTrack)) return material.activeTrack;
  const primary = getPrimaryMode(material);
  return isTrackEnabled(material, primary) ? primary : getEnabledModes(material)[0] ?? "exercise";
}

function getStudyUnit(material: Material, mode = getStudyMode(material)): StudyUnit {
  const explicit = mode === "reading" ? material.readingUnit : material.exerciseUnit;
  if (explicit) return explicit;
  if (getPrimaryMode(material) === mode && material.unit) return material.unit;
  return mode === "reading" ? "節" : "問";
}

function getChapterItems(chapter: Chapter, mode: StudyMode) {
  return mode === "reading" ? chapter.readingItems ?? [] : chapter.problems;
}

function withChapterItems(chapter: Chapter, mode: StudyMode, items: Problem[]): Chapter {
  return mode === "reading" ? { ...chapter, readingItems: items } : { ...chapter, problems: items };
}

function getTrackLabel(mode: StudyMode) {
  return mode === "reading" ? "読む" : "演習";
}

function getStatusOrder(material: Material, mode = getStudyMode(material)) {
  return mode === "reading" ? statusOrder.filter((status) => status !== "with-answer") : statusOrder;
}

function getStatusLabel(material: Material, status: Status, mode = getStudyMode(material)) {
  return mode === "reading" ? readingStatusLabel[status] : exerciseStatusLabel[status];
}

function getCompletionLabel(material: Material, mode = getStudyMode(material)) {
  return mode === "reading" ? "読了" : "解決";
}

const linearSeedStatuses: Status[] = ["solved", "solved", "with-answer", "solved", "todo", "trying", "solved", "todo", "todo", "with-answer", "solved", "todo", "solved", "todo"];

const seed: Material[] = [
  {
    id: "linear",
    title: "線形代数学入門",
    kind: "教科書",
    color: "#3b82f6",
    studyMode: "exercise",
    unit: "問",
    chapters: [
      {
        id: "l1",
        title: "第1章 ベクトルと行列",
        problems: linearSeedStatuses.map((status, i) => ({
          id: i + 1,
          status,
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
    studyMode: "exercise",
    unit: "問",
    chapters: [
      {
        id: "a1",
        title: "第1回 数列の極限",
        problems: Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          ...(i < 6
            ? { status: "solved" as Status }
            : i === 6
              ? { status: "solved" as Status }
              : { status: "todo" as Status }),
        })),
      },
    ],
  },
  {
    id: "probability",
    title: "確率・統計",
    kind: "教科書",
    color: "#275eb7",
    studyMode: "exercise",
    unit: "問",
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

function endOfWeek(date = new Date()) {
  const end = startOfWeek(date);
  end.setDate(end.getDate() + 7);
  end.setHours(0, 0, 0, 0);
  return end;
}

function sumActivity(activity: Record<string, number>, from: Date, to: Date) {
  return Object.entries(activity).reduce((sum, [key, count]) => {
    const date = new Date(`${key}T12:00:00`);
    return date >= from && date <= to ? sum + count : sum;
  }, 0);
}

function getRoundCount(material: Material, mode = getStudyMode(material)) {
  const explicit = mode === "reading" ? material.readingRoundCount : material.exerciseRoundCount;
  const legacy = getPrimaryMode(material) === mode ? material.roundCount : undefined;
  return Math.max(1, explicit ?? legacy ?? 1);
}

function getActiveRound(material: Material, mode = getStudyMode(material)) {
  const explicit = mode === "reading" ? material.readingActiveRound : material.exerciseActiveRound;
  const legacy = getPrimaryMode(material) === mode ? material.activeRound : undefined;
  return Math.min(getRoundCount(material, mode), Math.max(1, explicit ?? legacy ?? 1));
}

function getProblemState(problem: Problem, round: number): ProblemState {
  if (round === 1) {
    return {
      status: problem.status,
      studiedOn: problem.studiedOn,
    };
  }
  return problem.rounds?.[String(round)] ?? { status: "todo" };
}

function withProblemState(problem: Problem, round: number, state: ProblemState): Problem {
  if (round === 1) return { ...problem, ...state };
  return { ...problem, rounds: { ...problem.rounds, [String(round)]: state } };
}

function normalizeProblemState(value: unknown, studyMode: StudyMode): ProblemState {
  const candidate = value && typeof value === "object" ? value as Partial<ProblemState> : {};
  const validStatus = candidate.status === "todo"
    || candidate.status === "trying"
    || candidate.status === "solved"
    || candidate.status === "with-answer";
  let status: Status = validStatus ? candidate.status as Status : "todo";
  if (studyMode === "reading" && status === "with-answer") status = "solved";
  return {
    status,
    studiedOn: typeof candidate.studiedOn === "string" ? candidate.studiedOn : undefined,
  };
}

function normalizeProblem(problem: Problem, studyMode: StudyMode): Problem {
  const baseState = normalizeProblemState(problem, studyMode);
  const rounds = problem.rounds && typeof problem.rounds === "object"
    ? Object.fromEntries(Object.entries(problem.rounds).map(([round, state]) => [round, normalizeProblemState(state, studyMode)]))
    : undefined;
  return { id: problem.id, ...baseState, rounds };
}

function normalizeMaterials(value: unknown): Material[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  try {
    return value.map((rawMaterial, materialIndex) => {
      if (!rawMaterial || typeof rawMaterial !== "object") throw new Error("invalid material");
      const candidate = rawMaterial as Partial<Material>;
      const studyMode: StudyMode = candidate.studyMode === "reading" ? "reading" : "exercise";
      const unit: StudyUnit = candidate.unit === "節" || candidate.unit === "ページ" || candidate.unit === "項目"
        ? candidate.unit
        : "問";
      const exerciseEnabled = typeof candidate.exerciseEnabled === "boolean" ? candidate.exerciseEnabled : studyMode === "exercise";
      const readingEnabled = typeof candidate.readingEnabled === "boolean" ? candidate.readingEnabled : studyMode === "reading";
      const activeTrack = candidate.activeTrack === "reading" && readingEnabled
        ? "reading"
        : candidate.activeTrack === "exercise" && exerciseEnabled
          ? "exercise"
          : studyMode === "reading" && readingEnabled
            ? "reading"
            : exerciseEnabled
              ? "exercise"
              : "reading";
      if (!Array.isArray(candidate.chapters) || candidate.chapters.length === 0) throw new Error("invalid chapters");
      const chapters = candidate.chapters.map((rawChapter, chapterIndex) => {
        if (!rawChapter || typeof rawChapter !== "object" || !Array.isArray(rawChapter.problems)) throw new Error("invalid chapter");
        const normalizeRawItems = (items: unknown[], mode: StudyMode) => items.map((rawProblem, problemIndex) => {
          if (!rawProblem || typeof rawProblem !== "object") throw new Error("invalid problem");
          const problem = rawProblem as Problem;
          return normalizeProblem({ ...problem, id: typeof problem.id === "number" ? problem.id : problemIndex + 1 }, mode);
        });
        const rawReadingItems = Array.isArray(rawChapter.readingItems) ? rawChapter.readingItems : null;
        const readingItems = rawReadingItems
          ? normalizeRawItems(rawReadingItems, "reading")
          : studyMode === "reading"
            ? normalizeRawItems(rawChapter.problems, "reading")
            : [];
        const problems = studyMode === "reading" && !rawReadingItems ? [] : normalizeRawItems(rawChapter.problems, "exercise");
        return {
          ...rawChapter,
          id: typeof rawChapter.id === "string" ? rawChapter.id : `chapter-${materialIndex}-${chapterIndex}`,
          title: typeof rawChapter.title === "string" ? rawChapter.title : `第${chapterIndex + 1}章`,
          problems,
          readingItems,
        };
      });
      return {
        ...candidate,
        id: typeof candidate.id === "string" ? candidate.id : `material-${materialIndex}`,
        title: typeof candidate.title === "string" ? candidate.title : `教材 ${materialIndex + 1}`,
        kind: candidate.kind === "授業" || candidate.kind === "参考書" ? candidate.kind : "教科書",
        color: typeof candidate.color === "string" ? candidate.color : "#3b82f6",
        studyMode,
        unit: studyMode === "reading" && candidate.unit === undefined ? "節" : unit,
        activeTrack,
        exerciseEnabled,
        readingEnabled,
        exerciseUnit: candidate.exerciseUnit ?? (studyMode === "exercise" ? unit : "問"),
        readingUnit: candidate.readingUnit ?? (studyMode === "reading" ? (candidate.unit ?? "節") : "節"),
        exerciseRoundCount: candidate.exerciseRoundCount ?? (studyMode === "exercise" ? candidate.roundCount : undefined),
        exerciseActiveRound: candidate.exerciseActiveRound ?? (studyMode === "exercise" ? candidate.activeRound : undefined),
        readingRoundCount: candidate.readingRoundCount ?? (studyMode === "reading" ? candidate.roundCount : undefined),
        readingActiveRound: candidate.readingActiveRound ?? (studyMode === "reading" ? candidate.activeRound : undefined),
        chapters,
      };
    });
  } catch {
    return null;
  }
}

function pct(chapters: Chapter[], round = 1, mode: StudyMode = "exercise") {
  const all = chapters.flatMap((chapter) => getChapterItems(chapter, mode));
  const done = all.filter((problem) => {
    const state = getProblemState(problem, round);
    return state.status === "solved" || state.status === "with-answer";
  }).length;
  return all.length ? Math.round((done / all.length) * 100) : 0;
}

function materialPct(material: Material) {
  const modes = getEnabledModes(material);
  if (modes.length === 0) return 0;
  return Math.round(modes.reduce((sum, mode) => sum + pct(material.chapters, getActiveRound(material, mode), mode), 0) / modes.length);
}

function trackAwardId(material: Material, mode: StudyMode, round: number, chapterId: string, itemId?: number) {
  const modePart = mode === getPrimaryMode(material) ? "" : `:${mode}`;
  return `${material.id}${modePart}:${round}:${chapterId}${itemId === undefined ? "" : `:${itemId}`}`;
}

function trackRoundAwardId(material: Material, mode: StudyMode, round: number) {
  const modePart = mode === getPrimaryMode(material) ? "" : `:${mode}`;
  return `${material.id}${modePart}:${round}`;
}

function studiedDays(activity: Record<string, number>) {
  return Object.entries(activity).filter(([, count]) => count > 0).map(([date]) => date);
}

function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000);
}

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const time = [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  return days > 0 ? `${days}日 ${time}` : time;
}

function validStudyEvents(value: unknown): StudyEvent[] | null {
  if (!Array.isArray(value)) return null;
  const ids = new Set<string>();
  return value.filter((event): event is StudyEvent => {
    if (!event || typeof event !== "object") return false;
    const candidate = event as Partial<StudyEvent>;
    const valid = typeof candidate.id === "string"
      && (candidate.type === "study" || candidate.type === "solve")
      && typeof candidate.date === "string";
    if (!valid || ids.has(candidate.id!)) return false;
    ids.add(candidate.id!);
    return true;
  });
}

function migrateStudyEvents(activity: Record<string, number>) {
  return Object.entries(activity).flatMap(([date, count]) =>
    Array.from({ length: Math.max(0, count) }, (_, index): StudyEvent => ({
      id: `migrated:${date}:${index}`,
      type: "study",
      date,
    })),
  );
}

function validTimedRewardState(value: unknown): TimedRewardState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TimedRewardState>;
  if (typeof candidate.solvedProgress !== "number" || !Number.isFinite(candidate.solvedProgress) || !Array.isArray(candidate.rewards)) return null;
  const rewards = candidate.rewards.filter((reward): reward is TimedReward => Boolean(
    reward
    && typeof reward.id === "string"
    && typeof reward.unlockAt === "string"
    && typeof reward.expiresAt === "string",
  ));
  return { solvedProgress: Math.max(0, Math.floor(candidate.solvedProgress ?? 0)), rewards };
}

function validStudySnapshot(value: unknown): StudySnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StudySnapshot>;
  const materials = normalizeMaterials(candidate.materials);
  if (!materials) return null;
  const activity = candidate.activity && typeof candidate.activity === "object" ? candidate.activity : {};
  const goals = candidate.goals && typeof candidate.goals === "object" ? candidate.goals : { weekly: 20, monthly: 80 };
  const pointDays = normalizePointDays(Array.isArray(candidate.pointDays) ? candidate.pointDays : studiedDays(activity));
  const pointAwards = validPointAwards(candidate.pointAwards) ?? migratePointAwards(materials, pointDays, 0);
  const studyEvents = validStudyEvents(candidate.studyEvents) ?? migrateStudyEvents(activity);
  const timedRewards = validTimedRewardState(candidate.timedRewardState) ?? { solvedProgress: 0, rewards: [] };
  return {
    version: typeof candidate.version === "number" ? candidate.version : 1,
    exportedAt: typeof candidate.exportedAt === "string" ? candidate.exportedAt : new Date().toISOString(),
    materials,
    activity,
    goals,
    exams: Array.isArray(candidate.exams) ? candidate.exams : [],
    pointDays,
    pointAwards,
    studyEvents,
    timedRewardState: timedRewards,
  };
}

async function loadCloudSnapshot(userId: string): Promise<PendingCloudData | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("math_map_snapshots")
    .select("data, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const snapshot = validStudySnapshot(data.data);
  if (!snapshot) throw new Error("クラウドデータの形式を確認できませんでした");
  return { snapshot, updatedAt: data.updated_at };
}

async function saveCloudSnapshot(userId: string, snapshot: StudySnapshot) {
  if (!supabase) throw new Error("クラウド同期が設定されていません");
  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from("math_map_snapshots").upsert({
    user_id: userId,
    data: snapshot,
    version: snapshot.version,
    updated_at: updatedAt,
  }, { onConflict: "user_id" });
  if (error) throw error;
  return updatedAt;
}

function dailyEventProgress(events: StudyEvent[], date: string) {
  const todayEvents = events.filter((event) => event.date === date);
  return {
    study: todayEvents.filter((event) => event.type === "study").length,
    solve: todayEvents.filter((event) => event.type === "solve").length,
  };
}

function weeklyEventScore(events: StudyEvent[], from: string, to: string) {
  return events.reduce((score, event) => {
    if (event.date < from || event.date >= to) return score;
    if (event.type === "solve") return score + 3;
    return score + 1;
  }, 0);
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

function applyCurrentPointWeights(awards: PointAward[]) {
  return awards.map((award) => award.key.startsWith("solve:") && award.label.endsWith("を読了")
    ? { ...award, points: readingCompletionPoints }
    : award);
}

function migratePointAwards(materials: Material[], pointDays: string[], legacyPoints = 0) {
  const awards: PointAward[] = pointDays.map((day) => ({
    key: `daily:${day}`,
    points: 5,
    label: "本日の初回学習",
    earnedOn: day,
  }));

  materials.forEach((material) => {
    getEnabledModes(material).forEach((mode) => {
      Array.from({ length: getRoundCount(material, mode) }, (_, index) => index + 1).forEach((round) => {
        material.chapters.forEach((chapter) => {
          getChapterItems(chapter, mode).forEach((problem) => {
            const state = getProblemState(problem, round);
            const awardId = trackAwardId(material, mode, round, chapter.id, problem.id);
            const earnedOn = state.studiedOn ?? localDateKey();
            if (state.studiedOn || state.status !== "todo") {
              awards.push({ key: `start:${awardId}`, points: 1, label: `新しい${getStudyUnit(material, mode)}に着手`, earnedOn });
            }
            if (isSolvedStatus(state.status)) {
              awards.push({ key: `solve:${awardId}`, points: mode === "reading" ? readingCompletionPoints : exerciseCompletionPoints, label: mode === "reading" ? `${getStudyUnit(material, mode)}を読了` : "問題を解決", earnedOn });
            }
          });
          if (getChapterItems(chapter, mode).length > 0 && pct([chapter], round, mode) === 100) {
            awards.push({ key: `chapter:${trackAwardId(material, mode, round, chapter.id)}`, points: 15, label: `${chapter.title}の${getTrackLabel(mode)}を完了`, earnedOn: localDateKey() });
          }
        });
        if (pct(material.chapters, round, mode) === 100) {
          awards.push({ key: `complete:${trackRoundAwardId(material, mode, round)}`, points: 50, label: `${material.title}の${getTrackLabel(mode)} 第${round}周を完了`, earnedOn: localDateKey() });
        }
      });
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
  const [filter, setFilter] = useState<ProblemFilter>("all");
  const [view, setView] = useState<View>("home");
  const [dark, setDark] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<Material["kind"]>("教科書");
  const [newExerciseEnabled, setNewExerciseEnabled] = useState(true);
  const [newReadingEnabled, setNewReadingEnabled] = useState(false);
  const [newExerciseUnit, setNewExerciseUnit] = useState<StudyUnit>("問");
  const [newReadingUnit, setNewReadingUnit] = useState<StudyUnit>("節");
  const [chapterDrafts, setChapterDrafts] = useState<ChapterDraft[]>([
    { title: "第1章", exerciseCount: 10, readingCount: 0 },
  ]);
  const [activity, setActivity] = useState<Record<string, number>>({});
  const [goals, setGoals] = useState<Goals>({ weekly: 20, monthly: 80 });
  const [exams, setExams] = useState<ExamSettings[]>([]);
  const [pointAwards, setPointAwards] = useState<PointAward[]>([]);
  const [pointDays, setPointDays] = useState<string[]>([]);
  const [studyEvents, setStudyEvents] = useState<StudyEvent[]>([]);
  const [timedRewardState, setTimedRewardState] = useState<TimedRewardState>({ solvedProgress: 0, rewards: [] });
  const [pointToast, setPointToast] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const [restored, setRestored] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncEmail, setSyncEmail] = useState("");
  const [syncUser, setSyncUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [syncMessage, setSyncMessage] = useState("");
  const [pendingCloudData, setPendingCloudData] = useState<PendingCloudData | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [syncRefresh, setSyncRefresh] = useState(0);
  const importInput = useRef<HTMLInputElement>(null);
  const skipNextCloudPush = useRef(false);
  const lastSyncedAtRef = useRef("");
  const latestSnapshotRef = useRef<StudySnapshot>({
    version: 13,
    exportedAt: new Date().toISOString(),
    materials: seed,
    activity: {},
    goals: { weekly: 20, monthly: 80 },
    exams: [],
    pointDays: [],
    pointAwards: [],
    studyEvents: [],
    timedRewardState: { solvedProgress: 0, rewards: [] },
  });
  const applyStudySnapshot = useCallback((snapshot: StudySnapshot) => {
    skipNextCloudPush.current = true;
    setMaterials(snapshot.materials);
    setActivity(snapshot.activity);
    setGoals(snapshot.goals);
    setExams(snapshot.exams);
    setPointDays(snapshot.pointDays);
    setPointAwards(applyCurrentPointWeights(snapshot.pointAwards));
    setStudyEvents(snapshot.studyEvents);
    setTimedRewardState(snapshot.timedRewardState);
    setSelected(snapshot.materials[0].id);
    setView("home");
  }, []);

  useEffect(() => {
    latestSnapshotRef.current = {
      version: 13,
      exportedAt: new Date().toISOString(),
      materials,
      activity,
      goals,
      exams,
      pointDays,
      pointAwards,
      studyEvents,
      timedRewardState,
    };
  }, [activity, exams, goals, materials, pointAwards, pointDays, studyEvents, timedRewardState]);

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
      const savedStudyEvents = localStorage.getItem("math-map-study-events");
      const savedTimedRewards = localStorage.getItem("math-map-timed-rewards");
      let restoredMaterials = seed;
      let restoredActivity: Record<string, number> = {};
      if (saved) {
        try {
          const normalizedMaterials = normalizeMaterials(JSON.parse(saved));
          if (normalizedMaterials) {
            restoredMaterials = normalizedMaterials;
            setMaterials(restoredMaterials);
          }
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
      setPointAwards(applyCurrentPointWeights(restoredPointAwards ?? (hasSavedProgress ? migratePointAwards(restoredMaterials, restoredPointDays, Math.max(0, Number(savedPoints) || 0)) : [])));
      let restoredStudyEvents: StudyEvent[] | null = null;
      if (savedStudyEvents) {
        try { restoredStudyEvents = validStudyEvents(JSON.parse(savedStudyEvents)); } catch {}
      }
      setStudyEvents(restoredStudyEvents ?? migrateStudyEvents(restoredActivity));
      if (savedTimedRewards) {
        try {
          const restoredTimedRewards = validTimedRewardState(JSON.parse(savedTimedRewards));
          if (restoredTimedRewards) setTimedRewardState(restoredTimedRewards);
        } catch {}
      }
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
    if (!restored) return;
    localStorage.setItem("math-map-study-events", JSON.stringify(studyEvents));
    localStorage.setItem("math-map-timed-rewards", JSON.stringify(timedRewardState));
  }, [restored, studyEvents, timedRewardState]);

  useEffect(() => {
    if (!restored || !supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSyncUser(data.session?.user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setSyncUser(session?.user ?? null);
      if (!session) {
        setSyncStatus("local");
        setPendingCloudData(null);
        setLastSyncedAt("");
        lastSyncedAtRef.current = "";
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [restored]);

  const syncUserId = syncUser?.id ?? "";

  useEffect(() => {
    if (!restored || !supabase || !syncUserId) return;
    let active = true;
    const initializeCloudSync = async () => {
      setSyncStatus("checking");
      setSyncMessage("");
      try {
        const cloud = await loadCloudSnapshot(syncUserId);
        if (!active) return;
        if (!cloud) {
          const updatedAt = await saveCloudSnapshot(syncUserId, latestSnapshotRef.current);
          if (!active) return;
          localStorage.setItem("math-map-cloud-user", syncUserId);
          lastSyncedAtRef.current = updatedAt;
          setLastSyncedAt(updatedAt);
          setSyncStatus("synced");
          setSyncMessage("この端末のデータをクラウドへ保存しました。");
          return;
        }
        if (localStorage.getItem("math-map-cloud-user") === syncUserId) {
          applyStudySnapshot(cloud.snapshot);
          lastSyncedAtRef.current = cloud.updatedAt;
          setLastSyncedAt(cloud.updatedAt);
          setSyncStatus("synced");
          setSyncMessage("クラウドの最新データを反映しました。");
          return;
        }
        setPendingCloudData(cloud);
        setSyncStatus("choose");
      } catch {
        if (!active) return;
        setSyncStatus("error");
        setSyncMessage("クラウドに接続できませんでした。設定を確認して再試行してください。");
      }
    };
    void initializeCloudSync();
    return () => { active = false; };
  }, [applyStudySnapshot, restored, syncRefresh, syncUserId]);

  useEffect(() => {
    if (!restored || !supabase || !syncUserId || syncStatus !== "synced") return;
    if (skipNextCloudPush.current) {
      skipNextCloudPush.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void saveCloudSnapshot(syncUserId, latestSnapshotRef.current).then((updatedAt) => {
        localStorage.setItem("math-map-cloud-user", syncUserId);
        lastSyncedAtRef.current = updatedAt;
        setLastSyncedAt(updatedAt);
        setSyncMessage("変更を同期しました。");
      }).catch(() => {
        setSyncStatus("error");
        setSyncMessage("変更は端末に保存されています。クラウドへの同期を再試行してください。");
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [activity, exams, goals, materials, pointAwards, pointDays, restored, studyEvents, syncStatus, syncUserId, timedRewardState]);

  useEffect(() => {
    if (!supabase || !syncUserId || syncStatus !== "synced") return;
    let active = true;
    const pullLatest = async () => {
      try {
        const cloud = await loadCloudSnapshot(syncUserId);
        if (!active || !cloud || cloud.updatedAt <= lastSyncedAtRef.current) return;
        applyStudySnapshot(cloud.snapshot);
        lastSyncedAtRef.current = cloud.updatedAt;
        setLastSyncedAt(cloud.updatedAt);
        setSyncMessage("別の端末での変更を反映しました。");
      } catch {
        // 自動確認に失敗しても端末内保存は継続する。
      }
    };
    const handleFocus = () => { void pullLatest(); };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void pullLatest();
    };
    const timer = window.setInterval(() => { void pullLatest(); }, 60000);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [applyStudySnapshot, syncStatus, syncUserId]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!pointToast) return;
    const timer = window.setTimeout(() => setPointToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [pointToast]);

  const activeMaterials = materials.filter((material) => !material.archived);
  const archivedMaterials = materials.filter((material) => material.archived);
  const current = materials.find((m) => m.id === selected) ?? activeMaterials[0] ?? materials[0];
  const currentMode = current ? getStudyMode(current) : "exercise";
  const currentRound = current ? getActiveRound(current, currentMode) : 1;
  const now = new Date(clock);
  const todayKey = localDateKey(now);
  const totalProblems = activeMaterials.flatMap((material) => {
    return getEnabledModes(material).flatMap((mode) => {
      const round = getActiveRound(material, mode);
      return material.chapters.flatMap((chapter) => getChapterItems(chapter, mode).map((problem) => getProblemState(problem, round)));
    });
  });
  const allRoundProblemsForMode = (targetMode: StudyMode) => activeMaterials.flatMap((material) =>
    !isTrackEnabled(material, targetMode) ? [] :
      Array.from({ length: getRoundCount(material, targetMode) }, (_, index) =>
        material.chapters.flatMap((chapter) => getChapterItems(chapter, targetMode).map((problem) => getProblemState(problem, index + 1))),
      ).flat(),
  );
  const allExerciseRoundProblems = allRoundProblemsForMode("exercise");
  const allReadingRoundProblems = allRoundProblemsForMode("reading");
  const allRoundProblems = [...allExerciseRoundProblems, ...allReadingRoundProblems];
  const solved = allRoundProblems.filter((problem) => problem.status === "solved" || problem.status === "with-answer").length;
  const exerciseSolved = allExerciseRoundProblems.filter((problem) => isSolvedStatus(problem.status)).length;
  const readingCompleted = allReadingRoundProblems.filter((problem) => isSolvedStatus(problem.status)).length;
  const studyPoints = pointAwards.reduce((sum, award) => sum + award.points, 0);
  const overall = activeMaterials.length
    ? Math.round(activeMaterials.reduce((sum, material) => sum + materialPct(material), 0) / activeMaterials.length)
    : 0;
  const heatToday = new Date(`${todayKey}T12:00:00`);
  const heatDays = Array.from({ length: 49 }, (_, index) => {
    const date = new Date(heatToday);
    date.setHours(12, 0, 0, 0);
    date.setDate(heatToday.getDate() - (48 - index));
    const key = localDateKey(date);
    const count = activity[key] ?? 0;
    const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 9 ? 3 : 4;
    return { key, date, count, level };
  });
  const activeDays = heatDays.filter((day) => day.count > 0).length;
  const todayCount = activity[todayKey] ?? 0;
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const weekCount = sumActivity(activity, weekStart, now);
  const monthCount = sumActivity(activity, monthStart, now);
  const goalPercent = (count: number, target: number) => target > 0 ? Math.min(100, Math.round((count / target) * 100)) : 0;
  const streak = useMemo(() => streakFromDays(pointDays), [pointDays]);
  const dailyProgress = dailyEventProgress(studyEvents, todayKey);
  const dailyCompleted = dailyProgress.study >= dailyTargets.study
    && dailyProgress.solve >= dailyTargets.solve;
  const dailyCompletedCount = Number(dailyProgress.study >= dailyTargets.study)
    + Number(dailyProgress.solve >= dailyTargets.solve);
  const weekStartKey = localDateKey(weekStart);
  const weekEndKey = localDateKey(weekEnd);
  const weeklyScore = weeklyEventScore(studyEvents, weekStartKey, weekEndKey);
  const weeklyCompleted = weeklyScore >= weeklyTarget;
  const activeTimedRewards = timedRewardState.rewards.filter((reward) => new Date(reward.expiresAt).getTime() > clock);
  const readyTimedRewards = activeTimedRewards.filter((reward) => new Date(reward.unlockAt).getTime() <= clock);
  const lockedTimedRewards = activeTimedRewards.filter((reward) => new Date(reward.unlockAt).getTime() > clock);
  const nextTimedReward = lockedTimedRewards[0];
  const completedRounds = activeMaterials.flatMap((material) =>
    getEnabledModes(material).flatMap((mode) =>
      Array.from({ length: getRoundCount(material, mode) }, (_, index) => pct(material.chapters, index + 1, mode) === 100),
    ),
  ).filter(Boolean).length;
  const completedChapters = activeMaterials.reduce((total, material) => total + getEnabledModes(material).reduce((modeTotal, mode) => (
    modeTotal + Array.from({ length: getRoundCount(material, mode) }, (_, index) => index + 1).reduce((roundTotal, round) => (
      roundTotal + material.chapters.filter((chapter) => getChapterItems(chapter, mode).length > 0 && pct([chapter], round, mode) === 100).length
    ), 0)
  ), 0), 0);
  const bestStreak = longestStreak(pointDays);
  const milestoneGroups = [
    { id: "total", title: "完了単位", description: "演習と読書の合計", value: solved, unit: "単位", steps: [10, 25, 50, 100, 250, 500] },
    { id: "exercise", title: "演習の解決", description: "自力・解答参照を含む", value: exerciseSolved, unit: "問", steps: [10, 50, 100, 250] },
    { id: "reading", title: "読書の完了", description: "読了した記録単位", value: readingCompleted, unit: "単位", steps: [10, 25, 50, 100] },
    { id: "days", title: "累計学習日", description: "学習を記録した日数", value: pointDays.length, unit: "日", steps: [7, 30, 100, 365] },
    { id: "streak", title: "連続学習", description: "これまでの最長日数", value: bestStreak, unit: "日", steps: [3, 7, 14, 30, 100] },
    { id: "chapters", title: "章の完了", description: "内容・周回ごとに集計", value: completedChapters, unit: "章", steps: [1, 5, 10, 25] },
    { id: "rounds", title: "周回の完了", description: "読書・演習を個別集計", value: completedRounds, unit: "周", steps: [1, 3, 5, 10] },
    { id: "points", title: "累計ポイント", description: "すべての加算記録", value: studyPoints, unit: "pt", steps: [100, 500, 1000, 2500] },
  ];
  const achievedMilestoneCount = milestoneGroups.reduce((sum, group) => sum + group.steps.filter((step) => group.value >= step).length, 0);
  const milestoneTargetCount = milestoneGroups.reduce((sum, group) => sum + group.steps.length, 0);
  const nextMilestone = milestoneGroups
    .map((group) => {
      const target = group.steps.find((step) => group.value < step);
      return target ? { ...group, target, remaining: target - group.value, progress: group.value / target } : null;
    })
    .filter((milestone) => milestone !== null)
    .sort((a, b) => b.progress - a.progress)[0];
  const enabledExams = exams.filter((exam) => exam.enabled);
  const nextExam = [...enabledExams].sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  })[0];
  const nextExamMaterial = nextExam ? activeMaterials.find((material) => material.id === nextExam.materialId) : undefined;
  const nextExamDays = nextExam?.date ? Math.ceil((new Date(`${nextExam.date}T12:00:00`).getTime() - now.getTime()) / 86400000) : null;
  const dateLabel = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(now);

  const visibleFilter: ProblemFilter = current && filter !== "all" && !getStatusOrder(current, currentMode).includes(filter)
    ? "all" : filter;
  const filteredChapters = current?.chapters.map((chapter) => ({
    ...chapter,
    problems: getChapterItems(chapter, currentMode)
      .map((problem) => ({ ...problem, ...getProblemState(problem, currentRound) }))
      .filter((problem) => visibleFilter === "all"
        || problem.status === visibleFilter),
  })) ?? [];

  const firstStudyAwards = (today: string) => {
    if (pointDays.includes(today)) return [];
    const nextPointDays = [...pointDays, today];
    const awards: PointAward[] = [{ key: `daily:${today}`, points: 5, label: "本日の初回学習", earnedOn: today }];
    const nextStreak = streakFromDays(nextPointDays);
    if (streakBonuses[nextStreak]) {
      awards.push({ key: `streak:${nextStreak}`, points: streakBonuses[nextStreak], label: `${nextStreak}日連続学習`, earnedOn: today });
    }
    const previousDay = [...pointDays].filter((day) => day < today).sort().at(-1);
    if (previousDay) {
      const absenceDays = daysBetween(previousDay, today) - 1;
      if (absenceDays >= 3) {
        const points = absenceDays >= 14 ? 20 : absenceDays >= 7 ? 10 : 5;
        awards.push({ key: `return:${today}`, points, label: `${absenceDays}日ぶりの学習再開`, earnedOn: today });
      }
    }
    setPointDays(nextPointDays);
    return awards;
  };

  const grantPointAwards = (candidates: PointAward[], eventCandidates: StudyEvent[] = []) => {
    const existingEventIds = new Set(studyEvents.map((event) => event.id));
    const newEvents = eventCandidates.filter((event) => !existingEventIds.has(event.id));
    const nextEvents = [...studyEvents, ...newEvents];
    const existingAwardKeys = new Set(pointAwards.map((award) => award.key));
    const newAwards = candidates.filter((award) => !existingAwardKeys.has(award.key));
    const prospectiveAwards = [...pointAwards, ...newAwards];
    const automaticAwards: PointAward[] = [];
    const nextDailyProgress = dailyEventProgress(nextEvents, todayKey);
    if (
      nextDailyProgress.study >= dailyTargets.study
      && nextDailyProgress.solve >= dailyTargets.solve
      && !prospectiveAwards.some((award) => award.key === `daily-goal:${todayKey}`)
    ) {
      automaticAwards.push({ key: `daily-goal:${todayKey}`, points: 10, label: "日次目標を達成", earnedOn: todayKey });
    }
    if (
      weeklyEventScore(nextEvents, weekStartKey, weekEndKey) >= weeklyTarget
      && !prospectiveAwards.some((award) => award.key === `weekly-goal:${weekStartKey}`)
    ) {
      automaticAwards.push({ key: `weekly-goal:${weekStartKey}`, points: 50, label: "週間達成目標を完了", earnedOn: todayKey });
    }
    const allNewAwards = [...newAwards, ...automaticAwards];
    if (newEvents.length > 0) {
      setStudyEvents(nextEvents);
      const activityEvents = newEvents.filter((event) => event.type === "study");
      if (activityEvents.length > 0) {
        setActivity((days) => {
          const next = { ...days };
          activityEvents.forEach((event) => { next[event.date] = (next[event.date] ?? 0) + 1; });
          return next;
        });
      }
    }
    if (allNewAwards.length === 0) return;
    setPointAwards((awards) => {
      const currentKeys = new Set(awards.map((award) => award.key));
      return [...awards, ...allNewAwards.filter((award) => !currentKeys.has(award.key))];
    });
    const gained = allNewAwards.reduce((sum, award) => sum + award.points, 0);
    setPointToast(`＋${gained} pt　${allNewAwards.map((award) => award.label).join("・")}`);
  };

  const advanceTimedReward = () => {
    setTimedRewardState((state) => {
      const rewards = state.rewards.filter((reward) => new Date(reward.expiresAt).getTime() > clock);
      const solvedProgress = state.solvedProgress + 1;
      if (solvedProgress < timedRewardRequiredSolves) return { solvedProgress, rewards };
      const unlockAt = new Date(clock + timedRewardDelayMs);
      return {
        solvedProgress: solvedProgress - timedRewardRequiredSolves,
        rewards: [...rewards, {
          id: `timed-${clock}-${rewards.length}`,
          unlockAt: unlockAt.toISOString(),
          expiresAt: new Date(unlockAt.getTime() + timedRewardWindowMs).toISOString(),
        }],
      };
    });
  };

  const claimTimedReward = (reward: TimedReward) => {
    const unlockTime = new Date(reward.unlockAt).getTime();
    const expiresTime = new Date(reward.expiresAt).getTime();
    if (clock < unlockTime || clock >= expiresTime) return;
    setTimedRewardState((state) => ({
      ...state,
      rewards: state.rewards.filter((item) => item.id !== reward.id && new Date(item.expiresAt).getTime() > clock),
    }));
    grantPointAwards([{ key: `timed-reward:${reward.id}`, points: 15, label: "時限達成報酬を受領", earnedOn: todayKey }]);
  };

  const cycleProblem = (chapterId: string, problemId: number) => {
    const targetChapter = current.chapters.find((chapter) => chapter.id === chapterId);
    const targetProblem = targetChapter && getChapterItems(targetChapter, currentMode).find((problem) => problem.id === problemId);
    if (!targetProblem || !targetChapter) return;
    const targetState = getProblemState(targetProblem, currentRound);
    const shouldRecord = !targetState.studiedOn;
    const materialStatusOrder = getStatusOrder(current, currentMode);
    const currentStatusIndex = materialStatusOrder.indexOf(targetState.status);
    const nextStatus = materialStatusOrder[(Math.max(-1, currentStatusIndex) + 1) % materialStatusOrder.length];
    const today = todayKey;
    const awardId = trackAwardId(current, currentMode, currentRound, chapterId, problemId);
    const awards: PointAward[] = firstStudyAwards(today);
    const events: StudyEvent[] = [{ id: `study:${today}:${awardId}`, type: "study", date: today, problemKey: awardId }];
    if (shouldRecord) {
      awards.push({ key: `start:${awardId}`, points: 1, label: `新しい${getStudyUnit(current, currentMode)}に着手`, earnedOn: today });
    }
    if (nextStatus === "solved") {
      awards.push({ key: `solve:${awardId}`, points: currentMode === "reading" ? readingCompletionPoints : exerciseCompletionPoints, label: currentMode === "reading" ? `${getStudyUnit(current, currentMode)}を読了` : "問題を解決", earnedOn: today });
      events.push({ id: `solve:${today}:${awardId}`, type: "solve", date: today, problemKey: awardId });
    }
    const targetChapterItems = getChapterItems(targetChapter, currentMode);
    const willCompleteChapter = isSolvedStatus(nextStatus) && targetChapterItems.every((problem) =>
      problem.id === problemId || isSolvedStatus(getProblemState(problem, currentRound).status),
    );
    if (willCompleteChapter) {
      awards.push({ key: `chapter:${trackAwardId(current, currentMode, currentRound, chapterId)}`, points: 15, label: `${targetChapter.title}の${getTrackLabel(currentMode)}を完了`, earnedOn: today });
    }
    const willCompleteRound = isSolvedStatus(nextStatus) && current.chapters.every((chapter) =>
      getChapterItems(chapter, currentMode).every((problem) => {
        if (chapter.id === chapterId && problem.id === problemId) return true;
        return isSolvedStatus(getProblemState(problem, currentRound).status);
      }),
    );
    if (willCompleteRound) {
      awards.push({ key: `complete:${trackRoundAwardId(current, currentMode, currentRound)}`, points: 50, label: `${current.title}の${getTrackLabel(currentMode)} 第${currentRound}周を完了`, earnedOn: today });
    }
    const firstSolve = nextStatus === "solved" && !pointAwards.some((award) => award.key === `solve:${awardId}`);
    grantPointAwards(awards, events);
    if (firstSolve) advanceTimedReward();
    const nextState: ProblemState = { ...targetState, studiedOn: targetState.studiedOn ?? today, status: nextStatus };
    setMaterials((items) =>
      items.map((material) =>
        material.id !== current.id
          ? material
          : {
              ...material,
              chapters: material.chapters.map((chapter) => chapter.id !== chapterId
                ? chapter
                : withChapterItems(chapter, currentMode, getChapterItems(chapter, currentMode).map((problem) => problem.id !== problemId
                  ? problem
                  : withProblemState(problem, currentRound, nextState)))),
            },
      ),
    );
  };

  const resetProblem = (chapterId: string, problemId: number) => {
    const problemKey = trackAwardId(current, currentMode, currentRound, chapterId, problemId);
    const removedEvents = studyEvents.filter((event) => event.problemKey === problemKey);
    const removedActivity = removedEvents.filter((event) => event.type === "study");
    setMaterials((items) =>
      items.map((material) =>
        material.id !== current.id
          ? material
          : {
              ...material,
              chapters: material.chapters.map((chapter) => chapter.id !== chapterId
                ? chapter
                : withChapterItems(chapter, currentMode, getChapterItems(chapter, currentMode).map((problem) => {
                        if (problem.id !== problemId) return problem;
                        if (currentRound === 1) {
                          return {
                            ...problem,
                            studiedOn: undefined,
                            status: "todo" as Status,
                          };
                        }
                        const rounds = { ...problem.rounds, [String(currentRound)]: { status: "todo" as Status } };
                        return { ...problem, rounds };
                      }))),
            },
      ),
    );
    if (removedEvents.length > 0) {
      setStudyEvents((events) => events.filter((event) => event.problemKey !== problemKey));
    }
    if (removedActivity.length > 0) {
      setActivity((days) => {
        const next = { ...days };
        removedActivity.forEach((event) => {
          const remaining = Math.max(0, (next[event.date] ?? 0) - 1);
          if (remaining === 0) delete next[event.date];
          else next[event.date] = remaining;
        });
        return next;
      });
    }
  };

  const setMaterialRound = (materialId: string, round: number, mode?: StudyMode) => {
    setMaterials((items) => items.map((material) => {
      if (material.id !== materialId) return material;
      const targetMode = mode ?? getStudyMode(material);
      return targetMode === "reading" ? { ...material, readingActiveRound: round } : { ...material, exerciseActiveRound: round };
    }));
    setFilter("all");
  };

  const setMaterialTrack = (materialId: string, mode: StudyMode) => {
    setMaterials((items) => items.map((material) => material.id === materialId && isTrackEnabled(material, mode) ? { ...material, activeTrack: mode } : material));
    setFilter("all");
  };

  const startNextRound = () => {
    const nextRound = getRoundCount(current, currentMode) + 1;
    if (!window.confirm(`${current.title}の「${getTrackLabel(currentMode)}」第${nextRound}周を開始しますか？\nこれまでの記録は残したまま、新しい状態で取り組めます。`)) return;
    setMaterials((items) => items.map((material) => material.id !== current.id
      ? material
      : currentMode === "reading"
        ? { ...material, readingRoundCount: nextRound, readingActiveRound: nextRound }
        : { ...material, exerciseRoundCount: nextRound, exerciseActiveRound: nextRound }));
    setFilter("all");
  };

  const openAdd = () => {
    setEditingId(null);
    setNewTitle("");
    setNewKind("教科書");
    setNewExerciseEnabled(true);
    setNewReadingEnabled(false);
    setNewExerciseUnit("問");
    setNewReadingUnit("節");
    setChapterDrafts([{ title: "第1章", exerciseCount: 10, readingCount: 0 }]);
    setAdding(true);
  };

  const openEdit = (material: Material) => {
    setEditingId(material.id);
    setNewTitle(material.title);
    setNewKind(material.kind);
    setNewExerciseEnabled(isTrackEnabled(material, "exercise"));
    setNewReadingEnabled(isTrackEnabled(material, "reading"));
    setNewExerciseUnit(getStudyUnit(material, "exercise"));
    setNewReadingUnit(getStudyUnit(material, "reading"));
    setChapterDrafts(
      material.chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        exerciseCount: getChapterItems(chapter, "exercise").length,
        readingCount: getChapterItems(chapter, "reading").length,
      })),
    );
    setAdding(true);
  };

  const saveMaterial = () => {
    const exerciseTotal = chapterDrafts.reduce((sum, chapter) => sum + chapter.exerciseCount, 0);
    const readingTotal = chapterDrafts.reduce((sum, chapter) => sum + chapter.readingCount, 0);
    if (!newTitle.trim() || chapterDrafts.length === 0 || (!newExerciseEnabled && !newReadingEnabled)) return;
    if ((newExerciseEnabled && exerciseTotal === 0) || (newReadingEnabled && readingTotal === 0)) return;
    const normalized = chapterDrafts.map((chapter, index) => ({
      id: chapter.id,
      title: chapter.title.trim() || `第${index + 1}章`,
      exerciseCount: Math.max(0, Math.min(500, Number(chapter.exerciseCount) || 0)),
      readingCount: Math.max(0, Math.min(500, Number(chapter.readingCount) || 0)),
    }));
    const stamp = Date.now();
    const resizeItems = (previous: Problem[] | undefined, count: number, mode: StudyMode) => Array.from({ length: count }, (_, itemIndex) => (
      previous?.[itemIndex] ? normalizeProblem(previous[itemIndex], mode) : { id: itemIndex + 1, status: "todo" as Status }
    ));

    if (editingId) {
      setMaterials((items) =>
        items.map((material) => {
          if (material.id !== editingId) return material;
          const primaryMode = getPrimaryMode(material);
          const activeTrack = isTrackEnabled({ ...material, exerciseEnabled: newExerciseEnabled, readingEnabled: newReadingEnabled }, getStudyMode(material))
            ? getStudyMode(material)
            : newExerciseEnabled
              ? "exercise"
              : "reading";
          return {
            ...material,
            title: newTitle.trim(),
            kind: newKind,
            studyMode: primaryMode,
            unit: primaryMode === "reading" ? newReadingUnit : newExerciseUnit,
            activeTrack,
            exerciseEnabled: newExerciseEnabled,
            readingEnabled: newReadingEnabled,
            exerciseUnit: newExerciseUnit,
            readingUnit: newReadingUnit,
            chapters: normalized.map((draft, index) => {
              const previous = draft.id ? material.chapters.find((chapter) => chapter.id === draft.id) : undefined;
              return {
                id: draft.id ?? `${material.id}-${stamp}-${index}`,
                title: draft.title,
                problems: resizeItems(previous ? getChapterItems(previous, "exercise") : undefined, draft.exerciseCount, "exercise"),
                readingItems: resizeItems(previous ? getChapterItems(previous, "reading") : undefined, draft.readingCount, "reading"),
              };
            }),
          };
        }),
      );
    } else {
      const id = `material-${stamp}`;
      const primaryMode: StudyMode = newExerciseEnabled ? "exercise" : "reading";
      setMaterials((items) => [
        ...items,
        {
          id,
          title: newTitle.trim(),
          kind: newKind,
          color: "#6e7fbb",
          studyMode: primaryMode,
          unit: primaryMode === "reading" ? newReadingUnit : newExerciseUnit,
          activeTrack: primaryMode,
          exerciseEnabled: newExerciseEnabled,
          readingEnabled: newReadingEnabled,
          exerciseUnit: newExerciseUnit,
          readingUnit: newReadingUnit,
          chapters: normalized.map((draft, index) => ({
            id: `${id}-${index + 1}`,
            title: draft.title,
            problems: resizeItems(undefined, draft.exerciseCount, "exercise"),
            readingItems: resizeItems(undefined, draft.readingCount, "reading"),
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
    const id = `exam-${clock}-${exams.length}`;
    const material = activeMaterials[0];
    const mode = material && isTrackEnabled(material, "exercise") ? "exercise" : "reading";
    setExams((items) => [...items, { id, enabled: true, name: "", date: "", materialId: material?.id ?? "", round: material ? getActiveRound(material, mode) : 1 }]);
  };

  const updateExam = (id: string, changes: Partial<ExamSettings>) => {
    setExams((items) => items.map((exam) => exam.id === id ? { ...exam, ...changes } : exam));
  };

  const deleteExam = (id: string) => {
    if (!window.confirm("この試験を削除しますか？")) return;
    setExams((items) => items.filter((exam) => exam.id !== id));
  };

  const sendSyncLoginLink = async () => {
    if (!supabase || !syncEmail.trim()) return;
    setSyncStatus("checking");
    setSyncMessage("");
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: syncEmail.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      setSyncStatus("error");
      setSyncMessage("確認メールを送信できませんでした。メールアドレスを確認してください。");
      return;
    }
    setSyncStatus("local");
    setSyncMessage("確認メールを送信しました。メール内のリンクを開いてください。");
  };

  const chooseCloudData = () => {
    if (!pendingCloudData || !syncUserId) return;
    if (!window.confirm("この端末の学習データを、クラウドに保存されている内容で置き換えますか？")) return;
    applyStudySnapshot(pendingCloudData.snapshot);
    localStorage.setItem("math-map-cloud-user", syncUserId);
    lastSyncedAtRef.current = pendingCloudData.updatedAt;
    setLastSyncedAt(pendingCloudData.updatedAt);
    setPendingCloudData(null);
    setSyncStatus("synced");
    setSyncMessage("クラウドのデータをこの端末へ保存しました。");
  };

  const chooseLocalData = async () => {
    if (!syncUserId) return;
    if (!window.confirm("クラウドの学習データを、この端末の内容で置き換えますか？")) return;
    setSyncStatus("checking");
    try {
      const updatedAt = await saveCloudSnapshot(syncUserId, latestSnapshotRef.current);
      localStorage.setItem("math-map-cloud-user", syncUserId);
      lastSyncedAtRef.current = updatedAt;
      setLastSyncedAt(updatedAt);
      setPendingCloudData(null);
      setSyncStatus("synced");
      setSyncMessage("この端末のデータをクラウドへ保存しました。");
    } catch {
      setSyncStatus("error");
      setSyncMessage("クラウドへ保存できませんでした。再試行してください。");
    }
  };

  const pullCloudData = async () => {
    if (!syncUserId) return;
    if (!window.confirm("この端末の学習データを、クラウドの最新内容で置き換えますか？")) return;
    setSyncStatus("checking");
    try {
      const cloud = await loadCloudSnapshot(syncUserId);
      if (!cloud) throw new Error("クラウドデータがありません");
      applyStudySnapshot(cloud.snapshot);
      localStorage.setItem("math-map-cloud-user", syncUserId);
      lastSyncedAtRef.current = cloud.updatedAt;
      setLastSyncedAt(cloud.updatedAt);
      setSyncStatus("synced");
      setSyncMessage("クラウドの最新データを反映しました。");
    } catch {
      setSyncStatus("error");
      setSyncMessage("クラウドからデータを取得できませんでした。");
    }
  };

  const pushLocalData = async () => {
    if (!syncUserId) return;
    if (!window.confirm("クラウドの学習データを、この端末の最新内容で置き換えますか？")) return;
    setSyncStatus("checking");
    try {
      const updatedAt = await saveCloudSnapshot(syncUserId, latestSnapshotRef.current);
      localStorage.setItem("math-map-cloud-user", syncUserId);
      lastSyncedAtRef.current = updatedAt;
      setLastSyncedAt(updatedAt);
      setSyncStatus("synced");
      setSyncMessage("この端末の最新データを保存しました。");
    } catch {
      setSyncStatus("error");
      setSyncMessage("クラウドへデータを保存できませんでした。");
    }
  };

  const disableCloudSync = async () => {
    if (!supabase) return;
    await supabase.auth.signOut({ scope: "local" });
    localStorage.removeItem("math-map-cloud-user");
    setSyncUser(null);
    setSyncStatus("local");
    setPendingCloudData(null);
    setLastSyncedAt("");
    lastSyncedAtRef.current = "";
    setSyncMessage("クラウド同期を解除しました。データはこの端末に残っています。");
  };

  const exportData = () => {
    const backup = {
      version: 13,
      exportedAt: new Date().toISOString(),
      materials,
      activity,
      goals,
      exams,
      studyPoints,
      pointDays,
      pointAwards,
      studyEvents,
      timedRewardState,
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
      const restoredMaterials = normalizeMaterials(Array.isArray(parsed) ? parsed : parsed.materials);
      if (!restoredMaterials) {
        throw new Error("教材データがありません");
      }
      setMaterials(restoredMaterials);
      const restoredActivity = !Array.isArray(parsed) && parsed.activity && typeof parsed.activity === "object" ? parsed.activity as Record<string, number> : {};
      setActivity(restoredActivity);
      const restoredPointDays = normalizePointDays(!Array.isArray(parsed) && Array.isArray(parsed.pointDays) ? parsed.pointDays : studiedDays(restoredActivity));
      const restoredPointAwards = !Array.isArray(parsed) ? validPointAwards(parsed.pointAwards) : null;
      const legacyPoints = !Array.isArray(parsed) && typeof parsed.studyPoints === "number" ? Math.max(0, parsed.studyPoints) : 0;
      setPointDays(restoredPointDays);
      setPointAwards(applyCurrentPointWeights(restoredPointAwards ?? migratePointAwards(restoredMaterials, restoredPointDays, legacyPoints)));
      const restoredStudyEvents = !Array.isArray(parsed) ? validStudyEvents(parsed.studyEvents) : null;
      setStudyEvents(restoredStudyEvents ?? migrateStudyEvents(restoredActivity));
      const restoredTimedRewards = !Array.isArray(parsed) ? validTimedRewardState(parsed.timedRewardState) : null;
      setTimedRewardState(restoredTimedRewards ?? { solvedProgress: 0, rewards: [] });
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

  const syncButtonLabel = !cloudSyncConfigured
    ? "端末保存"
    : syncStatus === "checking"
      ? "同期確認中"
      : syncUser && syncStatus === "synced"
        ? "同期済み"
        : "クラウド同期";

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
              <small>{materialPct(material)}%</small>
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
            <button className={`sync-button ${syncStatus === "synced" ? "connected" : ""}`} onClick={() => setSyncOpen(true)}>
              <i aria-hidden="true" />{syncButtonLabel}
            </button>
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
                const modes = getEnabledModes(material);
                const sourceIndex = materials.findIndex((item) => item.id === material.id);
                return (
                  <article className="material-card" key={material.id}>
                    <button className="material-open" onClick={() => { setSelected(material.id); setView("home"); }}>
                      <span className="book-chip" style={{ background: material.color }}>{material.kind === "授業" ? "授" : "本"}</span>
                      <div>
                        <small>{material.kind}・{modes.map(getTrackLabel).join("・")}</small>
                        <h3>{material.title}</h3>
                        <p>{material.chapters.length}章・{modes.map((mode) => `${material.chapters.reduce((sum, chapter) => sum + getChapterItems(chapter, mode).length, 0)}${getStudyUnit(material, mode)}`).join("／")}</p>
                      </div>
                    </button>
                    <div className="material-card-progress track-progress-list">
                      {modes.map((mode) => {
                        const progress = pct(material.chapters, getActiveRound(material, mode), mode);
                        return <div className="track-progress-row" key={mode}><strong>{getTrackLabel(mode)} 第{getActiveRound(material, mode)}周・{progress}%</strong><div><i style={{ width: `${progress}%`, background: material.color }} /></div></div>;
                      })}
                    </div>
                    <div className="material-actions">
                      <button className="secondary-button" onClick={() => moveMaterial(material.id, -1)} disabled={sourceIndex === 0} aria-label={`${material.title}を上へ移動`}>↑</button>
                      <button className="secondary-button" onClick={() => moveMaterial(material.id, 1)} disabled={sourceIndex === materials.length - 1} aria-label={`${material.title}を下へ移動`}>↓</button>
                      <button className="secondary-button action-wide" onClick={() => openEdit(material)}>構成を設定</button>
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

        {view === "history" && (
          <section className="view-panel">
            <div className="view-heading"><div><p className="eyebrow">STUDY LOG</p><h2>学習記録</h2><p>これまでの積み重ねを状態別に確認できます</p></div></div>
            <div className="history-grid">
              {statusOrder.map((status) => {
                const count = totalProblems.filter((problem) => problem.status === status).length;
                return <article key={status}><i className={`dot ${status}`} /><span>{statusLabel[status]}</span><strong>{count}<small>件</small></strong></article>;
              })}
            </div>
            <article className="heat-card history-heat">
              <div className="card-heading"><div><p>学習の足あと</p><h3>直近7週間</h3></div><span>今日 {todayCount}件</span></div>
              <div className="heatmap">{heatDays.map((day) => <i key={day.key} data-level={day.level} title={`${formatHeatDate(day.date)}・${day.count}件`} />)}</div>
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
                  <label>週間目標<div><input type="number" min="1" max="999" value={goals.weekly} onChange={(event) => setGoals((value) => ({ ...value, weekly: Math.max(1, Number(event.target.value) || 1) }))} /><span>件</span></div></label>
                  <label>月間目標<div><input type="number" min="1" max="9999" value={goals.monthly} onChange={(event) => setGoals((value) => ({ ...value, monthly: Math.max(1, Number(event.target.value) || 1) }))} /><span>件</span></div></label>
                </div>
                <div className="goal-detail">
                  <div><span>今週</span><strong>{weekCount} / {goals.weekly}件</strong></div>
                  <div className="goal-track"><i style={{ width: `${goalPercent(weekCount, goals.weekly)}%` }} /></div>
                  <div><span>今月</span><strong>{monthCount} / {goals.monthly}件</strong></div>
                  <div className="goal-track"><i style={{ width: `${goalPercent(monthCount, goals.monthly)}%` }} /></div>
                </div>
              </article>
              <article className="streak-card">
                <p>現在の連続学習</p>
                <strong>{streak}<small>日</small></strong>
                <span>{streak > 0 ? "本日の学習状況を記録済み" : "1件記録すると継続日数が始まります"}</span>
              </article>
              <article className="point-card">
                <p>累計ポイント</p>
                <strong>{studyPoints}<small> pt</small></strong>
                <span>学習記録と目標達成に応じて加算</span>
              </article>
            </div>
            <section className="point-rules-section">
              <div className="section-heading"><div><p className="eyebrow">POINT RULES</p><h3>ポイントの加算条件</h3></div><span>同じ記録からの重複加算はありません</span></div>
              <div className="point-rules">
                <article><div><strong>本日の初回学習</strong><small>1日につき1回</small></div><b>＋5 pt</b></article>
                <article><div><strong>新しい単位に着手</strong><small>1単位・1周につき初回</small></div><b>＋1 pt</b></article>
                <article><div><strong>問題を解決</strong><small>1問・1周につき初回（自力・解答参照）</small></div><b>＋2 pt</b></article>
                <article><div><strong>読書単位を読了</strong><small>1単位・1周につき初回</small></div><b>＋5 pt</b></article>
                <article><div><strong>章を完了</strong><small>章の1周ごと</small></div><b>＋15 pt</b></article>
                <article><div><strong>教材を100%完了</strong><small>教材の1周ごと</small></div><b>＋50 pt</b></article>
                <article><div><strong>連続学習</strong><small>3日＋3・7日＋10・14日＋25・30日＋60・60日＋150・100日＋300</small></div><b>＋3〜300 pt</b></article>
                <article><div><strong>学習再開</strong><small>3〜6日＋5・7〜13日＋10・14日以上＋20</small></div><b>＋5〜20 pt</b></article>
                <article><div><strong>日次目標を完了</strong><small>学習3・完了2</small></div><b>＋10 pt</b></article>
                <article><div><strong>週間達成目標を完了</strong><small>学習1・完了3の合計100</small></div><b>＋50 pt</b></article>
                <article><div><strong>時限達成報酬を受領</strong><small>5単位の初回完了後、3時間後から24時間</small></div><b>＋15 pt</b></article>
              </div>
            </section>
            <section className="milestone-section">
              <div className="section-heading"><div><p className="eyebrow">MILESTONES</p><h3>マイルストーン</h3></div><span>{achievedMilestoneCount} / {milestoneTargetCount}段階を達成</span></div>
              <div className="milestone-grid">
                {milestoneGroups.map((group) => {
                  const achieved = group.steps.filter((step) => group.value >= step).length;
                  const next = group.steps.find((step) => group.value < step);
                  const complete = next === undefined;
                  return (
                    <article className={`milestone-kind ${achieved > 0 ? "has-achievement" : ""} ${complete ? "unlocked" : ""}`} key={group.id}>
                      <div className="milestone-kind-head"><span>{complete ? "✓" : achieved}</span><div><strong>{group.title}</strong><small>{group.description}</small></div></div>
                      <div className="milestone-value"><b>{group.value}</b><small>{group.unit}</small></div>
                      <div className="milestone-levels" aria-label={`${group.title}の達成段階`}>
                        {group.steps.map((step) => <span className={group.value >= step ? "achieved" : ""} key={step}>{step}</span>)}
                      </div>
                      <p>{next === undefined ? "すべての段階を達成" : `${next}${group.unit}まであと${next - group.value}${group.unit}`}</p>
                    </article>
                  );
                })}
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
                const examMode: StudyMode = material && isTrackEnabled(material, "exercise") ? "exercise" : "reading";
                const round = material ? Math.min(getRoundCount(material, examMode), Math.max(1, exam.round ?? getActiveRound(material, examMode))) : 1;
                const problems = material?.chapters.flatMap((chapter) => getChapterItems(chapter, examMode).map((problem) => getProblemState(problem, round))) ?? [];
                const solvedCount = problems.filter((problem) => problem.status === "solved" || problem.status === "with-answer").length;
                const completionPercent = problems.length ? Math.round((solvedCount / problems.length) * 100) : 0;
                const days = exam.date ? Math.ceil((new Date(`${exam.date}T12:00:00`).getTime() - now.getTime()) / 86400000) : null;
                return (
                  <article className="exam-card" key={exam.id}>
                    <div className="exam-settings">
                      <label className="switch-row"><span><strong>{exam.name.trim() || "新しい試験"}</strong><small>ホームの直近試験に表示</small></span><input type="checkbox" checked={exam.enabled} onChange={(event) => updateExam(exam.id, { enabled: event.target.checked })} /></label>
                      <label>試験名<input value={exam.name} onChange={(event) => updateExam(exam.id, { name: event.target.value })} placeholder="例：線形代数学 中間試験" /></label>
                      <label>試験日<input type="date" value={exam.date} onChange={(event) => updateExam(exam.id, { date: event.target.value })} /></label>
                      <label>対象教材<select value={exam.materialId} onChange={(event) => { const materialId = event.target.value; const selectedMaterial = activeMaterials.find((item) => item.id === materialId); const selectedMode: StudyMode = selectedMaterial && isTrackEnabled(selectedMaterial, "exercise") ? "exercise" : "reading"; updateExam(exam.id, { materialId, round: selectedMaterial ? getActiveRound(selectedMaterial, selectedMode) : 1 }); }}>{activeMaterials.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
                      {material && <label>対象の周<select value={round} onChange={(event) => updateExam(exam.id, { round: Number(event.target.value) })}>{Array.from({ length: getRoundCount(material, examMode) }, (_, index) => <option value={index + 1} key={index + 1}>第{index + 1}周</option>)}</select></label>}
                      <button className="danger-button" onClick={() => deleteExam(exam.id)}>試験を削除</button>
                    </div>
                    <div className="exam-summary">
                      <p>{exam.name.trim() || "試験名を設定してください"}</p>
                      <strong>{days === null ? "—" : days >= 0 ? `あと${days}日` : `${Math.abs(days)}日前`}</strong>
                      <span>{material ? `${material.title}・${getTrackLabel(examMode)}・第${round}周` : "対象教材なし"}</span>
                      <div className="exam-stats"><div><b>{solvedCount}</b><small>完了済み</small></div><div><b>{Math.max(0, problems.length - solvedCount)}</b><small>未完了</small></div><div><b>{completionPercent}%</b><small>進捗</small></div></div>
                      <div className="goal-track"><i style={{ width: `${completionPercent}%` }} /></div>
                      {material && <button className="primary-button" onClick={() => { setMaterialTrack(material.id, examMode); setMaterialRound(material.id, round, examMode); setSelected(material.id); setView("home"); }}>対象教材を開く</button>}
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
              <h2>継続は力なり</h2>
              <div className="mini-stats">
                <span><b>{solved}</b> 完了</span>
                <span><b>{todayCount}</b> 今日</span>
                <span><b>{activeMaterials.length}</b> 教材</span>
              </div>
            </div>
            <button className="overall-points" onClick={() => setView("goals")}>
              <span>累計ポイント</span>
              <strong>{studyPoints}<small> pt</small></strong>
              <em>{pointDays.includes(todayKey) ? "本日の学習を記録済み" : "本日の初回学習で＋5 pt"}</em>
            </button>
          </article>

          <article className="heat-card">
            <div className="card-heading">
              <div><p>学習のあしあと</p><h3>直近7週間</h3></div>
              <span>今日 {todayCount}件</span>
            </div>
            <div className="heatmap" aria-label="学習ヒートマップ">
              {heatDays.map((day) => <i key={day.key} data-level={day.level} title={`${formatHeatDate(day.date)}・${day.count}件`} />)}
            </div>
            <div className="heat-foot"><span>直近49日で{activeDays}日学習</span><div className="heat-legend"><span>少ない</span>{[0,1,2,3,4].map((v) => <i key={v} data-level={v} />)}<span>多い</span></div></div>
          </article>
        </section>

        <section className="quick-stats" aria-label="目標と実績">
          <button onClick={() => setView("goals")}><span>今週の目標</span><strong>{weekCount}<small> / {goals.weekly}件</small></strong><i><b style={{ width: `${goalPercent(weekCount, goals.weekly)}%` }} /></i></button>
          <button onClick={() => setView("goals")}><span>連続学習</span><strong>{streak}<small>日</small></strong><em>学習記録の連続日数</em></button>
          <button onClick={() => setView("goals")}><span>マイルストーン</span><strong>{achievedMilestoneCount}<small>段階達成</small></strong><em>{nextMilestone ? `次は${nextMilestone.title} ${nextMilestone.target}${nextMilestone.unit}` : "すべての段階を達成"}</em></button>
          {nextExam && <button className="exam-quick" onClick={() => setView("exam")}><span>{nextExam.name.trim() || "直近の試験"}</span><strong>{nextExamDays === null ? "日付未設定" : nextExamDays >= 0 ? `あと${nextExamDays}日` : "試験終了"}</strong><em>{nextExamMaterial?.title}</em></button>}
        </section>

        <section className="time-overview" aria-label="期限と達成状況">
          <article className={`time-card ${dailyCompleted ? "complete" : ""}`}>
            <header><span>日次目標</span><strong>{dailyCompletedCount}<small> / 2項目</small></strong></header>
            <div className="time-progress"><i style={{ width: `${Math.round((dailyCompletedCount / 2) * 100)}%` }} /></div>
            <p>学習 {Math.min(dailyProgress.study, dailyTargets.study)}/{dailyTargets.study}・完了 {Math.min(dailyProgress.solve, dailyTargets.solve)}/{dailyTargets.solve}</p>
            <em>{dailyCompleted ? "完了済み・＋10 pt" : "2項目の完了で＋10 pt"}</em>
          </article>
          <article className={`time-card ${weeklyCompleted ? "complete" : ""}`}>
            <header><span>週間達成目標</span><strong>{Math.min(weeklyScore, weeklyTarget)}<small> / {weeklyTarget}</small></strong></header>
            <div className="time-progress"><i style={{ width: `${Math.min(100, Math.round((weeklyScore / weeklyTarget) * 100))}%` }} /></div>
            <p>学習＋1・完了＋3<br />締切まで {formatRemaining(weekEnd.getTime() - clock)}</p>
            <em>{weeklyCompleted ? "完了済み・＋50 pt" : "完了時に＋50 pt"}</em>
          </article>
          <article className={`time-card ${readyTimedRewards.length > 0 ? "complete" : ""}`}>
            <header>
              <span>時限達成報酬</span>
              <strong>{readyTimedRewards.length > 0 ? readyTimedRewards.length : timedRewardState.solvedProgress}<small>{readyTimedRewards.length > 0 ? "件" : ` / ${timedRewardRequiredSolves}単位`}</small></strong>
            </header>
            <p>{readyTimedRewards.length > 0
              ? `受取期限まで ${formatRemaining(new Date(readyTimedRewards[0].expiresAt).getTime() - clock)}`
              : nextTimedReward
                ? `受取可能まで ${formatRemaining(new Date(nextTimedReward.unlockAt).getTime() - clock)}`
                : "5単位の初回完了で受取予定を設定"}</p>
            {readyTimedRewards.length > 0
              ? <button className="secondary-button" onClick={() => claimTimedReward(readyTimedRewards[0])}>＋15 ptを受け取る</button>
              : <em>受取可能後24時間</em>}
          </article>
        </section>

        <section className="material-head">
          <div className="book-title">
            <span style={{ background: current.color }}>{current.kind === "授業" ? "授" : "本"}</span>
            <div>
              <p>{current.kind}・{getEnabledModes(current).map(getTrackLabel).join("・")}</p>
              <h2>{current.title}</h2>
              {getEnabledModes(current).length > 1 && <div className="track-switch" aria-label="表示する学習内容">
                {getEnabledModes(current).map((mode) => <button className={currentMode === mode ? "active" : ""} key={mode} onClick={() => setMaterialTrack(current.id, mode)}>{getTrackLabel(mode)}</button>)}
              </div>}
            </div>
          </div>
          <div className="material-progress">
            <div><span>{getTrackLabel(currentMode)}・第{currentRound}周</span><strong>{pct(current.chapters, currentRound, currentMode)}%</strong></div>
            <div className="progress-track"><i style={{ width: `${pct(current.chapters, currentRound, currentMode)}%`, background: current.color }} /></div>
          </div>
          <div className="material-head-actions">
            <select aria-label="表示する周回" value={currentRound} onChange={(event) => setMaterialRound(current.id, Number(event.target.value), currentMode)}>{Array.from({ length: getRoundCount(current, currentMode) }, (_, index) => <option value={index + 1} key={index + 1}>第{index + 1}周</option>)}</select>
            <button className="secondary-button" onClick={startNextRound}>＋ {getTrackLabel(currentMode)}の次周</button>
            <button className="secondary-button edit-material" onClick={() => openEdit(current)}>構成を設定</button>
          </div>
        </section>

        <section className="problem-section">
          <div className="problem-toolbar">
            <div>
              <h3>章ごとの{getTrackLabel(currentMode)}</h3>
              <p>{getStudyUnit(current, currentMode)}番号を押すと進捗が切り替わります。{currentMode === "reading" && "読書の進み具合を記録できます。"}</p>
            </div>
            <select aria-label="状態で絞り込む" value={visibleFilter} onChange={(e) => setFilter(e.target.value as ProblemFilter)}>
              <option value="all">すべての状態</option>
              {getStatusOrder(current, currentMode).map((status) => <option value={status} key={status}>{getStatusLabel(current, status, currentMode)}</option>)}
            </select>
          </div>
          <div className="legend">
            {getStatusOrder(current, currentMode).map((status) => <span key={status}><i className={`dot ${status}`} />{getStatusLabel(current, status, currentMode)}</span>)}
          </div>

          <div className="chapters">
            {filteredChapters.map((chapter) => {
              const original = current.chapters.find((c) => c.id === chapter.id)!;
              const originalItems = getChapterItems(original, currentMode);
              const chapterPercent = pct([original], currentRound, currentMode);
              return (
                <article className={`chapter-card ${chapterPercent === 100 ? "completed" : ""}`} key={chapter.id}>
                  <div className="chapter-row">
                    <div className="chapter-info">
                      <h4>{chapter.title}{originalItems.length > 0 && chapterPercent === 100 && <span className="chapter-complete-label">完了</span>}</h4><p>{originalItems.length}{getStudyUnit(current, currentMode)}中 {originalItems.filter((problem) => { const state = getProblemState(problem, currentRound); return state.status === "solved" || state.status === "with-answer"; }).length}{getStudyUnit(current, currentMode)} {getCompletionLabel(current, currentMode)}</p>
                    </div>
                    <div className="chapter-pct">
                      <span>{chapterPercent}%</span>
                      <div><i style={{ width: `${chapterPercent}%`, background: current.color }} /></div>
                    </div>
                  </div>
                  <div className="problem-grid">
                    {chapter.problems.map((problem) => (
                        <div className="problem-wrap" key={problem.id}>
                          <button
                            className={`problem ${problem.status}`}
                            title={`${problem.id}${getStudyUnit(current, currentMode)}・${getStatusLabel(current, problem.status, currentMode)}`}
                            aria-label={`${problem.id}${getStudyUnit(current, currentMode)}、${getStatusLabel(current, problem.status, currentMode)}。押すと次の進捗へ`}
                            onClick={() => cycleProblem(chapter.id, problem.id)}
                          >
                            {problem.id}
                          </button>
                          {problem.status !== "todo" && (
                            <button
                              className="problem-reset"
                              title={`${problem.id}${getStudyUnit(current, currentMode)}の記録を消す`}
                              aria-label={`${problem.id}${getStudyUnit(current, currentMode)}の学習記録を消す`}
                              onClick={() => resetProblem(chapter.id, problem.id)}
                            >×</button>
                          )}
                        </div>
                    ))}
                    {chapter.problems.length === 0 && <p className="empty">この状態の学習単位はありません。</p>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        </>)}
      </section>

      {syncOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSyncOpen(false)}>
          <div className="modal sync-modal" role="dialog" aria-modal="true" aria-labelledby="sync-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="閉じる" onClick={() => setSyncOpen(false)}>×</button>
            <p className="eyebrow">DATA SYNC</p>
            <h2 id="sync-title">端末間同期</h2>

            {!cloudSyncConfigured && (
              <div className="sync-state-panel">
                <strong>現在は端末内に保存しています</strong>
                <p>クラウド同期の接続情報が設定されていない場合も、これまでどおりすべての機能を利用できます。</p>
              </div>
            )}

            {cloudSyncConfigured && !syncUser && (
              <div className="sync-login">
                <p>PCとスマートフォンで同じメールアドレスを使用すると、同じ学習データを利用できます。</p>
                <label>メールアドレス<input type="email" autoComplete="email" value={syncEmail} onChange={(event) => setSyncEmail(event.target.value)} placeholder="name@example.com" /></label>
                <button className="primary-button wide" disabled={!syncEmail.trim() || syncStatus === "checking"} onClick={() => { void sendSyncLoginLink(); }}>{syncStatus === "checking" ? "送信中" : "確認メールを送信"}</button>
                <small>パスワードの登録は不要です。届いたメール内のリンクからログインします。</small>
              </div>
            )}

            {cloudSyncConfigured && syncUser && (
              <div className="sync-account">
                <div className="sync-account-head">
                  <div><small>ログイン中</small><strong>{syncUser.email}</strong></div>
                  <span className={syncStatus === "synced" ? "connected" : ""}>{syncStatus === "synced" ? "自動同期中" : syncStatus === "checking" ? "確認中" : "設定が必要"}</span>
                </div>

                {syncStatus === "choose" && pendingCloudData && (
                  <div className="sync-choice">
                    <strong>最初に使用するデータを選択してください</strong>
                    <p>選ばなかった側のデータは置き換わります。必要に応じて先にJSONバックアップを書き出してください。</p>
                    <button className="sync-choice-button" onClick={chooseCloudData}><span>クラウドのデータを使う</span><small>更新日時 {new Date(pendingCloudData.updatedAt).toLocaleString("ja-JP")}</small></button>
                    <button className="sync-choice-button" onClick={() => { void chooseLocalData(); }}><span>この端末のデータを使う</span><small>現在表示されている教材と学習記録を保存</small></button>
                  </div>
                )}

                {syncStatus === "checking" && <div className="sync-state-panel"><strong>データを確認しています</strong><p>完了するまでこの画面を閉じずにお待ちください。</p></div>}

                {syncStatus === "synced" && (
                  <div className="sync-controls">
                    <div className="sync-state-panel"><strong>変更は自動的に同期されます</strong><p>{lastSyncedAt ? `最終同期 ${new Date(lastSyncedAt).toLocaleString("ja-JP")}` : "同期時刻を確認しています"}</p></div>
                    <div className="sync-control-buttons">
                      <button className="secondary-button" onClick={() => { void pullCloudData(); }}>クラウドから取り込む</button>
                      <button className="secondary-button" onClick={() => { void pushLocalData(); }}>この端末から保存</button>
                    </div>
                  </div>
                )}

                {syncStatus === "error" && (
                  <div className="sync-state-panel error"><strong>自動同期を確認できません</strong><p>学習データは引き続きこの端末に保存されています。</p><button className="secondary-button" onClick={() => setSyncRefresh((value) => value + 1)}>再試行</button></div>
                )}

                <button className="sync-disable" onClick={() => { void disableCloudSync(); }}>クラウド同期を解除</button>
              </div>
            )}

            {syncMessage && <p className="sync-message" role="status" aria-live="polite">{syncMessage}</p>}
            <p className="modal-note">クラウド同期を解除しても、この端末のデータとJSONバックアップ機能は残ります。</p>
          </div>
        </div>
      )}

      {adding && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAdding(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" aria-label="閉じる" onClick={() => setAdding(false)}>×</button>
            <p className="eyebrow">NEW MATERIAL</p>
            <h2 id="add-title">{editingId ? "教材の構成を編集" : "新しい教材を追加"}</h2>
            <div className="form-grid material-form-grid">
              <label>教材名<input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="例：微分積分学 演習" /></label>
              <label>種類<select value={newKind} onChange={(e) => setNewKind(e.target.value as Material["kind"])}><option>教科書</option><option>参考書</option><option>授業</option></select></label>
            </div>
            <fieldset className="track-settings">
              <legend>記録する内容</legend>
              <div className={newReadingEnabled ? "track-setting enabled" : "track-setting"}>
                <label className="track-check"><input type="checkbox" checked={newReadingEnabled} onChange={(event) => {
                  const enabled = event.target.checked;
                  setNewReadingEnabled(enabled);
                  if (enabled && chapterDrafts.every((chapter) => chapter.readingCount === 0)) setChapterDrafts((items) => items.map((item, index) => index === 0 ? { ...item, readingCount: 1 } : item));
                }} /><span><strong>読む</strong><small>節・ページなどの読了を記録</small></span></label>
                <label>単位<select disabled={!newReadingEnabled} value={newReadingUnit} onChange={(event) => setNewReadingUnit(event.target.value as StudyUnit)}><option>節</option><option>ページ</option><option>項目</option></select></label>
              </div>
              <div className={newExerciseEnabled ? "track-setting enabled" : "track-setting"}>
                <label className="track-check"><input type="checkbox" checked={newExerciseEnabled} onChange={(event) => {
                  const enabled = event.target.checked;
                  setNewExerciseEnabled(enabled);
                  if (enabled && chapterDrafts.every((chapter) => chapter.exerciseCount === 0)) setChapterDrafts((items) => items.map((item, index) => index === 0 ? { ...item, exerciseCount: 1 } : item));
                }} /><span><strong>演習</strong><small>問題の解決を記録</small></span></label>
                <label>単位<select disabled={!newExerciseEnabled} value={newExerciseUnit} onChange={(event) => setNewExerciseUnit(event.target.value as StudyUnit)}><option>問</option><option>項目</option></select></label>
              </div>
            </fieldset>
            <div className="chapter-editor">
              <div className="chapter-editor-title"><strong>章ごとの単位数</strong><button onClick={() => setChapterDrafts((items) => [...items, { title: `第${items.length + 1}章`, exerciseCount: newExerciseEnabled ? 10 : 0, readingCount: newReadingEnabled ? 1 : 0 }])}>＋ 章を追加</button></div>
              {chapterDrafts.map((chapter, index) => (
                <div className="chapter-draft" key={index}>
                  <span>{index + 1}</span>
                  <input aria-label={`${index + 1}章目の名前`} value={chapter.title} onChange={(e) => setChapterDrafts((items) => items.map((item, i) => i === index ? { ...item, title: e.target.value } : item))} placeholder={`第${index + 1}章`} />
                  {newReadingEnabled && <label><span>読む</span><input aria-label={`${index + 1}章目の読む単位数`} type="number" min="0" max="500" value={chapter.readingCount} onChange={(e) => setChapterDrafts((items) => items.map((item, i) => i === index ? { ...item, readingCount: Number(e.target.value) } : item))} />{newReadingUnit}</label>}
                  {newExerciseEnabled && <label><span>演習</span><input aria-label={`${index + 1}章目の演習単位数`} type="number" min="0" max="500" value={chapter.exerciseCount} onChange={(e) => setChapterDrafts((items) => items.map((item, i) => i === index ? { ...item, exerciseCount: Number(e.target.value) } : item))} />{newExerciseUnit}</label>}
                  <button aria-label={`${index + 1}章目を削除`} disabled={chapterDrafts.length === 1} onClick={() => setChapterDrafts((items) => items.filter((_, i) => i !== index))}>×</button>
                </div>
              ))}
            </div>
            <p className="modal-note">「読む」と「演習」は同じ教材に設定できます。各内容には1つ以上の単位が必要です。単位数を減らすと、末尾の記録は削除されます。</p>
            <button className="primary-button wide" disabled={!newTitle.trim() || (!newReadingEnabled && !newExerciseEnabled) || (newReadingEnabled && chapterDrafts.reduce((sum, chapter) => sum + chapter.readingCount, 0) === 0) || (newExerciseEnabled && chapterDrafts.reduce((sum, chapter) => sum + chapter.exerciseCount, 0) === 0)} onClick={saveMaterial}>{editingId ? "変更を保存する" : "教材を作成する"}</button>
          </div>
        </div>
      )}
      {pointToast && <div className="point-toast" role="status" aria-live="polite">{pointToast}</div>}
    </main>
  );
}
