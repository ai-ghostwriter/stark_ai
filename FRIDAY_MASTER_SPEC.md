1. Visione del progetto
2. Architettura completa v2
3. Diagrammi
4. Workflow vocali
5. Integrazione LiveKit
6. Integrazione Gemini Realtime
7. Integrazione Ollama
8. Router Qwen 1.7B
9. Claude Architect
10. Codex Implementer
11. Claude Reviewer
12. Logging
13. Workspace Isolation
14. Sicurezza
15. Git Integration
16. Test Integration
17. Tutti gli script Python
18. Struttura cartelle completa
19. Roadmap v3 (Multi-Agent)
20. Roadmap v4 (Fully Local)
21. Prompt operativi per Claude Code
22. Prompt operativi per Codex
23. Checklist implementazione
24. MVP
25. Production Ready Architecture

# FRIDAY_MASTER_SPEC.md

# FRIDAY

## Voice-First Multi-Agent AI Operating System

Version: 1.0

Author: Riccardo Sostene

Status: Architecture & Implementation Specification

---

# TABLE OF CONTENTS

1. Vision
2. Goals
3. Architecture Overview
4. Technology Stack
5. Voice Layer
6. Agent Layer
7. Routing Layer
8. Coding Agents
9. Security
10. Workspace Isolation
11. Logging
12. Git Integration
13. Test Integration
14. Project Structure
15. Python Implementation
16. Future Multi-Agent Expansion
17. Fully Local Mode
18. Production Roadmap

---

# 1. VISION

Friday is not a chatbot.

Friday is a voice-first AI operating system capable of coordinating:

* Voice interaction
* Software development
* Repository analysis
* Autonomous task delegation
* Multi-agent collaboration
* Local and cloud AI models

Inspired by JARVIS.

Goal:

Natural conversation.

Specialized execution.

Human approval gates.

---

# 2. PRIMARY OBJECTIVES

The system must:

* Understand voice commands
* Delegate work to specialized agents
* Analyze repositories
* Implement features
* Run tests
* Review code
* Maintain logs
* Operate safely

The system must remain modular.

Every component must be replaceable independently.

---

# 3. HIGH LEVEL ARCHITECTURE

```text
User
 │
 ▼
Microphone
 │
 ▼
LiveKit
 │
 ▼
Gemini Realtime
 │
 ▼
Python Orchestrator
 │
 ├────────► Qwen Router
 │
 ├────────► Claude Architect
 │
 ├────────► Codex Implementer
 │
 ├────────► Claude Reviewer
 │
 ├────────► Git Tools
 │
 ├────────► Test Tools
 │
 └────────► Logging System
```

---

# 4. WHY THIS ARCHITECTURE

Gemini Realtime:

* low latency
* natural dialogue
* voice interaction

Qwen:

* local routing
* intent classification
* cost reduction

Claude:

* architecture
* planning
* review

Codex:

* implementation
* code modifications
* testing support

Python:

* orchestration
* security
* workflow management

---

# 5. VOICE LAYER

Technology:

* LiveKit
* Gemini Realtime

Responsibilities:

* speech-to-speech interaction
* follow-up questions
* natural conversation
* session memory

Example:

User:

"Friday, analyze my React project."

Gemini:

"Certainly. Would you like an architecture review or bug analysis?"

---

# 6. LOCAL ROUTER

Model:

qwen3:1.7b

Responsibilities:

* classify intent
* select agent
* build structured commands

Example output:

```json
{
  "intent": "code_analysis",
  "agent": "claude_architect",
  "workspace": "current"
}
```

Benefits:

* low cost
* local execution
* near-zero resource usage

---

# 7. AGENT RESPONSIBILITIES

## Claude Architect

Purpose:

Planning.

Responsibilities:

* understand request
* analyze repository
* identify files
* identify risks
* create implementation plan

Output:

1. Objective
2. Files involved
3. Plan
4. Risks
5. Tests
6. Completion criteria

Never:

* modify code
* commit code

---

## Codex Implementer

Purpose:

Execution.

Responsibilities:

* modify code
* create files
* generate tests
* refactor

