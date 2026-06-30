# Task 8: End-to-End Testing Checklist
## Schema-Driven Dynamic Form Implementation

**Date:** 2025-10-14
**Server:** http://localhost:6116
**Status:** Ready for Manual Testing

---

## Automated Test Results

### ✅ Server Status
- **PM2 Status:** Online
- **Server URL:** http://localhost:6116
- **Uptime:** Running
- **Restart Count:** 827 (some pre-existing database schema issues in logs, but not related to this feature)

### ✅ Capabilities API Tests
- **Valid Model (200):** ✅ Returns capabilities JSON
- **Invalid Model (404):** ✅ Returns proper error message
- **Response Format:** ✅ Correct JSON structure
- **Error Handling:** ✅ Graceful degradation

Example Response:
```json
{
  "capabilities": {
    "supportsReferenceImages": false,
    "supportsNegativePrompt": false,
    "imageInputField": null,
    "acceptedParams": []
  }
}
```

### ✅ Build Verification
- **Build Status:** ✅ Successful
- **Build ID:** BoPiYWRTxdflDZ2xa-JWC
- **New Files Present:**
  - `/api/models/[id]/capabilities` route ✅
  - `src/lib/model-capabilities.ts` ✅
  - `src/hooks/use-model-capabilities.ts` ✅
- **No Build Errors:** ✅ (Only ESLint warnings unrelated to this feature)

---

## Manual Testing Checklist

### Test 1: Model Import with Schema
**Goal:** Verify that importing a new model fetches and stores the `openapi_schema`.

**Steps:**
1. [ ] Navigate to http://localhost:6116/dashboard/admin
2. [ ] Click on "Providers" tab
3. [ ] Select "Replicate" provider
4. [ ] Click "Browse Replicate" button
5. [ ] Search for `lucataco/flux-dev-lora` (known to support reference images)
6. [ ] Click "Import model" button
7. [ ] Wait for success message
8. [ ] Open Prisma Studio: `npx prisma studio`
9. [ ] Find the newly imported model in ProviderModel table
10. [ ] Check `metadata.openapi_schema` field
11. [ ] Verify it contains schema data (should have `components.schemas.Input`)

**Expected Result:**
- Model imports successfully
- `metadata.openapi_schema` is populated with OpenAPI schema data
- Schema contains Input/Output definitions

**Actual Result:**
- [ ] Pass
- [ ] Fail (describe issue): ___________________

---

### Test 2: Capabilities API Endpoint
**Goal:** Verify the API returns parsed capabilities.

**Steps:**
1. [ ] Get the model ID from the imported model (from Prisma Studio or database)
2. [ ] Run this command (replace MODEL_ID):
   ```bash
   curl http://localhost:6116/api/models/MODEL_ID/capabilities | jq
   ```
3. [ ] Verify response contains:
   - `capabilities.supportsReferenceImages` (boolean)
   - `capabilities.supportsNegativePrompt` (boolean)
   - `capabilities.imageInputField` (object or null)
   - `capabilities.acceptedParams` (array)

**Expected Result:**
- Returns 200 status code
- JSON response matches expected format
- Capabilities reflect the model's actual features

**Actual Result:**
- [ ] Pass
- [ ] Fail (describe issue): ___________________

---

### Test 3: Dynamic Form - Text-Only Model
**Goal:** Verify form sections disable correctly for models without reference image support.

**Steps:**
1. [ ] Navigate to http://localhost:6116/dashboard/create-image
2. [ ] Select "tencent/hunyuan-image-3" model (text-only, no reference images)
3. [ ] Wait for form to load (watch for "Loading model capabilities..." banner)
4. [ ] Scroll down to "Reference Images" section
5. [ ] Verify the section shows:
   - Lock icon instead of image icon
   - Greyed out / disabled appearance
   - Cannot be expanded/opened
   - Shows message: "This model doesn't support reference images"
6. [ ] Check "Negative Prompt" section (may or may not be disabled depending on schema)

**Expected Result:**
- Reference Images section is visibly disabled
- Lock icon is displayed
- Section cannot be opened
- Form remains usable for other fields

**Actual Result:**
- [ ] Pass
- [ ] Fail (describe issue): ___________________

---

### Test 4: Dynamic Form - Image-Capable Model
**Goal:** Verify form sections enable for models with reference image support.

**Steps:**
1. [ ] Stay on http://localhost:6116/dashboard/create-image
2. [ ] Select a model that supports reference images (e.g., `lucataco/flux-dev-lora` if imported)
3. [ ] Wait for form to update
4. [ ] Verify "Reference Images" section:
   - Shows image icon (not lock)
   - Normal styling (not greyed out)
   - Can be expanded/opened
   - Shows subtitle: "Upload or select images to guide the generation"
5. [ ] Click to expand the section
6. [ ] Verify the upload area is accessible

**Expected Result:**
- Reference Images section is enabled and interactive
- Section can be expanded
- Upload functionality is available

**Actual Result:**
- [ ] Pass
- [ ] Fail (describe issue): ___________________

---

