// chat.js — AURA AI unified chat pipeline
// Primary: FastAPI /ask with Firebase Bearer token
// Voice output: Gemini Native Audio TTS
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
        console.warn('[Chat] Backend failed:', backendErr.message);
        if(stopAnim) stopAnim();
        // Show user-friendly error — no Puter fallback
        const lastAi = [...chat.messages].reverse().find(m=>m.role==='ai');
        const errMsg = 'I\'m having trouble connecting right now. Please check your internet connection and try again in a moment.';
        if(lastAi){
          lastAi.content = errMsg;
        } else {
          chat.messages.push({role:'ai',content:errMsg});
        }
        renderActiveChat();
        saveChats();
        return;
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