Rules:

* minimal changes
* respect existing architecture
* no overengineering

Output:

1. Modified files
2. Changes summary
3. Known limitations

---

## Claude Reviewer

Purpose:

Validation.

Responsibilities:

* review git diff
* detect regressions
* detect bugs
* detect security issues
* identify missing tests

Output:

BLOCKERS

WARNINGS

SUGGESTIONS

---

# 8. EXECUTION WORKFLOW

Example:

User:

"Friday, add JWT authentication."

Step 1

Gemini receives request.

Step 2

Qwen routes request.

Step 3

Claude Architect generates plan.

Step 4

Human approval.

Step 5

Codex implements.

Step 6

Git diff generated.

Step 7

Tests execute.

Step 8

Claude reviews.

Step 9

Friday summarizes.

---

# 9. SECURITY MODEL

Mandatory:

* workspace isolation
* command whitelist
* approval gates
* complete logging

Forbidden:

* rm -rf
* unrestricted shell
* credential extraction
* destructive git operations

---

# 10. WORKSPACE ISOLATION

Allowed:

/workspaces/<project>

Forbidden:

/
~/Desktop
~/Documents
~/Downloads

Unless explicitly approved.

---

# 11. COMMAND WHITELIST

Allowed:

git
npm
pnpm
yarn
python
pytest
codex
claude

Everything else denied.

---

# 12. PROJECT STRUCTURE

```text
friday-agent-controller/
│
├── main.py
│
├── tools/
│   ├── shell_tool.py
│   ├── codex_tool.py
│   ├── claude_tool.py
│   ├── git_tool.py
│   ├── test_tool.py
│   └── logger.py
│
├── workspaces/
│
├── logs/
│
└── docs/
    └── FRIDAY_MASTER_SPEC.md
```

---

# 13. PYTHON IMPLEMENTATION

## logger.py

```python
from pathlib import Path
from datetime import datetime
import json

LOG_DIR = Path("./logs")
LOG_DIR.mkdir(exist_ok=True)

def write_log(agent: str, payload: dict):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = LOG_DIR / f"{timestamp}_{agent}.json"

    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    return str(path)
```

## shell_tool.py

```python
import subprocess
from pathlib import Path
from tools.logger import write_log

ALLOWED_ROOT = Path("./workspaces").resolve()

ALLOWED_COMMANDS = {
    "git",
    "npm",
    "pnpm",
    "yarn",
    "python",
    "pytest",
    "codex",
    "claude",
}

def safe_run(command: list[str], cwd: str, timeout: int = 300, agent: str = "shell"):
    workdir = Path(cwd).resolve()

    if not str(workdir).startswith(str(ALLOWED_ROOT)):
        raise PermissionError("Workspace non consentito")

    executable = command[0]

    if executable not in ALLOWED_COMMANDS:
        raise PermissionError(f"Comando non consentito: {executable}")

    result = subprocess.run(
        command,
        cwd=workdir,
        capture_output=True,
        text=True,
        timeout=timeout
    )

    payload = {
        "agent": agent,
        "cwd": str(workdir),
        "command": command,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returncode": result.returncode
    }

    log_path = write_log(agent, payload)
    payload["log_path"] = log_path

    return payload
```
# FRIDAY_MASTER_SPEC.md (PART 2)

---

# 14. AGENT WRAPPERS

## codex_tool.py

```python
from tools.shell_tool import safe_run

def ask_codex(prompt: str, workspace: str):
    return safe_run(
        ["codex", prompt],
        cwd=workspace,
        timeout=900,
        agent="codex"
    )
```

---

## claude_tool.py

```python
from tools.shell_tool import safe_run

def ask_claude(prompt: str, workspace: str):
    return safe_run(
        ["claude", prompt],
        cwd=workspace,
        timeout=900,
        agent="claude"
    )
```

---

# 15. GIT TOOLS

## git_tool.py

