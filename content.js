// LinkedIn Drafts - Content Script
// Manages saving/loading/deleting drafts for LinkedIn post composer

console.log("[v0.1]", "loaded");

const STORAGE_KEY = 'linkedin_drafts';

// ── Storage helpers ──

function getDrafts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveDrafts(drafts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

function addDraft(text) {
  const drafts = getDrafts();
  drafts.unshift({
    id: Date.now().toString(),
    text: text,
    createdAt: new Date().toISOString(),
  });
  saveDrafts(drafts);
  return drafts;
}

function deleteDraft(id) {
  const drafts = getDrafts().filter(d => d.id !== id);
  saveDrafts(drafts);
  return drafts;
}

// ── LinkedIn DOM helpers ──

function getPostDialog() {
  return document.querySelector('.share-box-feed-entry__closed-share-box') ? null :
    document.querySelector('[role="dialog"]') ||
    document.querySelector('.share-creation-state__text-editor') ?.closest('[role="dialog"]') ||
    document.querySelector('.editor-container')?.closest('[role="dialog"]');
}

function getEditorElement() {
  return document.querySelector('.editor-content') ||
    document.querySelector('.ql-editor[contenteditable="true"]') ||
    document.querySelector('[role="textbox"][contenteditable="true"]');
}

function getEditorText() {
  const el = document.querySelector('.editor-content');
  if (el) return el.innerText.trim();
  const fallback = document.querySelector('.ql-editor[contenteditable="true"]') ||
    document.querySelector('[role="textbox"][contenteditable="true"]');
  if (fallback) return fallback.innerText.trim();
  return '';
}

function setEditorText(text) {
  const el = document.querySelector('.editor-content [contenteditable="true"]') ||
    document.querySelector('.editor-content') ||
    document.querySelector('.ql-editor[contenteditable="true"]') ||
    document.querySelector('[role="textbox"][contenteditable="true"]');
  if (!el) return;
  el.focus();
  el.innerHTML = text.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── Side Panel ──

let panelEl = null;

function createPanel() {
  if (panelEl) return panelEl;

  panelEl = document.createElement('div');
  panelEl.className = 'ld-panel';
  panelEl.innerHTML = `
    <div class="ld-panel-header">
      <h2>EasyDraft <small style='font-size:70%'><a target=_blank href='https://indydevs.com'>by 🚀 indydevs</a></h2>
      <button class="ld-panel-close">&times;</button>
    </div>
    <div class="ld-panel-save">
      <button class="ld-save-btn ld-panel-save-btn">Save Text (Cmd+Shift+S)</button>
    </div>
    <div class="ld-panel-body"></div>
  `;
  document.body.appendChild(panelEl);

  panelEl.querySelector('.ld-panel-close').addEventListener('click', () => {
    panelEl.classList.remove('ld-open');
  });

  panelEl.querySelector('.ld-panel-save-btn').addEventListener('click', () => {
    const text = getEditorText();
    if (!text) return;
    addDraft(text);
    const btn = panelEl.querySelector('.ld-panel-save-btn');
    btn.classList.add('ld-saved');
    btn.innerHTML = 'Saved!';
    setTimeout(() => {
      btn.classList.remove('ld-saved');
      btn.innerHTML = 'Save as Draft';
    }, 1500);
    renderPanel();
    updateBadge();
  });

  return panelEl;
}

function renderPanel() {
  const panel = createPanel();
  const body = panel.querySelector('.ld-panel-body');
  const drafts = getDrafts();

  if (drafts.length === 0) {
    body.innerHTML = '<div class="ld-panel-empty">No drafts saved yet.<br>Open the post composer and click "Save Draft".</div>';
    return;
  }

  body.innerHTML = drafts.map((draft, i) => {
    const date = new Date(draft.createdAt);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const preview = draft.text || '(empty draft)';
    return `
      <div class="ld-draft" data-id="${draft.id}">
        <div class="ld-draft-top">
          <span class="ld-draft-num">#${i + 1}</span>
          <span class="ld-draft-date">• ${dateStr}</span>
          <button class="ld-draft-delete" data-id="${draft.id}">Delete</button>
        </div>
        <div class="ld-draft-preview">${escapeHtml(preview)}</div>
      </div>
    `;
  }).join('');

  // Click draft to load it
  body.querySelectorAll('.ld-draft').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('ld-draft-delete')) return;
      const id = el.dataset.id;
      const draft = getDrafts().find(d => d.id === id);
      if (!draft) return;
      setEditorText(draft.text);
    });
  });

  // Delete buttons
  body.querySelectorAll('.ld-draft-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDraft(btn.dataset.id);
      renderPanel();
      updateBadge();
    });
  });
}

