#!/bin/bash
# Automated API Testing Script for Task 8
# Schema-Driven Dynamic Form Implementation

echo "=========================================="
echo "Task 8: Capabilities API Testing"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Function to test API endpoint
test_api() {
    local test_name=$1
    local url=$2
    local expected_status=$3

    echo -n "Testing: $test_name ... "

    response=$(curl -s -w "\n%{http_code}" "$url")
    body=$(echo "$response" | head -n -1)
    status=$(echo "$response" | tail -n 1)

    if [ "$status" = "$expected_status" ]; then
        echo -e "${GREEN}PASS${NC} (HTTP $status)"
        PASSED=$((PASSED + 1))

        # Pretty print JSON if jq is available
        if command -v jq &> /dev/null && [ "$status" = "200" ]; then
            echo "$body" | jq . 2>/dev/null || echo "$body"
        fi
    else
        echo -e "${RED}FAIL${NC} (Expected: $expected_status, Got: $status)"
        FAILED=$((FAILED + 1))
        echo "Response: $body"
    fi
    echo ""
}

# Check if server is running
echo "Checking server status..."
if curl -s http://localhost:6116 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Server is running at http://localhost:6116"
else
    echo -e "${RED}✗${NC} Server is not responding at http://localhost:6116"
    echo "Please start the server with: pm2 start pixelfoundry"
    exit 1
fi
echo ""

# Get sample model IDs
echo "Fetching model IDs from database..."
MODEL_IDS=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const models = await prisma.providerModel.findMany({
    take: 3,
    select: { id: true, slug: true },
    orderBy: { createdAt: 'desc' }
  });
  models.forEach(m => console.log(\`\${m.id}|\${m.slug}\`));
  await prisma.\$disconnect();
}
main();
" 2>/dev/null)

if [ -z "$MODEL_IDS" ]; then
    echo -e "${RED}✗${NC} Could not fetch model IDs from database"
    exit 1
fi

echo -e "${GREEN}✓${NC} Found models in database"
echo ""

# Parse first model ID
FIRST_MODEL=$(echo "$MODEL_IDS" | head -n 1)
MODEL_ID=$(echo "$FIRST_MODEL" | cut -d'|' -f1)
MODEL_SLUG=$(echo "$FIRST_MODEL" | cut -d'|' -f2)

echo "Using test model: $MODEL_SLUG (ID: $MODEL_ID)"
echo ""

echo "=========================================="
echo "Running API Tests"
echo "=========================================="
echo ""

# Test 1: Valid model ID
test_api "Valid model capabilities" \
    "http://localhost:6116/api/models/$MODEL_ID/capabilities" \
    "200"

# Test 2: Invalid model ID
test_api "Invalid model ID (should 404)" \
    "http://localhost:6116/api/models/invalid-model-id-12345/capabilities" \
    "404"

# Test 3: Multiple models
echo "Testing multiple models..."
MODEL_COUNT=0
while IFS= read -r line; do
    if [ -n "$line" ]; then
        MODEL_ID=$(echo "$line" | cut -d'|' -f1)
        MODEL_SLUG=$(echo "$line" | cut -d'|' -f2)
        MODEL_COUNT=$((MODEL_COUNT + 1))

        echo -n "  [$MODEL_COUNT] $MODEL_SLUG ... "

        response=$(curl -s -w "\n%{http_code}" "http://localhost:6116/api/models/$MODEL_ID/capabilities")
        status=$(echo "$response" | tail -n 1)
        body=$(echo "$response" | head -n -1)

        if [ "$status" = "200" ]; then
            # Check if response has capabilities object
            if echo "$body" | grep -q '"capabilities"'; then
                echo -e "${GREEN}PASS${NC}"
                PASSED=$((PASSED + 1))

                # Check if model has schema
                supports_ref=$(echo "$body" | grep -o '"supportsReferenceImages":[^,}]*' | cut -d':' -f2 | tr -d ' ')
                supports_neg=$(echo "$body" | grep -o '"supportsNegativePrompt":[^,}]*' | cut -d':' -f2 | tr -d ' ')

                echo "    - Reference Images: $supports_ref"
                echo "    - Negative Prompt: $supports_neg"
            else
                echo -e "${YELLOW}WARN${NC} (Missing capabilities object)"
            fi
        else
            echo -e "${RED}FAIL${NC} (HTTP $status)"
            FAILED=$((FAILED + 1))
        fi
    fi
done <<< "$MODEL_IDS"
echo ""

# Check for openapi_schema in database
echo "=========================================="
echo "Database Schema Check"
echo "=========================================="
echo ""
echo "Checking which models have openapi_schema data..."

SCHEMA_CHECK=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const models = await prisma.providerModel.findMany({
    select: { slug: true, metadata: true },
    take: 10
  });
  let withSchema = 0;
  let withoutSchema = 0;
  models.forEach(m => {
    const metadata = m.metadata as any;
    if (metadata?.openapi_schema) {
      console.log('✓ ' + m.slug);
      withSchema++;
    } else {
      withoutSchema++;
    }
  });
  console.log('');
  console.log('Summary: ' + withSchema + ' with schema, ' + withoutSchema + ' without schema');
  await prisma.\$disconnect();
}
main();
" 2>/dev/null)

echo "$SCHEMA_CHECK"
echo ""

if echo "$SCHEMA_CHECK" | grep -q "0 with schema"; then
    echo -e "${YELLOW}⚠${NC}  No models have openapi_schema data yet"
    echo "   To test with schema data, import a new model via:"
    echo "   http://localhost:6116/dashboard/admin"
    echo "   Browse Replicate → Search for 'lucataco/flux-dev-lora' → Import"
else
    echo -e "${GREEN}✓${NC} Some models have schema data"
fi
echo ""

# Test summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo ""
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All automated tests passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Review the manual testing checklist: docs/TESTING-CHECKLIST-TASK8.md"
    echo "2. Import a new model to test with schema data"
    echo "3. Test the UI form behavior at http://localhost:6116/dashboard/create-image"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo "Please review the failures above and check server logs:"
    echo "  pm2 logs pixelfoundry --lines 50"
    exit 1
fi
