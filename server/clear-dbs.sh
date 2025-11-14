#!/bin/bash

# Load .env if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Clear Postgres
echo "Clearing Postgres..."
if [ -n "$DATABASE_URL" ]; then
  psql "$DATABASE_URL" -c "TRUNCATE TABLE diagram_presets, user_preferences, file_tree_nodes, repositories, users CASCADE;"
else
  echo "⚠️  DATABASE_URL not set, using default connection..."
  psql -c "TRUNCATE TABLE diagram_presets, user_preferences, file_tree_nodes, repositories, users CASCADE;"
fi
echo "✅ Postgres cleared"

# Clear Chroma (delete local storage)
echo "Clearing Chroma..."
rm -rf ./chroma/*
echo "✅ Chroma cleared"

echo ""
echo "✅ All databases cleared!"

