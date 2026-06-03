#!/bin/bash
# Laminam CRM API Unit Test
# This script tests GET and POST operations on sync.php to verify RBAC table database persistence.

API_URL="https://crm.laminam.sk/sync.php"
echo "=== LAMINAM CRM API PERSISTENCE UNIT TEST ==="
echo "Endpoint: $API_URL"
echo ""

# Step 1: Perform GET request to read current database state
echo "[TEST 1] Fetching current database state (GET)..."
GET_RESPONSE=$(curl -k -s -w "\nHTTP_STATUS:%{http_code}" "$API_URL")
HTTP_STATUS=$(echo "$GET_RESPONSE" | grep "HTTP_STATUS" | cut -d':' -f2)
JSON_BODY=$(echo "$GET_RESPONSE" | grep -v "HTTP_STATUS")

if [ "$HTTP_STATUS" -ne 200 ]; then
  echo "❌ FAIL: GET request failed with HTTP status $HTTP_STATUS"
  exit 1
fi

echo "✅ PASS: GET request succeeded with HTTP status 200"
echo "Active Roles in DB: $(echo "$JSON_BODY" | grep -o '"roles":\[[^]*\]' | cut -c1-150)..."
echo ""

# Step 2: Extract current settings payload to maintain integrity
echo "[TEST 2] Parsing existing payload settings..."
SYSTEM_NAME=$(echo "$JSON_BODY" | grep -o '"systemName":"[^"]*"' | cut -d':' -f2 | tr -d '"')
echo "Detected system name: $SYSTEM_NAME"
echo ""

# Step 3: Perform POST request with a toggle on Project Manager leads.view permission
# We cycle it to 'edit' or 'view' to verify toggling works
CURRENT_VAL=$(echo "$JSON_BODY" | grep -o '"leads.view":"[^"]*"' | cut -d':' -f2 | tr -d '"')
TARGET_VAL="view"
if [ "$CURRENT_VAL" = "view" ]; then
  TARGET_VAL="edit"
fi

echo "[TEST 3] Updating 'Project Manager' leads.view permission: '$CURRENT_VAL' -> '$TARGET_VAL' (POST)..."

POST_PAYLOAD=$(cat <<EOF
{
  "leads": [],
  "tasks": [],
  "users": [
    {"name":"Admin","email":"admin@crm.com","password":"password","role":"Admin","color":"#f43f5e"},
    {"name":"Erik","email":"erik@crm.com","password":"password","role":"Admin","color":"#10b981"}
  ],
  "roles": [
    {
      "name": "Admin",
      "permissions": {
        "general_config": "edit",
        "pm_managers": "edit",
        "pipeline_stages": "edit",
        "traffic_sources": "edit",
        "system_reset": "edit"
      }
    },
    {
      "name": "Project Manager",
      "permissions": {
        "general_config": "nothing",
        "pm_managers": "nothing",
        "pipeline_stages": "nothing",
        "traffic_sources": "nothing",
        "system_reset": "nothing",
        "leads.view": "$TARGET_VAL"
      }
    }
  ],
  "settings": {
    "systemName": "$SYSTEM_NAME",
    "systemLanguage": "sk",
    "leadStates": ["new","contacted","offer sent","accepted","rejected"],
    "leadSources": ["showroom","facebook","instagram","website"],
    "leadCategories": ["Kitchen Countertops","Flooring Tiles","Bathroom Renovation","Granite Slabs","Plumbing Services","Custom Masonry"],
    "leadStateColors": {"new":"#3b82f6","contacted":"#0ea5e9","offer sent":"#6366f1","accepted":"#10b981","rejected":"#ef4444"},
    "leadSourceColors":{"showroom":"#10b981","facebook":"#3b82f6","instagram":"#ec4899","website":"#8b5cf6"},
    "leadCategoryColors":{"Kitchen Countertops":"#f59e0b","Flooring Tiles":"#10b981","Bathroom Renovation":"#3b82f6","Granite Slabs":"#6366f1","Plumbing Services":"#0ea5e9","Custom Masonry":"#ec4899"},
    "leadStageGroups":{"new":"new","contacted":"in_progress","offer sent":"in_progress","accepted":"closed","rejected":"closed"},
    "leadStateParents":{}
  }
}
EOF
)

POST_RESPONSE=$(curl -k -s -w "\nHTTP_STATUS:%{http_code}" -X POST -H "Content-Type: application/json" -d "$POST_PAYLOAD" "$API_URL")
POST_HTTP_STATUS=$(echo "$POST_RESPONSE" | grep "HTTP_STATUS" | cut -d':' -f2)
POST_BODY=$(echo "$POST_RESPONSE" | grep -v "HTTP_STATUS")

if [ "$POST_HTTP_STATUS" -ne 200 ] || [[ ! "$POST_BODY" =~ "success\":true" ]]; then
  echo "❌ FAIL: POST request failed. Status: $POST_HTTP_STATUS. Body: $POST_BODY"
  exit 1
fi

echo "✅ PASS: POST request successful!"
echo ""

# Step 4: Verify persistence by calling GET again
echo "[TEST 4] Verifying database persistence (GET)..."
VERIFY_RESPONSE=$(curl -k -s "$API_URL")
NEW_VAL=$(echo "$VERIFY_RESPONSE" | grep -o '"leads.view":"[^"]*"' | cut -d':' -f2 | tr -d '"')

echo "Database returned value: '$NEW_VAL'"

if [ "$NEW_VAL" = "$TARGET_VAL" ]; then
  echo "✅ PASS: Value successfully updated and persisted in the MySQL database!"
  echo ""
  echo "=== ALL API PERSISTENCE UNIT TESTS PASSED ==="
  exit 0
else
  echo "❌ FAIL: PERSISTENCE ERROR. Expected '$TARGET_VAL' but database returned '$NEW_VAL'"
  exit 1
fi
