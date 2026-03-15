import { queryClient } from "./queryClient";

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}

export interface CursorPos {
  x: number;
  y: number;
  visible: boolean;
  clicking: boolean;
}

export interface TutorialActions {
  setCursorPos: (pos: CursorPos | ((prev: CursorPos) => CursorPos)) => void;
  showToast: (title: string, description?: string) => void;
  mode: string;
  signal?: AbortSignal;
  scrollToElement?: (el: Element) => void;
}

// Module-level abort signal, set by runTutorial
let _signal: AbortSignal | undefined;
function d(ms: number) { return delay(ms, _signal); }

// --- Helper functions ---

function getElementCenter(selector: string): { x: number; y: number } | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function ensureVisible(selector: string) {
  const el = document.querySelector(selector);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function moveTo(selector: string, setCursorPos: TutorialActions["setCursorPos"]): Promise<boolean> {
  ensureVisible(selector);
  await d(200);
  const pos = getElementCenter(selector);
  if (!pos) {
    console.warn(`Tutorial: element not found: ${selector}`);
    return false;
  }
  setCursorPos({ x: pos.x, y: pos.y, visible: true, clicking: false });
  await d(600); // wait for cursor animation
  return true;
}

async function clickEl(el: HTMLElement, setCursorPos: TutorialActions["setCursorPos"]): Promise<void> {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  await d(200);
  const rect = el.getBoundingClientRect();
  setCursorPos({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, visible: true, clicking: false });
  await d(600);
  setCursorPos(prev => ({ ...prev, clicking: true }));
  await d(100);
  el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  el.click();
  await d(300);
  setCursorPos(prev => ({ ...prev, clicking: false }));
}

async function simulateClick(selector: string, setCursorPos: TutorialActions["setCursorPos"]): Promise<boolean> {
  const found = await moveTo(selector, setCursorPos);
  if (!found) return false;
  // Show click ripple
  setCursorPos(prev => ({ ...prev, clicking: true }));
  await d(100);
  // Actually click — dispatch full pointer/mouse event chain for Radix compatibility
  const el = document.querySelector(selector) as HTMLElement;
  if (el) {
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    el.click();
  }
  await d(300);
  setCursorPos(prev => ({ ...prev, clicking: false }));
  return true;
}

async function simulateType(
  selector: string,
  text: string,
  setCursorPos: TutorialActions["setCursorPos"],
  clearFirst = true,
  charDelay = 50
): Promise<boolean> {
  const found = await moveTo(selector, setCursorPos);
  if (!found) return false;

  const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
  if (!el) return false;

  el.focus();
  setCursorPos(prev => ({ ...prev, clicking: true }));
  await d(150);
  setCursorPos(prev => ({ ...prev, clicking: false }));

  const nativeSetter =
    Object.getOwnPropertyDescriptor(
      el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      "value"
    )?.set;

  if (clearFirst) {
    nativeSetter?.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await d(100);
  }

  // For number inputs, set value all at once to avoid "024" issues
  const isNumber = el instanceof HTMLInputElement && el.type === "number";
  if (isNumber) {
    // Simulate typing effect with brief pauses
    for (let i = 1; i <= text.length; i++) {
      nativeSetter?.call(el, text.substring(0, i));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      await d(charDelay);
    }
  } else {
    // Type character by character for text inputs/textareas
    for (const char of text) {
      nativeSetter?.call(el, el.value + char);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      await d(charDelay);
    }
  }
  return true;
}

async function waitForElement(selector: string, timeoutMs = 3000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (document.querySelector(selector)) return true;
    await d(100);
  }
  console.warn(`Tutorial: timed out waiting for ${selector}`);
  return false;
}

// --- Cable creation helper ---
async function addCable(
  actions: TutorialActions,
  type: "Feed" | "Distribution",
  name: string,
  fiberCount: string,
  circuits: string,
  toastTitle: string,
  toastDesc: string
) {
  const { setCursorPos, showToast } = actions;

  showToast(toastTitle, toastDesc);
  await d(800);

  // Click Add Cable
  await simulateClick('[data-testid="button-add-cable"]', setCursorPos);
  await waitForElement('[data-testid="input-cable-name"]');
  await d(400);

  // Select cable type
  await simulateClick('[data-testid="select-cable-type"]', setCursorPos);
  await d(300);
  await waitForElement(`[data-testid="option-cable-type-${type}"]`, 2000);
  await simulateClick(`[data-testid="option-cable-type-${type}"]`, setCursorPos);
  await d(300);

  // Type cable name
  await simulateType('[data-testid="input-cable-name"]', name, setCursorPos);
  await d(200);

  // Type fiber count
  await simulateType('[data-testid="input-fiber-count"]', fiberCount, setCursorPos);
  await d(200);

  // Type circuit IDs
  await simulateType('[data-testid="textarea-circuit-ids"]', circuits, setCursorPos, true, 30);
  await d(400);

  // Save
  await simulateClick('[data-testid="button-save-cable"]', setCursorPos);
  await d(800);
}