```python
from tools.shell_tool import safe_run

def git_status(workspace: str):
    return safe_run(
        ["git", "status", "--short"],
        workspace,
        agent="git_status"
    )

def git_diff(workspace: str):
    return safe_run(
        ["git", "diff"],
        workspace,
        agent="git_diff"
    )

def git_branch(workspace: str):
    return safe_run(
        ["git", "branch", "--show-current"],
        workspace,
        agent="git_branch"
    )
```

---

# 16. TEST TOOLS

## test_tool.py

```python
from pathlib import Path
from tools.shell_tool import safe_run

def detect_package_manager(workspace: str):
    path = Path(workspace)

    if (path / "pnpm-lock.yaml").exists():
        return "pnpm"

    if (path / "yarn.lock").exists():
        return "yarn"

    return "npm"

def run_tests(workspace: str):
    pm = detect_package_manager(workspace)

    if pm == "pnpm":
        return safe_run(
            ["pnpm", "test"],
            workspace,
            timeout=600,
            agent="tests"
        )

    if pm == "yarn":
        return safe_run(
            ["yarn", "test"],
            workspace,
            timeout=600,
            agent="tests"
        )

    return safe_run(
        ["npm", "test"],
        workspace,
        timeout=600,
        agent="tests"
    )

def run_build(workspace: str):
    pm = detect_package_manager(workspace)

    if pm == "pnpm":
        return safe_run(
            ["pnpm", "build"],
            workspace,
            timeout=600,
            agent="build"
        )

    if pm == "yarn":
        return safe_run(
            ["yarn", "build"],
            workspace,
            timeout=600,
            agent="build"
        )

    return safe_run(
        ["npm", "run", "build"],
        workspace,
        timeout=600,
        agent="build"
    )
```

---

# 17. MAIN ORCHESTRATOR

## main.py

```python
from tools.codex_tool import ask_codex
from tools.claude_tool import ask_claude
from tools.git_tool import git_status
from tools.git_tool import git_diff
from tools.git_tool import git_branch
from tools.test_tool import run_tests
from tools.test_tool import run_build

WORKSPACE = "./workspaces/my-project"

def print_block(title: str, content: str):
    print(f"\n{'=' * 20} {title} {'=' * 20}\n")
    print(content)

def architect_task(user_request: str):
    prompt = f'''
Sei Claude Architect.

Analizza la richiesta.

Output:

1. Obiettivo tecnico
2. File coinvolti
3. Piano operativo
4. Rischi
5. Test
6. Criteri di completamento

Richiesta:

{user_request}
'''
    return ask_claude(prompt, WORKSPACE)

def implement_task(plan: str):
    prompt = f'''
Sei Codex Implementer.

Applica il piano.

Regole:

- modifica solo i file necessari
- no overengineering
- no commit

Piano:

{plan}
'''
    return ask_codex(prompt, WORKSPACE)

def reviewer_task(diff: str):
    prompt = f'''
Sei Claude Reviewer.

Analizza il seguente diff.

Output:

BLOCKERS
WARNINGS
SUGGESTIONS

Diff:

{diff}
'''
    return ask_claude(prompt, WORKSPACE)

def main():

    request = input("Cosa vuoi fare? ")

    branch = git_branch(WORKSPACE)
    print_block("BRANCH", branch["stdout"])

    status_before = git_status(WORKSPACE)
    print_block("STATUS BEFORE", status_before["stdout"])

    plan = architect_task(request)
    print_block("CLAUDE PLAN", plan["stdout"])

    confirm = input("Procedo? [y/N] ")

    if confirm.lower() != "y":
        return

    implementation = implement_task(plan["stdout"])

    print_block(
        "CODEX IMPLEMENTATION",
        implementation["stdout"]
    )

    status_after = git_status(WORKSPACE)

    print_block(
        "STATUS AFTER",
        status_after["stdout"]
    )

    diff = git_diff(WORKSPACE)

    print_block(
        "GIT DIFF",
        diff["stdout"]
    )

    run_checks = input("Run tests/build? [y/N] ")

    if run_checks.lower() == "y":

        tests = run_tests(WORKSPACE)

        print_block(
            "TEST RESULT",
            tests["stdout"]
        )

        build = run_build(WORKSPACE)

        print_block(
            "BUILD RESULT",
            build["stdout"]
        )

    review = reviewer_task(diff["stdout"])

    print_block(
        "CLAUDE REVIEW",
        review["stdout"]
    )

if __name__ == "__main__":
    main()
```