function togglePanel() {
  const panel = createPanel();
  renderPanel();
  panel.classList.toggle('ld-open');
}

// ── Buttons injected into post dialog ──

let buttonsInjected = false;
let lastSavedText = null;

function injectButtons(dialog) {
  if (dialog.querySelector('.ld-save-btn')) return;

  // Find the action bar (where Post button lives)
  const actionBar = dialog.querySelector('.share-box_actions') ||
    dialog.querySelector('.share-actions__primary-action')?.parentElement ||
    dialog.querySelector('[class*="share-box"]  [class*="actions"]') ||
    dialog.querySelector('.share-creation-state__footer') ||
    dialog.querySelector('[class*="footer"]');

  if (!actionBar) return;

  // Remove old buttons if any
  actionBar.querySelectorAll('.ld-save-btn, .ld-toggle-btn').forEach(el => el.remove());

  // Save Draft button
  const saveBtn = document.createElement('button');
  saveBtn.className = 'ld-save-btn';
  saveBtn.type = 'button';
  saveBtn.innerHTML = 'Save Draft';
  saveBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = getEditorText();
    if (!text) return;
    addDraft(text);
    lastSavedText = text;
    saveBtn.classList.add('ld-saved');
    saveBtn.innerHTML = 'Saved!';
    setTimeout(() => {
      saveBtn.classList.remove('ld-saved');
      saveBtn.innerHTML = 'Save Draft';
    }, 1500);
    renderPanel();
    updateBadge();
  });

  // Toggle Drafts button
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'ld-toggle-btn';
  toggleBtn.type = 'button';
  const count = getDrafts().length;
  toggleBtn.innerHTML = `Drafts ${count > 0 ? `<span class="ld-badge">${count}</span>` : ''}`;
  toggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePanel();
  });

  actionBar.prepend(toggleBtn);
  actionBar.prepend(saveBtn);
  buttonsInjected = true;
}

function updateBadge() {
  const toggleBtn = document.querySelector('.ld-toggle-btn');
  if (!toggleBtn) return;
  const count = getDrafts().length;
  toggleBtn.innerHTML = `Drafts ${count > 0 ? `<span class="ld-badge">${count}</span>` : ''}`;
}

// ── Utility ──

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Main observer ──

function init() {
  // Poll for post dialog (avoids MutationObserver feedback loops)
  setInterval(() => {
    const dialog = getPostDialog();
    if (dialog) injectButtons(dialog);
  }, 2000);

  // Cmd/Ctrl+Shift+S to save current post as draft
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      const text = getEditorText();
      if (!text) return;
      addDraft(text);
      renderPanel();
      updateBadge();
      // Flash the panel save button if panel is open
      const btn = panelEl?.querySelector('.ld-panel-save-btn');
      if (btn) {
        btn.classList.add('ld-saved');
        btn.innerHTML = 'Saved!';
        setTimeout(() => {
          btn.classList.remove('ld-saved');
          btn.innerHTML = 'Save Current Post as Draft';
        }, 1500);
      }
    }
  });

  // Open drafts panel when "Start a post" is clicked
  document.addEventListener('click', (e) => {
    const button = e.target.closest(
      'button.artdeco-button--tertiary'
    );
    if (!button) return;

    if (!button.innerText?.trim().toLowerCase().includes('start a post')) return;

    e.preventDefault();
    e.stopPropagation();
    togglePanel();
  });
  
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

console.log('LinkedinDrafts 1.6');