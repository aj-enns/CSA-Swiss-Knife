---
description: "End-of-session pattern capture. Asks whether any code, dashboard, report, or workflow artifact from this session is worth saving to the pattern library. Triggers: save pattern, capture pattern, anything worth saving, end of session capture."
---

Review the conversation history for reusable artifacts:
- Code snippets that were iterated on and landed in a good state
- Dashboard structures or DataviewJS blocks that worked well
- Report layouts or table schemas that were refined
- Query recipes (DAX, OData, KQL) that solved a real problem
- Multi-step workflows or tool chains that proved effective

For each candidate:
1. Summarize what it does and why it's reusable.
2. Classify: code | dashboard | report | query | workflow.
3. Suggest tags from the pattern-library taxonomy.

Present all candidates in a numbered list. Ask: **"Which of these should we save? (numbers, all, or none)"**

For each confirmed pattern, follow the `pattern-library` skill's Capture workflow — preview the full record, then apply the Write Safety Gate before saving.
