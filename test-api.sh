#!/bin/bash
# Simple script to test the Task API

BASE_URL="http://localhost:3000"

echo "Testing Task Manager API..."
echo ""

# Test health endpoint
echo "1. Testing health endpoint..."
curl -s "$BASE_URL/health" | jq '.' 2>/dev/null || echo "⚠️  API not running or jq not installed"
echo ""

# Create a task
echo "2. Creating a task..."
TASK_RESPONSE=$(curl -s -X POST "$BASE_URL/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Task from Script",
    "description": "This is a test task created via API",
    "status": "todo",
    "priority": "high"
  }')

TASK_ID=$(echo "$TASK_RESPONSE" | jq -r '.task.id' 2>/dev/null)
echo "$TASK_RESPONSE" | jq '.' 2>/dev/null || echo "$TASK_RESPONSE"
echo "Task ID: $TASK_ID"
echo ""

# List all tasks
echo "3. Listing all tasks..."
curl -s "$BASE_URL/api/tasks" | jq '.tasks | length' 2>/dev/null && echo " tasks found"
echo ""

# Get single task
if [ ! -z "$TASK_ID" ] && [ "$TASK_ID" != "null" ]; then
  echo "4. Getting task $TASK_ID..."
  curl -s "$BASE_URL/api/tasks/$TASK_ID" | jq '.task.title' 2>/dev/null
  echo ""
  
  # Update task
  echo "5. Updating task status to 'in_progress'..."
  curl -s -X PATCH "$BASE_URL/api/tasks/$TASK_ID" \
    -H "Content-Type: application/json" \
    -d '{"status": "in_progress"}' | jq '.task.status' 2>/dev/null
  echo ""
  
  # Delete task
  echo "6. Deleting task..."
  curl -s -X DELETE "$BASE_URL/api/tasks/$TASK_ID" | jq '.task.id' 2>/dev/null
  echo ""
fi

echo "✅ API test complete!"