---

# 18. AGENT COMMUNICATION PATTERN

```text
User
 │
 ▼
Friday
 │
 ▼
Gemini Realtime
 │
 ▼
Qwen Router
 │
 ▼
Claude Architect
 │
 ▼
Human Approval
 │
 ▼
Codex Implementer
 │
 ▼
Git Diff
 │
 ▼
Tests
 │
 ▼
Claude Reviewer
 │
 ▼
Friday Voice Summary
```

---

# 19. LATENCY STRATEGY

Objective:

Immediate perceived response.

Example:

User:

"Friday, analyze the repository."

Immediate answer:

"Understood. Starting analysis."

Heavy work:

* Claude
* Codex
* Git
* Tests

runs in background.

This produces a JARVIS-like experience.

---

# 20. GEMINI REALTIME ROLE

Gemini is NOT a coding agent.

Gemini responsibilities:

* speech recognition
* speech generation
* natural dialogue
* follow-up questions
* conversational memory

Gemini never edits code.

Gemini never touches repositories.

Gemini only orchestrates conversation.

# FRIDAY_MASTER_SPEC.md (PART 3)

---

# 21. OLLAMA ARCHITECTURE

## Purpose

Ollama is not intended to replace Claude Code or Codex.

Ollama is intended to reduce costs and improve local autonomy.

Responsibilities:

* intent routing
* task classification
* lightweight reasoning
* structured command generation

Not responsible for:

* architecture planning
* large refactoring
* code review
* implementation of complex features

Those responsibilities remain assigned to:

* Claude Architect
* Codex Implementer
* Claude Reviewer

---

# 22. RECOMMENDED LOCAL MODELS

## Primary Router

```text
qwen3:1.7b
```

Purpose:

* classify requests
* determine destination agent
* produce structured actions

Advantages:

* very low memory footprint
* fast inference
* low latency
* suitable for always-on execution

---

## Fallback Router

```text
qwen3:4b
```

Used when:

* ambiguity is detected
* classification confidence is low

---

## Future Local Coding Agent

```text
qwen-coder
deepseek-coder
```

Possible future replacement for:

* Claude Architect
* Codex

when running fully offline.

---

# 23. ROUTER OUTPUT FORMAT

Every routing decision should be transformed into JSON.

Example:

```json
{
  "intent": "implementation",
  "agent": "codex",
  "workspace": "current",
  "requires_approval": true
}
```

---

# 24. ROUTING LEVELS

## LEVEL 1

Simple commands.

Examples:

```text
Show git status
Open project
Read logs
List branches
Current time
```

Execution:

```text
Python only
```

No LLM required.

---

## LEVEL 2

Repository analysis.

Examples:

```text
Analyze architecture
Explain Redux flow
Generate documentation
Find technical debt
```

Execution:

```text
Claude Architect
```

---

## LEVEL 3

Code implementation.

Examples:

```text
Fix bug
Add endpoint
Create reducer
Write tests
```

Execution:

```text
Codex Implementer
```

---

## LEVEL 4

Validation.

Examples:

```text
Review code
Security audit
Regression analysis
```

Execution:

```text
Claude Reviewer
```

---

# 25. FUTURE MULTI-AGENT ARCHITECTURE

Current architecture:

```text
Claude
Codex
Claude
```

Future architecture:

```text
Claude Architect
        │
        ├── Backend Agent
        ├── Frontend Agent
        ├── Database Agent
        ├── DevOps Agent
        └── QA Agent
```

---

# 26. BACKEND AGENT

Responsibilities:

* APIs
* Node.js
* Express
* Python services
* Authentication
* Database access

Example tasks:

```text
Create endpoint
Implement JWT
Add middleware
Optimize query
```

---

# 27. FRONTEND AGENT

Responsibilities:

* React
* TypeScript
* Redux Toolkit
* Redux Saga
* Material UI