// --- Main tutorial ---

export async function runTutorial(actions: TutorialActions): Promise<void> {
  const { setCursorPos, showToast, mode, signal } = actions;
  _signal = signal;
  const apiMode = mode === "fiber" ? "fiber" : "copper";

  // Create floating stop button above all overlays
  const stopBtn = document.createElement("button");
  stopBtn.id = "tutorial-stop-btn";
  stopBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Stop`;
  Object.assign(stopBtn.style, {
    position: "fixed",
    top: "12px",
    right: "12px",
    zIndex: "99999",
    padding: "8px 16px",
    background: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
  });
  stopBtn.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("tutorial-stop"));
  });
  document.body.appendChild(stopBtn);

  // Clean up the button when signal aborts (from any source — header button or floating button)
  const removeStopBtn = () => stopBtn.remove();
  signal?.addEventListener("abort", removeStopBtn, { once: true });

  // Reset data first
  showToast("Tutorial Starting", "Clearing existing data...");
  const { getDb } = await import("@/lib/db");
  const db = getDb(apiMode);
  await db.cables.clear();
  await db.circuits.clear();
  queryClient.invalidateQueries({ queryKey: [`/api/${apiMode}/cables`] });
  queryClient.invalidateQueries({ queryKey: [`/api/${apiMode}/circuits`] });

  // Clear splice name to trigger naming dialog
  localStorage.removeItem(`spliceName-${apiMode}`);

  // Show cursor
  setCursorPos({ x: window.innerWidth / 2, y: window.innerHeight / 2, visible: true, clicking: false });
  await d(1000);

  // Wait for splice naming dialog to appear (it shows on empty state)
  // We need to trigger it — set state. The runner can't directly set React state for the dialog,
  // so we reload to trigger the "name your splice" dialog on fresh start.
  // Instead, we'll programmatically click the splice name button to edit it.

  // Phase 1: Add Feed Cable PFP1
  await addCable(
    actions,
    "Feed",
    "PFP1",
    "432",
    "pon,1-432",
    "Step 1: Add Feed Cable",
    "Adding feed cable PFP1 with 432 fibers..."
  );

  // Select PFP1 to show it
  await waitForElement('[data-testid^="button-cable-"]');
  await d(300);
  const pfp1Btn = document.querySelector('[data-testid^="button-cable-"]') as HTMLElement;
  if (pfp1Btn) {
    await moveTo(`[data-testid="${pfp1Btn.dataset.testid}"]`, setCursorPos);
    setCursorPos(prev => ({ ...prev, clicking: true }));
    await d(100);
    pfp1Btn.click();
    await d(300);
    setCursorPos(prev => ({ ...prev, clicking: false }));
  }
  await d(1200);

  // Phase 1b: Rename splice from "Main Splice" to "Print 2.1"
  showToast("Step 2: Rename Splice", "Click the splice name to rename it.");
  await d(800);

  // Click the splice name button (contains "Splice" text, has rounded-lg border)
  const spliceNameBtn = Array.from(document.querySelectorAll('button'))
    .find(btn => btn.textContent?.includes("Splice") && btn.classList.contains("rounded-lg")) as HTMLElement;
  if (spliceNameBtn) {
    await clickEl(spliceNameBtn, setCursorPos);
    await d(500);

    // Find the inline edit input (autoFocus input with text-center class)
    const editInput = document.querySelector('input.text-center') as HTMLInputElement;
    if (editInput) {
      // Use simulateType to clear and type the new name (works with React controlled inputs)
      await simulateType('input.text-center', "Print 2.1", setCursorPos, true, 80);
      await d(400);

      // Click the check button to confirm
      const checkBtn = document.querySelector('button:has(.lucide-check)') as HTMLElement;
      if (checkBtn) {
        await clickEl(checkBtn, setCursorPos);
      }
    }
  }
  await d(1000);

  // Phase 2: Add Feed Cable PFP2
  await addCable(
    actions,
    "Feed",
    "PFP2",
    "432",
    "pon,433-864",
    "Step 3: Add Feed Cable",
    "Adding feed cable PFP2 with 432 fibers..."
  );
  await d(1000);

  // --- Helper to splice pon checkboxes on the currently selected cable ---
  async function splicePonCheckboxes(cableName: string) {
    // Wait for checkboxes to render
    await waitForElement('[data-testid^="checkbox-spliced-"]', 3000);
    await d(300);

    // Find all unchecked pon checkboxes in the circuit table
    const checkboxes = document.querySelectorAll('[data-testid^="checkbox-spliced-"]');
    for (const cb of Array.from(checkboxes)) {
      const row = cb.closest("tr");
      const btn = cb.closest("button") || cb;
      const isChecked = btn.getAttribute("data-state") === "checked" ||
                        btn.getAttribute("aria-checked") === "true";
      if (row?.textContent?.includes("pon") && !isChecked) {
        await clickEl(btn as HTMLElement, setCursorPos);
        await d(1000);
      }
    }
    showToast("Spliced!", `${cableName} pon circuits matched to feed cable.`);
    await d(1500);
  }

  // Phase 4: Add Distribution Cable d1 (intentional error)
  await addCable(
    actions,
    "Distribution",
    "d1",
    "24",
    "pon,1-12",
    "Step 4: Add Distribution Cable (with error)",
    "Adding d1 with only 1 circuit — intentionally missing a,1-12 to show Fail..."
  );

  // Select d1
  await d(500);
  const d1Btn = Array.from(document.querySelectorAll('[data-testid^="button-cable-"]'))
    .find(el => el.textContent?.includes("d1")) as HTMLElement;
  if (d1Btn) await clickEl(d1Btn, setCursorPos);

  showToast("Notice: Fail!", "d1 shows Fail — only 12 of 24 fibers assigned. A circuit is missing.");
  await d(2500);

  // Phase 5: Fix d1
  showToast("Step 5: Fix the Error", "Adding missing circuit a,1-12 to d1...");
  await d(600);

  await waitForElement('[data-testid="input-circuit-id"]');
  await simulateType('[data-testid="input-circuit-id"]', "a,1-12", setCursorPos);
  await d(300);
  await simulateClick('[data-testid="button-add-circuit"]', setCursorPos);
  await d(800);

  showToast("Fixed!", "d1 now shows Pass — all 24 fibers are assigned.");
  await d(1500);

  // Phase 5b: Demonstrate move up/down
  showToast("Step 6: Reorder Circuits", "Use the up/down arrows to rearrange circuit order within a cable.");
  await d(800);

  // Scroll down so the circuit rows and action arrows are visible below the toast
  const circuitTable = document.querySelector('[data-testid="card-circuit-management"]');
  if (circuitTable) circuitTable.scrollIntoView({ behavior: "smooth", block: "start" });
  await d(500);

  // Move "a,1-12" (second row) up
  const moveUpBtn = document.querySelector('[data-testid^="button-move-up-"]') as HTMLElement;
  if (moveUpBtn) {
    // Find the second row's move-up button (the first row's move-up is disabled or first)
    const allMoveUp = Array.from(document.querySelectorAll('[data-testid^="button-move-up-"]')) as HTMLElement[];
    const targetBtn = allMoveUp.length > 1 ? allMoveUp[1] : allMoveUp[0];
    if (targetBtn) {
      await clickEl(targetBtn, setCursorPos);
      await d(1000);
      showToast("Moved Up", "Circuit a,1-12 moved above pon,1-12.");
      await d(1500);

      // Move it back down
      const allMoveDown = Array.from(document.querySelectorAll('[data-testid^="button-move-down-"]')) as HTMLElement[];
      const downBtn = allMoveDown[0];
      if (downBtn) {
        await clickEl(downBtn, setCursorPos);
        await d(1000);
        showToast("Moved Down", "Circuit a,1-12 moved back to its original position.");
        await d(1500);
      }
    }
  }

  // Splice d1 right after fixing it
  showToast("Step 7: Splice d1", "Check the splice checkbox to match d1's pon circuit to the feed cable.");
  await d(800);
  await splicePonCheckboxes("d1");

  // Phase 6: Add d3 and splice immediately
  await addCable(
    actions,
    "Distribution",
    "d3",
    "216",
    "h,1-24\npon,429-432\npon,433-584\na,181-216",
    "Step 8: Add Distribution Cable d3",
    "Adding d3 with 216 fibers and 4 circuits..."
  );
  await d(500);

  // Select d3 and splice
  const d3Btn = Array.from(document.querySelectorAll('[data-testid^="button-cable-"]'))
    .find(el => el.textContent?.includes("d3")) as HTMLElement;
  if (d3Btn) await clickEl(d3Btn, setCursorPos);
  await d(500);

  showToast("Step 9: Splice d3", "Checking splice checkboxes on d3's pon circuits...");
  await d(800);
  await splicePonCheckboxes("d3");

  // Phase 7: Create sub-splice on d3
  showToast("Step 10: Create Sub-Splice", "Click 'Add Splice' on d3 to create a sub-splice...");
  await d(800);

  // d3 should already be selected, find its Add Splice button using d3's cable ID
  const d3CableBtn = Array.from(document.querySelectorAll('[data-testid^="button-cable-"]'))
    .find(el => el.textContent?.includes("d3")) as HTMLElement;
  const d3CableId = d3CableBtn?.getAttribute("data-testid")?.replace("button-cable-", "");
  const addSpliceBtn = d3CableId
    ? document.querySelector(`[data-testid="button-add-splice-${d3CableId}"]`) as HTMLElement
    : null;
  if (addSpliceBtn) await clickEl(addSpliceBtn, setCursorPos);
  await d(500);

  // Name the splice in the dialog
  await waitForElement('input[placeholder*="Print"]', 2000);
  const spliceInput = document.querySelector('input[placeholder*="Print"]') as HTMLInputElement;
  if (spliceInput) {
    showToast("Name the Sub-Splice", "Type a name for this splice point...");
    await d(400);
    const inputRect = spliceInput.getBoundingClientRect();
    setCursorPos({ x: inputRect.left + inputRect.width / 2, y: inputRect.top + inputRect.height / 2, visible: true, clicking: false });
    await d(500);
    spliceInput.focus();
    setCursorPos(prev => ({ ...prev, clicking: true }));
    await d(150);
    setCursorPos(prev => ({ ...prev, clicking: false }));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    for (const char of "Print5.8") {
      setter?.call(spliceInput, spliceInput.value + char);
      spliceInput.dispatchEvent(new Event("input", { bubbles: true }));
      await d(60);
    }
    await d(400);

    // Click "Name & Enter" button
    const nameBtn = Array.from(document.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes("Name") && btn.textContent?.includes("Enter")) as HTMLElement;
    if (nameBtn) {
      const btnRect = nameBtn.getBoundingClientRect();
      setCursorPos({ x: btnRect.left + btnRect.width / 2, y: btnRect.top + btnRect.height / 2, visible: true, clicking: false });
      await d(500);
      setCursorPos(prev => ({ ...prev, clicking: true }));
      await d(100);
      nameBtn.click();
      await d(300);
      setCursorPos(prev => ({ ...prev, clicking: false }));
    }
  }
  await d(800);

  // Now in sub-splice context — add d4 cable
  showToast("Step 11: Add Cable in Sub-Splice", "Adding d4 inside the Print5.8 sub-splice (48 fibers)...");
  await d(600);

  await waitForElement('[data-testid="button-add-cable"]');
  await simulateClick('[data-testid="button-add-cable"]', setCursorPos);
  await waitForElement('[data-testid="input-cable-name"]');
  await d(400);

  // In sub-splice context, type is auto-set to Distribution, type selector may be hidden
  await simulateType('[data-testid="input-cable-name"]', "d4", setCursorPos);
  await d(200);
  await simulateType('[data-testid="input-fiber-count"]', "48", setCursorPos);
  await d(200);
  await simulateType('[data-testid="textarea-circuit-ids"]', "j,29-48\npon,429-432\npon,433-456", setCursorPos, true, 30);
  await d(400);
  await simulateClick('[data-testid="button-save-cable"]', setCursorPos);
  await d(1000);

  showToast("Sub-Splice Created!", "d4 is now a child of d3 in the splice tree.");
  await d(1500);

  // Select d4 and splice its pon circuits
  await d(500);
  const d4Btn = Array.from(document.querySelectorAll('[data-testid^="button-cable-"]'))
    .find(el => el.textContent?.includes("d4")) as HTMLElement;
  if (d4Btn) await clickEl(d4Btn, setCursorPos);
  await d(500);

  showToast("Step 12: Splice d4", "Checking splice checkboxes on d4's pon circuits...");
  await d(800);
  await splicePonCheckboxes("d4");

  // Show splice mapping for d4 in the sub-splice context
  showToast("Step 13: View Splice by Cable", "Click d4 tab to see the splice mapping for d4.");
  await d(800);
  const spliceByTab = Array.from(document.querySelectorAll('[data-testid^="tab-splice-"]'))
    .find(el => el.textContent?.includes("d4")) as HTMLElement;
  if (spliceByTab) {
    await clickEl(spliceByTab, setCursorPos);
    await d(2000);
  }

  // Phase: Toggle Strands/Ribbons view
  showToast("Step 14: Toggle View Mode", "Click the Strands/Ribbons toggle to switch between strand and ribbon views.");
  await d(800);

  // Scroll down to have a better view of the expanded splice table
  const spliceTable = document.querySelector('[data-testid^="switch-view-mode-"]')?.closest('div[class]')?.parentElement;
  if (spliceTable) spliceTable.scrollIntoView({ behavior: "smooth", block: "start" });
  await d(500);

  // Find the strands/ribbons toggle switch in the splice mapping table
  const viewToggle = document.querySelector('[data-testid^="switch-view-mode-"]') as HTMLElement;
  if (viewToggle) {
    await clickEl(viewToggle, setCursorPos);
    await d(2000);
    showToast("Ribbons View", "Now showing ribbon numbers instead of individual strand colors.");
    await d(2000);
    // Toggle back to strands
    await clickEl(viewToggle, setCursorPos);
    await d(1500);
    showToast("Strands View", "Back to strand view with fiber color codes.");
    await d(1500);
  }

  // Step 15: Navigate back to Print 2.1 via splice tree and open pon splice mapping
  showToast("Step 15: Return to Main Splice", "Click 'Print 2.1' in the splice tree to go back to the main splice...");
  await d(800);

  // Find the Print 2.1 node in the splice tree SVG — look for the <g> containing "Print 2.1" text
  const treeGroups = Array.from(document.querySelectorAll('svg g'));
  const print21Group = treeGroups.find(g => {
    const texts = g.querySelectorAll('text');
    return Array.from(texts).some(t => t.textContent?.includes("Print 2.1"));
  });
  if (print21Group) {
    // Click the transparent hit-area circle within this group
    const hitCircle = print21Group.querySelector('circle[fill="transparent"]') as SVGElement;
    if (hitCircle) {
      // SVG elements need special handling — scrollIntoView + click via coordinates
      const svgContainer = hitCircle.closest('svg')?.parentElement;
      if (svgContainer) svgContainer.scrollIntoView({ behavior: "smooth", block: "center" });
      await d(300);
      const rect = hitCircle.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      setCursorPos({ x: cx, y: cy, visible: true, clicking: false });
      await d(600);
      setCursorPos(prev => ({ ...prev, clicking: true }));
      await d(100);
      hitCircle.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
      await d(300);
      setCursorPos(prev => ({ ...prev, clicking: false }));
    }
  }
  await d(1000);

  // Click the pon splice tab
  showToast("Step 15: View Splice by ID", "Open the 'pon' splice mapping to see all pon circuit assignments...");
  await d(800);
  const ponTab = document.querySelector('[data-testid="tab-prefix-splice-pon"]') as HTMLElement;
  if (ponTab) {
    await clickEl(ponTab, setCursorPos);
    await d(2500);
  }

  // Hide cursor and clean up
  setCursorPos({ x: 0, y: 0, visible: false, clicking: false });
  stopBtn.remove();

  showToast("Tutorial Complete!", "You've seen how to add cables, assign circuits, splice them, and view splice mappings.");
}

// --- Copper Tutorial ---

export async function runCopperTutorial(actions: TutorialActions): Promise<void> {
  const { setCursorPos, showToast, signal } = actions;
  _signal = signal;
  const apiMode = "copper";

  // Create floating stop button above all overlays
  const stopBtn = document.createElement("button");
  stopBtn.id = "tutorial-stop-btn";
  stopBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Stop`;
  Object.assign(stopBtn.style, {
    position: "fixed",
    top: "12px",
    right: "12px",
    zIndex: "99999",
    padding: "8px 16px",
    background: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
  });
  stopBtn.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("tutorial-stop"));
  });
  document.body.appendChild(stopBtn);

  const removeStopBtn = () => stopBtn.remove();
  signal?.addEventListener("abort", removeStopBtn, { once: true });

  // Reset data
  showToast("Tutorial Starting", "Clearing existing data...");
  const { getDb } = await import("@/lib/db");
  const db = getDb(apiMode);
  await db.cables.clear();
  await db.circuits.clear();
  queryClient.invalidateQueries({ queryKey: [`/api/${apiMode}/cables`] });
  queryClient.invalidateQueries({ queryKey: [`/api/${apiMode}/circuits`] });

  // Clear splice name to trigger fresh start
  localStorage.removeItem(`spliceName-${apiMode}`);

  // Show cursor
  setCursorPos({ x: window.innerWidth / 2, y: window.innerHeight / 2, visible: true, clicking: false });
  await d(1000);

  // --- Helper to splice pot checkboxes on the currently selected cable ---
  async function splicePotCheckboxes(cableName: string) {
    await waitForElement('[data-testid^="checkbox-spliced-"]', 3000);
    await d(300);
    const checkboxes = document.querySelectorAll('[data-testid^="checkbox-spliced-"]');
    for (const cb of Array.from(checkboxes)) {
      const row = cb.closest("tr");
      const btn = cb.closest("button") || cb;
      const isChecked = btn.getAttribute("data-state") === "checked" ||
                        btn.getAttribute("aria-checked") === "true";
      if (row?.textContent?.includes("pot") && !isChecked) {
        await clickEl(btn as HTMLElement, setCursorPos);
        await d(1000);
      }
    }
    showToast("Spliced!", `${cableName} pot circuits matched to feed cable.`);
    await d(1500);
  }

  // Step 1: Add Feed Cable f1 (100 pairs, pot,1-100)
  await addCable(
    actions,
    "Feed",
    "f1",
    "100",
    "pot,1-100",
    "Step 1: Add Feed Cable",
    "Adding feed cable f1 with 100 pairs..."
  );

  // Select f1 to show it
  await waitForElement('[data-testid^="button-cable-"]');
  await d(300);
  const f1Btn = document.querySelector('[data-testid^="button-cable-"]') as HTMLElement;
  if (f1Btn) {
    await moveTo(`[data-testid="${f1Btn.dataset.testid}"]`, setCursorPos);
    setCursorPos(prev => ({ ...prev, clicking: true }));
    await d(100);
    f1Btn.click();
    await d(300);
    setCursorPos(prev => ({ ...prev, clicking: false }));
  }
  await d(1200);

  // Step 2: Rename splice from "Main" to "Copper Main"
  showToast("Step 2: Rename Splice", "Click the splice name to rename it.");
  await d(800);

  const spliceNameBtn = Array.from(document.querySelectorAll('button'))
    .find(btn => btn.textContent?.includes("Splice") && btn.classList.contains("rounded-lg")) as HTMLElement;
  if (spliceNameBtn) {
    await clickEl(spliceNameBtn, setCursorPos);
    await d(500);
    const editInput = document.querySelector('input.text-center') as HTMLInputElement;
    if (editInput) {
      await simulateType('input.text-center', "Copper Main", setCursorPos, true, 80);
      await d(400);
      const checkBtn = document.querySelector('button:has(.lucide-check)') as HTMLElement;
      if (checkBtn) await clickEl(checkBtn, setCursorPos);
    }
  }
  await d(1000);

  // Step 3: Add d1 with intentional error (50 pairs, only pot,1-25 — missing g,1-25)
  await addCable(
    actions,
    "Distribution",
    "d1",
    "50",
    "pot,1-25",
    "Step 3: Add Distribution Cable (with error)",
    "Adding d1 with only 1 circuit — intentionally missing g,1-25 to show Fail..."
  );

  // Select d1
  await d(500);
  const d1Btn = Array.from(document.querySelectorAll('[data-testid^="button-cable-"]'))
    .find(el => el.textContent?.includes("d1")) as HTMLElement;
  if (d1Btn) await clickEl(d1Btn, setCursorPos);

  showToast("Notice: Fail!", "d1 shows Fail — only 25 of 50 pairs assigned. A circuit is missing.");
  await d(2500);

  // Step 4: Fix d1 by adding g,1-25
  showToast("Step 4: Fix the Error", "Adding missing circuit g,1-25 to d1...");
  await d(600);

  await waitForElement('[data-testid="input-circuit-id"]');
  await simulateType('[data-testid="input-circuit-id"]', "g,1-25", setCursorPos);
  await d(300);
  await simulateClick('[data-testid="button-add-circuit"]', setCursorPos);
  await d(800);

  showToast("Fixed!", "d1 now shows Pass — all 50 pairs are assigned.");
  await d(1500);

  // Step 5: Reorder circuits demo
  showToast("Step 5: Reorder Circuits", "Use the up/down arrows to rearrange circuit order within a cable.");
  await d(800);

  const circuitTable = document.querySelector('[data-testid="card-circuit-management"]');
  if (circuitTable) circuitTable.scrollIntoView({ behavior: "smooth", block: "start" });
  await d(500);

  const allMoveUp = Array.from(document.querySelectorAll('[data-testid^="button-move-up-"]')) as HTMLElement[];
  const targetUpBtn = allMoveUp.length > 1 ? allMoveUp[1] : allMoveUp[0];
  if (targetUpBtn) {
    await clickEl(targetUpBtn, setCursorPos);
    await d(1000);
    showToast("Moved Up", "Circuit g,1-25 moved above pot,1-25.");
    await d(1500);

    const allMoveDown = Array.from(document.querySelectorAll('[data-testid^="button-move-down-"]')) as HTMLElement[];
    const downBtn = allMoveDown[0];
    if (downBtn) {
      await clickEl(downBtn, setCursorPos);
      await d(1000);
      showToast("Moved Down", "Circuit g,1-25 moved back to its original position.");
      await d(1500);
    }
  }

  // Step 6: Splice d1
  showToast("Step 6: Splice d1", "Check the splice checkbox to match d1's pot circuit to the feed cable.");
  await d(800);
  await splicePotCheckboxes("d1");

  // Step 7: Add d2 (50 pairs, pot,26-50 and vg,1-25)
  await addCable(
    actions,
    "Distribution",
    "d2",
    "50",
    "pot,26-50\nvg,1-25",
    "Step 7: Add Distribution Cable d2",
    "Adding d2 with 50 pairs and 2 circuits..."
  );
  await d(500);

  // Select d2 and splice
  const d2Btn = Array.from(document.querySelectorAll('[data-testid^="button-cable-"]'))
    .find(el => el.textContent?.includes("d2")) as HTMLElement;
  if (d2Btn) await clickEl(d2Btn, setCursorPos);
  await d(500);

  showToast("Step 8: Splice d2", "Checking splice checkboxes on d2's pot circuits...");
  await d(800);
  await splicePotCheckboxes("d2");

  // Step 9: Create sub-splice from d2
  showToast("Step 9: Create Sub-Splice", "Click 'Add Splice' on d2 to create a sub-splice...");
  await d(800);

  const d2CableBtn = Array.from(document.querySelectorAll('[data-testid^="button-cable-"]'))
    .find(el => el.textContent?.includes("d2")) as HTMLElement;
  const d2CableId = d2CableBtn?.getAttribute("data-testid")?.replace("button-cable-", "");
  const addSpliceBtn = d2CableId
    ? document.querySelector(`[data-testid="button-add-splice-${d2CableId}"]`) as HTMLElement
    : null;
  if (addSpliceBtn) await clickEl(addSpliceBtn, setCursorPos);
  await d(500);

  // Name the splice "Print5.6"
  await waitForElement('input[placeholder*="Print"]', 2000);
  const spliceInput = document.querySelector('input[placeholder*="Print"]') as HTMLInputElement;
  if (spliceInput) {
    showToast("Name the Sub-Splice", "Type a name for this splice point...");
    await d(400);
    const inputRect = spliceInput.getBoundingClientRect();
    setCursorPos({ x: inputRect.left + inputRect.width / 2, y: inputRect.top + inputRect.height / 2, visible: true, clicking: false });
    await d(500);
    spliceInput.focus();
    setCursorPos(prev => ({ ...prev, clicking: true }));
    await d(150);
    setCursorPos(prev => ({ ...prev, clicking: false }));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    for (const char of "Print5.6") {
      setter?.call(spliceInput, spliceInput.value + char);
      spliceInput.dispatchEvent(new Event("input", { bubbles: true }));
      await d(60);
    }
    await d(400);

    const nameBtn = Array.from(document.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes("Name") && btn.textContent?.includes("Enter")) as HTMLElement;
    if (nameBtn) {
      const btnRect = nameBtn.getBoundingClientRect();
      setCursorPos({ x: btnRect.left + btnRect.width / 2, y: btnRect.top + btnRect.height / 2, visible: true, clicking: false });
      await d(500);
      setCursorPos(prev => ({ ...prev, clicking: true }));
      await d(100);
      nameBtn.click();
      await d(300);
      setCursorPos(prev => ({ ...prev, clicking: false }));
    }
  }
  await d(800);

  // Step 10: Add d3 in sub-splice (50 pairs, pot,1-20 and f,1-30)
  showToast("Step 10: Add Cable in Sub-Splice", "Adding d3 inside the Print5.6 sub-splice (50 pairs)...");
  await d(600);

  await waitForElement('[data-testid="button-add-cable"]');
  await simulateClick('[data-testid="button-add-cable"]', setCursorPos);
  await waitForElement('[data-testid="input-cable-name"]');
  await d(400);

  await simulateType('[data-testid="input-cable-name"]', "d3", setCursorPos);
  await d(200);
  await simulateType('[data-testid="input-fiber-count"]', "50", setCursorPos);
  await d(200);
  await simulateType('[data-testid="textarea-circuit-ids"]', "pot,26-45\nf,1-30", setCursorPos, true, 30);
  await d(400);
  await simulateClick('[data-testid="button-save-cable"]', setCursorPos);
  await d(1000);

  showToast("Sub-Splice Created!", "d3 is now a child of d2 in the splice tree.");
  await d(1500);

  // Step 11: Select d3 and splice its pot circuits
  await d(500);
  const d3Btn = Array.from(document.querySelectorAll('[data-testid^="button-cable-"]'))
    .find(el => el.textContent?.includes("d3")) as HTMLElement;
  if (d3Btn) await clickEl(d3Btn, setCursorPos);
  await d(500);

  showToast("Step 11: Splice d3", "Checking splice checkboxes on d3's pot circuits...");
  await d(800);
  await splicePotCheckboxes("d3");

  // Step 12: View splice mapping for d3
  showToast("Step 12: View Splice by Cable", "Click d3 tab to see the splice mapping for d3.");
  await d(800);
  const spliceByTab = Array.from(document.querySelectorAll('[data-testid^="tab-splice-"]'))
    .find(el => el.textContent?.includes("d3")) as HTMLElement;
  if (spliceByTab) {
    await clickEl(spliceByTab, setCursorPos);
    await d(2000);
  }

  // Step 13: Toggle Strands/Binder view
  showToast("Step 13: Toggle View Mode", "Click the Strands/Binder toggle to switch views.");
  await d(800);

  const spliceTbl = document.querySelector('[data-testid^="switch-view-mode-"]')?.closest('div[class]')?.parentElement;
  if (spliceTbl) spliceTbl.scrollIntoView({ behavior: "smooth", block: "start" });
  await d(500);

  const viewToggle = document.querySelector('[data-testid^="switch-view-mode-"]') as HTMLElement;
  if (viewToggle) {
    await clickEl(viewToggle, setCursorPos);
    await d(2000);
    showToast("Binder View", "Now showing binder groupings instead of individual pairs.");
    await d(2000);
    await clickEl(viewToggle, setCursorPos);
    await d(1500);
    showToast("Strands View", "Back to strand view with pair color codes.");
    await d(1500);
  }

  // Step 14: Navigate back to Copper Main via splice tree and open pot splice mapping
  showToast("Step 14: Return to Main Splice", "Click 'Copper Main' in the splice tree to go back...");
  await d(800);

  const treeGroups = Array.from(document.querySelectorAll('svg g'));
  const mainGroup = treeGroups.find(g => {
    const texts = g.querySelectorAll('text');
    return Array.from(texts).some(t => t.textContent?.includes("Copper Main"));
  });
  if (mainGroup) {
    const hitCircle = mainGroup.querySelector('circle[fill="transparent"]') as SVGElement;
    if (hitCircle) {
      const svgContainer = hitCircle.closest('svg')?.parentElement;
      if (svgContainer) svgContainer.scrollIntoView({ behavior: "smooth", block: "center" });
      await d(300);
      const rect = hitCircle.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      setCursorPos({ x: cx, y: cy, visible: true, clicking: false });
      await d(600);
      setCursorPos(prev => ({ ...prev, clicking: true }));
      await d(100);
      hitCircle.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
      await d(300);
      setCursorPos(prev => ({ ...prev, clicking: false }));
    }
  }
  await d(1000);

  // Click the pot splice tab
  showToast("Step 14: View Splice by ID", "Open the 'pot' splice mapping to see all pot circuit assignments...");
  await d(800);
  const potTab = document.querySelector('[data-testid="tab-prefix-splice-pot"]') as HTMLElement;
  if (potTab) {
    await clickEl(potTab, setCursorPos);
    await d(2500);
  }

  // Hide cursor and clean up
  setCursorPos({ x: 0, y: 0, visible: false, clicking: false });
  stopBtn.remove();

  showToast("Tutorial Complete!", "You've seen how to add cables, assign circuits, splice them, and view splice mappings in copper mode.");
}
