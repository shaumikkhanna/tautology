export {
	diversifyRecommendations,
	facetJaccard,
	genreJaccard,
} from "./diversify.ts";
export {
	rankDiscoverCandidates,
	recommendDiscover,
	recommendPlayNext,
	scoreCandidate,
} from "./scoring.ts";
export {
	buildTasteProfile,
	getLatestFeedbackByGame,
	getLatestFeedbackByIgdbId,
	getPreferenceWeight,
} from "./signals.ts";
export { buildTasteClusters, getTasteClusterMatch } from "./clusters.ts";
export {
	buildFacetFilter,
	buildFacetRetrievalQueries,
	mergeFacetCandidateResults,
} from "./facetRetrieval.ts";
export type {
	FacetRetrievalQuery,
	RetrievalFacet,
	RetrievalFacetField,
	WeightedFacetSeed,
} from "./facetRetrieval.ts";
export type {
	PlayNextOptions,
	PlayNextRecommendation,
	DiscoverCandidateBase,
	DiscoverRecommendation,
	RecommendationGame,
	RecommendationFeedback,
	RecommendationFeedbackAction,
	RecommendationScore,
	RecommendationStatus,
	TasteProfile,
	TasteCluster,
	TasteClusterMatch,
} from "./types.ts";
export { recommendationVersions } from "./version.ts";
export { getDiscoverCandidateSource } from "./logging.ts";
export type { RecommendationCandidateSource } from "./logging.ts";
export {
	evaluateRecommendations,
	getEligibleCandidates,
	recommendationEvaluationVariants,
} from "./evaluation.ts";
export type {
	EvaluationMetrics,
	EvaluationRankingInput,
	EvaluationVariant,
	EvaluationVariantResult,
	RecommendationEvaluationReport,
} from "./evaluation.ts";
export {
	evaluationFixtureVersion,
	recommendationEvaluationCases,
} from "./evaluation.fixtures.ts";
export type {
	EvaluationCandidate,
	RecommendationEvaluationCase,
} from "./evaluation.fixtures.ts";
export {
	buildRecommendationDocument,
	cosineSimilarity,
	getRecommendationDocumentFields,
	getSemanticScore,
	gteSmallEmbeddingModel,
	hashRecommendationDocument,
	semanticDocumentVersion,
	validateEmbeddingBatch,
} from "./semantic.ts";
export {
	buildBlindRankingComparison,
	globalProfileVariant,
	multiInterestVariant,
} from "./blindEvaluation.ts";
export type {
	BlindRankingComparison,
	BlindRankingGame,
	BlindRankingVariant,
} from "./blindEvaluation.ts";
export type {
	EmbeddingProvider,
	SemanticScore,
	SemanticScoreInput,
	SemanticGameDocumentInput,
} from "./semantic.ts";
export {
	buildRecommendationOutcomeEvents,
	recommendationOutcomeAttributionDays,
} from "./outcomes.ts";
export type {
	RecommendationOutcome,
	RecommendationOutcomeEvent,
} from "./outcomes.ts";
export {
	analyzeRecommendationOutcomes,
	defaultMinimumOutcomeSampleSize,
	defaultOutcomeMaturityDays,
	getWilsonInterval,
	outcomeAnalysisVersion,
} from "./outcomeAnalysis.ts";
export type {
	BinomialOutcomeMetric,
	OutcomeAnalysisGroup,
	RecommendationOutcomeAnalysis,
	RecommendationOutcomeExport,
} from "./outcomeAnalysis.ts";
