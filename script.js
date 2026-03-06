// script.js - UI logic: theme, subjects, chats, accessibility
(function(){
  const root=document.documentElement;
  const themeSelect=document.getElementById('themeSelect');
  const subjectDropdown=document.getElementById('subjectDropdown');
  const historyList=document.getElementById('chatList');
  const newChatBtn=document.getElementById('newChat');
  const clearAllBtn=document.getElementById('clearAll');
  const messagesEl=document.getElementById('messages');
  const inputBox=document.getElementById('inputBox');
  const sendBtn=document.getElementById('sendBtn');
  const micBtn=document.getElementById('micBtn');
  const currentSubject=document.getElementById('currentSubject');
  const chatTitle=document.getElementById('chatTitle');
  const chatSubtitle=document.getElementById('chatSubtitle');
  const toasts=document.getElementById('toasts');
  const toggleSidebarBtn = document.getElementById('toggleSidebar');
  const sidebar = document.querySelector('.sidebar');
  const appEl = document.querySelector('.app');
  const composerEl = document.querySelector('.composer');
  const settingsLanguage = document.getElementById('settingsLanguage');
  const mainModelSelect = document.getElementById('mainModelSelect');
  const adminSettingsFields = document.getElementById('adminSettingsFields');
  const adminSettingsStatus = document.getElementById('adminSettingsStatus');
  const adminUnlockBtn = document.getElementById('adminUnlockBtn');
  const adminUnlockModal = document.getElementById('adminUnlockModal');
  const adminUnlockClose = document.getElementById('adminUnlockClose');
  const adminUnlockCancel = document.getElementById('adminUnlockCancel');
  const adminUnlockConfirm = document.getElementById('adminUnlockConfirm');
  const adminUnlockEmail = document.getElementById('adminUnlockEmail');
  const defaultSubject = document.getElementById('defaultSubject');
  const themeOptions = document.querySelectorAll('.theme-option');
  const themeToggleBtn = document.querySelector('.theme-toggle-btn');
  const studyGoalBtns = document.querySelectorAll('.study-goal-btn');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const welcomePanel = document.getElementById('welcomePanel');
  const badgesTab = document.getElementById('badgesTab');
  const badgesContent = document.getElementById('badges-content');
  const examModeToggleMount = document.getElementById('examModeToggleMount');
  const examModeRoot = document.getElementById('examModeRoot');
  let examModePrevActiveChat = null;
  let examModeSessionId = null;
  let examModePapersLoaded = false;
  let examModePdfLinks = [];
  const MAIN_MODEL_KEY = 'main_model';
  const ADMIN_UNLOCK_MS = 15000;
  const MAIN_MODEL_DEFAULT = 'gemini-3-pro-preview';
  const MAIN_MODEL_OPTIONS_FALLBACK = [
    { id: 'google/gemini-2.5-flash', label: 'google/gemini-2.5-flash' },
    { id: 'openai/gpt-5.2-chat', label: 'openai/gpt-5.2-chat' },
    { id: 'anthropic/claude-opus-4-6', label: 'anthropic/claude-opus-4-6' }
  ];
  

  // restore state
  let state={
    theme: localStorage.getItem('g9_theme') || 'system',
    subject: localStorage.getItem('g9_subject') || 'General',
    language: localStorage.getItem('g9_language') || 'English',
    studyGoal: localStorage.getItem('g9_study_goal') || '60',
    chats: JSON.parse(localStorage.getItem('g9_chats') || '[]'),
    active: localStorage.getItem('g9_active') || null
  };

  // Remote chat sync (Firestore via GoogleSync)
  try {
    window.addEventListener('g9:remote_chats', (ev)=>{
      const d = ev && ev.detail ? ev.detail : {};
      if(Array.isArray(d.chats)) state.chats = d.chats;
      if(d.active !== undefined) state.active = d.active;
      saveChats();
      renderChats();
      renderActiveChat();
    });
  } catch (e) {}

  // Theme handling
  function updateThemeToggleUI(){
    if(!themeToggleBtn) return;
    const iconEl = themeToggleBtn.querySelector('.theme-icon');
    const textEl = themeToggleBtn.querySelector('.theme-text');
    const mode = state.theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light') : state.theme;
    if(iconEl){
      iconEl.innerHTML = mode === 'dark' ? '<i data-lucide="moon"></i>' : '<i data-lucide="sun"></i>';
      try { if(window.lucide && window.lucide.createIcons) window.lucide.createIcons(); } catch (e) {}
    }
    if(textEl) textEl.textContent = state.theme.charAt(0).toUpperCase()+state.theme.slice(1)+' Mode';
  }

  function normalizeExamTerm(raw){
    const t = String(raw || '').trim().toLowerCase();
    if(!t) return '';
    if(/\b(first|1st|term\s*1|term-?1|t\s*1|\b1\b)\b/i.test(t)) return 'First';
    if(/\b(second|2nd|term\s*2|term-?2|t\s*2|\b2\b)\b/i.test(t)) return 'Second';
    if(/\b(third|3rd|term\s*3|term-?3|t\s*3|\b3\b)\b/i.test(t)) return 'Third';
    return '';
  }

  function stripAwardPointsLine(text){
    const t = String(text || '');
    // Remove the required scoring line from display (it should still exist in backend responses)
    return t.replace(/\n?\s*AWARD_POINTS\s*:\s*\d+\s*$/i, '').trim();
  }

  function normalizeExamSubject(raw){
    const t = String(raw || '').trim().toLowerCase();
    if(!t) return '';
    if(/\b(math|maths|mathematics)\b/i.test(t)) return 'Maths';
    if(/\b(science)\b/i.test(t)) return 'Science';
    if(/\b(english)\b/i.test(t)) return 'English';
    if(/\b(history)\b/i.test(t)) return 'History';
    if(/\b(geography)\b/i.test(t)) return 'Geography';
    if(/\b(sinhala)\b/i.test(t)) return 'Sinhala';
    if(/\b(civics|civic)\b/i.test(t)) return 'Civics';
    if(/\b(health)\b/i.test(t)) return 'Health';
    return '';
  }

  function setTheme(pref){
    state.theme = pref;
    localStorage.setItem('g9_theme', pref);
    if(pref==='system'){
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark':'light');
    } else {
      root.setAttribute('data-theme', pref);
    }
    if(themeSelect) themeSelect.value = pref;
    updateThemeToggleUI();
  }
  // init theme
  setTheme(state.theme);
  // respond to system changes
  const mq = window.matchMedia('(prefers-color-scheme: dark)'); if(mq.addEventListener) mq.addEventListener('change', ()=>{ if(state.theme==='system') setTheme('system'); });
  if(themeSelect) themeSelect.addEventListener('change',(e)=>{ root.classList.add('theme-transition'); setTheme(e.target.value); setTimeout(()=>root.classList.remove('theme-transition'),520); });
  if(themeToggleBtn){
    themeToggleBtn.addEventListener('click', ()=>{
      const order = ['light','dark','system'];
      const idx = order.indexOf(state.theme);
      const next = order[(idx+1)%order.length];
      root.classList.add('theme-transition');
      setTheme(next);
      setTimeout(()=>root.classList.remove('theme-transition'),520);
    });
    updateThemeToggleUI();
  }

  // Subjects
  if(subjectDropdown){
    subjectDropdown.value = state.subject;
    subjectDropdown.addEventListener('change',(e)=>{ state.subject = e.target.value; localStorage.setItem('g9_subject', state.subject); if(defaultSubject) defaultSubject.value = state.subject; if(currentSubject) currentSubject.textContent = 'Subject: '+state.subject; toast('Subject set to '+state.subject); });
  }

  // Settings Language
  if(settingsLanguage){
    settingsLanguage.value = state.language;
    settingsLanguage.addEventListener('change', (e) => {
      state.language = e.target.value;
      localStorage.setItem('g9_language', state.language);
      toast('Language: ' + state.language);
    });
  }

  // Default Subject
  if(defaultSubject){
    defaultSubject.value = state.subject;
    defaultSubject.addEventListener('change', (e) => {
      state.subject = e.target.value;
      localStorage.setItem('g9_subject', state.subject);
      if(subjectDropdown) subjectDropdown.value = state.subject;
      if(currentSubject) currentSubject.textContent = 'Subject: ' + state.subject;
      toast('Default Subject set to ' + state.subject);
    });
  }

  // Theme Options
  const currentTheme = root.getAttribute('data-theme');
  themeOptions.forEach(btn => {
    if (btn.dataset.theme === currentTheme) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      themeOptions.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const theme = btn.dataset.theme;
      root.classList.add('theme-transition');
      setTheme(theme);
      setTimeout(() => root.classList.remove('theme-transition'), 520);
    });
  });

  // Study Goal Buttons
  studyGoalBtns.forEach(btn => {
    if (btn.dataset.goal === state.studyGoal) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      studyGoalBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.studyGoal = btn.dataset.goal;
      localStorage.setItem('g9_study_goal', state.studyGoal);
      toast('Study Goal set to ' + btn.textContent);
    });
  });

  // Tab Switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if(tab !== 'settings' && adminUnlocked){
        setAdminUnlocked(false);
      }
      tabBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
      tabContents.forEach(c => {
        if (c.id === tab + '-tab') {
          c.style.display = 'block';
          setTimeout(() => c.classList.add('active'), 10);
        } else {
          c.classList.remove('active');
          setTimeout(() => c.style.display = 'none', 300);
        }
      });
      // If badges panel is open, close it and restore the previous chat state.
      try {
        if (badgesTab && badgesTab.classList.contains('active')) {
          badgesTab.classList.remove('active');
          if (badgesContent) badgesContent.style.display = 'none';
          restoreBadgesPrevState();
        }
      } catch (e) {}
    });
  });

  // Badges header tab switching
  let badgesPrevState = null;
  function captureBadgesPrevState(){
    try {
      const activeSidebarTab = document.querySelector('.tab-btn.active');
      return {
        sidebarTab: activeSidebarTab ? activeSidebarTab.dataset.tab : null,
        welcomeDisplay: welcomePanel ? welcomePanel.style.display : '',
        messagesDisplay: messagesEl ? messagesEl.style.display : '',
        messagesScrollTop: messagesEl ? messagesEl.scrollTop : 0,
        composerDisplay: composerEl ? composerEl.style.display : ''
      };
    } catch (e) {
      return {
        sidebarTab: null,
        welcomeDisplay: '',
        messagesDisplay: '',
        messagesScrollTop: 0,
        composerDisplay: ''
      };
    }
  }

  function restoreBadgesPrevState(){
    const s = badgesPrevState;
    badgesPrevState = null;
    if(!s) {
      // safest fallback
      if (composerEl) composerEl.style.display = '';
      checkWelcomePanel();
      return;
    }

    // restore sidebar tab selection
    if(s.sidebarTab){
      tabBtns.forEach(b => {
        const isActive = b.dataset.tab === s.sidebarTab;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      tabContents.forEach(c => {
        if (c.id === s.sidebarTab + '-tab') {
          c.style.display = 'block';
          c.classList.add('active');
        } else {
          c.classList.remove('active');
          c.style.display = 'none';
        }
      });
    }

    // restore chat area state
    if (welcomePanel) welcomePanel.style.display = s.welcomeDisplay;
    if (messagesEl) {
      messagesEl.style.display = s.messagesDisplay;
      try { messagesEl.scrollTop = s.messagesScrollTop; } catch (e) {}
    }
    if (composerEl) composerEl.style.display = s.composerDisplay || '';
  }

  if (badgesTab) {
    badgesTab.addEventListener('click', () => {
      try {
        if(window.ExamModeContext && window.ExamModeContext.getEnabled && window.ExamModeContext.setEnabled){
          if(window.ExamModeContext.getEnabled()) window.ExamModeContext.setEnabled(false);
        }
      } catch (e) {}
      // Toggle badges tab active state
      const isActive = badgesTab.classList.contains('active');
      
      if (isActive) {
        // If already active, deactivate and show chat
        badgesTab.classList.remove('active');
        if (badgesContent) badgesContent.style.display = 'none';
        restoreBadgesPrevState();
      } else {
        // Activate badges tab
        badgesPrevState = captureBadgesPrevState();
        badgesTab.classList.add('active');
        if (badgesContent) badgesContent.style.display = 'flex';
        if (welcomePanel) welcomePanel.style.display = 'none';
        if (messagesEl) messagesEl.style.display = 'none';
        if (composerEl) composerEl.style.display = 'none';

        try {
          if (window.BadgesUI && window.BadgesUI.refresh) window.BadgesUI.refresh();
        } catch (e) {}
        
        // Deactivate all sidebar tabs
        tabBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
        tabContents.forEach(c => {
          c.classList.remove('active');
          setTimeout(() => c.style.display = 'none', 300);
        });
      }
    });

    try { window.__g9_badges_handler_bound = true; } catch (e) {}
  }

  // Progress tracking events helper
  function emitProgressEvent(name, detail){
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (e) {}
  }

  // Toast helper
  function toast(msg,opts={duration:4200}){ if(!toasts) return; const d=document.createElement('div'); d.className='toast'; d.textContent=msg; toasts.appendChild(d); setTimeout(()=>{ d.style.opacity='0'; d.style.transform='translateY(10px)'; setTimeout(()=>d.remove(),300); }, opts.duration); }

  function setExamModeUI(enabled){
    if(enabled){
      if (badgesTab) badgesTab.classList.remove('active');
      if (badgesContent) badgesContent.style.display = 'none';
      if (welcomePanel) welcomePanel.style.display = 'none';
      if (messagesEl) messagesEl.style.display = 'flex';
      if (composerEl) composerEl.style.display = '';
      if (examModeRoot) examModeRoot.style.display = 'none';
      try {
        examModePrevActiveChat = state.active;
        examModePapersLoaded = false;
        if(window.ExamModeUI && window.ExamModeUI.reset) window.ExamModeUI.reset();
        if(window.ExamModeUI && window.ExamModeUI.renderSetupQuestions) window.ExamModeUI.renderSetupQuestions();
        checkWelcomePanel();
      } catch (e) {}
    } else {
      if (examModeRoot) examModeRoot.style.display = 'none';
      examModeSessionId = null;
      try { window.__EXAM_MODE_SESSION_ID__ = null; } catch (e) {}
      examModePapersLoaded = false;
      examModePdfLinks = [];
      try { if(window.ExamModeUI && window.ExamModeUI.reset) window.ExamModeUI.reset(); } catch (e) {}
      if (composerEl) composerEl.style.display = '';
      if (messagesEl) messagesEl.style.display = '';
      if (badgesTab && badgesTab.classList.contains('active')){
        if (badgesContent) badgesContent.style.display = 'flex';
      } else {
        try {
          if(examModePrevActiveChat !== null) state.active = examModePrevActiveChat;
          renderActiveChat();
        } catch (e) {
          checkWelcomePanel();
        }
      }
    }
  }

  function initExamMode(){
    try {
      if(window.ExamModeToggle && window.ExamModeToggle.mount && examModeToggleMount){
        window.ExamModeToggle.mount(examModeToggleMount);
      }
      if(window.ExamModeContext && window.ExamModeContext.subscribe){
        window.ExamModeContext.subscribe(setExamModeUI);
      }
    } catch (e) {}

    // Backup: if subscribe wiring ever fails, listen to the global event too.
    try {
      window.addEventListener('g9:exam_mode_changed', (ev)=>{
        const enabled = !!(ev && ev.detail && ev.detail.enabled);
        setExamModeUI(enabled);
      });
    } catch (e) {}

    // Apply current state immediately as a safety net.
    try {
      if(window.ExamModeContext && window.ExamModeContext.getEnabled){
        setExamModeUI(!!window.ExamModeContext.getEnabled());
      }
    } catch (e) {}

    try {
      if(examModeToggleMount && (!window.ExamModeToggle || !window.ExamModeContext || !window.ExamModeUI)){
        console.error('Exam Mode scripts missing:', {
          hasExamModeToggle: !!window.ExamModeToggle,
          hasExamModeContext: !!window.ExamModeContext,
          hasExamModeUI: !!window.ExamModeUI
        });
        toast('Exam Mode scripts did not load. Make sure you are opening index.html (not index_v2.html) and hard refresh (Ctrl+F5).',{duration:8000});
      }
    } catch (e) {}
  }

  function detectExamModeTrigger(text){
    const t = String(text || '').toLowerCase();
    if(!t) return false;
    const phrases = [
      'prepare me for my exam',
      'enable exam mode',
      'exam mode',
      'prepare me for my third exam',
      'i want to practice for my exam'
    ];
    return phrases.some(p => t.includes(p));
  }

  async function safeReadJson(res){
    try {
      const t = await res.text();
      if(!t) return {};
      try {
        return JSON.parse(t);
      } catch (e) {
        return { raw: t };
      }
    } catch (e) {
      return {};
    }
  }

  function getBackendErrorMessage(data){
    if(!data) return 'Unknown error';
    if(typeof data === 'string') return data;
    if(typeof data === 'object' && Object.keys(data).length === 0) return 'Empty response body (endpoint may be missing)';
    if(data.detail) return String(data.detail);
    if(data.error) return String(data.error);
    if(data.message) return String(data.message);
    if(data.raw) return String(data.raw);
    try { return JSON.stringify(data); } catch (e) { return 'Unknown error'; }
  }

  function getMainModel(){
    try {
      return String(localStorage.getItem(MAIN_MODEL_KEY) || MAIN_MODEL_DEFAULT).trim() || MAIN_MODEL_DEFAULT;
    } catch (e) {
      return MAIN_MODEL_DEFAULT;
    }
  }

  function setMainModel(nextModel){
    const v = String(nextModel || '').trim();
    if(!v) return false;
    try { localStorage.setItem(MAIN_MODEL_KEY, v); } catch (e) {}
    return true;
  }

  function getFirebaseCurrentUser(){
    try{
      if(window.firebase && firebase.auth && firebase.apps && firebase.apps.length){
        return firebase.auth().currentUser || null;
      }
    } catch (e) {}
    return null;
  }

  let adminUnlocked = false;
  let adminUnlockTimer = null;

  function setAdminUnlocked(unlocked){
    const yes = !!unlocked;
    adminUnlocked = yes;
    if(adminUnlockTimer){
      clearTimeout(adminUnlockTimer);
      adminUnlockTimer = null;
    }
    if(adminSettingsFields){
      adminSettingsFields.classList.toggle('is-locked', !yes);
      adminSettingsFields.style.display = yes ? '' : 'none';
    }
    if(adminSettingsStatus){
      adminSettingsStatus.textContent = yes
        ? 'Unlocked for 15 seconds.'
        : 'Locked. Re-authenticate to edit AI models.';
    }
    if(adminUnlockBtn){
      adminUnlockBtn.textContent = yes ? 'Unlocked' : 'Unlock';
    }
    if(yes){
      adminUnlockTimer = setTimeout(function(){
        adminUnlockTimer = null;
        setAdminUnlocked(false);
      }, ADMIN_UNLOCK_MS);
    }
  }

  function openAdminUnlockModal(){
    if(!adminUnlockModal) return;
    const u = getFirebaseCurrentUser();
    if(adminUnlockEmail){
      adminUnlockEmail.value = (u && u.email) ? String(u.email) : (localStorage.getItem('g9_email') || '');
    }
    adminUnlockModal.classList.add('active');
    adminUnlockModal.setAttribute('aria-hidden', 'false');
  }

  function closeAdminUnlockModal(){
    if(!adminUnlockModal) return;
    adminUnlockModal.classList.remove('active');
    adminUnlockModal.setAttribute('aria-hidden', 'true');
  }

  async function unlockAdministrativeSettings(){
    try{
      if(!window.firebase || !firebase.auth || !firebase.apps || !firebase.apps.length){
        toast('Firebase not ready. Refresh and try again.');
        return;
      }
      const user = firebase.auth().currentUser;
      if(!user){
        toast('Please sign in first.');
        return;
      }
      const provider = new firebase.auth.GoogleAuthProvider();
      await user.reauthenticateWithPopup(provider);
      setAdminUnlocked(true);
      closeAdminUnlockModal();
      toast('Administrative Settings unlocked.');
    } catch (e){
      const msg = String((e && e.message) || '');
      if(msg.toLowerCase().includes('popup')){
        toast('Popup blocked. Allow popups and try again.');
      } else {
        toast('Verification failed. Please try again.');
      }
    }
  }

  async function ensurePuterReady(interactive){
    if(!window.puter || !window.puter.ai) throw new Error('PUTER_NOT_LOADED');
    if(!window.puter.auth || !window.puter.auth.isSignedIn || !window.puter.auth.signIn) return;
    let signed = false;
    try { signed = !!(await window.puter.auth.isSignedIn()); } catch (e) {}
    if(!signed && interactive){
      await window.puter.auth.signIn({ attempt_temp_user_creation: true });
    }
  }

  function extractPuterText(resp){
    if(!resp) return '';
    if(typeof resp === 'string') return resp.trim();
    if(resp.message && typeof resp.message.content === 'string') return String(resp.message.content).trim();
    if(typeof resp.content === 'string') return String(resp.content).trim();
    return '';
  }

  function fallbackMainModels(){
    return MAIN_MODEL_OPTIONS_FALLBACK.slice();
  }

  async function fetchMainPuterModels(interactive){
    try {
      await ensurePuterReady(!!interactive);
      const raw = await window.puter.ai.listModels();
      const list = Array.isArray(raw) ? raw : [];
      const mapped = list.map(function(m){
        const id = String((m && (m.id || m.name)) || '').trim();
        if(!id) return null;
        const provider = String((m && m.provider) || '').trim();
        const label = provider ? (id + ' (' + provider + ')') : id;
        return { id: id, label: label };
      }).filter(Boolean);
      if(!mapped.length) return fallbackMainModels();
      mapped.sort(function(a,b){ return String(a.id).localeCompare(String(b.id)); });
      return mapped;
    } catch (e) {
      return fallbackMainModels();
    }
  }

  async function initMainModelSelector(){
    if(!mainModelSelect) return;
    const selectedModel = getMainModel();
    mainModelSelect.innerHTML = '';
    const models = await fetchMainPuterModels(false);
    for(let i=0;i<models.length;i+=1){
      const m = models[i];
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.label;
      mainModelSelect.appendChild(o);
    }
    const hasModel = models.some(function(m){ return m.id === selectedModel; });
    mainModelSelect.value = hasModel ? selectedModel : (models[0] ? String(models[0].id) : MAIN_MODEL_DEFAULT);
    if(!hasModel) setMainModel(mainModelSelect.value);
    mainModelSelect.addEventListener('change', function(){
      const v = String(mainModelSelect.value || '').trim();
      if(v){
        setMainModel(v);
        toast('Main model set to ' + v);
      }
    });
    mainModelSelect.addEventListener('focus', async function(){
      const fresh = await fetchMainPuterModels(true);
      if(!Array.isArray(fresh) || !fresh.length) return;
      const current = getMainModel();
      mainModelSelect.innerHTML = '';
      for(let i=0;i<fresh.length;i+=1){
        const m = fresh[i];
        const o = document.createElement('option');
        o.value = m.id;
        o.textContent = m.label;
        mainModelSelect.appendChild(o);
      }
      const hasCurrent = fresh.some(function(m){ return m.id === current; });
      mainModelSelect.value = hasCurrent ? current : String(fresh[0].id);
      if(!hasCurrent) setMainModel(mainModelSelect.value);
    });
  }

  function initAdministrativeSettingsLock(){
    setAdminUnlocked(false);
    if(adminUnlockBtn){
      adminUnlockBtn.addEventListener('click', function(){
        if(adminUnlocked) return;
        openAdminUnlockModal();
      });
    }
    if(adminUnlockClose) adminUnlockClose.addEventListener('click', closeAdminUnlockModal);
    if(adminUnlockCancel) adminUnlockCancel.addEventListener('click', closeAdminUnlockModal);
    if(adminUnlockConfirm) adminUnlockConfirm.addEventListener('click', function(){ unlockAdministrativeSettings(); });
    if(adminUnlockModal){
      adminUnlockModal.addEventListener('click', function(ev){
        if(ev.target === adminUnlockModal) closeAdminUnlockModal();
      });
    }
    try{
      if(window.firebase && firebase.auth && firebase.apps && firebase.apps.length){
        firebase.auth().onAuthStateChanged(function(){
          setAdminUnlocked(false);
          closeAdminUnlockModal();
        });
      }
    } catch (e) {}
  }

  // Account wiring (Google identity + logout)
  try {
    if(window.Account && window.Account.initAccount){
      window.Account.initAccount({ toast });
    }
  } catch (e) {}

  // Debug function for testing progress (remove in production)
  window.testProgress = function() {
    console.log('Testing progress system...');
    console.log('window.Progress exists:', !!window.Progress);
    console.log('window.Progress.addPoints exists:', !!(window.Progress && window.Progress.addPoints));
    console.log('window.Progress.setMinutesToday exists:', !!(window.Progress && window.Progress.setMinutesToday));
    
    if(window.Progress && window.Progress.addPoints){
      console.log('Adding 10 test points');
      window.Progress.addPoints(10);
    }
    if(window.Progress && window.Progress.setMinutesToday){
      console.log('Setting 5 test minutes');
      window.Progress.setMinutesToday(5);
    }
    
    // Also test points module
    console.log('window.Points exists:', !!window.Points);
    console.log('window.Timer exists:', !!window.Timer);
  };

  // Chat persistence
  function saveChats(){ localStorage.setItem('g9_chats', JSON.stringify(state.chats)); localStorage.setItem('g9_active', state.active); try { if(window.GoogleSync && window.GoogleSync.queueChatsSave) window.GoogleSync.queueChatsSave(state.chats, state.active); } catch (e) {} }
  function createChat(title){ _maybeExitExamMode(); const id='c_'+Date.now(); const chat={id,title:title||'New Chat',messages:[],subject:state.subject,language:state.language,created:Date.now()}; state.chats.unshift(chat); state.active=chat.id; saveChats(); renderChats(); renderActiveChat(); }
  function clearAll(){ _maybeExitExamMode(); state.chats=[]; state.active=null; saveChats(); renderChats(); renderActiveChat(); }

  function formatTimestamp(ts){
    const now = new Date();
    const date = new Date(ts);
    const diff = now - date;
    const days = Math.floor(diff / (1000*60*60*24));
    if(days === 0) return 'Today, ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    if(days === 1) return 'Yesterday';
    return days + ' days ago';
  }

  function renderChats(){ if(!historyList) return; historyList.innerHTML=''; state.chats.forEach(chat=>{ const item=document.createElement('div'); item.className='recent-chat-item'; item.setAttribute('role','listitem'); item.setAttribute('tabindex','0'); if(chat.id===state.active) item.classList.add('active'); const title=document.createElement('div'); title.className='recent-chat-title'; title.textContent=chat.title||'New Chat'; const preview=document.createElement('div'); preview.className='recent-chat-preview'; const lastMsg=[...chat.messages].reverse().find(m=>m.role==='user'); preview.textContent=lastMsg?lastMsg.content.slice(0,34):'No messages yet'; const time=document.createElement('div'); time.className='recent-chat-time'; time.textContent=formatTimestamp(chat.created||Date.now()); item.append(title,preview,time); item.addEventListener('click',()=>{ _maybeExitExamMode(); state.active=chat.id; saveChats(); renderChats(); renderActiveChat(); }); item.addEventListener('keydown',(e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); _maybeExitExamMode(); state.active=chat.id; saveChats(); renderChats(); renderActiveChat(); } }); historyList.appendChild(item); }); }

  function _isExamModeEnabled(){
    try {
      return !!(window.ExamModeContext && window.ExamModeContext.getEnabled && window.ExamModeContext.getEnabled());
    } catch (e) {
      return false;
    }
  }

  function _maybeExitExamMode(){
    try {
      if(window.ExamModeContext && window.ExamModeContext.getEnabled && window.ExamModeContext.setEnabled){
        if(window.ExamModeContext.getEnabled()) window.ExamModeContext.setEnabled(false);
      }
    } catch (e) {}
  }

  function renderActiveChat(){
    if(!messagesEl) return;
    // Exam Mode owns the message area; do not overwrite it with normal chat rendering.
    if(_isExamModeEnabled()){
      try {
        if (welcomePanel) welcomePanel.style.display = 'none';
        messagesEl.style.display = 'flex';
      } catch (e) {}
      return;
    }
    messagesEl.innerHTML='';
    const chat=state.chats.find(x=>x.id===state.active);
    if(!chat){ if(chatTitle) chatTitle.textContent='Welcome'; if(chatSubtitle) chatSubtitle.textContent='Start a new conversation'; checkWelcomePanel(); return; }
    if(chatTitle) chatTitle.textContent=chat.title;
    if(chatSubtitle) chatSubtitle.textContent=new Date(chat.created).toLocaleString();
    chat.messages.forEach(m=>appendMessage(m.role,m.content,false));
    messagesEl.scrollTop=messagesEl.scrollHeight;
    checkWelcomePanel();
  }

  // improved appendMessage with enter/show animation
  function appendMessage(role,content,animate=true){
    if(!messagesEl) return;
    const m=document.createElement('div');
    m.className='msg '+(role==='user'?'user':'ai')+' enter';
    m.textContent=content;
    messagesEl.appendChild(m);
    messagesEl.scrollTop=messagesEl.scrollHeight;
    // trigger CSS entry animation
    if(animate){ requestAnimationFrame(()=>{ m.classList.add('show'); }); }
    else { m.classList.add('show'); }
    // remove enter class after animation to keep DOM clean
    setTimeout(()=>{ m.classList.remove('enter'); }, 700);
    // Avoid welcome-panel logic interfering with Exam Mode rendering.
    if(!_isExamModeEnabled()) checkWelcomePanel();
  }

  async function generateTitle(text){
    try {
      if(window.Api && window.Api.apiFetch){
        const res = await window.Api.apiFetch('/generate_title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: text })
        });
        if(res.ok){
          const data = await res.json();
          if(data && data.title) return data.title.replace(/["'`\n\r]+/g,'').slice(0,48);
        }
      }
    } catch (e) {}
    return text.slice(0,40);
  }

  async function sendMessage(){
    const text=inputBox.value.trim();
    if(!text) return;

    try {
      if(window.ExamModeContext && window.ExamModeContext.getEnabled && window.ExamModeContext.getEnabled()){
        if(!window.ExamModeUI){
          try { toast('Exam Mode UI did not load — switching back to normal chat. Hard refresh (Ctrl+F5) to fix Exam Mode.',{duration:9000}); } catch (e) {}
          try {
            if(window.ExamModeContext && window.ExamModeContext.setEnabled){
              window.ExamModeContext.setEnabled(false);
            }
          } catch (e2) {}
          // Continue with normal chat send below.
        }

        inputBox.value='';
        if(micBtn) micBtn.classList.remove('hidden');
        if(sendBtn) sendBtn.classList.remove('show');

        if(window.ExamModeUI){
          const isSetupCompleteFn = (typeof window.ExamModeUI.isSetupComplete === 'function') ? window.ExamModeUI.isSetupComplete : null;
          const handleUserInputFn = (typeof window.ExamModeUI.handleUserInput === 'function') ? window.ExamModeUI.handleUserInput : null;
          const appendUserMessageFn = (typeof window.ExamModeUI.appendUserMessage === 'function') ? window.ExamModeUI.appendUserMessage : null;
          const appendAiMessageFn = (typeof window.ExamModeUI.appendAiMessage === 'function') ? window.ExamModeUI.appendAiMessage : null;
          const updateMessageFn = (typeof window.ExamModeUI.updateMessage === 'function') ? window.ExamModeUI.updateMessage : null;
          const getHistoryForBackendFn = (typeof window.ExamModeUI.getHistoryForBackend === 'function') ? window.ExamModeUI.getHistoryForBackend : null;
          const getAnswersFn = (typeof window.ExamModeUI.getAnswers === 'function') ? window.ExamModeUI.getAnswers : null;

          if(!isSetupCompleteFn || !isSetupCompleteFn()){
            let setupResult = null;
            if(handleUserInputFn) setupResult = handleUserInputFn(text);
            else {
              console.error('ExamModeUI.handleUserInput missing');
              try { toast('Exam Mode UI is not ready. Open index.html and hard refresh (Ctrl+F5).',{duration:8000}); } catch (e) {}
            }

            // If the user just finished the 3 setup questions, fetch a random past-paper question.
            try {
              if(setupResult && setupResult.justCompleted && appendAiMessageFn){
                const setup = getAnswersFn ? getAnswersFn() : {};
                const normalizedSubject = normalizeExamSubject(setup.subject) || (setup.subject ? String(setup.subject).trim() : '') || state.subject;
                const normalizedTerm = normalizeExamTerm(setup.term) || (setup.term ? String(setup.term).trim() : '') || 'Third';
                const scanningIndex = appendAiMessageFn('Scanning past papers…');

                const startBody = {
                  mode: (setup.intent || 'practice'),
                  term: normalizedTerm,
                  subject: normalizedSubject,
                  session_id: examModeSessionId || undefined
                };

                const startRes = await (window.Api && window.Api.apiFetch
                  ? window.Api.apiFetch('/exam-mode/start', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(startBody) })
                  : fetch('/exam-mode/start', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(startBody) }));
                const startData = await safeReadJson(startRes);
                if(!startRes.ok){
                  throw new Error('Exam Mode start failed (HTTP ' + startRes.status + '): ' + getBackendErrorMessage(startData));
                }
                if(startData && startData.session_id) examModeSessionId = startData.session_id;
                try { window.__EXAM_MODE_SESSION_ID__ = examModeSessionId; } catch (e) {}

                if(!examModeSessionId){
                  throw new Error('Exam Mode start failed: missing session_id');
                }

                const fetchBody = {
                  session_id: examModeSessionId,
                  subject: normalizedSubject,
                  term: normalizedTerm
                };
                const fetchRes = await (window.Api && window.Api.apiFetch
                  ? window.Api.apiFetch('/exam-mode/fetch-papers', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(fetchBody) })
                  : fetch('/exam-mode/fetch-papers', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(fetchBody) }));
                const fetchData = await safeReadJson(fetchRes);
                if(!fetchRes.ok){
                  throw new Error('Exam Mode fetch-papers failed (HTTP ' + fetchRes.status + '): ' + getBackendErrorMessage(fetchData));
                }
                examModePapersLoaded = true;
                examModePdfLinks = (fetchData && Array.isArray(fetchData.pdf_links)) ? fetchData.pdf_links : [];

                const askBody = {
                  session_id: examModeSessionId,
                  subject: normalizedSubject,
                  term: normalizedTerm,
                  pdf_links: examModePdfLinks
                };
                const askRes = await (window.Api && window.Api.apiFetch
                  ? window.Api.apiFetch('/exam-mode/ask-question', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(askBody) })
                  : fetch('/exam-mode/ask-question', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(askBody) }));
                const askData = await safeReadJson(askRes);
                if(!askRes.ok){
                  throw new Error('Exam Mode ask-question failed (HTTP ' + askRes.status + '): ' + getBackendErrorMessage(askData));
                }

                const qText = (askData && askData.question && askData.question.text)
                  ? String(askData.question.text)
                  : 'I could not extract a question from the past papers.';

                const isNoPapers = !!(askData && askData.question && askData.question.id === 'no_papers_found');
                const finalText = isNoPapers
                  ? qText
                  : ('✅ Papers ready. Here is your first question:\n\n' + qText);

                if(updateMessageFn && typeof scanningIndex === 'number') updateMessageFn(scanningIndex, finalText);
                else if(appendAiMessageFn) appendAiMessageFn(finalText);

                if(fetchData && fetchData.total_questions === 0){
                  try { toast('No questions found for that subject/term — using fallback questions.',{duration:6000}); } catch (e) {}
                }
              }
            } catch (e) {
              const msg = (e && e.message) ? String(e.message) : 'Exam Mode paper scan failed.';
              console.error('Exam Mode paper scan failed:', e);
              try {
                if(window.ExamModeUI && typeof window.ExamModeUI.appendAiMessage === 'function'){
                  window.ExamModeUI.appendAiMessage('⚠️ ' + msg);
                }
              } catch (e2) {}
              try { toast(msg,{duration:8000}); } catch (e3) {}
            }

            return;
          }

          if(appendUserMessageFn) appendUserMessageFn(text);
          const thinkingIndex = appendAiMessageFn ? appendAiMessageFn('Thinking…') : null;

          const history = getHistoryForBackendFn ? getHistoryForBackendFn(20) : [];
          const setup = getAnswersFn ? getAnswersFn() : {};

          const setupTag = (setup && (setup.intent || setup.term || setup.subject))
            ? ('[ExamMode Setup] ' +
              'Type=' + (setup.intent || '—') + '; ' +
              'Term=' + (setup.term || '—') + '; ' +
              'Subject=' + (setup.subject || '—') + '. ')
            : '[ExamMode] ';

          try {
            const reqBody = {
              subject: setup.subject || state.subject,
              language: state.language,
              student_question: setupTag + text,
              history,
              title: 'Exam Mode',
              email: 'guest@student.com'
            };

            const res = await (window.Api && window.Api.apiFetch
              ? window.Api.apiFetch('/ask', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(reqBody) })
              : fetch('/ask', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(reqBody) }));

            const data = await safeReadJson(res);
            if(!res.ok){
              throw new Error('AI request failed (HTTP ' + res.status + '): ' + getBackendErrorMessage(data));
            }

            const answerRaw = (data && data.answer) ? String(data.answer) : '';
            const answer = answerRaw ? stripAwardPointsLine(answerRaw) : '⚠️ AI returned an empty response.';
            if(updateMessageFn && typeof thinkingIndex === 'number') updateMessageFn(thinkingIndex, answer);
            else if(appendAiMessageFn) appendAiMessageFn(answer);
          } catch (e) {
            const msg = (e && e.message) ? ('⚠️ ' + String(e.message)) : '⚠️ Message failed to send. Please check your connection or try again later.';
            if(updateMessageFn && typeof thinkingIndex === 'number') updateMessageFn(thinkingIndex, msg);
            else if(appendAiMessageFn) appendAiMessageFn(msg);
            try { toast(msg,{duration:5000}); } catch (e2) {}
          }

          return;
        }
      }
    } catch (e) {
      console.error('Exam Mode send failed:', e);
      try { toast('Exam Mode crashed — refresh the page and try again.',{duration:6000}); } catch (e2) {}
      try {
        if(window.ExamModeUI && typeof window.ExamModeUI.appendAiMessage === 'function'){
          window.ExamModeUI.appendAiMessage('⚠️ Exam Mode crashed. Please refresh the page and try again.');
        }
      } catch (e3) {}
    }

    let chat=state.chats.find(c=>c.id===state.active); if(!chat){ createChat('New Chat'); chat=state.chats[0]; }
    if(chat.messages.length===0){ const t=await generateTitle(text); chat.title=t; saveChats(); renderChats(); renderActiveChat(); }
    const langTag = state.language==='Sinhala' ? '[සිංහල]' : '[English]'; chat.messages.push({role:'user',content:langTag+' '+text}); appendMessage('user',langTag+' '+text); saveChats(); inputBox.value=''; if(micBtn) micBtn.classList.remove('hidden'); if(sendBtn) sendBtn.classList.remove('show'); chat.messages.push({role:'ai',content:'Thinking…'}); appendMessage('ai','Thinking…'); saveChats(); renderChats(); emitProgressEvent('g9:chat_context', { chatId: state.active, subject: state.subject });
    emitProgressEvent('g9:user_message', { chatId: state.active, subject: state.subject, text });

    const history = (chat && Array.isArray(chat.messages))
      ? chat.messages
          .filter(m => m && (m.role === 'user' || m.role === 'ai') && m.content && m.content !== 'Thinking…')
          .slice(-20)
          .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: String(m.content).slice(0, 1200) }))
      : [];

    try{
      await ensurePuterReady(true);
      const mainModel = getMainModel();
      const systemPrompt =
        'You are The Tutor, a helpful study tutor for Grade 9 students. ' +
        'Keep answers accurate, clear, and practical. ' +
        'Current subject: ' + state.subject + '. ' +
        'Respond in ' + state.language + '.';
      const chatMessages = [{ role: 'system', content: systemPrompt }].concat(history);
      const puterResp = await window.puter.ai.chat(chatMessages, { model: mainModel });
      const answerRaw = extractPuterText(puterResp);
      if(!answerRaw){
        throw new Error('Main AI returned an empty response.');
      }
      const lastAi=[...chat.messages].reverse().find(m=>m.role==='ai');
      const answer = answerRaw ? stripAwardPointsLine(answerRaw) : 'AI returned an empty response.';
      if(lastAi) lastAi.content=answer; emitProgressEvent('g9:ai_response', { chatId: state.active, subject: state.subject, text: answer });
      renderActiveChat(); saveChats(); 
    }
    catch(e){ const msg=(e && e.message) ? ('⚠️ ' + String(e.message)) : '⚠️ Message failed to send. Please check your connection or try again later.'; const lastAi=[...chat.messages].reverse().find(m=>m.role==='ai'); if(lastAi) lastAi.content=msg; renderActiveChat(); saveChats(); toast(msg,{duration:5000}); }
  }

  // Speech
  let recognition=null; 
  if('webkitSpeechRecognition' in window || 'SpeechRecognition' in window){
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new Rec();
    recognition.continuous=false;
    recognition.interimResults=false;
    recognition.onresult=(ev)=>{ 
      const t=ev.results[0][0].transcript||''; 
      inputBox.value=t; 
      inputBox.focus(); 
      // Trigger input event to show send button
      try { inputBox.dispatchEvent(new Event('input')); } catch (e) {}
    };
    recognition.onstart=()=>{ toast('Listening…'); };
    recognition.onend=()=>{ /* no-op */ };
    recognition.onerror=(e)=>{ 
      const code = (e && (e.error || e.name)) ? String(e.error || e.name) : 'unknown';
      if(code === 'not-allowed' || code === 'service-not-allowed') toast('Microphone permission denied');
      else if(code === 'no-speech') toast('No speech detected');
      else toast('Speech recognition error: ' + code);
    };
  }
  if(micBtn && !window.__g9_voice_backend_enabled) micBtn.onclick=()=>{
    if(!recognition) return toast('Speech recognition not supported');
    // SpeechRecognition usually requires a secure context (HTTPS) except localhost.
    const host = String(location.hostname || '').toLowerCase();
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if(!window.isSecureContext && !isLocal){
      return toast('Mic requires HTTPS or localhost');
    }
    recognition.lang = state.language==='Sinhala' ? 'si-LK' : 'en-US';
    try {
      // If already running, restart cleanly
      if(recognition.abort) recognition.abort();
      recognition.start();
    } catch (e) {
      toast('Speech recognition failed to start');
    }
  };

  // Sidebar toggle wiring: ensure button toggles .app.sidebar-hidden and persists
  let sidebarVisible = localStorage.getItem('g9_sidebar_visible');
  if(sidebarVisible===null) sidebarVisible = 'true';
  sidebarVisible = sidebarVisible === 'true';
  const mobileMq = window.matchMedia('(max-width: 900px)');
  if (mobileMq.matches) sidebarVisible = false;
  function applySidebar(){ if(sidebarVisible){ appEl.classList.remove('sidebar-hidden'); if(sidebar) sidebar.classList.remove('hidden'); toggleSidebarBtn && toggleSidebarBtn.setAttribute('aria-expanded','true'); } else { appEl.classList.add('sidebar-hidden'); if(sidebar) sidebar.classList.add('hidden'); toggleSidebarBtn && toggleSidebarBtn.setAttribute('aria-expanded','false'); } localStorage.setItem('g9_sidebar_visible', sidebarVisible); }
  if(toggleSidebarBtn){ toggleSidebarBtn.addEventListener('click', ()=>{ sidebarVisible = !sidebarVisible; applySidebar(); }); }
  try {
    mobileMq.addEventListener('change', (ev) => {
      if (ev.matches) {
        sidebarVisible = false;
        applySidebar();
      }
    });
  } catch (e) {}
  applySidebar();

  // Input box mic/send toggle
  if (inputBox && micBtn && sendBtn) {
    inputBox.addEventListener('input', () => {
      if (inputBox.value.trim()) {
        micBtn.classList.add('hidden');
        sendBtn.classList.add('show');
      } else {
        micBtn.classList.remove('hidden');
        sendBtn.classList.remove('show');
      }
      try {
        if(window.ExamModeContext && window.ExamModeContext.getEnabled && window.ExamModeContext.setEnabled){
          if(!window.ExamModeContext.getEnabled() && detectExamModeTrigger(inputBox.value)){
            window.ExamModeContext.setEnabled(true);
          }
        }
      } catch (e) {}
    });
  }

  // Action buttons
  const actionButtons = document.querySelectorAll('.action-button');
  actionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.querySelector('.action-text').textContent;
      if (inputBox) {
        inputBox.value = text;
        inputBox.focus();
        // Trigger input event to show send button
        inputBox.dispatchEvent(new Event('input'));
        // Hide welcome panel and show messages
        if (welcomePanel) welcomePanel.style.display = 'none';
        if (messagesEl) messagesEl.style.display = 'flex';
      }
    });
  });

  // Show welcome panel when no messages
  function checkWelcomePanel() {
    try {
      if(window.ExamModeContext && window.ExamModeContext.getEnabled && window.ExamModeContext.getEnabled()){
        if (welcomePanel) welcomePanel.style.display = 'none';
        if (messagesEl) messagesEl.style.display = 'flex';
        return;
      }
    } catch (e) {}
    if (messagesEl && welcomePanel) {
      if (messagesEl.children.length === 0) {
        welcomePanel.style.display = 'flex';
        messagesEl.style.display = 'none';
      } else {
        welcomePanel.style.display = 'none';
        messagesEl.style.display = '';
      }
    }
  }

  initExamMode();


  // Settings functionality
  // Language selector
  if (settingsLanguage) {
    settingsLanguage.value = state.language;
    settingsLanguage.addEventListener('change', (e) => {
      state.language = e.target.value;
      localStorage.setItem('g9_language', state.language);
      toast('Language changed to ' + state.language);
    });
  }

  // Default subject selector
  if (defaultSubject) {
    defaultSubject.value = state.subject;
    defaultSubject.addEventListener('change', (e) => {
      state.subject = e.target.value;
      localStorage.setItem('g9_subject', state.subject);
      if(currentSubject) currentSubject.textContent = 'Subject: ' + state.subject;
      toast('Default subject set to ' + state.subject);
    });
  }

  // Theme toggle
  themeOptions.forEach(option => {
    if (option.dataset.theme === state.theme) {
      option.classList.add('active');
    }
    option.addEventListener('click', () => {
      themeOptions.forEach(opt => opt.classList.remove('active'));
      option.classList.add('active');
      setTheme(option.dataset.theme);
    });
  });

  // Study goal buttons
  studyGoalBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      studyGoalBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const goal = btn.getAttribute('data-goal');
      toast('Study goal set to ' + goal + ' minutes');
    });
  });

  // Events
  initAdministrativeSettingsLock();
  initMainModelSelector().catch((e)=>{
    console.error('Main model selector init failed:', e);
  });
  if(sendBtn) sendBtn.onclick=sendMessage;
  if(inputBox) inputBox.addEventListener('keydown',(e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } });
  if(newChatBtn) newChatBtn.onclick=()=>{ createChat('New Chat'); if(inputBox) inputBox.focus(); };
  if(clearAllBtn) clearAllBtn.onclick=()=>{
    if(confirm('Clear all conversations?')){
      clearAll();
      try { if(window.Points && window.Points.resetSession) window.Points.resetSession(); } catch (e) {}
      try { if(window.Timer && window.Timer.resetSession) window.Timer.resetSession(); } catch (e) {}
      try { if(window.Progress && window.Progress.resetSession) window.Progress.resetSession(); } catch (e) {}
      toast('All conversations cleared');
    }
  };

  // init
  renderChats(); renderActiveChat(); if(!state.active && state.chats.length===0) createChat('New Chat');
  
  // Initial welcome panel check
  checkWelcomePanel();

  try { if(window.lucide && window.lucide.createIcons) window.lucide.createIcons(); } catch (e) {}
})();

