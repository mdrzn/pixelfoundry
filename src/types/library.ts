export type LibraryJobType = "CREATE_IMAGE" | "EDIT_IMAGE" | "CREATE_VIDEO"
export type LibraryJobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED"
export type LibraryAssetType = "IMAGE" | "VIDEO" | "UNKNOWN"

export type LibraryAsset = {
  id: string
  jobId: string
  assetId: string | null
  jobType: LibraryJobType
  jobStatus: LibraryJobStatus
  assetType: LibraryAssetType
  title: string | null
  prompt: string
  negativePrompt: string | null
  providerModelId: string | null
  providerDisplayName: string | null
  providerSlug: string | null
  providerLabel: string | null
  aspectRatio: string | null
  mode: "INPAINT" | "OUTPAINT" | "STYLE" | null
  duration: number | null
  frameRate: number | null
  referenceUrl: string | null
  inputImageUrl: string | null
  maskUrl: string | null
  assetUrl: string | null
  previewUrl: string | null
  thumbnailUrl: string | null
  hasAsset: boolean
  createdAt: string
  completedAt: string | null
  cost: number
  isFavorite: boolean
  tags: string[]
  collections: string[]
  shareToken: string | null
  shareCreatedAt: string | null
  failureReason: string | null
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
  metadata: Record<string, unknown>
}

export type AssetSource = "generated" | "uploaded"

export type AssetLibraryItem = {
  id: string
  type: "IMAGE" | "VIDEO"
  source: AssetSource
  title: string | null
  url: string
  thumbnail: string
  createdAt: string
  isFavorite: boolean
  tags: string[]
  collections: string[]
  shareToken: string | null
  shareCreatedAt: string | null

  // Upload metadata (if uploaded)
  uploadInfo: {
    originalName: string
    size: number
    uploadedAt: string
  } | null

  // Usage tracking
  usageCount: number // Number of jobs that used this as input
  isJobOutput: boolean // True if this is an output of a job
  outputJobId: string | null // Job that generated this (if any)

  // Full metadata
  metadata: Record<string, unknown>
}