Example tasks:

```text
Create component
Refactor page
Add route
Optimize rendering
```

---

# 28. DATABASE AGENT

Responsibilities:

* PostgreSQL
* MySQL
* MongoDB
* Pinecone

Tasks:

```text
Schema design
Index optimization
Migration generation
Query optimization
```

---

# 29. DEVOPS AGENT

Responsibilities:

* Docker
* GitHub Actions
* CI/CD
* Kubernetes
* Infrastructure

Tasks:

```text
Create pipeline
Optimize Dockerfile
Configure deployment
```

---

# 30. QA AGENT

Responsibilities:

* Unit tests
* Integration tests
* E2E tests

Tasks:

```text
Generate tests
Coverage analysis
Regression detection
```

---

# 31. AGENT DELEGATION MODEL

Future execution:

```text
User
 │
 ▼
Friday
 │
 ▼
Claude Architect
 │
 ├── Frontend Agent
 ├── Backend Agent
 └── QA Agent
```

Each agent:

* receives a scoped task
* works independently
* returns results

Architect consolidates outputs.

---

# 32. HUMAN APPROVAL GATES

Mandatory before:

```text
Code modifications
Commits
Pull requests
Deployment
```

Approval example:

```text
Plan generated.

Proceed with implementation?

[Y/N]
```

---

# 33. MCP INTEGRATION

Future support:

Model Context Protocol servers.

Examples:

```text
GitHub MCP
Jira MCP
Confluence MCP
Filesystem MCP
Database MCP
```

Benefits:

* direct tool integration
* reduced custom code
* standard protocol

---

# 34. CLAUDE SKILLS

Future folder:

```text
.claude/skills
```

Examples:

```text
react-architect.md
redux-saga.md
node-backend.md
docker-devops.md
```

Purpose:

specialized expertise injection.

---

# 35. CODEX TASK LIBRARY

Future folder:

```text
.codex/tasks
```

Examples:

```text
fix_bug.md
implement_feature.md
generate_tests.md
review_pr.md
```

Purpose:

repeatable workflows.

---

# 36. PROJECT MEMORY

Future capability:

Persistent memory.

Stored information:

```text
Repositories
Architecture decisions
Coding standards
Deployment rules
Naming conventions
```

Benefits:

reduced repeated prompting.

---

# 37. DOCKER DEPLOYMENT

Recommended structure:

```text
docker/
│
├── friday
├── ollama
├── postgres
└── monitoring
```

---

# 38. LOCAL DEVELOPMENT MODE

Components:

```text
LiveKit
Gemini
Ollama
Python
Claude
Codex
```

Purpose:

rapid iteration.

---

# 39. PRODUCTION MODE

Components:

```text
LiveKit
Gemini
Python Orchestrator
Claude
Codex
Monitoring
Logging
```

---

# 40. OBSERVABILITY

Future stack:

```text
Prometheus
Grafana
OpenTelemetry
```

Metrics:

```text
Agent execution time
Success rate
Failure rate
Average latency
Token usage
```

---

# 41. FAILURE HANDLING

If Codex fails:

```text
Return error
Generate report
Request user intervention
```

If Claude fails:

```text
Retry
Fallback model
Generate incident log
```

---

# 42. COST OPTIMIZATION

Goal:

Use expensive models only when required.

Strategy:

```text
Simple tasks
↓
Python

Moderate tasks
↓
Qwen

Complex analysis
↓
Claude

Implementation
↓
Codex
```

Result:

minimal cloud costs.

---

# 43. FUTURE FULLY LOCAL MODE

Architecture:

```text
Microphone
 │
 ▼
Whisper
 │
 ▼
Qwen
 │
 ▼
Python
 │
 ▼
Local Agents
 │
 ▼
Kokoro/Piper
```

Benefits:

```text
Zero API cost
Offline operation
Maximum privacy
```

Trade-offs:

```text
Higher latency
Lower reasoning quality
```

---

# 44. LONG TERM ROADMAP

V1

```text
Claude
Codex
Gemini
Python
```

V2

