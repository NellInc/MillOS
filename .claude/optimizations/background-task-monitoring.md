# Bash Command Efficiency

> **CRITICAL**: Minimize bash commands. Each command has overhead. Batch operations, use proper tools.

## Rule 1: No Polling Loops

```bash
# FORBIDDEN - polling wastes time and triggers hooks:
Bash(sleep 30 && tail output_file)
Bash(for i in 1 2 3; do ps aux | grep X; sleep 60; done)
Bash(timeout 300 bash -c 'while ps aux | grep X; do sleep 10; done')

# CORRECT - use TaskOutput:
Bash(command, run_in_background: true)  # Returns task_id
TaskOutput(task_id, block=true)         # Wait for completion
```

## Rule 2: No Sequential Command Spam

```bash
# FORBIDDEN - running 10+ sequential bash commands to investigate:
Bash(ls -la dir1)
Bash(ls -la dir2)
Bash(grep pattern file1)
Bash(grep pattern file2)
Bash(cat file1 | python3 -c "...")
# ... repeat 15 more times

# CORRECT - batch into ONE command:
Bash(ls -la dir1 dir2 && grep pattern file1 file2 && cat file1 | python3 -c "...")

# CORRECT - use Explore agent for investigation:
Task(subagent_type="Explore", prompt="Find all X in the codebase")

# CORRECT - use proper tools:
Glob(pattern="**/*.md")           # Instead of: find . -name "*.md"
Grep(pattern="X", path="dir/")    # Instead of: grep -r "X" dir/
Read(file_path="/path/to/file")   # Instead of: cat /path/to/file
```

## Rule 3: Maximum 3 Bash Commands Per Response

If you need more than 3 bash commands, you're doing it wrong. Either:
1. **Batch them** into a single command with `&&`
2. **Use Explore agent** for multi-file investigation
3. **Use native tools** (Glob, Grep, Read) instead of bash equivalents

## Decision Tree

| Task | Correct Approach |
|------|------------------|
| Find files | `Glob` tool, NOT `find` or `ls` |
| Search content | `Grep` tool, NOT `grep` or `rg` |
| Read files | `Read` tool, NOT `cat/head/tail` |
| Multi-file investigation | `Explore` agent |
| Background task status | `TaskOutput`, NOT polling |
| Multiple independent checks | Single bash with `&&` |

## Why This Matters

Each bash command:
- Triggers 2 PostToolUse hooks
- Consumes context tokens
- Adds latency

10 sequential bash commands = 20 hook executions = wasted time and money.

## Disable

Remove `@.claude/optimizations/background-task-monitoring.md` from CLAUDE.md
