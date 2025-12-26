# MillOS Interface Redesign Specification & Test Plan

## 1. Vision: "Cyber-Industrial" Dashboard
The goal is to transform the MillOS interface from a "debug overlay" feel to a polished, professional "Digital Twin Operating System". The new design will prioritize situational awareness, ease of use, and immersion.

### Key Design Pillars
*   **Immersion First:** UI should frame the 3D content, not obscure it. Use glassmorphism and transparency.
*   **Contextual Information:** Show details only when relevant. Reduce persistent clutter.
*   **Unified Navigation:** A central "Dock" for mode switching (Operations, AI, SCADA, Admin).
*   **Tactile Feedback:** Crisp hover states, subtle animations, and sound effects for interactions.

## 2. Layout Architecture
The new layout abandons the scattered buttons for a structured grid:

*   **HUD (Top Layer):**
    *   *Top-Left:* Branding & DateTime (Minimal)
    *   *Top-Right:* System Status (FPS, Network, Safety Score)
    *   *Top-Center:* Urgent Alerts / Notifications (Toast area)
*   **The Dock (Bottom Center):** Mac-style floating dock for primary application modes.
*   **Primary Sidebar (Left - Collapsible):** "Mission Control" (Active objectives, quick stats).
*   **Inspector Panel (Right - Contextual):** Details for selected objects (Machine/Worker) or the active "Tool" (AI Chat, Settings).

## 3. Component Specifications

### 3.1 The Dock (`Dock.tsx`)
A floating container at the bottom center of the screen.
*   **Items:**
    1.  **Overview** (Home icon) - Resets camera, shows summary.
    2.  **AI Command** (Brain icon) - Opens AI Chat sidebar.
    3.  **SCADA** (Activity icon) - Opens deep data overlay.
    4.  **Workforce** (Users icon) - Worker list/management.
    5.  **Safety** (Shield icon) - Emergency controls.
    6.  **Settings** (Cog icon) - Graphics & Audio.
*   **Behavior:** Hover scales icons slightly. Active state indicated by a glowing dot.

### 3.2 Context Sidebar (`ContextSidebar.tsx`)
Replaces the current separate panels for AI, Worker Details, and Machine Details.
*   **Location:** Right side, full height (minus margins).
*   **Content:** Dynamic based on selection or Dock mode.
    *   *Mode: AI* -> Chat Interface.
    *   *Mode: Selection* -> Machine/Worker details.
    *   *Mode: None* -> Hidden.

### 3.3 Status HUD (`StatusHUD.tsx`)
Minimal indicators.
*   **Location:** Top bar.
*   **Style:** Transparent background, text only with icons.

## 4. User Flows

### Flow A: Inspecting a Machine
1.  **Trigger:** User clicks a 3D machine mesh.
2.  **Action:**
    *   Camera smoothly focuses on machine (existing).
    *   **New:** Right Sidebar slides out with "Machine Inspector" view.
    *   **New:** Dock highlights "Overview" (or stays neutral).
3.  **Exit:** Click "Close" on sidebar or click empty space. Sidebar slides away.

### Flow B: Consulting the AI
1.  **Trigger:** User clicks "Brain" icon in Dock (or presses 'A').
2.  **Action:**
    *   Right Sidebar slides out with "AI Command Center" view.
    *   Input field auto-focused.
3.  **Exit:** Click Dock icon again or press 'Esc'.

### Flow C: Emergency Response
1.  **Trigger:** Safety Score drops or User clicks "Shield" in Dock.
2.  **Action:**
    *   "Safety Mode" overlay activates (red tint edges).
    *   Right Sidebar shows "Emergency Controls".
    *   Central Toast shows alert.

## 5. Test Design & Verification Plan

Outlines how we will verify the "Incredible & Easy to Use" goals.

### 5.1 Component Level Tests (Unit/Visual)

| Component | Test Case | Expected Behavior |
|-----------|-----------|-------------------|
| **Dock** | `render` | Renders all 6 icons. |
| **Dock** | `hover` | Icon scales up 1.1x, tooltip appears. |
| **Dock** | `click` | Emits selection event, active indicator turns on. |
| **Inspector**| `prop: machine` | Displays RPM, Temp, Status for specific machine. |
| **Inspector**| `prop: worker` | Displays Name, Role, Fatigue, Location. |
| **HUD** | `render` | Shows FPS (if enabled), Time, Safety Score. |

### 5.2 Integration Tests (User Flows)

| Flow ID | Description | Steps | Success Criteria |
|---------|-------------|-------|------------------|
| **INT-01** | **Machine Inspection** | 1. Load Scene.<br>2. Click 'Roller Mill A'. | Sidebar opens. Title is "Roller Mill A". Live graphs render. |
| **INT-02** | **AI Interaction** | 1. Press 'A'. | Sidebar switches to AI mode. Text input is focused. |
| **INT-03** | **Mode Switching** | 1. Open AI.<br>2. Click Machine.<br>3. Click 'Settings' in Dock. | Sidebar transitions: AI -> Machine -> Settings. No overlap/clutter. |
| **INT-04** | **Responsiveness** | 1. Resize window to mobile width. | Dock scales down/hides labels. Sidebar becomes full screen. |

### 5.3 UX Acceptance Criteria (The "Incredible" Factor)
*   **Animation:** All panel entrances/exits must use `framer-motion` spring physics (no linear slides).
*   **Sound:** Hovering Dock items must trigger a subtle 'click' sound.
*   **Visuals:** Panels must use `backdrop-filter: blur(12px)` and a thin `1px` border with slight transparency.
*   **Performance:** UI interactions must not drop 3D scene FPS below 30.

## 6. Implementation Strategy
1.  **Scaffold:** Create `src/components/ui-new/` to avoid breaking current UI during dev.
2.  **Core Components:** Build `Dock`, `SidebarContainer`, `HUD`.
3.  **Migration:** Move logic from `UIOverlay.tsx` into new structure piece-by-piece.
4.  **Switch:** Update `App.tsx` to use `NewLayout`.