### Test 5: State Persistence During Model Switch
**Goal:** Verify form state persists when switching between compatible and incompatible models.

**Steps:**
1. [ ] On Create Image page, select a model that supports reference images
2. [ ] Expand "Reference Images" section
3. [ ] Upload a test image (or select from library)
4. [ ] Verify image appears in the form
5. [ ] Now switch to "tencent/hunyuan-image-3" (incompatible model)
6. [ ] Observe the Reference Images section becomes disabled/greyed out
7. [ ] Switch back to the compatible model
8. [ ] Expand Reference Images section
9. [ ] Verify the uploaded image is still present

**Expected Result:**
- Uploaded images remain in form state when switching models
- Form does not lose user data
- Section enables/disables appropriately
- User experience is smooth

**Actual Result:**
- [ ] Pass
- [ ] Fail (describe issue): ___________________

---

### Test 6: Loading States
**Goal:** Verify loading indicators display during capability fetching.

**Steps:**
1. [ ] Navigate to Create Image page
2. [ ] Open browser DevTools → Network tab
3. [ ] Select a different model from dropdown
4. [ ] Watch for:
   - "Loading model capabilities..." banner at top of form
   - Network request to `/api/models/[id]/capabilities`
5. [ ] Verify banner disappears after capabilities load
6. [ ] Check Network tab for request details (should be successful)

**Expected Result:**
- Loading banner appears during fetch
- Banner disappears after successful load
- Form remains usable during loading

**Actual Result:**
- [ ] Pass
- [ ] Fail (describe issue): ___________________

---

### Test 7: Error Handling - Missing Schema
**Goal:** Verify graceful degradation when model has no schema data.

**Steps:**
1. [ ] Select a model that was imported before Task 1 (has no openapi_schema)
2. [ ] Examples: "flux-kontext-apps/change-haircut", "google/nano-banana"
3. [ ] Observe form behavior
4. [ ] Verify all sections are enabled (fail-open behavior)
5. [ ] Check browser console for any errors

**Expected Result:**
- Form shows all sections as enabled (safe default)
- No JavaScript errors in console
- Form is fully functional
- User can proceed with image generation

**Actual Result:**
- [ ] Pass
- [ ] Fail (describe issue): ___________________

---

### Test 8: Error Handling - Network Failure
**Goal:** Verify behavior when capabilities API fails.

**Steps:**
1. [ ] Open browser DevTools → Network tab
2. [ ] Enable "Offline" mode or throttle to "Offline"
3. [ ] On Create Image page, select a different model
4. [ ] Observe form behavior
5. [ ] Check browser console for error handling
6. [ ] Disable offline mode
7. [ ] Verify form recovers

**Expected Result:**
- Form defaults to showing all sections enabled
- User sees appropriate loading/error state
- Console logs error gracefully
- Form remains usable

**Actual Result:**
- [ ] Pass
- [ ] Fail (describe issue): ___________________

---

### Test 9: API Caching
**Goal:** Verify capabilities API responses are cached.

**Steps:**
1. [ ] Open browser DevTools → Network tab
2. [ ] Clear cache and reload page
3. [ ] Select a model (e.g., "tencent/hunyuan-image-3")
4. [ ] Note the capabilities API request
5. [ ] Switch to another model, then back to the first model
6. [ ] Check if the API request is made again or served from cache
7. [ ] Look for cache headers in the response

**Expected Result:**
- First request fetches from server
- Subsequent requests may use browser cache
- Response headers indicate caching (Cache-Control or similar)
- Performance is improved on repeated model selections

**Actual Result:**
- [ ] Pass
- [ ] Fail (describe issue): ___________________

---

### Test 10: End-to-End Image Generation
**Goal:** Verify actual image generation works with reference images.

**Steps:**
1. [ ] Select a model that supports reference images (imported in Test 1)
2. [ ] Expand Reference Images section
3. [ ] Upload a test image (face photo recommended)
4. [ ] Enter prompt: "professional headshot, studio lighting"
5. [ ] Set other parameters (width, height, etc.)
6. [ ] Click "Generate Image" or submit button
7. [ ] Monitor job creation
8. [ ] Check PM2 logs: `pm2 logs pixelfoundry --lines 50`
9. [ ] Verify job appears in dashboard/library
10. [ ] Wait for generation to complete
11. [ ] Verify output image is generated

**Expected Result:**
- Job is created successfully
- Reference image is included in API request to Replicate
- No errors in PM2 logs
- Image generation completes
- Result appears in library

**Actual Result:**
- [ ] Pass
- [ ] Fail (describe issue): ___________________

---

### Test 11: Negative Prompt Capability
**Goal:** Verify negative prompt section disables/enables correctly.

**Steps:**
1. [ ] Select different models and observe "Negative Prompt" section
2. [ ] For models with negative_prompt in schema: section should be enabled
3. [ ] For models without: section should be disabled with lock icon
4. [ ] Test with at least 2-3 different models

**Expected Result:**
- Negative Prompt section behavior matches model capabilities
- Disabled state displays correctly with lock icon
- Enabled state allows text input