```text
Qwen Router
Workspace Isolation
Logging
```

V3

```text
Multi-Agent Delegation
```

V4

```text
MCP Integration
```

V5

```text
Fully Local Operation
```

---

# 45. SUCCESS CRITERIA

System is complete when:

✓ Voice interaction works

✓ Natural conversation works

✓ Intent routing works

✓ Claude generates plans

✓ Codex implements plans

✓ Claude reviews changes

✓ Tests run automatically

✓ Git diff generated automatically

✓ Logs generated automatically

✓ Human approval enforced

✓ Multi-agent expansion supported

✓ Fully local mode remains possible

END OF PART 3

# FRIDAY_MASTER_SPEC.md (PART 4)

---

# 46. REPOSITORY STRUCTURE

Recommended repository layout:

```text
friday/
│
├── apps/
│   │
│   ├── voice-gateway/
│   ├── orchestrator/
│   └── dashboard/
│
├── agents/
│   │
│   ├── architect/
│   ├── implementer/
│   ├── reviewer/
│   ├── backend/
│   ├── frontend/
│   ├── database/
│   ├── devops/
│   └── qa/
│
├── tools/
│
├── workspaces/
│
├── logs/
│
├── prompts/
│
├── docs/
│
├── .claude/
│   └── skills/
│
├── .codex/
│   └── tasks/
│
└── docker/
```

---

# 47. PROMPT - CLAUDE ARCHITECT

System Prompt:

```text
You are Friday Architect.

Responsibilities:

- analyze repositories
- understand requirements
- identify risks
- generate implementation plans

Rules:

- never modify files
- never commit
- never execute destructive commands

Output:

1. Objective
2. Impacted files
3. Architecture considerations
4. Risks
5. Implementation plan
6. Tests
7. Completion criteria
```

---

# 48. PROMPT - CODEX IMPLEMENTER

System Prompt:

```text
You are Friday Implementer.

Responsibilities:

- implement approved plans
- modify code
- create tests
- update documentation

Rules:

- minimal changes
- preserve architecture
- no overengineering
- no commits

Output:

1. Modified files
2. Summary
3. Remaining limitations
```

---

# 49. PROMPT - CLAUDE REVIEWER

System Prompt:

```text
You are Friday Reviewer.

Responsibilities:

- review git diff
- identify regressions
- identify security issues
- identify missing tests

Output:

BLOCKERS

WARNINGS

SUGGESTIONS
```

---

# 50. CLAUDE SKILLS

Folder:

```text
.claude/skills
```

Recommended skills:

```text
react-architect.md
redux-toolkit.md
redux-saga.md
typescript.md
node-express.md
python-backend.md
docker.md
github-actions.md
postgresql.md
mongodb.md
pinecone.md
kdp-publishing.md
```

Purpose:

Inject domain-specific expertise.

---

# 51. CODEX TASK LIBRARY

Folder:

```text
.codex/tasks
```

Recommended tasks:

```text
analyze_repository.md
fix_bug.md
implement_feature.md
generate_tests.md
create_documentation.md
refactor_component.md
review_pull_request.md
security_audit.md
```

---

# 52. LIVEKIT INTEGRATION

Responsibilities:

* microphone access
* audio streaming
* session management
* realtime communication

Pipeline:

```text
Microphone
    │
    ▼
LiveKit
    │
    ▼
Gemini Realtime
```

---

# 53. GEMINI CONFIGURATION

Responsibilities:

* natural conversation
* follow-up questions
* speech synthesis
* speech recognition

Gemini never:

* edits files
* accesses repositories
* executes code

Gemini only:

* communicates

---

# 54. OLLAMA CONFIGURATION

Recommended:

```bash
ollama pull qwen3:1.7b
```

Optional:

```bash
ollama pull qwen3:4b
```

Future:

```bash
ollama pull qwen-coder
ollama pull deepseek-coder
```

---

# 55. PYTHON ORCHESTRATOR RESPONSIBILITIES

Responsibilities:

```text
Task routing
Approval gates
Workspace isolation
Tool execution
Logging
Agent coordination
```

The orchestrator is the heart of Friday.

