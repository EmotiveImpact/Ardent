#!/bin/bash
# Facilities OS — Autonomous Build Loop (Phase 2)
# Fills all PRD gaps, polishes design, completes the full MVP.
#
# Usage: ./build-loop.sh
# Stop:  Ctrl+C

set -e

MAX_ITERATIONS=30
SLEEP_BETWEEN=3

PROMPT='You are the orchestrator for Facilities OS Phase 2.

Phase 1 scaffolding is DONE. Your job is to complete all remaining PRD features and polish the design.

1. Read CLAUDE.md for the full protocol, design system, and rules.
2. Read facilities_os_prd.md for complete product requirements.
3. Read PROGRESS.md to see completed vs remaining tasks.
4. Continue from the next incomplete task in the Remaining section.
5. Stack: Vite + React 19, HeroUI, Tailwind v4, React Router, TanStack Query, Supabase.
6. Design: Dark navy sidebar, teal brand accent, white cards on light gray surface. Use brand/status/navy/surface color tokens from index.css.
7. For each task: implement fully (data + UI + integration), run `npm run build`, fix errors, update PROGRESS.md.
8. If stuck for more than 2 attempts, log to BLOCKERS.md and skip to next task.
9. Do NOT ask questions. Do NOT stop to confirm. Just build.

IMPORTANT DESIGN RULES:
- Use brand-* color tokens (teal) for primary actions, links, active states
- Use status-* tokens for compliance/job status colors
- Use navy-* tokens only in sidebar
- Use HeroUI Table, not raw HTML tables
- Use HeroUI Chip for status badges
- White cards, light gray (#f8fafc) page backgrounds
- No purple, no random blues — stick to the design system

Use subagents (Agent tool) to parallelize independent tasks where possible.
Before starting, ALWAYS check PROGRESS.md first so you never redo completed work.'

echo "============================================"
echo "  Facilities OS — Phase 2 Build Loop"
echo "  Design Polish + PRD Feature Completion"
echo "============================================"
echo ""
echo "Max iterations: $MAX_ITERATIONS"
echo "Working dir: $(pwd)"
echo ""

for i in $(seq 1 $MAX_ITERATIONS); do
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Iteration $i / $MAX_ITERATIONS"
    echo "  $(date '+%Y-%m-%d %H:%M:%S')"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Check if all tasks are complete
    REMAINING=$(grep -c "^\- \[ \]" PROGRESS.md 2>/dev/null || true)
    if [ "$REMAINING" = "0" ]; then
        echo "All tasks complete! Phase 2 build finished."
        exit 0
    fi
    echo "Tasks remaining: $REMAINING"

    # Run Claude Code in non-interactive print mode
    claude --dangerously-skip-permissions -p "$PROMPT" 2>&1 | tail -80

    echo ""
    echo "Iteration $i complete. Pausing ${SLEEP_BETWEEN}s..."
    sleep $SLEEP_BETWEEN
done

echo ""
echo "Reached max iterations ($MAX_ITERATIONS). Check PROGRESS.md for status."
