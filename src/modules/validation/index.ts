export {
  createIdeaProduct,
  startValidation,
  concludeValidationById,
  abortRunningValidation,
  markLaunched,
  recordManualSignal,
  changeStage,
  assertValidStageTransition,
  STAGE_TRANSITIONS,
  InvalidStageTransitionError,
  ValidationStateError,
  findLatestBrief,
  findBriefById,
  listValidations,
  findRunningValidation,
  findValidation,
  findDueValidations,
  listStageEvents,
  getValidationMetrics,
  getVariantPerformance,
  rewriteValidationPost,
  RewriteNotAllowedError,
  startLandingPageGeneration,
  generateLandingPage,
  startCustomLandingUpload,
  deployCustomLanding,
  LandingGenerationError,
  findLatestLandingPage,
  findLandingPage,
  listWaitlistSignups,
} from './service'

export { parseCustomLandingZip, CustomLandingUploadError } from './landing/custom-upload'

export { evaluateGate, type GateResult, type GateMetrics, type GateThresholds, type ValidationVerdict, type GateRule } from './gate'

export { VALIDATION_SIGNAL_WEIGHTS, SIGNAL_LABELS, STRONG_SIGNAL_EVENT_TYPES } from './signals'

export { briefInputSchema, type BriefInput } from './types'

export type { ProductBrief, Validation, ProductStageEvent, LandingPage, WaitlistSignup } from './schema'
