export {
  approvePost,
  rejectPost,
  editPost,
  rejectIdea,
  listPosts,
  findPost,
  listIdeas,
  findIdea,
  recentPostsMemory,
  recentRejectionReasons,
  recentAngleUsage,
  createExperimentWithVariants,
  findExperiment,
  listExperimentVariants,
  startExperimentById,
  setPostVariant,
  hasAnyExperiment,
  InvalidTransitionError,
} from './service'

export { checkDedupe, prepareFingerprint, normalizeText } from './dedupe'

export {
  CONTENT_ANGLES,
  ANGLE_LABELS,
  CHANNEL_CAPABILITIES,
  type ContentAngle,
  type RiskReview,
  type DedupeVerdict,
} from './types'

export type {
  SocialPost,
  ContentIdea,
  ContentAsset,
  ContentFingerprint,
  Experiment,
  ExperimentVariant,
} from './schema'
