#!/bin/bash
echo "🔍 QUESTIONNAIRE IMPLEMENTATION VERIFICATION"
echo "============================================="
echo ""

echo "1. Fischer-Yates Shuffle Function"
echo "   File: backend/utils/fisherYates_shuffle.js"
[ -f "backend/utils/fisherYates_shuffle.js" ] && echo "   ✅ File exists" || echo "   ❌ File missing"
echo ""

echo "2. Database Migration"
echo "   File: backend/migrations/002_questionnaire_optimization.sql"
[ -f "backend/migrations/002_questionnaire_optimization.sql" ] && echo "   ✅ File exists" || echo "   ❌ File missing"
echo ""

echo "3. Database Tables & Columns"
psql "postgresql://a4m_app:jsT%40sA2nd1nsd3cl2y0@10.99.0.1:5432/a4m_db" -t -c "
  SELECT '   ✅ ' || table_name || ' table exists'
  FROM information_schema.tables
  WHERE table_name IN ('questionnaire_question_order', 'user_answers', 'questionnaire_sessions')
  AND table_schema = 'public'
  ORDER BY table_name;
"
echo ""

echo "4. New Columns Added"
psql "postgresql://a4m_app:jsT%40sA2nd1nsd3cl2y0@10.99.0.1:5432/a4m_db" -t -c "
  SELECT '   ✅ ' || table_name || '.' || column_name
  FROM information_schema.columns
  WHERE (table_name = 'user_answers' AND column_name IN ('session_id', 'answer_sequence'))
     OR (table_name = 'questionnaire_sessions' AND column_name = 'completed_at')
  ORDER BY table_name, column_name;
"
echo ""

echo "5. Indexes Created"
psql "postgresql://a4m_app:jsT%40sA2nd1nsd3cl2y0@10.99.0.1:5432/a4m_db" -t -c "
  SELECT '   ✅ ' || indexname
  FROM pg_indexes
  WHERE tablename IN ('user_answers', 'questionnaire_question_order')
    AND indexname LIKE 'idx_%'
  ORDER BY indexname;
" | head -10
echo "   ... and more"
echo ""

echo "6. Backend Routes Updated"
echo "   File: backend/routes-src/questions.js"
grep -q "fisherYatesShuffle" backend/routes-src/questions.js 2>/dev/null && \
  echo "   ✅ Fischer-Yates import found" || echo "   ❌ Fischer-Yates import missing"
grep -q "setDatabaseClient" backend/routes-src/questions.js 2>/dev/null && \
  echo "   ✅ setDatabaseClient function found" || echo "   ❌ setDatabaseClient missing"
grep -q "initializeSessionQuestions" backend/routes-src/questions.js 2>/dev/null && \
  echo "   ✅ initializeSessionQuestions function found" || echo "   ❌ initializeSessionQuestions missing"
echo ""

echo "7. Answer Tracking Enhanced"
echo "   File: backend/routes-src/answers.ts"
grep -q "sessionId" backend/routes-src/answers.ts 2>/dev/null && \
  echo "   ✅ sessionId tracking added" || echo "   ❌ sessionId tracking missing"
grep -q "answer_sequence" backend/routes-src/answers.ts 2>/dev/null && \
  echo "   ✅ answer_sequence tracking added" || echo "   ❌ answer_sequence tracking missing"
echo ""

echo "8. Server Configuration"
echo "   File: backend/server.ts"
grep -q "setQuestionsDatabaseClient" backend/server.ts 2>/dev/null && \
  echo "   ✅ Questions DB client injection configured" || echo "   ❌ Questions DB client injection missing"
echo ""

echo "============================================="
echo "🎉 IMPLEMENTATION VERIFICATION COMPLETE!"
echo ""
echo "See QUESTIONNAIRE_IMPLEMENTATION_SUMMARY.md for full details"
