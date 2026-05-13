export type CrosswordStats = {
  solvedCount: number;
  perfectCount: number;
  averageCompletedSeconds: number | null;
  standardDeviationCompletedSeconds: number | null;
};

export type CrosswordStatsProgress = {
  elapsed_seconds: number;
  completed_at: string | null;
  perfect: boolean;
};

export const emptyCrosswordStats: CrosswordStats = {
  solvedCount: 0,
  perfectCount: 0,
  averageCompletedSeconds: null,
  standardDeviationCompletedSeconds: null,
};

export function calculateCrosswordStats(
  progress: CrosswordStatsProgress[],
): CrosswordStats {
  const completed = progress.filter((item) => item.completed_at);
  const perfectCompleted = completed.filter((item) => item.perfect);
  const completedSeconds = perfectCompleted.map((item) => item.elapsed_seconds);
  const averageCompletedSeconds =
    completedSeconds.length > 0
      ? Math.round(
          completedSeconds.reduce((total, seconds) => total + seconds, 0) /
            completedSeconds.length,
        )
      : null;

  return {
    solvedCount: completed.length,
    perfectCount: perfectCompleted.length,
    averageCompletedSeconds,
    standardDeviationCompletedSeconds:
      averageCompletedSeconds === null
        ? null
        : Math.round(
            Math.sqrt(
              completedSeconds.reduce(
                (total, seconds) =>
                  total + (seconds - averageCompletedSeconds) ** 2,
                0,
              ) / completedSeconds.length,
            ),
          ),
  };
}
