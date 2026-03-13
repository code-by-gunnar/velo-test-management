# Research: Phase 3 — GWT Step Editor

## Current Step Editor Architecture

### Component hierarchy
```
CasesRoute (pages/app/[slug]/[projectKey]/cases.tsx)
  └─ CasesPage (components/cases/CasesPage.tsx)
       └─ CasePanel (components/cases/CasePanel.tsx)
            ├─ Preconditions textarea (line 256-265)
            └─ StepEditor (components/cases/StepEditor.tsx)
                 └─ StepRow[] (components/cases/StepRow.tsx)
```

### StepEditor (StepEditor.tsx, 93 lines)
- Props: `{ steps: Step[], onChange: (steps: Step[]) => void }`
- Step interface: `{ action: string, expected_result: string }` — no step_type yet
- Manages DOM refs via `elementsRef` Map for focus management
- Methods: handleChange, handleAddAfter (inserts after index), handleDelete (removes, focuses prev)
- Ensures at least 1 step via useEffect
- Renders column headers ("Action" / "Expected Result") + StepRow per step

### StepRow (StepRow.tsx, 102 lines)
- Two-column grid: action textarea + expected_result textarea
- Keyboard: Tab (action→expected), Tab/Enter (expected→add new), Backspace (empty action→delete), Shift+Tab (expected→action)
- Auto-resize textareas on mount and input
- Uses callback refs for focus management

### CasePanel (CasePanel.tsx, 335 lines)
- Slide-in right panel, view + edit modes
- Uses react-hook-form for title/priority/preconditions
- Steps managed as separate state: `const [steps, setSteps] = useState<Step[]>(DEFAULT_STEPS)`
- On save: sends `{ title, priority, steps, suite_id?, preconditions? }` to API
- **Does NOT receive test_format** — only gets workspaceId, projectId, selectedSuiteId
- View mode also renders steps in traditional 2-column layout (lines 300-319)

### Data flow gap
- `cases.tsx` getServerSideProps fetches project by key but only extracts `{ id }` — test_format is NOT passed down
- CasesPage gets workspaceId + projectId only
- CasePanel gets them via passthrough
- **Need to**: fetch test_format in getServerSideProps, pass through CasesPage → CasePanel

### API already supports step_type
- POST/PUT accept `step_type` on each step (enum: action/given/when/then/and/but), defaults to 'action'
- GET returns `step_type` on each step in the response
- Frontend Step interface just needs the field added

## GWT Editor Design

### Architecture approach
Create `GwtStepEditor` + `GwtStepRow` as parallel components (NOT modifying existing StepEditor). CasePanel conditionally renders based on test_format.

### Keyword auto-suggest logic
```
Position 0 (first step): default "given"
After "given": suggest "when"
After "when": suggest "then"
After "then": suggest "then"
After "and"/"but": inherit parent's suggestion
```

### GWT step differences from traditional
| Aspect | Traditional | GWT |
|--------|------------|-----|
| Columns | Action + Expected Result | Keyword pill + Action text |
| step_type | Always "action" | given/when/then/and/but |
| expected_result | Used | Not used (null/empty) |
| Column headers | "Action" / "Expected Result" | None (pills are self-documenting) |
| Keyboard: Tab | Action → Expected | Pill → Text |
| Keyboard: Tab/Enter from last field | Expected → new step | Text → new step |

### Keyword pill design
- Clickable span/button showing current keyword (e.g., "Given")
- On click: opens a small dropdown with all 5 keywords
- Each keyword colored consistently (use gray-100 bg with gray-700 text — neutral, not status-colored)
- Dropdown: white bg, shadow-dropdown, border-gray-200, rounded-md
- Pill width: fixed ~60px to prevent layout shift between "Given" and "But"

---
*Researched: 2026-03-13*
