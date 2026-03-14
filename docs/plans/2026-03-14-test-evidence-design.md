# Test Evidence — Screenshot & File Attachments During Execution

## Problem

QA engineers find issues during test execution but have no way to capture evidence in the moment. Screenshots, logs, and recordings sit on their desktop and rarely make it to the defect report. When they do, it's a manual process: take screenshot, open Linear, find the issue, upload. By the time they get back to Velo, they've lost their flow.

The result: defects filed without evidence, developers asking "can you show me?", and time wasted reproducing issues that were already observed.

## Solution

Let QA upload evidence (screenshots, logs, screen recordings) directly from the execution screen. Files are stored in Cloudflare R2. When a defect is logged, all evidence attached to that case is automatically synced to the Linear issue — the developer gets the screenshots without the QA ever leaving Velo.

## User Flow

### During Execution

Below the steps (above the notes textarea), a new **Evidence** section appears:

- Drag-drop zone or click-to-upload button
- Accepts images (PNG, JPEG, WebP, GIF), PDFs, text/log files, and video (MP4, WebM)
- Max file size: 10MB per file, 5 files per run item
- Uploaded files appear as a horizontal strip of thumbnails (images) or file pills (non-images)
- Each attachment has a delete button (x) and opens in a new tab on click (presigned URL)

### When Logging a Defect

After clicking "Log Defect" and the defect is created:

1. Velo saves the defect to the database (existing flow)
2. Velo creates the Linear issue (existing flow)
3. Velo uploads each attached evidence file to the Linear issue as attachments (new)
4. Toast shows: "Defect logged: VEL-XX with N attachments"

If Linear attachment upload fails for any file, the defect is still created — evidence lives in Velo regardless. A warning toast notes which files failed to sync.

### Viewing Evidence Later

On the run detail page and execution history, cases with evidence show a small paperclip icon + count. Clicking opens the attachment list with presigned download URLs.

## Architecture

### Database

New table: `run_item_attachments`

```sql
CREATE TABLE run_item_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_item_id UUID NOT NULL REFERENCES run_items(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  r2_key VARCHAR(500) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

R2 key format: `evidence/{workspaceId}/{runItemId}/{uuid}.{ext}`

RLS: same workspace_id enforcement as other tenant tables.

### API Endpoints

**Upload:** `POST /api/workspaces/:workspaceId/run-items/:itemId/attachments`
- Multipart file upload (same pattern as avatar)
- Validates: file type, file size (10MB), count per item (max 5)
- Stores in R2, records in DB
- Returns: `{ id, filename, content_type, size_bytes, created_at }`

**List:** `GET /api/workspaces/:workspaceId/run-items/:itemId/attachments`
- Returns array of attachments with presigned download URLs (1-hour expiry)
- Returns: `[{ id, filename, content_type, size_bytes, url, created_at }]`

**Delete:** `DELETE /api/workspaces/:workspaceId/run-items/:itemId/attachments/:attachmentId`
- Removes from R2 and DB
- Only the uploader or an admin can delete

### Linear Sync (on defect creation)

Modify `handleFileDefect` flow in defects.ts:

1. After creating the Linear issue (existing)
2. Fetch attachments for the run_item_id from DB
3. For each attachment:
   - Download from R2 (internal, no presigned URL needed — use GetObjectCommand)
   - Convert to base64
   - Call Linear `create_attachment` with the issue identifier
4. Log success/failure per attachment

Linear's attachment API accepts base64-encoded content with filename and content type — maps directly to what we store.

### R2 Utilities (already exist)

From `apps/api/src/lib/r2.ts`:
- `uploadToR2(key, buffer, contentType)` — stores file
- `getR2PresignedUrl(key)` — 1-hour download URL
- `deleteR2Objects(keys)` — batch delete
- `r2Enabled()` — guard for environments without R2

Need to add: `downloadFromR2(key): Promise<Buffer>` — for reading files back when syncing to Linear. Simple `GetObjectCommand` wrapper.

### Frontend Components

**New files:**
- `EvidenceUpload.tsx` — drag-drop upload zone + attachment strip in execution screen

**Modified files:**
- `ExecutionScreen.tsx` — add EvidenceUpload section between steps and notes
- `defects.ts` (API) — after Linear issue creation, sync attachments

### File Type Validation

```typescript
const ALLOWED_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "application/pdf",
  "text/plain", "text/csv", "application/json",
  "video/mp4", "video/webm",
])
const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10MB
const MAX_ATTACHMENTS_PER_ITEM = 5
```

## Edge Cases

1. **R2 not configured (local dev):** Upload endpoint returns 503 "File uploads not available in this environment"
2. **Max attachments reached:** Upload returns 409 "Maximum 5 attachments per test case"
3. **File too large:** Upload returns 413 before streaming to R2
4. **Linear sync fails:** Defect is still created, evidence lives in Velo. Toast warns about sync failure.
5. **Attachment on non-fail case:** Allowed — QA might attach evidence to a blocked case or even a pass (documenting expected behavior)
6. **Run item deleted:** CASCADE deletes attachment rows. R2 objects orphaned — cleaned up by lifecycle sweep (already exists for ingestion payloads)
7. **Duplicate filenames:** Allowed — R2 key uses UUID, filename is display-only

## What This Is NOT

- **Not a full file manager.** Upload, view, delete — no folders, no renaming, no sharing.
- **Not version-controlled.** Upload once, delete if wrong, upload again.
- **Not automatic screen capture.** QA takes the screenshot themselves and uploads it. Browser extensions for auto-capture are out of scope.

## Implementation Estimate

- 1 migration (~15 lines)
- 1 new R2 function: `downloadFromR2` (~10 lines)
- 1 new API route file: `run-item-attachments.ts` (~120 lines — upload, list, delete)
- Modify `defects.ts`: Linear attachment sync (~40 lines)
- 1 new frontend component: `EvidenceUpload.tsx` (~200 lines)
- Modify `ExecutionScreen.tsx`: add evidence section (~10 lines)
- Total: ~395 lines of new code
