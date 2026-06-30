# Task 8 Testing - Quick Start Guide

**Status:** ✅ Automated Tests Complete - Manual Testing Ready

---

## 🎯 What You Need To Do

### Step 1: Run Automated Tests (5 minutes)
```bash
cd /home/tools/public_html/dashboard-app
./test-capabilities-api.sh
```
**Expected:** All 5 tests should PASS ✅

---

### Step 2: Import a Model with Schema (5 minutes)
1. Go to: http://localhost:6116/dashboard/admin
2. Click: **Providers** tab → **Replicate** → **Browse Replicate**
3. Search: `lucataco/flux-dev-lora`
4. Click: **Import model**
5. Wait for success message

---

### Step 3: Verify Schema Stored (2 minutes)
```bash
npx prisma studio
```
1. Open **ProviderModel** table
2. Find: `lucataco/flux-dev-lora`
3. Check: `metadata.openapi_schema` has data ✅

---

### Step 4: Test the API (2 minutes)
```bash
# Get the model ID from Prisma Studio, then run:
curl http://localhost:6116/api/models/YOUR_MODEL_ID/capabilities | jq
```
**Expected:**
```json
{
  "capabilities": {
    "supportsReferenceImages": true,
    "imageInputField": { ... },
    "supportsNegativePrompt": true,
    "acceptedParams": [...]
  }
}
```

---

### Step 5: Test UI Form (10 minutes)

#### Test A: Text-Only Model (Should Disable Reference Images)
1. Go to: http://localhost:6116/dashboard/create-image
2. Select: **tencent/hunyuan-image-3**
3. ✅ Check: "Reference Images" section is greyed out with lock icon
4. ✅ Check: Cannot expand the section

#### Test B: Image-Capable Model (Should Enable Reference Images)
1. Select: **lucataco/flux-dev-lora** (the model you just imported)
2. ✅ Check: "Reference Images" section is enabled (no lock icon)
3. ✅ Check: Can expand and upload images

#### Test C: State Persistence
1. With **lucataco/flux-dev-lora** selected, upload a test image
2. Switch to: **tencent/hunyuan-image-3** (section becomes disabled)
3. Switch back to: **lucataco/flux-dev-lora**
4. ✅ Check: Your uploaded image is still there

---

### Step 6: Test End-to-End Generation (15 minutes)
1. Select: **lucataco/flux-dev-lora**
2. Upload: A test image (face photo works well)
3. Prompt: "professional headshot, studio lighting"
4. Click: **Generate Image**
5. ✅ Check: Job appears in library
6. ✅ Check: Generation completes successfully
7. Monitor: `pm2 logs pixelfoundry --lines 50` (should show no errors)

---

## 📋 Full Testing Checklist

For comprehensive testing (13 detailed scenarios):
```bash
cat docs/TESTING-CHECKLIST-TASK8.md
```

---

## 🔍 If Something Goes Wrong

### API Returns 404
```bash
# Get valid model IDs:
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const models = await prisma.providerModel.findMany({
    select: { id: true, slug: true },
    take: 5
  });
  console.log(models);
  await prisma.\$disconnect();
}
main();
"
```

### Server Not Responding
```bash
pm2 restart pixelfoundry
pm2 logs pixelfoundry --lines 50
```

### Build Issues
```bash
npm run build
```

### Schema Data Not Present
- Re-import the model through admin panel
- Check that you're testing with a newly imported model (not pre-existing)

---

## ✅ Success Criteria

You can mark Task 8 as COMPLETE when:
- [ ] Automated test script passes (5/5)
- [ ] At least one model has schema data
- [ ] API returns correct capabilities for that model
- [ ] Form sections enable/disable based on model
- [ ] State persists when switching models
- [ ] End-to-end image generation works with reference images

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| `test-capabilities-api.sh` | Automated tests (run this first) |
| `docs/TESTING-CHECKLIST-TASK8.md` | 13 detailed manual test scenarios |
| `docs/TASK8-TEST-RESULTS.md` | Automated test results & metrics |
| `TASK8-SUMMARY.md` | Complete summary & recommendations |
| `TASK8-QUICK-START.md` | This file - quick reference |

---

## 🚀 Current Status

- ✅ Server: Running at http://localhost:6116
- ✅ Build: Successful (Build ID: BoPiYWRTxdflDZ2xa-JWC)
- ✅ API: Operational (5/5 tests passing)
- ✅ Files: All present and verified
- ⏳ Manual UI Testing: Awaiting user completion

---

## ⏱️ Estimated Time

| Task | Time | Status |
|------|------|--------|
| Automated Tests | 5 min | ✅ DONE |
| Import Model | 5 min | ☐ TODO |
| Verify Schema | 2 min | ☐ TODO |
| Test API | 2 min | ☐ TODO |
| Test UI | 10 min | ☐ TODO |
| End-to-End Test | 15 min | ☐ TODO |
| **TOTAL** | **~40 min** | **In Progress** |

---

## 💡 Pro Tips

1. **Use jq for JSON formatting**: Install with `sudo apt-get install jq`
2. **Keep Prisma Studio open**: Makes testing faster
3. **Test with multiple models**: Import 2-3 different models
4. **Monitor logs in real-time**: `pm2 logs pixelfoundry -f`
5. **Use browser DevTools**: Network tab shows API calls

---

## 🎉 You're Almost Done!

The hard work (Tasks 1-7) is complete. This is just verification that everything works as designed. If you run into any issues, all the documentation is there to help troubleshoot.

**Good luck!** 🚀

---

**Quick Links:**
- Server: http://localhost:6116
- Admin Panel: http://localhost:6116/dashboard/admin
- Create Image: http://localhost:6116/dashboard/create-image
- Library: http://localhost:6116/dashboard/library
