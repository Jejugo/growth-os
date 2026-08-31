export {
  registerProduct,
  registerIdeaProduct,
  setProductStage,
  analyzeProduct,
  createProfile,
  editProfileField,
  unlockProfileField,
  mergeProfile,
  buildAiValues,
  toProfileValues,
  ProductAlreadyExistsError,
  type ProfileValues,
  type AnalysisOutcome,
} from './service'

export {
  findProduct,
  findProductByDomain,
  findProductIdsByStage,
  listProducts,
  getCurrentProfile,
  listProfileVersions,
  deleteProduct,
} from './repo'

export { normalizeProductUrl, domainOf, InvalidUrlError, isPrivateAddress } from './url'

export {
  COLUMN_FIELDS,
  DATA_FIELDS,
  EDITABLE_FIELDS,
  FIELD_LABELS,
  isEditableField,
  type EditableField,
  type ColumnField,
  type ProfileData,
} from './types'

export type { Product, ProductProfile, CrawlSnapshot, ProductStage } from './schema'