Every agent is subordinate to it.

---

# 56. APPROVAL WORKFLOW

Before implementation:

```text
Plan generated.

Proceed?
[Y/N]
```

Before commit:

```text
Changes complete.

Create commit?
[Y/N]
```

Before deployment:

```text
Deployment ready.

Deploy?
[Y/N]
```

No exceptions.

---

# 57. LOGGING STANDARD

Each log must contain:

```json
{
  "agent": "",
  "workspace": "",
  "command": "",
  "stdout": "",
  "stderr": "",
  "returncode": 0,
  "timestamp": ""
}
```

Retention:

```text
30 days minimum
```

Future:

```text
Database-backed logs
```

---

# 58. DASHBOARD ROADMAP

Future React dashboard.

Sections:

```text
Voice Console
Agents
Tasks
Repositories
Logs
Metrics
Settings
```

---

# 59. REACT DASHBOARD FEATURES

Voice Console:

```text
Current conversation
Agent status
Execution progress
```

Agents:

```text
Architect
Implementer
Reviewer
```

Repositories:

```text
Available workspaces
Current branch
Pending changes
```

Logs:

```text
Search
Filtering
Export
```

---

# 60. AGENT STATUS SYSTEM

Possible states:

```text
IDLE
THINKING
WAITING_APPROVAL
IMPLEMENTING
TESTING
REVIEWING
ERROR
```

---

# 61. TASK QUEUE

Future queue system:

```text
Redis
RQ
Celery
```

Purpose:

Background execution.

Examples:

```text
Large repository analysis
Documentation generation
Massive refactoring
```

---

# 62. FUTURE DATABASE

Recommended:

```text
PostgreSQL
```

Tables:

```text
tasks
agents
logs
repositories
settings
```

---

# 63. MONITORING

Future stack:

```text
Prometheus
Grafana
OpenTelemetry
```

Track:

```text
Latency
Errors
Execution time
Token usage
Success rate
```

---

# 64. LOCAL-FIRST STRATEGY

Decision:

Friday must remain cloud-independent.

Cloud services are optional.

The architecture must support:

```text
Cloud
Hybrid
Fully Local
```

without redesign.

---

# 65. IMPLEMENTATION PHASES

PHASE 1

MVP

```text
LiveKit
Gemini
Python
Claude
Codex
```

Goal:

Working voice coding assistant.

---

PHASE 2

Operational Safety

```text
Logging
Workspace Isolation
Approval Gates
```

Goal:

Safe operation.

---

PHASE 3

Developer Experience

```text
Dashboard
Repository Management
Metrics
```

Goal:

Productivity.

---

PHASE 4

Multi-Agent

```text
Backend Agent
Frontend Agent
Database Agent
DevOps Agent
QA Agent
```

Goal:

Parallel execution.

---

PHASE 5

Local Independence

```text
Whisper
Qwen
Kokoro
```

Goal:

Zero cloud dependency.

---

# 66. CLAUDE CODE IMPLEMENTATION REQUEST

Prompt:

```text
Read FRIDAY_MASTER_SPEC.md.

Implement the architecture incrementally.

Follow the phases.

Prioritize:

1. Python Orchestrator
2. Workspace Isolation
3. Logging
4. Claude Architect
5. Codex Implementer
6. Claude Reviewer

Generate production-quality code.

Do not skip security requirements.
```

---

# 67. CODEX IMPLEMENTATION REQUEST

Prompt:

```text
Read FRIDAY_MASTER_SPEC.md.

Implement approved tasks.

Focus on:

- clean code
- test coverage
- minimal changes
- maintainability

Do not introduce unnecessary dependencies.

Do not commit changes.
```

---

# 68. FINAL OBJECTIVE

Friday must evolve into:

```text
Voice-first AI Operating System
```

capable of:

```text
Talking
Reasoning
Planning
Coding
Reviewing
Testing
Delegating
Learning
```

while maintaining:

```text
Security
Transparency
Modularity
Human Control
```

---

# END OF FRIDAY_MASTER_SPEC.md

Version 1.0 Complete
