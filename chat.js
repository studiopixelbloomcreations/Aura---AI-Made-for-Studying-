// chat.js — AURA AI unified chat pipeline
// Primary: FastAPI /ask with Firebase Bearer token
// Fallback: Puter.js with 8s timeout
(function(){
  function startLoadingAnimation(targetEl){
    let i = 0;
    const timer = setInterval(()=>{
      i = (i + 1) % 3;
      const dots = i === 0 ? '…' : i === 1 ? '..' : '...';
      targetEl.textContent = 'Thinking' + dots;
    }, 450);
    return () => clearInterval(timer);
  }

  /**
   * Get the backend base URL from environment or default.
   */
  function getBackendUrl(){
    try {
      // Vercel env or window config
      if(window.__AURA_BACKEND_URL__) return window.__AURA_BACKEND_URL__;
      if(window.__FIREBASE_CONFIG__ && window.__FIREBASE_CONFIG__.backendUrl) return window.__FIREBASE_CONFIG__.backendUrl;
    } catch(e){}
    // Default to same origin in production, localhost in dev
    if(location.hostname === 'localhost' || location.hostname === '127.0.0.1'){
      return 'http://localhost:8000';
    }
    return ''; // same origin
  }

  /**
   * Get Firebase auth token for Bearer header.
   */
  async function getAuthToken(){
    try {
      if(window.FirebaseRuntimeConfig){
        const auth = window.FirebaseRuntimeConfig.getAuth();
        if(auth && auth.currentUser){
          return await auth.currentUser.getIdToken();
        }
      }
      if(window.auth && window.auth.currentUser){
        return await window.auth.currentUser.getIdToken();
      }
    } catch(e){
      console.warn('[Chat] Failed to get auth token:', e);
    }
    return null;
  }

  function initChat(ctx){
    const { state, elements, toast, appendMessage, saveChats, renderChats, renderActiveChat, createChat, generateTitle } = ctx;
    const { inputBox, sendBtn, messagesEl } = elements;

    function emit(name, detail){
      try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (e) {}
    }

    async function sendMessage(){
      const text = (inputBox && inputBox.value || '').trim();
      if(!text) return;

      let chat = state.chats.find(c=>c.id===state.active);
      if(!chat){
        createChat('New Chat');
        chat = state.chats[0];
      }

      if(chat.messages.length===0){
        const t = await generateTitle(text);
        chat.title = t;
        saveChats();
        renderChats();
        renderActiveChat();
      }

      const langTag = state.language==='Sinhala' ? '[සිංහල]' : '[English]';
      const userText = langTag + ' ' + text;

      emit('g9:chat_context', { chatId: state.active, subject: state.subject });
      emit('g9:user_message', { chatId: state.active, subject: state.subject, text });

      chat.messages.push({role:'user',content:userText});
      appendMessage('user', userText);
      saveChats();
      inputBox.value='';

      chat.messages.push({role:'ai',content:'Thinking…'});
      appendMessage('ai','Thinking…');
      saveChats();
      renderChats();

      const lastBubble = messagesEl ? messagesEl.lastElementChild : null;
      const stopAnim = lastBubble ? startLoadingAnimation(lastBubble) : null;

      let answer = '';

      // ─── PRIMARY: FastAPI /ask with Firebase auth ───
      try {
        const backendUrl = getBackendUrl();
        const token = await getAuthToken();
        const headers = { 'Content-Type': 'application/json' };
        if(token) headers['Authorization'] = 'Bearer ' + token;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const resp = await fetch(backendUrl + '/ask', {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            subject: state.subject || 'general',
            language: state.language || 'English',
            student_question: text,
            title: chat.title || 'General Help',
            email: 'guest@student.com'
          })
        });
        clearTimeout(timeout);

        if(resp.ok){
          const data = await resp.json();
          if(data && data.answer){
            answer = data.answer;
          } else if(data && data.error){
            throw new Error(data.error);
          }
        } else {
          throw new Error('Backend returned ' + resp.status);
        }
      } catch(backendErr){
        console.warn('[Chat] Backend failed, trying Puter fallback:', backendErr.message);

        // ─── FALLBACK: Puter.js with 8s timeout ───
        try {
          await ensurePuterReady(true);
          const systemPrompt =
            'You are AURA AI, a helpful study tutor for Grade 9 students. ' +
            'Keep answers accurate, clear, and practical. ' +
            'Current subject: ' + (state.subject || 'general') + '. ' +
            'Respond in ' + (state.language || 'English') + '.';

          const history = (chat && Array.isArray(chat.messages))
            ? chat.messages
                .filter(m => m && (m.role === 'user' || m.role === 'ai') && m.content && m.content !== 'Thinking…')
                .slice(-20)
                .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: String(m.content).slice(0, 1200) }))
            : [];

          const mainModel = getMainModel();
          const puterResp = await Promise.race([
            window.puter.ai.chat(
              [{ role: 'system', content: systemPrompt }].concat(history),
              { model: mainModel }
            ),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Puter timeout (8s)')), 8000))
          ]);
          answer = extractPuterText(puterResp);
        } catch(puterErr){
          throw new Error('Both backend and fallback failed: ' + puterErr.message);
        }
      }

      if(!answer){
        throw new Error('No answer received');
      }

      // Update the last AI message
      const lastAi = [...chat.messages].reverse().find(m=>m.role==='ai');
      if(lastAi){
        lastAi.content = answer;
      } else {
        chat.messages.push({role:'ai',content:answer});
      }

      emit('g9:ai_response', { chatId: state.active, subject: state.subject, text: answer });

      renderActiveChat();
      saveChats();

      if(stopAnim) stopAnim();
    }

    function getMainModel(){
      try {
        return String(localStorage.getItem('main_model') || 'google/gemini-2.5-flash').trim() || 'google/gemini-2.5-flash';
      } catch (e) {
        return 'google/gemini-2.5-flash';
      }
    }

    async function ensurePuterReady(interactive){
      if(window.__VIS_TEST_USE_MOCK || navigator.onLine === false) return;
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

    // Marks update confirmation
    window.addEventListener('g9:marks_updated', ()=>{
      try {
        const chat = state.chats.find(c=>c.id===state.active);
        if(!chat) return;
        const msg = '✅ Your marks have been successfully updated in the progress bar.';
        chat.messages.push({ role: 'ai', content: msg });
        appendMessage('ai', msg);
        saveChats();
        renderChats();
      } catch (e) {}
    });

    if(sendBtn) sendBtn.onclick = sendMessage;
    if(inputBox){
      inputBox.addEventListener('keydown',(e)=>{
        if(e.key==='Enter' && !e.shiftKey){
          e.preventDefault();
          sendMessage();
        }
      });
    }

    return { sendMessage };
  }

  window.Chat = { initChat };
})();