**Actual Result:**
- [ ] Pass
- [ ] Fail (describe issue): ___________________

---

### Test 12: CollapsibleSection Disabled State
**Goal:** Verify the CollapsibleSection component disabled state works correctly.

**Steps:**
1. [ ] Find any disabled section (Reference Images with incompatible model)
2. [ ] Verify visual styling:
   - Opacity reduced (appears greyed out)
   - Lock icon visible
   - Cursor shows "not-allowed" on hover
3. [ ] Try clicking the section header
4. [ ] Verify it does not expand
5. [ ] Verify chevron icon is not shown
6. [ ] Check the disabled message is displayed

**Expected Result:**
- Visual feedback clearly indicates disabled state
- Section cannot be interacted with
- Lock icon and disabled message are visible
- Styling matches design intent

**Actual Result:**
- [ ] Pass
- [ ] Fail (describe issue): ___________________

---

### Test 13: Refresh Model Schema (Admin Function)
**Goal:** Verify the refresh schema server action works (if UI is implemented).

**Steps:**
1. [ ] Navigate to http://localhost:6116/dashboard/admin
2. [ ] Find a Replicate model in the models list
3. [ ] If "Refresh Schema" button exists, click it
4. [ ] Verify success message
5. [ ] Check Prisma Studio to see updated schema
6. [ ] Test capabilities API to verify changes

**Note:** If UI is not yet implemented, this can be tested programmatically:
```bash
# Test will be added when UI is complete
# For now, re-importing a model refreshes its schema
```

**Expected Result:**
- Schema refresh completes successfully
- Updated schema is stored in database
- Capabilities API reflects changes

**Actual Result:**
- [ ] Pass
- [ ] Fail (describe issue): ___________________
- [ ] Not implemented yet (skip)

---

## Performance & Quality Checks

### Performance
- [ ] Form loads quickly (< 2 seconds)
- [ ] Model switching is responsive (< 1 second)
- [ ] No visible lag when expanding/collapsing sections
- [ ] Capabilities API response time is acceptable (< 500ms)

### UI/UX
- [ ] Disabled sections are clearly distinguishable
- [ ] Loading states are visible but not intrusive
- [ ] No layout shift when capabilities load
- [ ] Error messages are user-friendly
- [ ] Icons are appropriate and clear

### Code Quality
- [ ] No console errors during normal operation
- [ ] Network requests are efficient (no redundant calls)
- [ ] Form validation still works correctly
- [ ] No TypeScript errors in browser console

---

## Known Issues & Notes

### Current State
- Most existing models do NOT have `openapi_schema` data (imported before Task 1)
- To test with schema data, need to import a NEW model after Task 1 completion
- PM2 logs show pre-existing database schema issues (ImagePreset table, jobType column) - these are unrelated to this feature

### Database State
Total models checked: 10
Models with openapi_schema: 0

This is expected! Models need to be re-imported or refreshed to populate schemas.

### Recommended Test Models
For testing reference image capabilities:
- `lucataco/flux-dev-lora` (supports reference images)
- `flux-kontext-apps/professional-headshot` (re-import to get schema)
- Any flux-based model with reference image input

For testing text-only (no reference images):
- `tencent/hunyuan-image-3` (confirmed text-only)

---

## Post-Testing Actions

### If All Tests Pass
- [ ] Mark Task 8 as complete
- [ ] Document any minor UX improvements for future enhancement
- [ ] Update README with new features
- [ ] Consider deploying to staging environment

### If Issues Found
- [ ] Document each issue in detail
- [ ] Create GitHub issues or task list
- [ ] Prioritize fixes (critical vs. nice-to-have)
- [ ] Re-test after fixes

---

## Additional Test Scenarios (Optional)

### Edge Cases
- [ ] Test with model that has malformed schema
- [ ] Test with very large schema (performance)
- [ ] Test rapid model switching (race conditions)
- [ ] Test with no internet connection
- [ ] Test with expired authentication

### Accessibility
- [ ] Keyboard navigation works for disabled sections
- [ ] Screen reader announces disabled state
- [ ] Focus states are visible and appropriate

### Cross-Browser (if applicable)
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari

---

## Testing Summary

**Date Tested:** ___________________
**Tested By:** ___________________
**Overall Status:** [ ] Pass [ ] Fail [ ] Partial

**Critical Issues:** ___________________
**Minor Issues:** ___________________
**Notes:** ___________________

---

## Quick Test Commands

```bash
# Check server status
pm2 status

# View logs
pm2 logs pixelfoundry --lines 50

# Test capabilities API (replace MODEL_ID)
curl http://localhost:6116/api/models/MODEL_ID/capabilities | jq

# Get model IDs from database
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const models = await prisma.providerModel.findMany({
    take: 5,
    select: { id: true, slug: true, displayName: true },
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(models, null, 2));
  await prisma.\$disconnect();
}
main();
"

# Run fresh build
npm run build

# Open Prisma Studio
npx prisma studio
```

---

**End of Testing Checklist**
